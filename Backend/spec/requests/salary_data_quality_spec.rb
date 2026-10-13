require "rails_helper"

RSpec.describe "Salary data quality", type: :request, authenticated: true do
  let(:path) { "/api/v1/salary_data_anomalies" }

  def run_checks
    post "/api/v1/salary_data_quality_scans"
    expect(response).to have_http_status(:created)
  end

  def finding
    SalaryDataAnomaly.order(:id).first
  end

  it "returns an empty review queue before the first manual scan" do
    get path
    expect(json_response).to include("data" => [])
    expect(json_response["meta"]).to include("last_scan" => nil, "total_count" => 0)
    expect(response.headers["Cache-Control"]).to include("no-store")
  end

  it "runs checks and returns persisted findings with evidence but no credentials" do
    create_employee(base_salary: "0")
    run_checks
    expect(json_response["data"]).to include("checked_employees" => 1, "new_findings" => 1)
    get path
    row = json_response["data"].first
    expect(row).to include("rule_code" => "active_zero_salary", "review_status" => "pending", "source_stale" => false)
    expect(row["employee"]["employee_id"]).to eq("EMP001")
    expect(json_response["meta"]["last_scan"]["id"]).to eq(SalaryDataQualityScan.first.id)
    expect(response.body).not_to include("password_digest", "token_digest")
  end

  it "combines employee filters, currency, search and pagination" do
    create_employee(base_salary: "0")
    create_employee(employee_id: "USD", name: "Jane Smith", country: "United States", currency: "USD", base_salary: "0")
    run_checks
    get path, params: { country: "India", department: "Engineering", status: "active", currency: "INR", q: "EMP001", per_page: 1 }
    expect(json_response["data"].size).to eq(1)
    expect(json_response["meta"]).to include("total_count" => 1, "total_pages" => 1)
    get path, params: { page: 3, per_page: 1 }
    expect(json_response["data"]).to eq([])
    expect(json_response["meta"]["total_count"]).to eq(2)
  end

  it "records HR decisions and exposes a paginated audit trail" do
    create_employee(base_salary: "0")
    run_checks
    %w[investigating legitimate].each do |status|
      patch "#{path}/#{finding.id}", params: { review: { status: status, notes: "Verified an unpaid placement" } }, as: :json
      expect(response).to have_http_status(:ok)
      expect(json_response["data"]["review_status"]).to eq(status)
    end
    get "#{path}/#{finding.id}", params: { per_page: 1 }
    expect(json_response["reviews"]["meta"]).to include("total_count" => 2, "total_pages" => 2)
    expect(json_response["reviews"]["data"].first).to include("status" => "legitimate", "notes" => "Verified an unpaid placement")
    get path, params: { review_status: "pending" }
    expect(json_response["data"]).to be_empty
    get path, params: { review_status: "legitimate" }
    expect(json_response["data"].size).to eq(1)
  end

  [ "confirmed_error", "legitimate" ].each do |status|
    it "requires notes to classify a finding as #{status}" do
      create_employee(base_salary: "0")
      run_checks
      patch "#{path}/#{finding.id}", params: { review: { status: status, notes: " " } }, as: :json
      expect(response).to have_http_status(:unprocessable_entity)
      expect(json_response["errors"]).to have_key("notes")
      expect(finding.reviews).to be_empty
      expect(finding.review_status).to eq("pending")
    end
  end

  [ { status: "wrong" }, { status: "legitimate", notes: "x" * 2001 } ].each do |review|
    it "rejects invalid review input #{review[:status]}" do
      create_employee(base_salary: "0")
      run_checks
      patch "#{path}/#{finding.id}", params: { review: review }, as: :json
      expect(response).to have_http_status(:unprocessable_entity)
      expect(finding.reviews.count).to eq(0)
    end
  end

  [ {}, { review: [] }, { review: "bad" } ].each do |payload|
    it "rejects malformed review envelopes #{payload}" do
      create_employee(base_salary: "0")
      run_checks
      patch "#{path}/#{finding.id}", params: payload, as: :json
      expect(response).to have_http_status(:bad_request)
    end
  end

  it "rejects a stale source and allows review only after another scan" do
    employee = create_employee(base_salary: "0")
    run_checks
    old_id = finding.id
    employee.update!(name: "Changed Employee")
    get "#{path}/#{old_id}"
    expect(json_response["data"]["source_stale"]).to be(true)
    patch "#{path}/#{old_id}", params: { review: { status: "investigating" } }, as: :json
    expect(response).to have_http_status(:conflict)
    expect(finding.reviews).to be_empty
    run_checks
    patch "#{path}/#{SalaryDataAnomaly.where(active: true).first.id}", params: { review: { status: "investigating" } }, as: :json
    expect(response).to have_http_status(:ok)
  end

  it "rejects review if new history has been imported without changing employee timestamps" do
    employee = create_employee(base_salary: "0")
    run_checks
    employee.salary_changes.create!(old_base_salary: "0", new_base_salary: "1", old_currency: "INR", new_currency: "INR",
      old_effective_date: employee.effective_date, effective_date: employee.effective_date, changed_at: Time.current)
    patch "#{path}/#{finding.id}", params: { review: { status: "investigating" } }, as: :json
    expect(response).to have_http_status(:conflict)
  end

  it "hides cleared findings by default, retains them on request and rejects their review" do
    employee = create_employee(base_salary: "0")
    run_checks
    employee.update!(base_salary: "100")
    run_checks
    get path
    expect(json_response["data"]).to be_empty
    get path, params: { include_cleared: "true" }
    expect(json_response["data"].first["active"]).to be(false)
    patch "#{path}/#{finding.id}", params: { review: { status: "investigating" } }, as: :json
    expect(response).to have_http_status(:conflict)
  end

  [ { currency: "XXX" }, { status: "unknown" }, { review_status: "deleted" },
    { include_cleared: "maybe" }, { page: "0" }, { per_page: "0" } ].each do |params|
    it "rejects unsupported filters #{params}" do
      get path, params: params
      expect(response).to have_http_status(:unprocessable_entity)
    end
  end

  it "returns 404 for unknown findings" do
    get "#{path}/999999"
    expect(response).to have_http_status(:not_found)
  end

  it "caps oversized page requests at 100" do
    get path, params: { per_page: 101 }
    expect(json_response["meta"]["per_page"]).to eq(100)
  end
end

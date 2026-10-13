require "rails_helper"

RSpec.describe "Employee detail updates", type: :request, authenticated: true do
  let(:employee) { create_employee }

  def update_employee(attributes = {}, method: :patch, **fields)
    public_send(method, "/api/v1/employees/#{employee.id}", params: { employee: attributes.merge(fields) }, as: :json)
  end

  it "updates all profile fields while preserving the primary key, compensation and salary history" do
    SalaryUpdater.call(employee: employee, base_salary: "70000.25", currency: "INR", effective_date: "2026-10-01", confirmed: true)
    history = employee.salary_changes.first.attributes
    update_employee(employee_id: "EMP_UPDATED", name: "Updated Employee", country: "Germany",
      department: "Sales", designation: "Account Executive", status: "inactive")
    expect(response).to have_http_status(:ok)
    expect(json_response["data"]).to include("id" => employee.id, "employee_id" => "EMP_UPDATED", "name" => "Updated Employee",
      "country" => "Germany", "department" => "Sales", "designation" => "Account Executive", "status" => "inactive",
      "base_salary" => "70000.25", "currency" => "INR", "effective_date" => "2026-10-01")
    expect(Employee.count).to eq(1)
    expect(employee.salary_changes.reload.first.attributes).to eq(history)
    expect(response.headers["Cache-Control"]).to eq("no-store")
  end

  %i[patch put].each do |method|
    it "supports a partial profile update through #{method}" do
      previous = employee.attributes
      update_employee({ name: "New Name" }, method: method)
      expect(response).to have_http_status(:ok)
      expect(employee.reload.name).to eq("New Name")
      expect(employee.attributes.except("name", "updated_at")).to eq(previous.except("name", "updated_at"))
    end
  end

  it "accepts custom countries and departments without imposing a new model allowlist" do
    update_employee(country: "Canada", department: "Research")
    expect(response).to have_http_status(:ok)
    get "/api/v1/employees/options"
    expect(json_response["data"]["countries"]).to include("Canada")
    expect(json_response["data"]["departments"]).to include("Research")
  end

  Employee::DETAIL_FIELDS.each do |field|
    [ nil, " " ].each do |value|
      it "rejects #{field}=#{value.inspect} without changing the original record" do
        original = employee.attributes
        update_employee(**{ field => value, name: field == :name ? value : "Must roll back" })
        expect(response).to have_http_status(422)
        expect(json_response["errors"]).to have_key(field.to_s)
        expect(employee.reload.attributes).to eq(original)
      end
    end
  end

  it "rejects unsupported employee status" do
    update_employee(status: "pending")
    expect(response).to have_http_status(422)
    expect(employee.reload.status).to eq("active")
  end

  it "rejects another employee's business ID without modifying either employee" do
    other = create_employee(employee_id: "OTHER")
    original = employee.attributes
    update_employee(employee_id: other.employee_id, name: "Not saved")
    expect(response).to have_http_status(422)
    expect(json_response["errors"]["employee_id"]).to include("has already been taken")
    expect(employee.reload.attributes).to eq(original)
    expect(other.reload.name).to eq("Alice Morgan")
  end

  %i[base_salary currency effective_date].each do |field|
    it "rejects compensation field #{field} even alongside a valid detail change" do
      original = employee.attributes
      update_employee(**{ name: "Not saved", field => employee.public_send(field) })
      expect(response).to have_http_status(422)
      expect(json_response["errors"].first).to include("confirmed salary endpoint")
      expect(employee.reload.attributes).to eq(original)
      expect(SalaryChange.count).to eq(0)
    end
  end

  it "ignores protected primary keys, timestamps and nested salary history" do
    previous_id = employee.id
    created_at = employee.created_at
    update_employee(name: "Allowed", id: 999999, created_at: "2000-01-01", updated_at: "2000-01-01",
      salary_changes_attributes: [ { new_base_salary: "1" } ])
    expect(response).to have_http_status(:ok)
    expect(employee.reload).to have_attributes(id: previous_id, name: "Allowed", created_at: created_at)
    expect(SalaryChange.count).to eq(0)
  end

  [ nil, "bad", [], [ { name: "Bad" } ], {}, { name: [] } ].each do |payload|
    it "returns JSON 400 for malformed profile payload #{payload.inspect}" do
      original = employee.attributes
      patch "/api/v1/employees/#{employee.id}", params: { employee: payload }, as: :json
      expect(response).to have_http_status(:bad_request)
      expect(json_response["errors"]).not_to be_empty
      expect(employee.reload.attributes).to eq(original)
    end
  end

  it "returns 404 for an unknown employee" do
    patch "/api/v1/employees/999999", params: { employee: { name: "Not found" } }, as: :json
    expect(response).to have_http_status(:not_found)
  end

  it "handles a unique-index race as a validation error" do
    allow_any_instance_of(Employee).to receive(:update!).and_raise(ActiveRecord::RecordNotUnique)
    update_employee(name: "Not saved")
    expect(response).to have_http_status(422)
    expect(json_response["errors"]["employee_id"]).to include("has already been taken")
  end

  it "does not change timestamps or create history for an unchanged profile" do
    original = employee.attributes
    update_employee(employee.attributes.slice(*Employee::DETAIL_FIELDS.map(&:to_s)))
    expect(response).to have_http_status(:ok)
    expect(employee.reload.attributes).to eq(original)
    expect(SalaryChange.count).to eq(0)
  end

  it "refreshes reports after department, country and status changes" do
    employee
    update_employee(department: "Sales", country: "Germany", status: "inactive")
    get "/api/v1/compensation_insights", params: { country: "Germany", department: "Sales", status: "inactive" }
    expect(json_response["data"]["headcount"]).to eq(1)
    get "/api/v1/compensation_insights", params: { country: "India", status: "active" }
    expect(json_response["data"]["headcount"]).to eq(0)
  end

  it "marks existing anomaly evidence stale when profile details change" do
    employee.update!(base_salary: "0")
    post "/api/v1/salary_data_quality_scans"
    anomaly = SalaryDataAnomaly.first
    update_employee(name: "Updated Name")
    get "/api/v1/salary_data_anomalies/#{anomaly.id}"
    expect(json_response["data"]["source_stale"]).to be(true)
    patch "/api/v1/salary_data_anomalies/#{anomaly.id}", params: { review: { status: "investigating" } }, as: :json
    expect(response).to have_http_status(:conflict)
    expect(anomaly.reviews.count).to eq(0)
  end
end

require "rails_helper"

RSpec.describe "Employee salary API", type: :request, authenticated: true do
  let!(:employee) { create_employee }
  let(:salary_change_class) { require_feature!("SalaryChange") }
  let(:salary_path) { "/api/v1/employees/#{employee.id}/salary" }
  let(:history_path) { "/api/v1/employees/#{employee.id}/salary_history" }
  let(:salary_params) do
    { base_salary: "75000.25", currency: "USD", effective_date: "2026-02-01", confirmed: true }
  end

  it "shows current base salary, currency and effective date" do
    get salary_path

    expect(response).to have_http_status(:ok)
    expect(json_response.fetch("data")).to include(
      "base_salary" => "60000.50", "currency" => "INR", "effective_date" => "2026-01-01"
    )
  end

  it "updates a salary after confirmation and records the old and new values" do
    expect {
      patch salary_path, params: { salary: salary_params }, as: :json
    }.to change { salary_change_class.where(employee: employee).count }.by(1)

    expect(response).to have_http_status(:ok)
    expect(json_response.fetch("data")).to include(
      "base_salary" => "75000.25", "currency" => "USD", "effective_date" => "2026-02-01"
    )
    expect(employee.reload.base_salary).to eq(BigDecimal("75000.25"))
    expect(employee.currency).to eq("USD")
    expect(employee.effective_date).to eq(Date.new(2026, 2, 1))

    change = salary_change_class.find_by!(employee: employee)
    expect(change.old_base_salary).to eq(BigDecimal("60000.50"))
    expect(change.new_base_salary).to eq(BigDecimal("75000.25"))
    expect(change.old_currency).to eq("INR")
    expect(change.new_currency).to eq("USD")
    expect(change.old_effective_date).to eq(Date.new(2026, 1, 1))
    expect(change.effective_date).to eq(Date.new(2026, 2, 1))
    expect(change.changed_at).to be_within(5.seconds).of(Time.current)
  end

  [ false, nil, "true" ].each do |confirmed|
    it "requires explicit boolean confirmation instead of #{confirmed.inspect}" do
      original = employee.attributes

      expect {
        patch salary_path, params: { salary: salary_params.merge(confirmed: confirmed) }, as: :json
      }.not_to change { salary_change_class.count }

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json_response.fetch("errors")).not_to be_empty
      expect(employee.reload.attributes).to eq(original)
    end
  end

  [ { base_salary: "-1" }, { base_salary: "abc" }, { base_salary: nil }, { currency: "ZZZ" },
    { currency: nil }, { effective_date: "2026-02-30" }, { effective_date: nil } ].each do |invalid|
    it "rejects #{invalid.inspect} without changing salary or history" do
      original = employee.attributes

      expect {
        patch salary_path, params: { salary: salary_params.merge(invalid) }, as: :json
      }.not_to change { salary_change_class.count }

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json_response.fetch("errors")).not_to be_empty
      expect(employee.reload.attributes).to eq(original)
    end
  end

  it "prevents salary updates from modifying employee identity" do
    patch salary_path, params: { salary: salary_params.merge(employee_id: "REPLACED", name: "Replaced") }, as: :json

    expect(response).to have_http_status(:ok)
    expect(employee.reload.employee_id).to eq("EMP001")
    expect(employee.name).to eq("Alice Morgan")
  end

  it "returns an empty history for an employee with no changes" do
    get history_path

    expect(response).to have_http_status(:ok)
    expect(json_response.fetch("data")).to eq([])
  end

  it "preserves earlier history and returns the newest change first" do
    travel_to(Time.utc(2026, 1, 15, 10)) do
      patch salary_path, params: { salary: salary_params }, as: :json
      expect(response).to have_http_status(:ok)
    end
    first_change = salary_change_class.find_by!(employee: employee)
    original_history = first_change.attributes

    travel_to(Time.utc(2026, 1, 16, 10)) do
      patch salary_path, params: { salary: salary_params.merge(base_salary: "80000", effective_date: "2026-03-01") }, as: :json
      expect(response).to have_http_status(:ok)
    end

    expect(first_change.reload.attributes).to eq(original_history)
    get history_path

    expect(response).to have_http_status(:ok)
    history = json_response.fetch("data")
    expect(history.size).to eq(2)
    expect(history.first).to include(
      "old_base_salary" => "75000.25", "new_base_salary" => "80000.00",
      "old_currency" => "USD", "new_currency" => "USD",
      "old_effective_date" => "2026-02-01", "effective_date" => "2026-03-01"
    )
    expect(Time.iso8601(history.first.fetch("changed_at"))).to eq(Time.utc(2026, 1, 16, 10))
    expect(history.last.fetch("new_base_salary")).to eq("75000.25")
  end

  it "does not include another employee's salary history" do
    other_employee = create_employee(employee_id: "EMP002")
    patch "/api/v1/employees/#{other_employee.id}/salary", params: { salary: salary_params }, as: :json
    expect(response).to have_http_status(:ok)

    get history_path

    expect(response).to have_http_status(:ok)
    expect(json_response.fetch("data")).to eq([])
  end

  it "returns 404 when updating a missing employee" do
    patch "/api/v1/employees/0/salary", params: { salary: salary_params }, as: :json

    expect(response).to have_http_status(:not_found)
  end

  it "returns 404 for the history of a missing employee" do
    get "/api/v1/employees/0/salary_history"

    expect(response).to have_http_status(:not_found)
  end
end

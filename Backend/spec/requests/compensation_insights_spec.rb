require "rails_helper"

RSpec.describe "Compensation insights API", type: :request, authenticated: true do
  before do
    create_employee(employee_id: "EMP001", base_salary: "100", department: "Engineering")
    create_employee(employee_id: "EMP002", base_salary: "300", department: "Finance", status: "inactive")
    create_employee(employee_id: "EMP003", base_salary: "1000", currency: "USD", department: "Finance")
    create_employee(employee_id: "EMP004", base_salary: "3000", currency: "USD", country: "United Kingdom")
  end

  it "returns headcount and currency-specific compensation statistics" do
    get "/api/v1/compensation_insights"

    expect(response).to have_http_status(:ok)
    data = json_response.fetch("data")
    expect(data.fetch("headcount")).to eq(4)
    expect(data.fetch("currencies").fetch("INR")).to include(
      "headcount" => 2, "total_base_salary" => "400.00",
      "average_base_salary" => "200.00", "median_base_salary" => "200.00",
      "monthly_payroll_estimate" => "33.33", "minimum_base_salary" => "100.00", "maximum_base_salary" => "300.00"
    )
    expect(data.fetch("currencies").fetch("USD")).to include(
      "headcount" => 2, "total_base_salary" => "4000.00",
      "average_base_salary" => "2000.00", "median_base_salary" => "2000.00",
      "monthly_payroll_estimate" => "333.33", "minimum_base_salary" => "1000.00", "maximum_base_salary" => "3000.00"
    )
    expect(data.keys).not_to include("total_base_salary", "average_base_salary", "median_base_salary")
  end

  it "includes distributions by country and department within each currency" do
    get "/api/v1/compensation_insights"

    expect(response).to have_http_status(:ok)
    groups = json_response.fetch("data").fetch("currencies")
    expect(groups.fetch("INR").fetch("by_country").fetch("India")).to include(
      "headcount" => 2, "total_base_salary" => "400.00"
    )
    expect(groups.fetch("INR").fetch("by_department").fetch("Finance")).to include(
      "headcount" => 1, "total_base_salary" => "300.00", "monthly_payroll_estimate" => "25.00",
      "minimum_base_salary" => "300.00", "maximum_base_salary" => "300.00"
    )
    expect(groups.fetch("USD").fetch("by_country").fetch("India")).to include(
      "headcount" => 1, "total_base_salary" => "1000.00"
    )
  end

  it "supports combined country, department and status filters" do
    get "/api/v1/compensation_insights", params: { country: "India", department: "Finance", status: "active" }

    expect(response).to have_http_status(:ok)
    data = json_response.fetch("data")
    expect(data.fetch("headcount")).to eq(1)
    expect(data.fetch("currencies").keys).to eq([ "USD" ])
    expect(data.fetch("currencies").fetch("USD").fetch("total_base_salary")).to eq("1000.00")
  end

  it "returns an empty summary for filters with no matches" do
    get "/api/v1/compensation_insights", params: { country: "Missing" }

    expect(response).to have_http_status(:ok)
    expect(json_response.fetch("data")).to eq("headcount" => 0, "country_headcounts" => {}, "currencies" => {})
  end

  it "rejects an unsupported status filter" do
    get "/api/v1/compensation_insights", params: { status: "unknown" }

    expect(response).to have_http_status(:unprocessable_entity)
    expect(json_response.fetch("errors")).not_to be_empty
  end

  it "includes the latest persisted salary after an update" do
    employee = require_feature!("Employee").find_by!(employee_id: "EMP001")
    patch "/api/v1/employees/#{employee.id}/salary", params: {
      salary: { base_salary: "500", currency: "INR", effective_date: "2026-02-01", confirmed: true }
    }, as: :json
    expect(response).to have_http_status(:ok)

    get "/api/v1/compensation_insights"

    expect(response).to have_http_status(:ok)
    expect(json_response.fetch("data").fetch("currencies").fetch("INR")).to include(
      "total_base_salary" => "800.00", "average_base_salary" => "400.00", "median_base_salary" => "400.00"
    )
  end

  it "exposes consolidated country counts and explicit salary bands in the API" do
    get "/api/v1/compensation_insights"
    data = json_response.fetch("data")
    expect(data.fetch("country_headcounts")).to eq("India" => 3, "United Kingdom" => 1)
    inr = data.fetch("currencies").fetch("INR")
    expect(inr.fetch("salary_bands").first).to eq("lower_bound" => "0.00", "upper_bound" => "500000.00", "headcount" => 2)
    expect(inr.fetch("salary_bands").last.fetch("upper_bound")).to be_nil
    expect(inr.fetch("by_department").fetch("Finance").fetch("salary_bands").first.fetch("headcount")).to eq(1)
  end

  it "applies combined filters to country counts and department salary bands" do
    get "/api/v1/compensation_insights", params: { country: "India", department: "Finance", status: "active" }
    data = json_response.fetch("data")
    expect(data.fetch("country_headcounts")).to eq("India" => 1)
    finance = data.fetch("currencies").fetch("USD").fetch("by_department").fetch("Finance")
    expect(finance.fetch("salary_bands").map { |band| band.fetch("headcount") }).to eq([ 1, 0, 0, 0 ])
  end

  it "moves salary band membership after a confirmed salary update" do
    employee = Employee.find_by!(employee_id: "EMP001")
    patch "/api/v1/employees/#{employee.id}/salary", params: {
      salary: { base_salary: "600000", currency: "INR", effective_date: "2026-11-01", confirmed: true }
    }, as: :json
    expect(response).to have_http_status(:ok)
    get "/api/v1/compensation_insights"
    data = json_response.fetch("data")
    engineering = data.fetch("currencies").fetch("INR").fetch("by_department").fetch("Engineering")
    expect(engineering.fetch("salary_bands").map { |band| band.fetch("headcount") }).to eq([ 0, 1, 0, 0 ])
    expect(data.fetch("country_headcounts")).to eq("India" => 3, "United Kingdom" => 1)
  end
end

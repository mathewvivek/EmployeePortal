require "rails_helper"

RSpec.describe "Salary analysis API", type: :request, authenticated: true do
  before do
    %w[100 200 300 400 1000].each_with_index { |salary, index| create_employee(employee_id: "EMP#{index}", base_salary: salary) }
  end

  it "returns role comparisons and pagination metadata" do
    get "/api/v1/salary_analysis"
    expect(response).to have_http_status(:ok)
    expect(response.headers["Cache-Control"]).to eq("no-store")
    expect(json_response.fetch("data").first).to include("designation" => "Software Engineer", "headcount" => 5,
      "minimum_base_salary" => "100.00", "maximum_base_salary" => "1000.00", "salary_gap" => "900.00")
    expect(json_response.fetch("meta")).to include("report" => "roles", "total_count" => 1)
  end

  it "returns high outliers with the comparison average, threshold and group size" do
    get "/api/v1/salary_analysis", params: { report: "outliers" }
    expect(response).to have_http_status(:ok)
    expect(response_employee_ids).to eq([ "EMP4" ])
    expect(json_response.fetch("data").first).to include("comparison_average" => "400.00", "comparison_threshold" => "700.00",
      "comparison_headcount" => 5, "salary_difference" => "300.00")
    expect(json_response.fetch("meta")).to include("minimum_peer_count" => 5)
  end

  it "returns below-average employees using the full cohort even on a small page" do
    get "/api/v1/salary_analysis", params: { report: "below_department_average", page: 2, per_page: 1 }
    expect(response).to have_http_status(:ok)
    expect(response_employee_ids).to eq([ "EMP1" ])
    expect(json_response.fetch("data").first).to include("comparison_average" => "400.00", "salary_difference" => "200.00")
    expect(json_response.fetch("meta")).to include("page" => 2, "total_count" => 3, "total_pages" => 3)
  end

  it "applies filters and returns empty reports without matches" do
    get "/api/v1/salary_analysis", params: { country: "Missing", currency: "USD" }
    expect(response).to have_http_status(:ok)
    expect(json_response.fetch("data")).to eq([])
    expect(json_response.fetch("meta").fetch("total_count")).to eq(0)
  end

  [ { report: "unknown" }, { currency: "XYZ" }, { status: "unknown" }, { page: "-1" }, { per_page: "0" } ].each do |params|
    it "returns validation errors for #{params.inspect}" do
      get "/api/v1/salary_analysis", params: params
      expect(response).to have_http_status(:unprocessable_content)
      expect(json_response.fetch("errors")).not_to be_empty
    end
  end

  it "reflects a confirmed salary change in role, outlier and below-average reports" do
    employee = Employee.find_by!(employee_id: "EMP4")
    patch "/api/v1/employees/#{employee.id}/salary", params: {
      salary: { base_salary: "400", currency: "INR", effective_date: "2026-11-01", confirmed: true }
    }, as: :json
    expect(response).to have_http_status(:ok)
    get "/api/v1/salary_analysis", params: { report: "outliers" }
    expect(json_response.fetch("data")).to be_empty
    get "/api/v1/salary_analysis", params: { report: "roles" }
    expect(json_response.fetch("data").first.fetch("average_base_salary")).to eq("280.00")
    get "/api/v1/salary_analysis", params: { report: "below_department_average" }
    expect(response_employee_ids).to eq(%w[EMP1 EMP0])
  end
end

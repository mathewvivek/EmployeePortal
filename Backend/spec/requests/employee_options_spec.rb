require "rails_helper"

RSpec.describe "Employee form options", type: :request, authenticated: true do
  it "returns standard choices for an empty database without requiring seed data" do
    get "/api/v1/employees/options"
    expect(response).to have_http_status(:ok)
    expect(json_response["data"]).to eq("countries" => EmployeeFormOptions::COUNTRIES.sort,
      "departments" => EmployeeFormOptions::DEPARTMENTS.sort)
    expect(response.headers["Cache-Control"]).to eq("no-store")
  end

  it "includes distinct custom values from both active and inactive employees" do
    create_employee(country: "Canada", department: "Research", status: "inactive")
    create_employee(employee_id: "OTHER", country: "Canada", department: "Research")
    get "/api/v1/employees/options"
    expect(json_response["data"]["countries"]).to eq((EmployeeFormOptions::COUNTRIES + [ "Canada" ]).sort)
    expect(json_response["data"]["departments"]).to eq((EmployeeFormOptions::DEPARTMENTS + [ "Research" ]).sort)
    expect(response.body).not_to include("Alice Morgan", "60000.50", "EMP001")
  end

  it "excludes blank values imported without Rails validation" do
    create_employee.update_columns(country: " ", department: "")
    get "/api/v1/employees/options"
    expect(json_response["data"]["countries"]).not_to include(" ")
    expect(json_response["data"]["departments"]).not_to include("")
  end
end

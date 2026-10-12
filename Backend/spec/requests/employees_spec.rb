require "rails_helper"

RSpec.describe "Employee directory API", type: :request do
  before do
    create_employee(employee_id: "EMP001", name: "Alice Morgan", base_salary: "60000.50")
    create_employee(employee_id: "EMP002", name: "Bob Chen", country: "United States",
      department: "Finance", currency: "USD", base_salary: "90000")
    create_employee(employee_id: "EMP003", name: "Carla Jones", country: "United Kingdom",
      status: "inactive", currency: "GBP", base_salary: "75000")
    create_employee(employee_id: "EMP004", name: "David Singh", department: "Finance",
      status: "inactive", base_salary: "50000")
  end

  it "returns employee directory fields and salary details" do
    get "/api/v1/employees"

    expect(response).to have_http_status(:ok)
    expect(response.media_type).to eq("application/json")
    expect(json_response.fetch("data").first).to include(
      "employee_id" => "EMP001", "name" => "Alice Morgan", "department" => "Engineering",
      "country" => "India", "designation" => "Software Engineer", "status" => "active",
      "base_salary" => "60000.50", "currency" => "INR", "effective_date" => "2026-01-01"
    )
  end

  it "defaults to a stable employee ID order and 25 results per page" do
    get "/api/v1/employees"

    expect(response).to have_http_status(:ok)
    expect(response_employee_ids).to eq(%w[EMP001 EMP002 EMP003 EMP004])
    expect(json_response.fetch("meta")).to include(
      "page" => 1, "per_page" => 25, "total_count" => 4, "total_pages" => 1
    )
  end

  it "returns separate pages with correct metadata" do
    get "/api/v1/employees", params: { page: 1, per_page: 2 }

    expect(response).to have_http_status(:ok)
    expect(response_employee_ids).to eq(%w[EMP001 EMP002])
    expect(json_response.fetch("meta")).to include(
      "page" => 1, "per_page" => 2, "total_count" => 4, "total_pages" => 2
    )

    get "/api/v1/employees", params: { page: 2, per_page: 2 }

    expect(response).to have_http_status(:ok)
    expect(response_employee_ids).to eq(%w[EMP003 EMP004])
  end

  it "caps page size at 100" do
    get "/api/v1/employees", params: { per_page: 500 }

    expect(response).to have_http_status(:ok)
    expect(json_response.fetch("meta").fetch("per_page")).to eq(100)
  end

  [ { page: 0 }, { page: -1 }, { page: "abc" }, { per_page: 0 }, { per_page: -1 }, { per_page: "abc" } ].each do |params|
    it "rejects invalid pagination #{params.inspect}" do
      get "/api/v1/employees", params: params

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json_response.fetch("errors")).not_to be_empty
    end
  end

  it "returns an empty page beyond the last page" do
    get "/api/v1/employees", params: { page: 3, per_page: 2 }

    expect(response).to have_http_status(:ok)
    expect(json_response.fetch("data")).to eq([])
    expect(json_response.fetch("meta").fetch("total_count")).to eq(4)
  end

  it "searches names without regard to case" do
    get "/api/v1/employees", params: { q: "ALICE" }

    expect(response).to have_http_status(:ok)
    expect(response_employee_ids).to eq([ "EMP001" ])
  end

  it "searches by employee ID" do
    get "/api/v1/employees", params: { q: "EMP003" }

    expect(response).to have_http_status(:ok)
    expect(response_employee_ids).to eq([ "EMP003" ])
  end

  it "treats search wildcard characters literally" do
    create_employee(employee_id: "EMP005", name: "100% Analyst")

    get "/api/v1/employees", params: { q: "%" }

    expect(response).to have_http_status(:ok)
    expect(response_employee_ids).to eq([ "EMP005" ])
  end

  it "does not interpret search input as SQL" do
    get "/api/v1/employees", params: { q: "' OR 1=1 --" }

    expect(response).to have_http_status(:ok)
    expect(response_employee_ids).to eq([])
  end

  {
    country: [ "India", %w[EMP001 EMP004] ],
    department: [ "Finance", %w[EMP002 EMP004] ],
    status: [ "inactive", %w[EMP003 EMP004] ]
  }.each do |filter, (value, ids)|
    it "filters by #{filter}" do
      get "/api/v1/employees", params: { filter => value }

      expect(response).to have_http_status(:ok)
      expect(response_employee_ids).to eq(ids)
    end
  end

  it "combines search, all filters and pagination" do
    get "/api/v1/employees", params: {
      q: "Singh", country: "India", department: "Finance", status: "inactive", per_page: 1
    }

    expect(response).to have_http_status(:ok)
    expect(response_employee_ids).to eq([ "EMP004" ])
    expect(json_response.fetch("meta").fetch("total_count")).to eq(1)
  end

  it "returns an empty result and zero total pages for no matches" do
    get "/api/v1/employees", params: { q: "Nobody" }

    expect(response).to have_http_status(:ok)
    expect(response_employee_ids).to eq([])
    expect(json_response.fetch("meta")).to include("total_count" => 0, "total_pages" => 0)
  end

  { "asc" => %w[EMP004 EMP001 EMP003 EMP002], "desc" => %w[EMP002 EMP003 EMP001 EMP004] }.each do |direction, ids|
    it "sorts base salary #{direction} numerically" do
      get "/api/v1/employees", params: { sort: "base_salary", direction: direction }

      expect(response).to have_http_status(:ok)
      expect(response_employee_ids).to eq(ids)
    end
  end

  it "breaks salary ties with employee ID for stable pagination" do
    create_employee(employee_id: "EMP005", base_salary: "50000")

    get "/api/v1/employees", params: { sort: "base_salary", direction: "asc", per_page: 2 }

    expect(response).to have_http_status(:ok)
    expect(response_employee_ids).to eq(%w[EMP004 EMP005])
  end

  [ { sort: "name; DROP TABLE employees" }, { direction: "sideways" }, { status: "unknown" } ].each do |params|
    it "rejects invalid directory parameters #{params.inspect}" do
      get "/api/v1/employees", params: params

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json_response.fetch("errors")).not_to be_empty
    end
  end

  it "shows an employee by database ID" do
    employee = require_feature!("Employee").find_by!(employee_id: "EMP001")

    get "/api/v1/employees/#{employee.id}"

    expect(response).to have_http_status(:ok)
    expect(json_response.fetch("data").fetch("employee_id")).to eq("EMP001")
  end

  it "returns 404 for an employee that does not exist" do
    get "/api/v1/employees/0"

    expect(response).to have_http_status(:not_found)
  end
end

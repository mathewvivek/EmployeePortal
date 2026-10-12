require "rails_helper"

RSpec.describe "Employee creation", type: :request, authenticated: true do
  def submit(attributes = employee_attributes)
    post "/api/v1/employees", params: { employee: attributes }, as: :json
  end

  it "persists and returns an employee with decimal salary and a resource location" do
    expect { submit }.to change(Employee, :count).by(1)
    expect(response).to have_http_status(:created)
    employee = Employee.last
    expect(response.headers["Location"]).to end_with("/api/v1/employees/#{employee.id}")
    expect(json_response.fetch("data")).to include(
      "id" => employee.id, "employee_id" => "EMP001", "name" => "Alice Morgan",
      "base_salary" => "60000.50", "currency" => "INR", "effective_date" => "2026-01-01"
    )
    expect(employee.salary_changes).to be_empty
    get "/api/v1/compensation_insights"
    expect(json_response.fetch("data").fetch("headcount")).to eq(1)
  end

  it "accepts zero salary, inactive status, new departments and future dates" do
    submit(employee_attributes(base_salary: "0", status: "inactive", department: "Research",
      country: "Canada", currency: "USD", effective_date: "2030-01-01"))
    expect(response).to have_http_status(:created)
    expect(json_response.fetch("data")).to include("base_salary" => "0.00", "status" => "inactive")
  end

  employee_fields = %i[employee_id name department country designation status base_salary currency effective_date]
  employee_fields.each do |field|
    it "rejects missing #{field} without inserting an employee" do
      expect { submit(employee_attributes.except(field)) }.not_to change(Employee, :count)
      expect(response).to have_http_status(422)
      expect(json_response.fetch("errors").fetch(field.to_s)).not_to be_empty
    end
  end

  { employee_id: "   ", name: "   ", department: "   ", country: "   ", designation: "   ",
    status: "pending", base_salary: "-0.01", currency: "CAD", effective_date: "2026-02-30" }.each do |field, value|
    it "rejects invalid #{field}" do
      expect { submit(employee_attributes(**{ field => value })) }.not_to change(Employee, :count)
      expect(response).to have_http_status(422)
      expect(json_response.fetch("errors").fetch(field.to_s)).not_to be_empty
    end
  end

  it "rejects a nonnumeric salary" do
    submit(employee_attributes(base_salary: "not a salary"))
    expect(response).to have_http_status(422)
    expect(Employee.count).to eq(0)
  end

  it "rejects duplicate employee IDs without changing the original" do
    original = create_employee
    attributes = original.attributes
    expect { submit(employee_attributes(name: "Another employee")) }.not_to change(Employee, :count)
    expect(response).to have_http_status(422)
    expect(json_response.fetch("errors").fetch("employee_id")).to include("has already been taken")
    expect(original.reload.attributes).to eq(attributes)
  end

  [ nil, "employee", [], [ { name: "Alice" } ], {} ].each do |payload|
    it "returns JSON bad request for malformed employee payload #{payload.inspect}" do
      post "/api/v1/employees", params: { employee: payload }, as: :json
      expect(response).to have_http_status(:bad_request)
      expect(json_response.fetch("errors")).not_to be_empty
      expect(Employee.count).to eq(0)
    end
  end

  it "ignores primary keys, timestamps and nested history supplied by clients" do
    submit(employee_attributes.merge(id: 987654, created_at: "2000-01-01",
      salary_changes_attributes: [ { new_base_salary: "1" } ]))
    expect(response).to have_http_status(:created)
    expect(Employee.last.id).not_to eq(987654)
    expect(Employee.last.created_at.year).not_to eq(2000)
    expect(SalaryChange.count).to eq(0)
  end

  it "returns a validation error when the unique index detects a concurrent duplicate" do
    allow(Employee).to receive(:create!).and_raise(ActiveRecord::RecordNotUnique)
    submit
    expect(response).to have_http_status(422)
    expect(json_response.fetch("errors").fetch("employee_id")).to include("has already been taken")
  end
end

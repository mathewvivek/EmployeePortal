module EmployeeSpecHelpers
  def require_feature!(name)
    expect(Object.const_defined?(name)).to be(true),
      "#{name} is not implemented. This is an intentional red-phase feature spec."
    Object.const_get(name)
  end

  def employee_attributes(**overrides)
    {
      employee_id: "EMP001",
      name: "Alice Morgan",
      department: "Engineering",
      country: "India",
      designation: "Software Engineer",
      status: "active",
      base_salary: "60000.50",
      currency: "INR",
      effective_date: "2026-01-01"
    }.merge(overrides)
  end

  def create_employee(**overrides)
    require_feature!("Employee").create!(employee_attributes(**overrides))
  end

  def json_response
    JSON.parse(response.body)
  end

  def response_employee_ids
    json_response.fetch("data").map { |employee| employee.fetch("employee_id") }
  end

  def expect_validation_error(record, attribute, value)
    # Enum writers can reject unsupported values before validation runs.
    begin
      record.public_send("#{attribute}=", value)
    rescue ArgumentError
      expect(attribute).to eq(:status)
      return
    end

    expect(record).not_to be_valid
    expect(record.errors[attribute]).not_to be_empty
  end
end

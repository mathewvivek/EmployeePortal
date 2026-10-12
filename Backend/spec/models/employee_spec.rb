require "rails_helper"

RSpec.describe "Employee", type: :model do
  subject(:employee) { employee_class.new(employee_attributes) }

  let(:employee_class) { require_feature!("Employee") }

  it "persists complete employee details" do
    employee.save!

    expect(employee.reload.attributes.symbolize_keys).to include(
      employee_id: "EMP001",
      name: "Alice Morgan",
      department: "Engineering",
      country: "India",
      designation: "Software Engineer",
      status: "active",
      currency: "INR",
      effective_date: Date.new(2026, 1, 1)
    )
    expect(employee.base_salary).to eq(BigDecimal("60000.50"))
  end

  %i[employee_id name department country designation status currency effective_date base_salary].each do |attribute|
    [ nil, "" ].each do |value|
      it "rejects #{attribute} when it is #{value.inspect}" do
        expect_validation_error(employee, attribute, value)
      end
    end
  end

  %i[employee_id name department country designation].each do |attribute|
    it "rejects whitespace-only #{attribute}" do
      expect_validation_error(employee, attribute, "   ")
    end
  end

  it "requires a unique employee ID" do
    create_employee

    expect(employee).not_to be_valid
    expect(employee.errors[:employee_id]).not_to be_empty
  end

  it "allows an existing employee to retain its own ID" do
    employee.save!

    expect(employee).to be_valid
  end

  it "allows different employees to share a name" do
    create_employee
    employee.employee_id = "EMP002"

    expect(employee).to be_valid
  end

  %w[active inactive].each do |status|
    it "accepts the #{status} status" do
      employee.status = status

      expect(employee).to be_valid
    end
  end

  it "rejects an unsupported status" do
    expect_validation_error(employee, :status, "unknown")
  end

  [ "0", "1250.75" ].each do |amount|
    it "accepts a nonnegative salary of #{amount}" do
      employee.base_salary = amount

      expect(employee).to be_valid
    end
  end

  [ "-0.01", "-100", "not-a-number" ].each do |amount|
    it "rejects salary #{amount.inspect}" do
      expect_validation_error(employee, :base_salary, amount)
    end
  end

  %w[INR USD GBP EUR JPY].each do |currency|
    it "supports ISO currency #{currency}" do
      employee.currency = currency

      expect(employee).to be_valid
    end
  end

  %w[ZZZ usd US].each do |currency|
    it "rejects unsupported or malformed currency #{currency}" do
      expect_validation_error(employee, :currency, currency)
    end
  end

  [ "not-a-date", "2026-02-30" ].each do |date|
    it "rejects invalid effective date #{date.inspect}" do
      expect_validation_error(employee, :effective_date, date)
    end
  end

  it "accepts a valid future effective date" do
    employee.effective_date = Date.current + 30.days

    expect(employee).to be_valid
  end
end

require "rails_helper"

RSpec.describe "SalaryChange", type: :model do
  subject(:change) { salary_change_class.new(attributes) }

  let(:salary_change_class) { require_feature!("SalaryChange") }
  let(:employee) { create_employee }
  let(:attributes) do
    {
      employee: employee,
      old_base_salary: "60000.50",
      new_base_salary: "75000.25",
      old_currency: "INR",
      new_currency: "USD",
      old_effective_date: "2026-01-01",
      effective_date: "2026-02-01",
      changed_at: Time.utc(2026, 1, 15, 10)
    }
  end

  it "preserves both salary values, both currencies, dates and change timestamp" do
    change.save!

    expect(change.reload.employee).to eq(employee)
    expect(change.old_base_salary).to eq(BigDecimal("60000.50"))
    expect(change.new_base_salary).to eq(BigDecimal("75000.25"))
    expect(change.old_currency).to eq("INR")
    expect(change.new_currency).to eq("USD")
    expect(change.old_effective_date).to eq(Date.new(2026, 1, 1))
    expect(change.effective_date).to eq(Date.new(2026, 2, 1))
    expect(change.changed_at).to eq(attributes.fetch(:changed_at))
  end

  %i[employee old_base_salary new_base_salary old_currency new_currency old_effective_date effective_date changed_at].each do |attribute|
    it "requires #{attribute}" do
      expect_validation_error(change, attribute, nil)
    end
  end

  %i[old_base_salary new_base_salary].each do |attribute|
    it "rejects negative #{attribute}" do
      expect_validation_error(change, attribute, "-0.01")
    end

    it "accepts zero #{attribute}" do
      change.public_send("#{attribute}=", "0")

      expect(change).to be_valid
    end
  end

  %i[old_currency new_currency].each do |attribute|
    it "rejects unsupported #{attribute}" do
      expect_validation_error(change, attribute, "ZZZ")
    end
  end

  %i[old_effective_date effective_date].each do |attribute|
    it "rejects malformed #{attribute}" do
      expect_validation_error(change, attribute, "not-a-date")
    end
  end
end

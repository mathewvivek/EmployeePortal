require "rails_helper"

RSpec.describe "SalaryUpdater", type: :service do
  let(:updater) { require_feature!("SalaryUpdater") }
  let(:salary_change_class) { require_feature!("SalaryChange") }
  let(:employee) { create_employee }
  let(:params) do
    { employee: employee, base_salary: "75000.25", currency: "USD",
      effective_date: "2026-02-01", confirmed: true }
  end

  it "updates the employee and creates exactly one audit record" do
    expect { updater.call(**params) }.to change { salary_change_class.count }.by(1)

    expect(employee.reload.base_salary).to eq(BigDecimal("75000.25"))
    change = salary_change_class.find_by!(employee: employee)
    expect(change.old_base_salary).to eq(BigDecimal("60000.50"))
    expect(change.new_base_salary).to eq(BigDecimal("75000.25"))
  end

  it "rejects an unconfirmed update" do
    original = employee.attributes

    expect { updater.call(**params.merge(confirmed: false)) }.to raise_error(ArgumentError)

    expect(employee.reload.attributes).to eq(original)
    expect(salary_change_class.where(employee: employee)).to be_empty
  end

  it "rejects invalid salary data without persisting a partial update" do
    original = employee.attributes

    expect { updater.call(**params.merge(base_salary: "-1")) }.to raise_error(ActiveRecord::RecordInvalid)

    expect(employee.reload.attributes).to eq(original)
    expect(salary_change_class.where(employee: employee)).to be_empty
  end

  it "rolls back salary changes if recording history fails" do
    history_class = salary_change_class
    original = employee.attributes
    callback = -> { raise ActiveRecord::RecordInvalid.new(self) }
    history_class.set_callback(:create, :before, callback)

    expect { updater.call(**params) }.to raise_error(ActiveRecord::RecordInvalid)

    expect(employee.reload.attributes).to eq(original)
    expect(history_class.where(employee: employee)).to be_empty
  ensure
    history_class.skip_callback(:create, :before, callback) if history_class && callback
  end

  it "records a currency-only change even when the amount is unchanged" do
    expect {
      updater.call(**params.merge(base_salary: "60000.50", effective_date: "2026-01-01"))
    }.to change { salary_change_class.count }.by(1)

    change = salary_change_class.find_by!(employee: employee)
    expect(change.old_currency).to eq("INR")
    expect(change.new_currency).to eq("USD")
    expect(change.old_base_salary).to eq(change.new_base_salary)
  end

  it "records an effective-date-only change" do
    expect {
      updater.call(**params.merge(base_salary: "60000.50", currency: "INR"))
    }.to change { salary_change_class.count }.by(1)

    change = salary_change_class.find_by!(employee: employee)
    expect(change.old_effective_date).to eq(Date.new(2026, 1, 1))
    expect(change.effective_date).to eq(Date.new(2026, 2, 1))
  end

  it "does not record a change when salary, currency and date are unchanged" do
    original = employee.attributes

    expect {
      updater.call(**params.merge(base_salary: "60000.50", currency: "INR", effective_date: "2026-01-01"))
    }.not_to change { salary_change_class.count }

    expect(employee.reload.attributes).to eq(original)
  end
end

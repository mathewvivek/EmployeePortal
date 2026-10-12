require "rails_helper"

RSpec.describe EmployeeSeedData do
  it "generates 10000 deterministic employees with unique IDs and full names" do
    rows = described_class.rows.to_a

    expect(rows.length).to eq(10_000)
    expect(rows.map { |row| row.fetch(:employee_id) }.uniq.length).to eq(10_000)
    expect(rows.map { |row| row.fetch(:name) }.uniq.length).to eq(10_000)
    expect(rows.first.fetch(:employee_id)).to eq("SEED00001")
    expect(rows.last.fetch(:employee_id)).to eq("SEED10000")
    expect(rows.first(10)).to eq(described_class.rows.first(10))
  end

  it "uses 100 distinct first names and 100 distinct last names" do
    expect(described_class::FIRST_NAMES.length).to eq(100)
    expect(described_class::FIRST_NAMES.uniq.length).to eq(100)
    expect(described_class::LAST_NAMES.length).to eq(100)
    expect(described_class::LAST_NAMES.uniq.length).to eq(100)
    rows = described_class.rows.to_a
    expect(rows.map { |row| row.fetch(:name).split.first }.uniq.length).to eq(100)
    expect(rows.map { |row| row.fetch(:name).split.last }.uniq.length).to eq(100)
  end

  it "provides valid details across all supported currencies and departments" do
    described_class.rows.first(35).each do |attributes|
      expect(Employee.new(attributes)).to be_valid
    end
  end

  it "loads batches idempotently and preserves existing employee details" do
    existing = create_employee(employee_id: "SEED00001")
    original = existing.attributes

    expect { described_class.load!(count: 7, batch_size: 3) }.to change(Employee, :count).by(6)
    expect(existing.reload.attributes).to eq(original)
    expect(described_class.load!(count: 7, batch_size: 3)).to eq(0)
    expect(Employee.count).to eq(7)
  end

  it "prevents synthetic seeding in production" do
    allow(Rails).to receive(:env).and_return(ActiveSupport::EnvironmentInquirer.new("production"))
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with("ALLOW_PRODUCTION_SEEDS").and_return(nil)

    expect { described_class.load!(count: 1) }.to raise_error(ArgumentError, /development or test/)
    expect { described_class.load!(count: 1, refresh_names: true) }.to raise_error(ArgumentError, /development or test/)
    expect(Employee.count).to eq(0)
  end

  it "loads 10000 unique employees in explicitly opted-in production without overwriting existing records" do
    existing = create_employee(employee_id: "EMP_CUSTOM")
    original = existing.attributes
    allow(Rails).to receive(:env).and_return(ActiveSupport::EnvironmentInquirer.new("production"))
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with("ALLOW_PRODUCTION_SEEDS").and_return("true")

    expect { described_class.load! }.to change(Employee, :count).by(10_000)
    seeded = Employee.where.not(id: existing.id)
    expect(seeded.distinct.count(:employee_id)).to eq(10_000)
    expect(seeded.distinct.count(:name)).to eq(10_000)
    expect(existing.reload.attributes).to eq(original)
    expect(described_class.load!).to eq(0)
    expect(Employee.count).to eq(10_001)
    expect(SalaryChange.count).to eq(0)
  end

  %w[false yes].each do |permission|
    it "rejects a non-boolean production seed opt-in #{permission}" do
      allow(Rails).to receive(:env).and_return(ActiveSupport::EnvironmentInquirer.new("production"))
      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with("ALLOW_PRODUCTION_SEEDS").and_return(permission)

      expect { described_class.load!(count: 1) }.to raise_error(ArgumentError, /ALLOW_PRODUCTION_SEEDS=true/)
      expect(Employee.count).to eq(0)
    end
  end

  it "rejects invalid counts and batch sizes before writing records" do
    expect { described_class.load!(count: 0) }.to raise_error(ArgumentError, /Seed count/)
    expect { described_class.load!(count: 10_001, refresh_names: true) }.to raise_error(ArgumentError, /unique full names/)
    expect { described_class.load!(count: 1, batch_size: 0) }.to raise_error(ArgumentError, /Batch size/)
    expect(Employee.count).to eq(0)
  end

  it "refreshes seed names without replacing IDs, salary details or unrelated employees" do
    existing = create_employee(employee_id: "SEED00001", base_salary: "123.45", currency: "GBP")
    original = existing.attributes.except("name", "updated_at")
    unrelated = create_employee(employee_id: "EMP_CUSTOM")
    unrelated_attributes = unrelated.attributes

    expect { described_class.load!(count: 3, batch_size: 2, refresh_names: true) }.to change(Employee, :count).by(2)
    expect(existing.reload.name).to eq(described_class.rows.first.fetch(:name))
    expect(existing.attributes.except("name", "updated_at")).to eq(original)
    expect(unrelated.reload.attributes).to eq(unrelated_attributes)
    expect(SalaryChange.count).to eq(0)
    refreshed = Employee.order(:employee_id).map(&:attributes)
    expect(described_class.load!(count: 3, refresh_names: true)).to eq(3)
    expect(Employee.order(:employee_id).map(&:attributes)).to eq(refreshed)
  end
end

require "rails_helper"

RSpec.describe "CompensationInsights", type: :service do
  let(:insights) { require_feature!("CompensationInsights") }
  let(:employee_class) { require_feature!("Employee") }
  let(:result) { insights.call(employees: employee_class.all) }

  before do
    create_employee(employee_id: "EMP001", base_salary: "100", department: "Engineering")
    create_employee(employee_id: "EMP002", base_salary: "300", department: "Finance", status: "inactive")
    create_employee(employee_id: "EMP003", base_salary: "1000", currency: "USD", department: "Finance")
    create_employee(employee_id: "EMP004", base_salary: "3000", currency: "USD", country: "United Kingdom")
  end

  it "reports headcount across all statuses" do
    expect(result.fetch(:headcount)).to eq(4)
  end

  it "calculates total, average and even-count median separately for each currency" do
    expect(result.fetch(:currencies).fetch("INR")).to include(
      headcount: 2, total_base_salary: "400.00", average_base_salary: "200.00", median_base_salary: "200.00"
    )
    expect(result.fetch(:currencies).fetch("USD")).to include(
      headcount: 2, total_base_salary: "4000.00", average_base_salary: "2000.00", median_base_salary: "2000.00"
    )
  end

  it "does not expose a total, average or median that mixes currencies" do
    expect(result.keys).not_to include(:total_base_salary, :average_base_salary, :median_base_salary)
    expect(result.fetch(:currencies).keys).to match_array(%w[INR USD])
  end

  it "calculates a median for an odd number of salaries" do
    create_employee(employee_id: "EMP005", base_salary: "900")

    expect(result.fetch(:currencies).fetch("INR").fetch(:median_base_salary)).to eq("300.00")
  end

  it "calculates country distributions within each currency" do
    expect(result.fetch(:currencies).fetch("INR").fetch(:by_country).fetch("India")).to include(
      headcount: 2, total_base_salary: "400.00", average_base_salary: "200.00", median_base_salary: "200.00"
    )
    usd = result.fetch(:currencies).fetch("USD").fetch(:by_country)
    expect(usd.fetch("India")).to include(headcount: 1, total_base_salary: "1000.00")
    expect(usd.fetch("United Kingdom")).to include(headcount: 1, total_base_salary: "3000.00")
  end

  it "calculates department distributions within each currency" do
    inr = result.fetch(:currencies).fetch("INR").fetch(:by_department)
    expect(inr.fetch("Engineering")).to include(
      headcount: 1, total_base_salary: "100.00", average_base_salary: "100.00", median_base_salary: "100.00"
    )
    expect(inr.fetch("Finance")).to include(
      headcount: 1, total_base_salary: "300.00", average_base_salary: "300.00", median_base_salary: "300.00"
    )
    usd = result.fetch(:currencies).fetch("USD").fetch(:by_department)
    expect(usd.fetch("Engineering").fetch(:total_base_salary)).to eq("3000.00")
    expect(usd.fetch("Finance").fetch(:total_base_salary)).to eq("1000.00")
  end

  it "respects the supplied employee scope" do
    scoped = insights.call(employees: employee_class.where(status: "active", currency: "INR"))

    expect(scoped.fetch(:headcount)).to eq(1)
    expect(scoped.fetch(:currencies).keys).to eq([ "INR" ])
    expect(scoped.fetch(:currencies).fetch("INR").fetch(:total_base_salary)).to eq("100.00")
  end

  it "returns zero headcount and no currency groups for an empty scope" do
    empty = insights.call(employees: employee_class.none)

    expect(empty).to eq(headcount: 0, currencies: {})
  end

  it "includes zero salaries in headcount and statistics" do
    create_employee(employee_id: "EMP005", base_salary: "0")

    expect(result.fetch(:currencies).fetch("INR")).to include(
      headcount: 3, total_base_salary: "400.00", average_base_salary: "133.33", median_base_salary: "100.00"
    )
  end

  it "uses exact decimal arithmetic and rounds only reported values" do
    create_employee(employee_id: "EMP005", base_salary: "0.10", currency: "EUR")
    create_employee(employee_id: "EMP006", base_salary: "0.20", currency: "EUR")

    expect(result.fetch(:currencies).fetch("EUR")).to include(
      headcount: 2, total_base_salary: "0.30", average_base_salary: "0.15", median_base_salary: "0.15"
    )
  end
end

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

  it "estimates monthly base payroll as annual total divided by twelve per currency" do
    expect(result.fetch(:currencies).fetch("INR").fetch(:monthly_payroll_estimate)).to eq("33.33")
    expect(result.fetch(:currencies).fetch("USD").fetch(:monthly_payroll_estimate)).to eq("333.33")
    expect(result.keys).not_to include(:monthly_payroll_estimate)
  end

  it "reports lowest and highest annual salaries in every currency, country and department group" do
    inr = result.fetch(:currencies).fetch("INR")
    expect(inr).to include(minimum_base_salary: "100.00", maximum_base_salary: "300.00")
    expect(inr.fetch(:by_country).fetch("India")).to include(minimum_base_salary: "100.00", maximum_base_salary: "300.00")
    expect(inr.fetch(:by_department).fetch("Finance")).to include(minimum_base_salary: "300.00", maximum_base_salary: "300.00")
    expect(result.fetch(:currencies).fetch("USD")).to include(minimum_base_salary: "1000.00", maximum_base_salary: "3000.00")
  end

  it "includes zero salaries in ranges and rounds monthly estimates only after summing" do
    create_employee(employee_id: "ZERO", currency: "EUR", base_salary: "0")
    create_employee(employee_id: "CENT1", currency: "EUR", base_salary: "0.03")
    create_employee(employee_id: "CENT2", currency: "EUR", base_salary: "0.03")
    expect(result.fetch(:currencies).fetch("EUR")).to include(minimum_base_salary: "0.00", maximum_base_salary: "0.03", monthly_payroll_estimate: "0.01")
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

    expect(empty).to eq(headcount: 0, country_headcounts: {}, currencies: {})
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

  it "consolidates country headcounts across currencies without mixing salaries" do
    expect(result.fetch(:country_headcounts)).to eq("India" => 3, "United Kingdom" => 1)
    expect(result.fetch(:country_headcounts).values.sum).to eq(result.fetch(:headcount))
    expect(result.keys).not_to include(:total_base_salary, :average_base_salary)
  end

  it "filters consolidated country headcounts along with the salary scope" do
    scoped = insights.call(employees: employee_class.where(status: "active", department: "Finance"))
    expect(scoped.fetch(:country_headcounts)).to eq("India" => 1)
    expect(scoped.fetch(:headcount)).to eq(1)
  end

  it "returns four explicit annual salary bands including empty bands" do
    expect(result.fetch(:currencies).fetch("INR").fetch(:salary_bands)).to eq([
      { lower_bound: "0.00", upper_bound: "500000.00", headcount: 2 },
      { lower_bound: "500000.00", upper_bound: "1000000.00", headcount: 0 },
      { lower_bound: "1000000.00", upper_bound: "2000000.00", headcount: 0 },
      { lower_bound: "2000000.00", upper_bound: nil, headcount: 0 }
    ])
  end

  it "places boundary salaries in exactly one band using inclusive lower and exclusive upper bounds" do
    %w[0 499999.99 500000 999999.99 1000000 1999999.99 2000000 9000000].each_with_index do |salary, index|
      create_employee(employee_id: "BOUND#{index}", base_salary: salary, department: "People")
    end
    people = result.fetch(:currencies).fetch("INR").fetch(:by_department).fetch("People")
    expect(people.fetch(:salary_bands).map { |band| band.fetch(:headcount) }).to eq([ 2, 2, 2, 2 ])
    expect(people.fetch(:salary_bands).sum { |band| band.fetch(:headcount) }).to eq(people.fetch(:headcount))
  end

  it "uses currency-specific bands for every supported currency" do
    insights::SALARY_BAND_LIMITS.each do |currency, limits|
      create_employee(employee_id: "BAND#{currency}", currency: currency, base_salary: limits.first)
      bands = insights.call(employees: employee_class.all).fetch(:currencies).fetch(currency).fetch(:salary_bands)
      expect(bands[1].fetch(:lower_bound)).to eq(Compensation.format_amount(limits.first))
      expect(bands[1].fetch(:headcount)).to eq(1)
    end
  end

  it "keeps all department and country band totals consistent with currency headcounts" do
    result.fetch(:currencies).each_value do |group|
      expect(group.fetch(:salary_bands).sum { |band| band.fetch(:headcount) }).to eq(group.fetch(:headcount))
      %i[by_department by_country].each do |key|
        groups = group.fetch(key).values
        4.times do |index|
          expect(groups.sum { |metrics| metrics.fetch(:salary_bands)[index].fetch(:headcount) })
            .to eq(group.fetch(:salary_bands)[index].fetch(:headcount))
        end
      end
    end
  end

  it "summarizes 10000 employees in one aggregation query without instantiating employee records" do
    EmployeeSeedData.load!
    queries = []
    subscriber = ->(_name, _start, _finish, _id, payload) { queries << payload[:sql] if payload[:sql].include?("GROUPING SETS") }
    expect(employee_class).not_to receive(:instantiate)
    summary = ActiveSupport::Notifications.subscribed(subscriber, "sql.active_record") do
      insights.call(employees: employee_class.where("employee_id LIKE ?", "SEED%"))
    end
    expect(queries.size).to eq(1)
    expect(summary.fetch(:headcount)).to eq(10_000)
    expect(summary.fetch(:country_headcounts).values.sum).to eq(10_000)
    expect(summary.fetch(:currencies).values.sum { |group| group.fetch(:salary_bands).sum { |band| band.fetch(:headcount) } }).to eq(10_000)
  end
end

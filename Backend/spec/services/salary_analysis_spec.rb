require "rails_helper"

RSpec.describe SalaryAnalysis, type: :service do
  def cohort(salaries, **attributes)
    salaries.each_with_index.map { |salary, index| create_employee(employee_id: "#{attributes.fetch(:currency, 'INR')}#{index}", base_salary: salary, **attributes) }
  end

  def analysis(report = "roles", **params)
    described_class.call(employees: Employee.all, params: { report: report }.merge(params))
  end

  it "compares employees in the same role, country and currency with exact salary statistics" do
    cohort(%w[100 200 300 400 1000])
    create_employee(employee_id: "USD", currency: "USD", base_salary: "999999")
    create_employee(employee_id: "UK", country: "United Kingdom", base_salary: "500")
    create_employee(employee_id: "DESIGN", designation: "Designer", base_salary: "700")
    result = analysis
    expect(result[:meta][:total_count]).to eq(4)
    row = result[:data].find { |group| group[:country] == "India" && group[:designation] == "Software Engineer" && group[:currency] == "INR" }
    expect(row).to include(headcount: 5, average_base_salary: "400.00", median_base_salary: "300.00",
      minimum_base_salary: "100.00", maximum_base_salary: "1000.00", salary_gap: "900.00")
  end

  it "handles singleton and zero-salary role groups" do
    cohort([ "0" ])
    expect(analysis[:data].first).to include(headcount: 1, average_base_salary: "0.00", salary_gap: "0.00")
  end

  it "identifies salaries above the discrete upper quartile plus 1.5 times IQR" do
    cohort(%w[100 200 300 400 1000])
    result = analysis("outliers")
    expect(result[:data].map { |row| row["employee_id"] }).to eq([ "INR4" ])
    expect(result[:data].first).to include(comparison_headcount: 5, comparison_average: "400.00",
      comparison_threshold: "700.00", salary_difference: "300.00")
    expect(result[:meta][:minimum_peer_count]).to eq(5)
  end

  it "does not flag a salary equal to the outlier threshold" do
    cohort(%w[100 200 300 400 700])
    expect(analysis("outliers")[:data]).to be_empty
  end

  it "uses 1.5 times the upper quartile when the cohort IQR is zero" do
    cohort(%w[100 100 100 100 1000])
    expect(analysis("outliers")[:data].first).to include(comparison_threshold: "150.00", salary_difference: "850.00")
  end

  it "does not flag identical or all-zero salaries" do
    cohort(%w[0 0 0 0 0])
    expect(analysis("outliers")[:data]).to be_empty
    Employee.update_all(base_salary: "100")
    expect(analysis("outliers")[:data]).to be_empty
  end

  it "does not flag cohorts of fewer than five employees" do
    cohort(%w[100 100 100 10000])
    expect(analysis("outliers")[:data]).to be_empty
  end

  it "does not combine countries, roles or currencies to reach the minimum peer count" do
    cohort(%w[100 100 100 10000])
    create_employee(employee_id: "COUNTRY", country: "United Kingdom", base_salary: "100")
    create_employee(employee_id: "ROLE", designation: "Designer", base_salary: "100")
    create_employee(employee_id: "CURRENCY", currency: "USD", base_salary: "100")
    expect(analysis("outliers")[:data]).to be_empty
  end

  it "lists salaries strictly below the department average within each currency" do
    cohort(%w[100 200 300 400 1000])
    create_employee(employee_id: "USD", currency: "USD", base_salary: "999999")
    create_employee(employee_id: "OTHER", department: "Design", base_salary: "0")
    result = analysis("below_department_average")
    expect(result[:data].map { |row| row["employee_id"] }).to eq(%w[INR2 INR1 INR0])
    expect(result[:data].first).to include(comparison_headcount: 5, comparison_average: "400.00", salary_difference: "100.00")
  end

  it "compares decimal salaries before rounding the reported average" do
    cohort(%w[0.10 0.11 0.11])
    result = analysis("below_department_average")
    expect(result[:data].map { |row| row["employee_id"] }).to eq([ "INR0" ])
    expect(result[:data].first[:comparison_average]).to eq("0.11")
  end

  it "computes baselines over all matching employees before pagination" do
    cohort(%w[100 200 300 400 1000])
    result = analysis("below_department_average", per_page: "1", page: "2")
    expect(result[:data].first["employee_id"]).to eq("INR1")
    expect(result[:data].first[:comparison_average]).to eq("400.00")
    expect(result[:meta]).to include(total_count: 3, total_pages: 3, per_page: 1, page: 2)
  end

  it "applies country, department, status and currency filters to the full comparison cohort" do
    cohort(%w[100 200 300 400 1000])
    Employee.find_by!(employee_id: "INR4").update!(status: "inactive")
    result = analysis("roles", country: "India", department: "Engineering", status: "active", currency: "INR")
    expect(result[:data].first).to include(headcount: 4, average_base_salary: "250.00")
    expect(analysis("outliers", status: "active")[:data]).to be_empty
    expect(analysis("below_department_average", status: "active")[:data].map { |row| row["employee_id"] }).to eq(%w[INR1 INR0])
  end

  it "paginates role groups deterministically and preserves counts beyond the last page" do
    create_employee(employee_id: "FIRST", designation: "Designer")
    create_employee(employee_id: "SECOND", designation: "Engineer")
    expect(analysis("roles", page: "2", per_page: "1")[:data].first[:designation]).to eq("Engineer")
    result = analysis("roles", page: "3", per_page: "1")
    expect(result[:data]).to be_empty
    expect(result[:meta]).to include(total_count: 2, total_pages: 2)
  end

  SalaryAnalysis::REPORTS.each do |report|
    it "returns an empty paginated #{report} report for an empty scope" do
      result = analysis(report)
      expect(result[:data]).to be_empty
      expect(result[:meta]).to include(total_count: 0, total_pages: 0)
    end

    it "rejects invalid pagination for #{report} and caps page size" do
      cohort([ "100" ])
      expect { analysis(report, page: "0") }.to raise_error(EmployeeDirectory::InvalidParameter)
      expect { analysis(report, per_page: "bad") }.to raise_error(EmployeeDirectory::InvalidParameter)
      expect(analysis(report, per_page: "10000")[:meta][:per_page]).to eq(100)
    end
  end

  it "rejects unsupported reports, currencies and statuses" do
    expect { analysis("bad") }.to raise_error(EmployeeDirectory::InvalidParameter)
    expect { analysis(currency: "XYZ") }.to raise_error(EmployeeDirectory::InvalidParameter)
    expect { analysis(status: "unknown") }.to raise_error(EmployeeDirectory::InvalidParameter)
  end

  it "handles quote characters in filters as data rather than SQL" do
    create_employee(employee_id: "SAFE", country: "O'Reilly", department: "People's Team")
    expect(analysis(country: "O'Reilly", department: "People's Team")[:data].first[:headcount]).to eq(1)
    expect(analysis("outliers", country: "' OR 1=1 --")[:data]).to be_empty
  end

  it "supports 10000 employees with bounded report pages" do
    EmployeeSeedData.load!
    %w[roles outliers below_department_average].each do |report|
      result = analysis(report, per_page: "8")
      expect(result[:data].size).to be <= 8
      expect(result[:meta][:total_count]).to be >= result[:data].size
    end
    expect(analysis("roles", per_page: "100")[:data].sum { |row| row[:headcount] }).to eq(10_000)
  end
end

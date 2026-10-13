require "rails_helper"

RSpec.describe SalaryDataQualityChecker, type: :service do
  let(:user) { create_user }

  def scan
    described_class.call(requested_by: user)
  end

  def codes(employee)
    SalaryDataQualityRules.findings(SalaryDataQualityRules.employee_scope.find(employee.id),
      peers: SalaryDataQualityRules.peer_statistics, checked_on: Date.current).pluck(:rule_code)
  end

  def change_salary(employee, amount, currency: employee.currency)
    SalaryUpdater.call(employee: employee, base_salary: amount, currency: currency,
      effective_date: employee.effective_date, confirmed: true)
  end

  it "does not flag valid singleton salaries without history or invent currency-country restrictions" do
    expect(codes(create_employee(currency: "USD", country: "India"))).to be_empty
  end

  it "flags zero salary only for active employees" do
    employee = create_employee(base_salary: "0")
    expect(codes(employee)).to eq([ "active_zero_salary" ])
    employee.update!(status: "inactive")
    expect(codes(employee)).to be_empty
  end

  [ [ "1000", true ], [ "999.99", false ], [ "10", true ], [ "10.01", false ] ].each do |salary, flagged|
    it "checks the exact tenfold peer boundary at #{salary}" do
      4.times { |index| create_employee(employee_id: "PEER#{index}", base_salary: "100") }
      employee = create_employee(base_salary: salary)
      expect(codes(employee).include?("extreme_peer_ratio")).to eq(flagged)
    end
  end

  it "requires five employees in the same country, role and currency for peer comparisons" do
    3.times { |index| create_employee(employee_id: "PEER#{index}", base_salary: "100") }
    employee = create_employee(base_salary: "10000")
    create_employee(employee_id: "COUNTRY", country: "United Kingdom", base_salary: "100")
    create_employee(employee_id: "ROLE", designation: "Designer", base_salary: "100")
    create_employee(employee_id: "CURRENCY", currency: "USD", base_salary: "100")
    expect(codes(employee)).to be_empty
  end

  it "does not divide by a zero peer median" do
    4.times { |index| create_employee(employee_id: "PEER#{index}", base_salary: "0", status: "inactive") }
    expect(codes(create_employee(base_salary: "10000"))).to be_empty
  end

  [ [ "1200", "annual_monthly_pattern" ], [ "1176", "annual_monthly_pattern" ],
    [ "1224", "annual_monthly_pattern" ], [ "1224.01", "large_salary_change" ],
    [ "8.33", "annual_monthly_pattern" ], [ "500", "large_salary_change" ],
    [ "20", "large_salary_change" ], [ "0", "active_zero_salary" ] ].each do |amount, code|
    it "recognizes the salary-change pattern for 100 -> #{amount}" do
      employee = create_employee(base_salary: "100")
      change_salary(employee, amount)
      expect(codes(employee)).to include(code)
      expect(codes(employee)).not_to include("large_salary_change") if code == "annual_monthly_pattern"
    end
  end

  [ "499.99", "20.01" ].each do |amount|
    it "does not flag a change just inside the large-change boundary (#{amount})" do
      employee = create_employee(base_salary: "100")
      change_salary(employee, amount)
      expect(codes(employee)).to be_empty
    end
  end

  it "does not compare amounts across different currencies or divide by an old zero salary" do
    employee = create_employee(base_salary: "0")
    change_salary(employee, "1200")
    expect(codes(employee)).to be_empty
    change_salary(employee, "100", currency: "USD")
    expect(codes(employee)).to be_empty
  end

  it "flags a currency switch with the same nonzero numeric amount as information" do
    employee = create_employee(base_salary: "100")
    change_salary(employee, "100", currency: "USD")
    finding = SalaryDataQualityRules.findings(SalaryDataQualityRules.employee_scope.find(employee.id), peers: {}, checked_on: Date.current).first
    expect(finding).to include(rule_code: "currency_change_same_amount", severity: "info")
  end

  it "accepts ordinary future dates and flags only dates more than 365 days ahead" do
    employee = create_employee(effective_date: Date.current + 365)
    expect(codes(employee)).to be_empty
    employee.update!(effective_date: Date.current + 366)
    expect(codes(employee)).to eq([ "distant_effective_date" ])
  end

  it "detects imports that bypass required-detail validation" do
    employee = create_employee
    employee.update_columns(name: " ", department: "")
    scan
    expect(SalaryDataAnomaly.first.observed).to eq("missing_fields" => %w[name department])
  end

  it "compares current salary with the latest audit entry, not every old entry" do
    employee = create_employee(base_salary: "100")
    change_salary(employee, "1200")
    change_salary(employee, "1300")
    expect(codes(employee)).to be_empty
    employee.update_columns(base_salary: "1400")
    expect(codes(employee)).to eq([ "history_mismatch" ])
  end

  it "stores reproducible findings and scan counts without changing employee or salary history data" do
    employee = create_employee(base_salary: "0", effective_date: Date.current + 366)
    original = employee.attributes
    result = scan
    expect(result).to have_attributes(checked_employees: 1, detected_findings: 2, affected_employees: 1, new_findings: 2)
    expect(result.completed_at).to be_present
    expect(employee.reload.attributes).to eq(original)
    expect(SalaryChange.count).to eq(0)
    expect(SalaryDataAnomaly.first.snapshot).to include("base_salary" => "0.00", "employee_id" => "EMP001")
  end

  it "preserves reviews and does not duplicate findings on unchanged repeat scans" do
    create_employee(base_salary: "0")
    scan
    anomaly = SalaryDataAnomaly.first
    SalaryDataAnomalyReviewer.call(anomaly: anomaly, reviewed_by: user, status: "legitimate", notes: "Unpaid placement confirmed")
    result = scan
    expect(result).to have_attributes(new_findings: 0, detected_findings: 1)
    expect(SalaryDataAnomaly.count).to eq(1)
    expect(anomaly.reload).to have_attributes(review_status: "legitimate", review_notes: "Unpaid placement confirmed", last_seen_scan_id: result.id)
    expect(anomaly.reviews.count).to eq(1)
  end

  it "clears old findings after a correction while keeping their immutable review history" do
    employee = create_employee(base_salary: "0")
    scan
    anomaly = SalaryDataAnomaly.first
    SalaryDataAnomalyReviewer.call(anomaly: anomaly, reviewed_by: user, status: "confirmed_error", notes: "Amount missing")
    change_salary(employee, "100")
    expect(scan.cleared_findings).to eq(1)
    expect(anomaly.reload).to have_attributes(active: false, review_status: "confirmed_error")
    expect(anomaly.cleared_at).to be_present
    expect { anomaly.reviews.first.update!(notes: "Overwritten") }.to raise_error(ActiveRecord::ReadOnlyRecord)
  end

  it "creates a fresh pending review when the source changes but still triggers a rule" do
    employee = create_employee(base_salary: "0")
    scan
    previous = SalaryDataAnomaly.first
    employee.update!(name: "Updated Employee")
    expect(scan).to have_attributes(new_findings: 1, cleared_findings: 1)
    expect(previous.reload.active).to be(false)
    expect(SalaryDataAnomaly.where(active: true).first.review_status).to eq("pending")
  end

  it "rolls back the entire scan on failure without clearing previous findings" do
    create_employee(base_salary: "0")
    scan
    allow(SalaryDataQualityRules).to receive(:findings).and_raise("Check failed")
    expect { scan }.to raise_error("Check failed")
    expect(SalaryDataQualityScan.count).to eq(1)
    expect(SalaryDataAnomaly.first.active).to be(true)
  end

  it "handles an empty database" do
    expect(scan).to have_attributes(checked_employees: 0, detected_findings: 0, affected_employees: 0)
  end

  it "checks 10,000 employees in bounded batches without per-employee history queries" do
    now = Time.current
    Employee.insert_all!(10_000.times.map { |index| employee_attributes(employee_id: "BULK#{index}").merge(created_at: now, updated_at: now) })
    queries = []
    subscriber = ->(_name, _start, _finish, _id, payload) { queries << payload[:sql] if payload[:sql].include?("LEFT JOIN LATERAL") }
    result = ActiveSupport::Notifications.subscribed(subscriber, "sql.active_record") { scan }
    expect(result).to have_attributes(checked_employees: 10_000, detected_findings: 0)
    expect(queries.size).to be <= 21
    expect(queries).to all(include("LIMIT"))
  end
end

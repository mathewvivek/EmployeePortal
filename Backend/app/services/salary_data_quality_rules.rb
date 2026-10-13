class SalaryDataQualityRules
  MINIMUM_PEER_COUNT = 5
  MAXIMUM_FUTURE_DAYS = 365
  REQUIRED_FIELDS = %w[employee_id name department country designation].freeze
  RULES = {
    "active_zero_salary" => [ "Zero salary on an active employee", "warning" ],
    "extreme_peer_ratio" => [ "Salary far from the same-role peer median", "warning" ],
    "annual_monthly_pattern" => [ "Possible annual/monthly salary unit mix-up", "warning" ],
    "large_salary_change" => [ "Unusually large same-currency salary change", "warning" ],
    "currency_change_same_amount" => [ "Currency changed but the numeric amount did not", "info" ],
    "distant_effective_date" => [ "Effective date more than a year ahead", "info" ],
    "history_mismatch" => [ "Current salary differs from the latest salary history", "warning" ],
    "missing_employee_details" => [ "Required employee details are blank", "warning" ]
  }.transform_values(&:freeze).freeze

  def self.employee_scope
    # A lateral lookup loads only the latest audit entry, avoiding an audit-history N+1.
    Employee.joins(<<~SQL.squish).select("employees.*", Arel.sql(<<~COLUMNS.squish))
      LEFT JOIN LATERAL (
        SELECT id, old_base_salary, new_base_salary, old_currency, new_currency,
          old_effective_date, effective_date, changed_at
        FROM salary_changes WHERE salary_changes.employee_id = employees.id
        ORDER BY changed_at DESC, id DESC LIMIT 1
      ) latest_change ON TRUE
    SQL
      latest_change.id AS latest_change_id, latest_change.old_base_salary AS latest_old_salary,
      latest_change.new_base_salary AS latest_new_salary, latest_change.old_currency AS latest_old_currency,
      latest_change.new_currency AS latest_new_currency, latest_change.effective_date AS latest_effective_date,
      latest_change.changed_at AS latest_changed_at
    COLUMNS
  end

  def self.peer_statistics
    Employee.group(:country, :designation, :currency).pluck(:country, :designation, :currency,
      Arel.sql("COUNT(*)"), Arel.sql(CompensationInsights::MEDIAN)).to_h do |country, designation, currency, count, median|
      [ [ country, designation, currency ], { count: count, median: median } ]
    end
  end

  def self.snapshot(employee)
    latest = employee.latest_change_id && {
      "id" => employee.latest_change_id,
      "old_salary" => Compensation.format_amount(employee.latest_old_salary),
      "new_salary" => Compensation.format_amount(employee.latest_new_salary),
      "old_currency" => employee.latest_old_currency, "new_currency" => employee.latest_new_currency,
      "effective_date" => employee.latest_effective_date.iso8601,
      "changed_at" => employee.latest_changed_at.utc.iso8601(6)
    }
    employee.slice(*REQUIRED_FIELDS, :status).merge(
      "base_salary" => Compensation.format_amount(employee.base_salary), "currency" => employee.currency,
      "effective_date" => employee.effective_date.iso8601, "updated_at" => employee.updated_at.utc.iso8601(6), "latest_change" => latest)
  end

  def self.findings(employee, peers:, checked_on:)
    data = snapshot(employee)
    findings = []
    add = ->(code, observed, reference) { findings << { rule_code: code, severity: RULES.fetch(code).last, snapshot: data, observed: observed, reference: reference } }
    salary = employee.base_salary
    add.call("active_zero_salary", { salary: data["base_salary"], status: employee.status }, { expected: "Review whether this active role is paid" }) if employee.status == "active" && salary.zero?
    peer = peers[[ employee.country, employee.designation, employee.currency ]]
    if peer && peer[:count] >= MINIMUM_PEER_COUNT && peer[:median].positive? && salary.positive? &&
      (salary >= peer[:median] * 10 || salary * 10 <= peer[:median])
      add.call("extreme_peer_ratio", { salary: data["base_salary"], currency: employee.currency },
        { peer_median: Compensation.format_amount(peer[:median]), peer_count: peer[:count], country: employee.country, designation: employee.designation, multiplier: 10 })
    end
    latest = data["latest_change"]
    if latest
      old_salary = employee.latest_old_salary
      new_salary = employee.latest_new_salary
      if latest["old_currency"] == latest["new_currency"] && old_salary.positive?
        ratio = new_salary / old_salary
        pattern = (ratio - 12).abs <= BigDecimal("0.24") || (ratio * 12 - 1).abs <= BigDecimal("0.02")
        if pattern
          add.call("annual_monthly_pattern", latest, { multiplier: 12, tolerance_percent: 2 })
        elsif new_salary >= old_salary * 5 || new_salary * 5 <= old_salary
          add.call("large_salary_change", latest, { increase_multiplier: 5, decrease_percent: 80 })
        end
      elsif latest["old_currency"] != latest["new_currency"] && old_salary == new_salary && new_salary.positive?
        add.call("currency_change_same_amount", latest, { expected: "Confirm the unchanged amount is intended in the new currency" })
      end
      if latest["new_salary"] != data["base_salary"] || latest["new_currency"] != data["currency"] || latest["effective_date"] != data["effective_date"]
        add.call("history_mismatch", data.slice("base_salary", "currency", "effective_date"), latest)
      end
    end
    if employee.effective_date > checked_on + MAXIMUM_FUTURE_DAYS
      add.call("distant_effective_date", { effective_date: data["effective_date"] }, { maximum_future_days: MAXIMUM_FUTURE_DAYS })
    end
    missing = REQUIRED_FIELDS.select { |field| employee.public_send(field).blank? }
    add.call("missing_employee_details", { missing_fields: missing }, { required_fields: REQUIRED_FIELDS }) if missing.any?
    findings
  end
end

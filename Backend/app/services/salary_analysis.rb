class SalaryAnalysis
  REPORTS = %w[roles outliers below_department_average].freeze
  MINIMUM_PEER_COUNT = 5
  OUTLIER_THRESHOLD = <<~SQL.squish.freeze
    CASE WHEN role_stats.q3 > role_stats.q1
      THEN role_stats.q3 + 1.5 * (role_stats.q3 - role_stats.q1)
      ELSE role_stats.q3 * 1.5 END
  SQL

  def self.call(employees:, params:)
    report = params.fetch(:report, "roles")
    raise EmployeeDirectory::InvalidParameter, "Unsupported salary analysis report" unless REPORTS.include?(report)
    currency = params[:currency].presence
    if currency && !Compensation::CURRENCIES.include?(currency)
      raise EmployeeDirectory::InvalidParameter, "Unsupported currency"
    end
    scope = EmployeeDirectory.filter(employees: employees, params: params).reorder(nil)
    scope = scope.where(currency: currency) if currency
    report == "roles" ? roles(scope, params) : employee_report(scope, params, report)
  end

  def self.roles(scope, params)
    page, per_page = EmployeeDirectory.pagination(params).values_at(:page, :per_page)
    grouped = scope.group(:country, :designation, :currency)
    total_count = Employee.from("(#{grouped.reselect(:country, :designation, :currency).to_sql}) employees").count
    rows = grouped.order(:country, :designation, :currency).offset((page - 1) * per_page).limit(per_page).pluck(
      :country, :designation, :currency, Arel.sql("COUNT(*)"), Arel.sql("AVG(employees.base_salary)"),
      Arel.sql(CompensationInsights::MEDIAN), Arel.sql("MIN(employees.base_salary)"), Arel.sql("MAX(employees.base_salary)")
    )
    data = rows.map do |country, designation, currency, count, average, median, minimum, maximum|
      { country: country, designation: designation, currency: currency, headcount: count,
        average_base_salary: Compensation.format_amount(average), median_base_salary: Compensation.format_amount(median),
        minimum_base_salary: Compensation.format_amount(minimum), maximum_base_salary: Compensation.format_amount(maximum),
        salary_gap: Compensation.format_amount(maximum - minimum) }
    end
    { data: data, meta: { report: "roles", page: page, per_page: per_page, total_count: total_count,
      total_pages: (total_count + per_page - 1) / per_page } }
  end

  def self.employee_report(scope, params, report)
    if report == "outliers"
      stats = scope.group(:country, :designation, :currency).reselect(
        :country, :designation, :currency, Arel.sql("COUNT(*) AS peer_count"),
        Arel.sql("AVG(employees.base_salary) AS average_salary"),
        Arel.sql("PERCENTILE_DISC(0.25) WITHIN GROUP (ORDER BY employees.base_salary) AS q1"),
        Arel.sql("PERCENTILE_DISC(0.75) WITHIN GROUP (ORDER BY employees.base_salary) AS q3")
      )
      flagged = scope.joins(<<~SQL.squish)
        INNER JOIN (#{stats.to_sql}) role_stats ON employees.country = role_stats.country
          AND employees.designation = role_stats.designation AND employees.currency = role_stats.currency
      SQL
      flagged = flagged.where("role_stats.peer_count >= ? AND employees.base_salary > (#{OUTLIER_THRESHOLD})", MINIMUM_PEER_COUNT)
      columns = "role_stats.peer_count AS comparison_headcount, role_stats.average_salary AS comparison_average, (#{OUTLIER_THRESHOLD}) AS comparison_threshold"
    else
      stats = scope.group(:department, :currency).reselect(:department, :currency,
        Arel.sql("COUNT(*) AS peer_count"), Arel.sql("AVG(employees.base_salary) AS average_salary"))
      flagged = scope.joins(<<~SQL.squish)
        INNER JOIN (#{stats.to_sql}) department_stats ON employees.department = department_stats.department
          AND employees.currency = department_stats.currency
      SQL
      flagged = flagged.where("employees.base_salary < department_stats.average_salary")
      columns = "department_stats.peer_count AS comparison_headcount, department_stats.average_salary AS comparison_average"
    end
    # Count and paginate before loading employees; comparison cohorts use the full filtered scope.
    directory = EmployeeDirectory.call(employees: flagged, params: params.merge(sort: "base_salary", direction: "desc"))
    data = directory[:employees].select("employees.*", Arel.sql(columns)).map do |employee|
      row = EmployeeSerializer.call(employee).merge(
        comparison_headcount: employee.comparison_headcount,
        comparison_average: Compensation.format_amount(employee.comparison_average))
      if report == "outliers"
        row.merge!(comparison_threshold: Compensation.format_amount(employee.comparison_threshold),
          salary_difference: Compensation.format_amount(employee.base_salary - employee.comparison_threshold))
      else
        row[:salary_difference] = Compensation.format_amount(employee.comparison_average - employee.base_salary)
      end
      row
    end
    { data: data, meta: directory[:meta].merge(report: report, minimum_peer_count: report == "outliers" ? MINIMUM_PEER_COUNT : nil) }
  end
  private_class_method :roles, :employee_report
end

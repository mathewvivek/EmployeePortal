class CompensationInsights
  SALARY_BAND_LIMITS = {
    "INR" => [ 500_000, 1_000_000, 2_000_000 ].freeze,
    "USD" => [ 50_000, 100_000, 150_000 ].freeze,
    "GBP" => [ 50_000, 100_000, 150_000 ].freeze,
    "EUR" => [ 50_000, 100_000, 150_000 ].freeze,
    "JPY" => [ 3_000_000, 6_000_000, 9_000_000 ].freeze
  }.freeze

  GROUPINGS = <<~SQL.squish.freeze
    GROUPING SETS (
      (employees.currency),
      (employees.currency, employees.country),
      (employees.currency, employees.department)
    )
  SQL

  # Fixed, currency-specific annual bands keep department distributions comparable.
  BAND_THRESHOLDS = 3.times.map do |index|
    cases = SALARY_BAND_LIMITS.map { |currency, limits| "WHEN '#{currency}' THEN #{limits[index]}" }.join(" ")
    "(CASE employees.currency #{cases} END)"
  end.freeze
  BAND_COUNTS = [
    "employees.base_salary < #{BAND_THRESHOLDS[0]}",
    "employees.base_salary >= #{BAND_THRESHOLDS[0]} AND employees.base_salary < #{BAND_THRESHOLDS[1]}",
    "employees.base_salary >= #{BAND_THRESHOLDS[1]} AND employees.base_salary < #{BAND_THRESHOLDS[2]}",
    "employees.base_salary >= #{BAND_THRESHOLDS[2]}"
  ].map { |condition| Arel.sql("COUNT(*) FILTER (WHERE #{condition})") }.freeze

  # Average the middle numeric values to keep the median in decimal arithmetic.
  MEDIAN = <<~SQL.squish.freeze
    (
      (ARRAY_AGG(employees.base_salary ORDER BY employees.base_salary))[(COUNT(*)::integer + 1) / 2] +
      (ARRAY_AGG(employees.base_salary ORDER BY employees.base_salary))[(COUNT(*)::integer + 2) / 2]
    ) / 2.0
  SQL

  def self.call(employees:)
    rows = employees.reorder(nil).group(Arel.sql(GROUPINGS)).pluck(
      :currency, :country, :department,
      Arel.sql("COUNT(*)"), Arel.sql("SUM(employees.base_salary)"),
      Arel.sql("AVG(employees.base_salary)"), Arel.sql(MEDIAN),
      Arel.sql("MIN(employees.base_salary)"), Arel.sql("MAX(employees.base_salary)"), *BAND_COUNTS
    )

    currencies = {}
    country_headcounts = Hash.new(0)
    rows.each do |currency, country, department, count, total, average, median, minimum, maximum, *band_counts|
      group = currencies[currency] ||= { by_country: {}, by_department: {} }
      metrics = {
        headcount: count,
        total_base_salary: Compensation.format_amount(total),
        monthly_payroll_estimate: Compensation.format_amount(total / 12),
        average_base_salary: Compensation.format_amount(average),
        median_base_salary: Compensation.format_amount(median),
        minimum_base_salary: Compensation.format_amount(minimum),
        maximum_base_salary: Compensation.format_amount(maximum),
        salary_bands: salary_bands(currency, band_counts)
      }

      if country
        group[:by_country][country] = metrics
        country_headcounts[country] += count
      elsif department
        group[:by_department][department] = metrics
      else
        group.merge!(metrics)
      end
    end

    { headcount: currencies.values.sum { |group| group.fetch(:headcount) },
      country_headcounts: country_headcounts.sort.to_h, currencies: currencies }
  end

  def self.salary_bands(currency, counts)
    bounds = [ 0, *SALARY_BAND_LIMITS.fetch(currency), nil ]
    counts.each_with_index.map do |count, index|
      { lower_bound: Compensation.format_amount(bounds[index]),
        upper_bound: bounds[index + 1] && Compensation.format_amount(bounds[index + 1]), headcount: count }
    end
  end
  private_class_method :salary_bands
end

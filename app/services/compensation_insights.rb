class CompensationInsights
  GROUPINGS = <<~SQL.squish.freeze
    GROUPING SETS (
      (employees.currency),
      (employees.currency, employees.country),
      (employees.currency, employees.department)
    )
  SQL

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
      Arel.sql("AVG(employees.base_salary)"), Arel.sql(MEDIAN)
    )

    currencies = {}
    rows.each do |currency, country, department, count, total, average, median|
      group = currencies[currency] ||= { by_country: {}, by_department: {} }
      metrics = {
        headcount: count,
        total_base_salary: Compensation.format_amount(total),
        average_base_salary: Compensation.format_amount(average),
        median_base_salary: Compensation.format_amount(median)
      }

      if country
        group[:by_country][country] = metrics
      elsif department
        group[:by_department][department] = metrics
      else
        group.merge!(metrics)
      end
    end

    { headcount: currencies.values.sum { |group| group.fetch(:headcount) }, currencies: currencies }
  end
end

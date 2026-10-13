class EmployeeFormOptions
  COUNTRIES = [ "United States", "India", "United Kingdom", "Germany", "Japan" ].freeze
  DEPARTMENTS = %w[Engineering Design People Finance Product Sales].freeze

  def self.call
    {
      countries: (COUNTRIES + Employee.distinct.pluck(:country).reject(&:blank?)).uniq.sort,
      departments: (DEPARTMENTS + Employee.distinct.pluck(:department).reject(&:blank?)).uniq.sort
    }
  end
end

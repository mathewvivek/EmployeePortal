class Employee < ApplicationRecord
  STATUSES = %w[active inactive].freeze
  DETAIL_FIELDS = %i[employee_id name department country designation status].freeze

  has_many :salary_changes, dependent: :restrict_with_error, inverse_of: :employee
  has_many :salary_data_anomalies, dependent: :restrict_with_error

  validates :employee_id, :name, :department, :country, :designation, :status,
    :base_salary, :currency, :effective_date, presence: true
  validates :employee_id, uniqueness: true
  validates :status, inclusion: { in: STATUSES }
  validates :currency, inclusion: { in: Compensation::CURRENCIES }
  validates :base_salary, numericality: { greater_than_or_equal_to: 0 }
end

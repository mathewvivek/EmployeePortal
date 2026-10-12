class SalaryChange < ApplicationRecord
  belongs_to :employee, inverse_of: :salary_changes

  validates :employee, :old_base_salary, :new_base_salary, :old_currency,
    :new_currency, :old_effective_date, :effective_date, :changed_at, presence: true
  validates :old_base_salary, :new_base_salary, numericality: { greater_than_or_equal_to: 0 }
  validates :old_currency, :new_currency, inclusion: { in: Compensation::CURRENCIES }

  def readonly?
    persisted? || super
  end
end

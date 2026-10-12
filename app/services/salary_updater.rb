class SalaryUpdater
  def self.call(employee:, base_salary:, currency:, effective_date:, confirmed:)
    raise ArgumentError, "Salary changes require explicit confirmation" unless confirmed == true

    employee.with_lock do
      previous = employee.slice(:base_salary, :currency, :effective_date)
      employee.assign_attributes(base_salary: base_salary, currency: currency, effective_date: effective_date)
      employee.validate!

      if employee.changed?
        employee.save!
        employee.salary_changes.create!(
          old_base_salary: previous.fetch("base_salary"),
          new_base_salary: employee.base_salary,
          old_currency: previous.fetch("currency"),
          new_currency: employee.currency,
          old_effective_date: previous.fetch("effective_date"),
          effective_date: employee.effective_date,
          changed_at: Time.current
        )
      end
    end

    employee
  end
end

class SalaryChangeSerializer
  def self.call(change)
    {
      id: change.id,
      old_base_salary: Compensation.format_amount(change.old_base_salary),
      new_base_salary: Compensation.format_amount(change.new_base_salary),
      old_currency: change.old_currency,
      new_currency: change.new_currency,
      old_effective_date: change.old_effective_date.iso8601,
      effective_date: change.effective_date.iso8601,
      changed_at: change.changed_at.iso8601(6)
    }
  end
end

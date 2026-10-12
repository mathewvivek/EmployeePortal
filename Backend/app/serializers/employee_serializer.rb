class EmployeeSerializer
  def self.call(employee)
    employee.slice(:id, :employee_id, :name, :department, :country, :designation, :status).merge(salary(employee))
  end

  def self.salary(employee)
    {
      "base_salary" => Compensation.format_amount(employee.base_salary),
      "currency" => employee.currency,
      "effective_date" => employee.effective_date.iso8601
    }
  end
end

class EmployeeDirectory
  class InvalidParameter < StandardError; end

  def self.filter(employees:, params:)
    if params[:status].present? && !Employee::STATUSES.include?(params[:status])
      raise InvalidParameter, "Status must be active or inactive"
    end

    %i[country department status].each do |field|
      employees = employees.where(field => params[field]) if params[field].present?
    end

    if params[:q].present?
      query = "%#{Employee.sanitize_sql_like(params[:q])}%"
      employees = employees.where("employees.name ILIKE :query OR employees.employee_id ILIKE :query", query: query)
    end

    employees
  end

  def self.call(params:, employees: Employee.all)
    page = positive_integer(params.fetch(:page, 1), :page)
    per_page = [ positive_integer(params.fetch(:per_page, 25), :per_page), 100 ].min
    sort = params[:sort].presence
    direction = params.fetch(:direction, "asc")
    raise InvalidParameter, "Unsupported sort field" if sort && sort != "base_salary"
    raise InvalidParameter, "Direction must be asc or desc" unless %w[asc desc].include?(direction)

    employees = filter(employees: employees, params: params)
    count = employees.count
    employees = if sort
      employees.reorder(base_salary: direction, employee_id: :asc)
    else
      employees.reorder(employee_id: :asc)
    end

    {
      employees: employees.offset((page - 1) * per_page).limit(per_page),
      meta: { page: page, per_page: per_page, total_count: count, total_pages: (count + per_page - 1) / per_page }
    }
  end

  def self.positive_integer(value, field)
    unless /\A[0-9]+\z/.match?(value.to_s) && value.to_i.positive?
      raise InvalidParameter, "#{field} must be a positive integer"
    end

    value.to_i
  end
  private_class_method :positive_integer
end

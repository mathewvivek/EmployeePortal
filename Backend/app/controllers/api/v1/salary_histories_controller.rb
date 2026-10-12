module Api
  module V1
    class SalaryHistoriesController < BaseController
      def show
        employee = Employee.find(params[:employee_id])
        changes = employee.salary_changes.order(changed_at: :desc, id: :desc)
        render json: { data: changes.map { |change| SalaryChangeSerializer.call(change) } }
      end
    end
  end
end

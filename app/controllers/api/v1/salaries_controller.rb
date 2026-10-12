module Api
  module V1
    class SalariesController < BaseController
      def show
        render json: { data: EmployeeSerializer.salary(Employee.find(params[:employee_id])) }
      end

      def update
        employee = Employee.find(params[:employee_id])
        salary = params.require(:salary).permit(:base_salary, :currency, :effective_date, :confirmed)
        SalaryUpdater.call(
          employee: employee, base_salary: salary[:base_salary], currency: salary[:currency],
          effective_date: salary[:effective_date], confirmed: salary[:confirmed]
        )
        render json: { data: EmployeeSerializer.salary(employee) }
      rescue ArgumentError => error
        render json: { errors: [ error.message ] }, status: :unprocessable_entity
      end
    end
  end
end

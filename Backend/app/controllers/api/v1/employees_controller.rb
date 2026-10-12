module Api
  module V1
    class EmployeesController < BaseController
      def index
        directory = EmployeeDirectory.call(params: params)
        render json: {
          data: directory.fetch(:employees).map { |employee| EmployeeSerializer.call(employee) },
          meta: directory.fetch(:meta)
        }
      end

      def show
        render json: { data: EmployeeSerializer.call(Employee.find(params[:id])) }
      end

      def create
        attributes = params.expect(employee: [ :employee_id, :name, :department, :country,
          :designation, :status, :base_salary, :currency, :effective_date ])
        employee = Employee.create!(attributes)
        render json: { data: EmployeeSerializer.call(employee) }, status: :created,
          location: api_v1_employee_url(employee)
      rescue ActionController::ParameterMissing
        render json: { errors: [ "An employee object is required" ] }, status: :bad_request
      rescue ActiveRecord::RecordNotUnique
        render json: { errors: { employee_id: [ "has already been taken" ] } }, status: :unprocessable_content
      end
    end
  end
end

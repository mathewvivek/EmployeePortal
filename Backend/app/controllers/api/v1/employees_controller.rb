module Api
  module V1
    class EmployeesController < BaseController
      rescue_from ActionController::ParameterMissing do
        render json: { errors: [ "An employee object with editable fields is required" ] }, status: :bad_request
      end

      rescue_from ActiveRecord::RecordNotUnique do
        render json: { errors: { employee_id: [ "has already been taken" ] } }, status: :unprocessable_content
      end

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

      def options
        render json: { data: EmployeeFormOptions.call }
      end

      def create
        attributes = params.expect(employee: [ :employee_id, :name, :department, :country,
          :designation, :status, :base_salary, :currency, :effective_date ])
        employee = Employee.create!(attributes)
        render json: { data: EmployeeSerializer.call(employee) }, status: :created,
          location: api_v1_employee_url(employee)
      end

      def update
        employee = Employee.find(params[:id])
        attributes = params.expect(employee: Employee::DETAIL_FIELDS)
        if (params[:employee].keys & %w[base_salary currency effective_date]).any?
          render json: { errors: [ "Update compensation through the confirmed salary endpoint" ] }, status: :unprocessable_content
          return
        end
        employee.with_lock { employee.update!(attributes) }
        render json: { data: EmployeeSerializer.call(employee) }
      end
    end
  end
end

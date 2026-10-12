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
    end
  end
end

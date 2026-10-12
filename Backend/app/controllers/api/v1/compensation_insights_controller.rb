module Api
  module V1
    class CompensationInsightsController < BaseController
      def index
        employees = EmployeeDirectory.filter(employees: Employee.all, params: params)
        render json: { data: CompensationInsights.call(employees: employees) }
      end
    end
  end
end

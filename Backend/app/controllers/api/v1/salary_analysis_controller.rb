module Api
  module V1
    class SalaryAnalysisController < BaseController
      def index
        render json: SalaryAnalysis.call(employees: Employee.all, params: params.permit(:report, :country, :department, :status, :currency, :page, :per_page).to_h.symbolize_keys)
      end
    end
  end
end

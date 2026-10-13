module Api
  module V1
    class SalaryDataQualityScansController < BaseController
      def create
        scan = SalaryDataQualityChecker.call(requested_by: @current_user)
        render json: { data: SalaryDataAnomalySerializer.scan(scan) }, status: :created
      end
    end
  end
end

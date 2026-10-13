module Api
  module V1
    class SalaryDataAnomaliesController < BaseController
      rescue_from ActiveRecord::RecordNotFound do
        render json: { errors: [ "Salary finding not found" ] }, status: :not_found
      end

      rescue_from SalaryDataAnomalyReviewer::StaleFinding do |error|
        render json: { errors: [ error.message ] }, status: :conflict
      end

      def index
        employees = EmployeeDirectory.filter(employees: Employee.all, params: params)
        if params[:currency].present?
          raise EmployeeDirectory::InvalidParameter, "Unsupported currency" unless Compensation::CURRENCIES.include?(params[:currency])
          employees = employees.where(currency: params[:currency])
        end
        anomalies = SalaryDataAnomaly.joins(:employee).merge(employees)
        include_cleared = params.fetch(:include_cleared, "false")
        raise EmployeeDirectory::InvalidParameter, "include_cleared must be true or false" unless %w[true false].include?(include_cleared)
        anomalies = anomalies.where(active: true) unless include_cleared == "true"
        if params[:review_status].present?
          raise EmployeeDirectory::InvalidParameter, "Unsupported review status" unless SalaryDataAnomaly::REVIEW_STATUSES.include?(params[:review_status])
          anomalies = anomalies.where(review_status: params[:review_status])
        end
        total = anomalies.count
        page, size = EmployeeDirectory.pagination(params).values_at(:page, :per_page)
        records = anomalies.includes(:employee, :reviewed_by, :last_seen_scan).order(created_at: :desc, id: :desc).offset((page - 1) * size).limit(size)
        render json: { data: records.map { |anomaly| SalaryDataAnomalySerializer.call(anomaly) },
          meta: { page: page, per_page: size, total_count: total, total_pages: (total + size - 1) / size,
            last_scan: SalaryDataAnomalySerializer.scan(SalaryDataQualityScan.order(id: :desc).first) } }
      end

      def show
        anomaly = SalaryDataAnomaly.includes(:employee, :reviewed_by, :last_seen_scan).find(params[:id])
        page, size = EmployeeDirectory.pagination(params).values_at(:page, :per_page)
        reviews = anomaly.reviews
        count = reviews.count
        rows = reviews.includes(:reviewed_by).order(created_at: :desc, id: :desc).offset((page - 1) * size).limit(size)
        render json: { data: SalaryDataAnomalySerializer.call(anomaly), reviews: {
          data: rows.map { |review| review.slice(:id, :status, :notes).merge("reviewed_at" => review.created_at.iso8601, "reviewed_by" => review.reviewed_by.slice(:id, :name)) },
          meta: { page: page, per_page: size, total_count: count, total_pages: (count + size - 1) / size } } }
      end

      def update
        anomaly = SalaryDataAnomaly.find(params[:id])
        review = params.expect(review: [ :status, :notes ])
        SalaryDataAnomalyReviewer.call(anomaly: anomaly, reviewed_by: @current_user, status: review[:status], notes: review[:notes])
        render json: { data: SalaryDataAnomalySerializer.call(anomaly) }
      rescue ActionController::ParameterMissing
        render json: { errors: [ "A review object is required" ] }, status: :bad_request
      end
    end
  end
end

class SalaryDataAnomalyReviewer
  class StaleFinding < StandardError; end

  def self.call(anomaly:, reviewed_by:, status:, notes:)
    anomaly.with_lock do
      anomaly.employee.with_lock do
        current = SalaryDataQualityRules.employee_scope.find(anomaly.employee_id)
        unless anomaly.active? && SalaryDataQualityRules.snapshot(current) == anomaly.snapshot
          raise StaleFinding, "Employee data changed or this finding cleared. Run salary checks again before reviewing it."
        end
        review = anomaly.reviews.create!(reviewed_by: reviewed_by, status: status, notes: notes)
        anomaly.update!(review_status: review.status, review_notes: review.notes, reviewed_by: reviewed_by, reviewed_at: review.created_at)
      end
    end
    anomaly
  end
end

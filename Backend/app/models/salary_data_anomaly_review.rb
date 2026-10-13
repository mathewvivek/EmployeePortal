class SalaryDataAnomalyReview < ApplicationRecord
  belongs_to :salary_data_anomaly
  belongs_to :reviewed_by, class_name: "User"
  validates :status, inclusion: { in: SalaryDataAnomaly::REVIEW_STATUSES }
  validates :notes, length: { maximum: 2000 }
  validates :notes, presence: true, if: -> { %w[confirmed_error legitimate].include?(status) }

  def readonly?
    persisted? || super
  end
end

class SalaryDataAnomaly < ApplicationRecord
  REVIEW_STATUSES = %w[pending investigating confirmed_error legitimate].freeze
  belongs_to :employee
  belongs_to :last_seen_scan, class_name: "SalaryDataQualityScan"
  belongs_to :reviewed_by, class_name: "User", optional: true
  has_many :reviews, class_name: "SalaryDataAnomalyReview", dependent: :restrict_with_error

  validates :fingerprint, :rule_code, :severity, :review_status, presence: true
  validates :fingerprint, format: { with: /\A[0-9a-f]{64}\z/ }, uniqueness: true
  validates :rule_code, inclusion: { in: SalaryDataQualityRules::RULES.keys }
  validates :severity, inclusion: { in: %w[warning info] }
  validates :review_status, inclusion: { in: REVIEW_STATUSES }
  validates :review_notes, length: { maximum: 2000 }
end

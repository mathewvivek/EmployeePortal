class SalaryDataQualityScan < ApplicationRecord
  belongs_to :requested_by, class_name: "User"
  validates :started_at, presence: true
end

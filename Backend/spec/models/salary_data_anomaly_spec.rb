require "rails_helper"

RSpec.describe SalaryDataAnomaly, type: :model do
  let(:user) { create_user }
  let(:anomaly) do
    create_employee(base_salary: "0")
    SalaryDataQualityChecker.call(requested_by: user)
    described_class.first
  end

  it "validates fingerprint, rule, severity and review status" do
    expect(anomaly).to be_valid
    { fingerprint: "bad", rule_code: "unknown", severity: "error", review_status: "closed" }.each do |attribute, value|
      expect_validation_error(anomaly, attribute, value)
      anomaly.reload
    end
  end

  it "rejects duplicate fingerprints" do
    duplicate = anomaly.dup
    expect(duplicate).not_to be_valid
    expect(duplicate.errors[:fingerprint]).not_to be_empty
  end

  it "validates the audit reviewer, status and maximum note length" do
    review = anomaly.reviews.new(reviewed_by: user, status: "investigating")
    expect(review).to be_valid
    expect_validation_error(review, :notes, "x" * 2001)
    review.notes = nil
    expect_validation_error(review, :status, "closed")
    review.status = "investigating"
    review.reviewed_by = nil
    expect(review).not_to be_valid
  end

  it "rejects deletion of findings with review history" do
    SalaryDataAnomalyReviewer.call(anomaly: anomaly, reviewed_by: user, status: "investigating", notes: "Review in progress")
    expect(anomaly.destroy).to be(false)
    expect(anomaly.reviews.count).to eq(1)
  end

  it "rejects destruction of persisted audit entries" do
    SalaryDataAnomalyReviewer.call(anomaly: anomaly, reviewed_by: user, status: "investigating", notes: nil)
    expect { anomaly.reviews.first.destroy! }.to raise_error(ActiveRecord::ReadOnlyRecord)
  end
end

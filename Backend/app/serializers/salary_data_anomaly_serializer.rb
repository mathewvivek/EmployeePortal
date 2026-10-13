class SalaryDataAnomalySerializer
  def self.call(anomaly)
    employee = anomaly.employee
    current = employee.slice(*SalaryDataQualityRules::REQUIRED_FIELDS, :status).merge(
      "base_salary" => Compensation.format_amount(employee.base_salary), "currency" => employee.currency,
      "effective_date" => employee.effective_date.iso8601, "updated_at" => employee.updated_at.utc.iso8601(6))
    {
      id: anomaly.id, employee: EmployeeSerializer.call(employee), rule_code: anomaly.rule_code,
      rule_name: SalaryDataQualityRules::RULES.fetch(anomaly.rule_code).first, severity: anomaly.severity,
      snapshot: anomaly.snapshot, observed: anomaly.observed, reference: anomaly.reference, active: anomaly.active,
      source_stale: current != anomaly.snapshot.except("latest_change"), review_status: anomaly.review_status,
      review_notes: anomaly.review_notes, reviewed_by: anomaly.reviewed_by&.slice(:id, :name),
      reviewed_at: anomaly.reviewed_at&.iso8601, first_detected_at: anomaly.created_at.iso8601,
      last_checked_at: anomaly.last_seen_scan.completed_at&.iso8601, cleared_at: anomaly.cleared_at&.iso8601
    }
  end

  def self.scan(scan)
    return nil unless scan
    scan.slice(:id, :checked_employees, :detected_findings, :new_findings, :affected_employees, :cleared_findings).merge(
      "started_at" => scan.started_at.iso8601, "completed_at" => scan.completed_at&.iso8601)
  end
end

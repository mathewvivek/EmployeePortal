class SalaryDataQualityChecker
  BATCH_SIZE = 500

  def self.call(requested_by:)
    SalaryDataQualityScan.transaction do
      # Serialize full scans so concurrent requests cannot clear each other's findings.
      SalaryDataQualityScan.connection.execute("SELECT pg_advisory_xact_lock(81263004)")
      scan = SalaryDataQualityScan.create!(requested_by: requested_by, started_at: Time.current)
      peers = SalaryDataQualityRules.peer_statistics
      checked_on = Date.current
      checked = detected = added = 0
      SalaryDataQualityRules.employee_scope.find_in_batches(batch_size: BATCH_SIZE) do |employees|
        now = Time.current
        rows = employees.flat_map do |employee|
          SalaryDataQualityRules.findings(employee, peers: peers, checked_on: checked_on).map do |finding|
            fingerprint = Digest::SHA256.hexdigest(JSON.generate([ employee.id, finding ]))
            finding.merge(employee_id: employee.id, fingerprint: fingerprint, last_seen_scan_id: scan.id,
              review_status: "pending", active: true, created_at: now, updated_at: now)
          end
        end
        checked += employees.size
        detected += rows.size
        if rows.any?
          added += SalaryDataAnomaly.insert_all(rows, unique_by: :fingerprint, returning: [ :id ]).rows.size
          SalaryDataAnomaly.where(fingerprint: rows.map { |row| row[:fingerprint] }).update_all(
            last_seen_scan_id: scan.id, active: true, cleared_at: nil, updated_at: now)
        end
      end
      completed_at = Time.current
      cleared = SalaryDataAnomaly.where(active: true).where.not(last_seen_scan_id: scan.id).update_all(
        active: false, cleared_at: completed_at, updated_at: completed_at)
      scan.update!(completed_at: completed_at, checked_employees: checked, detected_findings: detected,
        new_findings: added, affected_employees: SalaryDataAnomaly.where(last_seen_scan_id: scan.id).distinct.count(:employee_id), cleared_findings: cleared)
      scan
    end
  end
end

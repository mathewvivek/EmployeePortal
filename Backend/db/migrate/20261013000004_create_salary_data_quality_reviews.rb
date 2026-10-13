class CreateSalaryDataQualityReviews < ActiveRecord::Migration[8.1]
  def change
    create_table :salary_data_quality_scans do |t|
      t.references :requested_by, null: false, foreign_key: { to_table: :users }
      t.datetime :started_at, null: false
      t.datetime :completed_at
      t.integer :checked_employees, null: false, default: 0
      t.integer :detected_findings, null: false, default: 0
      t.integer :new_findings, null: false, default: 0
      t.integer :affected_employees, null: false, default: 0
      t.integer :cleared_findings, null: false, default: 0
      t.timestamps
    end

    create_table :salary_data_anomalies do |t|
      t.references :employee, null: false, foreign_key: true
      t.references :last_seen_scan, null: false, foreign_key: { to_table: :salary_data_quality_scans }
      t.string :fingerprint, null: false
      t.string :rule_code, null: false
      t.string :severity, null: false
      t.jsonb :snapshot, null: false, default: {}
      t.jsonb :observed, null: false, default: {}
      t.jsonb :reference, null: false, default: {}
      t.boolean :active, null: false, default: true
      t.string :review_status, null: false, default: "pending"
      t.text :review_notes
      t.references :reviewed_by, foreign_key: { to_table: :users }
      t.datetime :reviewed_at
      t.datetime :cleared_at
      t.timestamps
    end
    add_index :salary_data_anomalies, :fingerprint, unique: true
    add_index :salary_data_anomalies, [ :active, :review_status, :created_at ], name: "index_salary_anomalies_on_review_queue"
    add_check_constraint :salary_data_anomalies, "review_status IN ('pending', 'investigating', 'confirmed_error', 'legitimate')", name: "salary_anomalies_review_status"
    add_check_constraint :salary_data_anomalies, "severity IN ('warning', 'info')", name: "salary_anomalies_severity"

    create_table :salary_data_anomaly_reviews do |t|
      t.references :salary_data_anomaly, null: false, foreign_key: true
      t.references :reviewed_by, null: false, foreign_key: { to_table: :users }
      t.string :status, null: false
      t.text :notes
      t.timestamps
    end
    add_check_constraint :salary_data_anomaly_reviews, "status IN ('pending', 'investigating', 'confirmed_error', 'legitimate')", name: "salary_anomaly_reviews_status"
  end
end

# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_10_13_000004) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "employees", force: :cascade do |t|
    t.string "employee_id", null: false
    t.string "name", null: false
    t.string "department", null: false
    t.string "country", null: false
    t.string "designation", null: false
    t.string "status", null: false
    t.decimal "base_salary", precision: 18, scale: 2, null: false
    t.string "currency", null: false
    t.date "effective_date", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["base_salary", "employee_id"], name: "index_employees_on_base_salary_and_employee_id"
    t.index ["country", "department", "status"], name: "index_employees_on_country_and_department_and_status"
    t.index ["department"], name: "index_employees_on_department"
    t.index ["employee_id"], name: "index_employees_on_employee_id", unique: true
    t.index ["status"], name: "index_employees_on_status"
    t.check_constraint "base_salary >= 0::numeric", name: "employees_nonnegative_salary"
    t.check_constraint "currency::text = ANY (ARRAY['INR'::character varying, 'USD'::character varying, 'GBP'::character varying, 'EUR'::character varying, 'JPY'::character varying]::text[])", name: "employees_supported_currency"
    t.check_constraint "status::text = ANY (ARRAY['active'::character varying, 'inactive'::character varying]::text[])", name: "employees_supported_status"
  end

  create_table "salary_changes", force: :cascade do |t|
    t.bigint "employee_id", null: false
    t.decimal "old_base_salary", precision: 18, scale: 2, null: false
    t.decimal "new_base_salary", precision: 18, scale: 2, null: false
    t.string "old_currency", null: false
    t.string "new_currency", null: false
    t.date "old_effective_date", null: false
    t.date "effective_date", null: false
    t.datetime "changed_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["employee_id", "changed_at", "id"], name: "index_salary_changes_on_employee_id_and_changed_at_and_id"
    t.index ["employee_id"], name: "index_salary_changes_on_employee_id"
    t.check_constraint "(old_currency::text = ANY (ARRAY['INR'::character varying, 'USD'::character varying, 'GBP'::character varying, 'EUR'::character varying, 'JPY'::character varying]::text[])) AND (new_currency::text = ANY (ARRAY['INR'::character varying, 'USD'::character varying, 'GBP'::character varying, 'EUR'::character varying, 'JPY'::character varying]::text[]))", name: "salary_changes_supported_currencies"
    t.check_constraint "old_base_salary >= 0::numeric AND new_base_salary >= 0::numeric", name: "salary_changes_nonnegative_salaries"
  end

  create_table "salary_data_anomalies", force: :cascade do |t|
    t.bigint "employee_id", null: false
    t.bigint "last_seen_scan_id", null: false
    t.string "fingerprint", null: false
    t.string "rule_code", null: false
    t.string "severity", null: false
    t.jsonb "snapshot", default: {}, null: false
    t.jsonb "observed", default: {}, null: false
    t.jsonb "reference", default: {}, null: false
    t.boolean "active", default: true, null: false
    t.string "review_status", default: "pending", null: false
    t.text "review_notes"
    t.bigint "reviewed_by_id"
    t.datetime "reviewed_at"
    t.datetime "cleared_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["active", "review_status", "created_at"], name: "index_salary_anomalies_on_review_queue"
    t.index ["employee_id"], name: "index_salary_data_anomalies_on_employee_id"
    t.index ["fingerprint"], name: "index_salary_data_anomalies_on_fingerprint", unique: true
    t.index ["last_seen_scan_id"], name: "index_salary_data_anomalies_on_last_seen_scan_id"
    t.index ["reviewed_by_id"], name: "index_salary_data_anomalies_on_reviewed_by_id"
    t.check_constraint "review_status::text = ANY (ARRAY['pending'::character varying, 'investigating'::character varying, 'confirmed_error'::character varying, 'legitimate'::character varying]::text[])", name: "salary_anomalies_review_status"
    t.check_constraint "severity::text = ANY (ARRAY['warning'::character varying, 'info'::character varying]::text[])", name: "salary_anomalies_severity"
  end

  create_table "salary_data_anomaly_reviews", force: :cascade do |t|
    t.bigint "salary_data_anomaly_id", null: false
    t.bigint "reviewed_by_id", null: false
    t.string "status", null: false
    t.text "notes"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["reviewed_by_id"], name: "index_salary_data_anomaly_reviews_on_reviewed_by_id"
    t.index ["salary_data_anomaly_id"], name: "index_salary_data_anomaly_reviews_on_salary_data_anomaly_id"
    t.check_constraint "status::text = ANY (ARRAY['pending'::character varying, 'investigating'::character varying, 'confirmed_error'::character varying, 'legitimate'::character varying]::text[])", name: "salary_anomaly_reviews_status"
  end

  create_table "salary_data_quality_scans", force: :cascade do |t|
    t.bigint "requested_by_id", null: false
    t.datetime "started_at", null: false
    t.datetime "completed_at"
    t.integer "checked_employees", default: 0, null: false
    t.integer "detected_findings", default: 0, null: false
    t.integer "new_findings", default: 0, null: false
    t.integer "affected_employees", default: 0, null: false
    t.integer "cleared_findings", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["requested_by_id"], name: "index_salary_data_quality_scans_on_requested_by_id"
  end

  create_table "sessions", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "token_digest", null: false
    t.datetime "expires_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["expires_at"], name: "index_sessions_on_expires_at"
    t.index ["token_digest"], name: "index_sessions_on_token_digest", unique: true
    t.index ["user_id"], name: "index_sessions_on_user_id"
  end

  create_table "users", force: :cascade do |t|
    t.string "email", null: false
    t.string "name", null: false
    t.string "role", default: "superadmin", null: false
    t.string "password_digest", null: false
    t.boolean "active", default: true, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_users_on_email", unique: true
    t.check_constraint "role::text = 'superadmin'::text", name: "users_superadmin_role"
  end

  add_foreign_key "salary_changes", "employees"
  add_foreign_key "salary_data_anomalies", "employees"
  add_foreign_key "salary_data_anomalies", "salary_data_quality_scans", column: "last_seen_scan_id"
  add_foreign_key "salary_data_anomalies", "users", column: "reviewed_by_id"
  add_foreign_key "salary_data_anomaly_reviews", "salary_data_anomalies"
  add_foreign_key "salary_data_anomaly_reviews", "users", column: "reviewed_by_id"
  add_foreign_key "salary_data_quality_scans", "users", column: "requested_by_id"
  add_foreign_key "sessions", "users"
end

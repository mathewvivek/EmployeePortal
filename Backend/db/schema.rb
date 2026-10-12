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

ActiveRecord::Schema[8.1].define(version: 2026_10_12_000003) do
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
  add_foreign_key "sessions", "users"
end

class CreateSalaryChanges < ActiveRecord::Migration[8.1]
  def change
    create_table :salary_changes do |t|
      t.references :employee, null: false, foreign_key: true
      t.decimal :old_base_salary, precision: 18, scale: 2, null: false
      t.decimal :new_base_salary, precision: 18, scale: 2, null: false
      t.string :old_currency, null: false
      t.string :new_currency, null: false
      t.date :old_effective_date, null: false
      t.date :effective_date, null: false
      t.datetime :changed_at, null: false
      t.timestamps
    end

    add_index :salary_changes, [ :employee_id, :changed_at, :id ]
    add_check_constraint :salary_changes, "old_base_salary >= 0 AND new_base_salary >= 0",
      name: "salary_changes_nonnegative_salaries"
    add_check_constraint :salary_changes,
      "old_currency IN ('INR', 'USD', 'GBP', 'EUR', 'JPY') AND new_currency IN ('INR', 'USD', 'GBP', 'EUR', 'JPY')",
      name: "salary_changes_supported_currencies"
  end
end

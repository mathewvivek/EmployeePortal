class CreateEmployees < ActiveRecord::Migration[8.1]
  def change
    create_table :employees do |t|
      t.string :employee_id, null: false
      t.string :name, null: false
      t.string :department, null: false
      t.string :country, null: false
      t.string :designation, null: false
      t.string :status, null: false
      t.decimal :base_salary, precision: 18, scale: 2, null: false
      t.string :currency, null: false
      t.date :effective_date, null: false
      t.timestamps
    end

    add_index :employees, :employee_id, unique: true
    add_index :employees, [ :country, :department, :status ]
    add_index :employees, :department
    add_index :employees, :status
    add_index :employees, [ :base_salary, :employee_id ]
    add_check_constraint :employees, "base_salary >= 0", name: "employees_nonnegative_salary"
    add_check_constraint :employees, "status IN ('active', 'inactive')", name: "employees_supported_status"
    add_check_constraint :employees, "currency IN ('INR', 'USD', 'GBP', 'EUR', 'JPY')", name: "employees_supported_currency"
  end
end

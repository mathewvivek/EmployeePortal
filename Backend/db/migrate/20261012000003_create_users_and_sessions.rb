class CreateUsersAndSessions < ActiveRecord::Migration[8.1]
  def change
    create_table :users do |t|
      t.string :email, null: false
      t.string :name, null: false
      t.string :role, null: false, default: "superadmin"
      t.string :password_digest, null: false
      t.boolean :active, null: false, default: true
      t.timestamps
    end
    add_index :users, :email, unique: true
    add_check_constraint :users, "role = 'superadmin'", name: "users_superadmin_role"

    create_table :sessions do |t|
      t.references :user, null: false, foreign_key: true
      t.string :token_digest, null: false
      t.datetime :expires_at, null: false
      t.timestamps
    end
    add_index :sessions, :token_digest, unique: true
    add_index :sessions, :expires_at
  end
end

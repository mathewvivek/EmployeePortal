class User < ApplicationRecord
  has_secure_password reset_token: false
  has_many :sessions, dependent: :destroy

  normalizes :email, with: ->(email) { email.strip.downcase }
  validates :email, :name, :role, presence: true
  validates :email, format: { with: URI::MailTo::EMAIL_REGEXP }, uniqueness: true
  validates :role, inclusion: { in: [ "superadmin" ] }
  validates :password, length: { minimum: 12 }, allow_nil: true

  after_update :revoke_sessions, if: -> { saved_change_to_password_digest? || saved_change_to_active? }

  def public_attributes
    attributes.slice("id", "email", "name", "role")
  end

  private

  def revoke_sessions
    sessions.destroy_all
  end
end

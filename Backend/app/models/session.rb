require "digest"

class Session < ApplicationRecord
  LIFETIME = 8.hours

  belongs_to :user
  validates :token_digest, :expires_at, presence: true
  validates :token_digest, uniqueness: true

  def self.issue!(user:)
    token = SecureRandom.hex(32)
    session = create!(user: user, token_digest: Digest::SHA256.hexdigest(token), expires_at: LIFETIME.from_now)
    [ session, token ]
  end

  def self.authenticate(token)
    return unless token.is_a?(String) && token.match?(/\A[0-9a-f]{64}\z/)

    session = includes(:user).where("expires_at > ?", Time.current)
      .find_by(token_digest: Digest::SHA256.hexdigest(token))
    session if session&.user&.active?
  end
end

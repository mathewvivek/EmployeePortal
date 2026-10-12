require "rails_helper"

RSpec.describe Session do
  it "stores only a token digest and authenticates the original opaque token" do
    user = create_user
    session, token = described_class.issue!(user: user)
    expect(token).to match(/\A[0-9a-f]{64}\z/)
    expect(session.token_digest).not_to eq(token)
    expect(described_class.authenticate(token)).to eq(session)
    expect(session.expires_at).to be_within(1.second).of(8.hours.from_now)
  end

  it "rejects malformed, tampered and expired tokens" do
    session, token = described_class.issue!(user: create_user)
    [ nil, "", "invalid", "a" * 64 ].each { |value| expect(described_class.authenticate(value)).to be_nil }
    session.update!(expires_at: 1.second.ago)
    expect(described_class.authenticate(token)).to be_nil
  end
end

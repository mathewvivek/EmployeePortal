require "rails_helper"

RSpec.describe User do
  it "hashes the password and normalizes the login email" do
    user = create_user(email: " HR@EXAMPLE.COM ")
    expect(user.email).to eq("hr@example.com")
    expect(user.password_digest).not_to eq(user.password)
    expect(user.authenticate("TestingHR!2026Access")).to eq(user)
    expect(user.authenticate("wrong password")).to be(false)
    expect(user.public_attributes.keys).to contain_exactly("id", "email", "name", "role")
  end

  it "validates required identity details, email uniqueness and password length" do
    user = create_user
    expect(User.new(email: user.email.upcase, name: "Another HR", password: "short")).not_to be_valid
    expect(User.new(email: "bad email", name: "", password: "TestingHR!2026Access", role: "other")).not_to be_valid
    expect(User.new(email: "new@example.com", name: "HR")).not_to be_valid
  end

  it "revokes sessions when the password changes" do
    user = create_user
    session, token = Session.issue!(user: user)
    user.update!(password: "NewTestingHR!2026Access")
    expect(Session.exists?(session.id)).to be(false)
    expect(Session.authenticate(token)).to be_nil
  end

  it "revokes sessions when the HR account is disabled" do
    user = create_user
    session, token = Session.issue!(user: user)
    user.update!(active: false)
    expect(Session.exists?(session.id)).to be(false)
    expect(Session.authenticate(token)).to be_nil
  end
end

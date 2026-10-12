require "rails_helper"

RSpec.describe HrUserSeed do
  before do
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:fetch).and_call_original
    allow(ENV).to receive(:fetch).with("HR_LOGIN_EMAIL", described_class::DEVELOPMENT_EMAIL).and_return(described_class::DEVELOPMENT_EMAIL)
    allow(ENV).to receive(:[]).with("HR_LOGIN_PASSWORD").and_return(nil)
    allow(ENV).to receive(:[]).with("SEED_HR_USER").and_return(nil)
    allow(ENV).to receive(:[]).with("ROTATE_HR_PASSWORD").and_return(nil)
  end

  it "creates exactly one HR superadmin and preserves an existing account on reruns" do
    expect { described_class.load! }.to change(User, :count).by(1)
    user = User.last
    expect(user.authenticate(described_class::DEVELOPMENT_PASSWORD)).to eq(user)
    expect(user.role).to eq("superadmin")
    user.update!(password: "ChangedPassword!2026Access")
    original = user.attributes
    expect { described_class.load! }.not_to change(User, :count)
    expect(user.reload.attributes).to eq(original)
  end

  it "rejects production provisioning without an opt-in or a production password" do
    allow(Rails).to receive(:env).and_return(ActiveSupport::EnvironmentInquirer.new("production"))
    expect { described_class.load! }.to raise_error(ArgumentError, /SEED_HR_USER/)
    allow(ENV).to receive(:[]).with("SEED_HR_USER").and_return("true")
    expect { described_class.load! }.to raise_error(ArgumentError, /HR_LOGIN_PASSWORD/)
    expect(User.count).to eq(0)
  end

  it "uses the configured production password instead of the demo default" do
    allow(Rails).to receive(:env).and_return(ActiveSupport::EnvironmentInquirer.new("production"))
    allow(ENV).to receive(:[]).with("SEED_HR_USER").and_return("true")
    allow(ENV).to receive(:[]).with("HR_LOGIN_PASSWORD").and_return("ProductionPassword!2026Access")
    described_class.load!
    user = User.last
    expect(user.authenticate("ProductionPassword!2026Access")).to eq(user)
    expect(user.authenticate(described_class::DEVELOPMENT_PASSWORD)).to be(false)
    expect(User.count).to eq(1)
  end

  it "rotates the existing account password only when requested and revokes old sessions" do
    user = described_class.load!
    _session, token = Session.issue!(user: user)
    allow(ENV).to receive(:[]).with("HR_LOGIN_PASSWORD").and_return("RotatedHR!2026Access")
    described_class.load!
    expect(Session.authenticate(token)).not_to be_nil
    allow(ENV).to receive(:[]).with("ROTATE_HR_PASSWORD").and_return("true")
    expect { described_class.load! }.not_to change(User, :count)
    expect(user.reload.authenticate("RotatedHR!2026Access")).to eq(user)
    expect(Session.authenticate(token)).to be_nil
  end
end

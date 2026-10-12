require "spec_helper"
require "fileutils"
require "open3"
require "tmpdir"

RSpec.describe "Render build script" do
  let(:backend_root) { File.expand_path("../..", __dir__) }
  let(:script) { File.join(backend_root, "bin/render-build.sh") }

  def run_build(overrides = {})
    Dir.mktmpdir("render-build-spec") do |directory|
      bundle = File.join(directory, "bundle")
      log = File.join(directory, "commands.log")
      File.write(bundle, <<~BASH)
        #!/usr/bin/env bash
        printf '%s|%s|%s|%s|%s|%s|%s\n' "$PWD" "$RAILS_ENV" "$BUNDLE_FROZEN" "$BUNDLE_WITHOUT" "$*" "${SEED_EMPLOYEE_COUNT:-}" "${ALLOW_PRODUCTION_SEEDS:-}" >> "$COMMAND_LOG"
        if [[ "$*" == "${FAIL_COMMAND:-}" ]]; then exit 42; fi
      BASH
      FileUtils.chmod(0o755, bundle)
      environment = {
        "PATH" => "#{directory}:#{ENV.fetch('PATH')}", "COMMAND_LOG" => log,
        "DATABASE_URL" => "postgresql://example.invalid/employee_portal",
        "RAILS_ENV" => "development", "BUNDLE_WITHOUT" => nil,
        "RENDER_RUN_MIGRATIONS" => nil, "FAIL_COMMAND" => nil,
        "SEED_EMPLOYEE_COUNT" => nil, "ALLOW_PRODUCTION_SEEDS" => nil,
        "SEED_HR_USER" => nil, "HR_LOGIN_PASSWORD" => nil
      }.merge(overrides)
      stdout, stderr, status = Open3.capture3(environment, "bash", script, chdir: directory)
      calls = File.exist?(log) ? File.readlines(log, chomp: true).map { |line| line.split("|") } : []
      { stdout: stdout, stderr: stderr, status: status, calls: calls }
    end
  end

  it "is executable" do
    expect(File.executable?(script)).to be(true)
  end

  it "builds from Backend in production and migrates only the primary database" do
    result = run_build
    expect(result[:status]).to be_success
    expect(result[:calls].map { |call| call[4] }).to eq([
      "install", "exec bootsnap precompile --gemfile app/ lib/", "exec rails db:migrate:primary"
    ])
    result[:calls].each do |call|
      expect(call.first(4)).to eq([ backend_root, "production", "true", "development:test" ])
    end
  end

  it "can defer migrations to Render's pre-deploy command" do
    result = run_build("RENDER_RUN_MIGRATIONS" => "false")
    expect(result[:status]).to be_success
    expect(result[:calls].map { |call| call[4] }).to eq([ "install", "exec bootsnap precompile --gemfile app/ lib/" ])
  end

  it "requires a database URL before running build commands" do
    result = run_build("DATABASE_URL" => nil)
    expect(result[:status]).not_to be_success
    expect(result[:stderr]).to include("Set DATABASE_URL")
    expect(result[:calls]).to be_empty
  end

  it "rejects invalid migration settings before running build commands" do
    result = run_build("RENDER_RUN_MIGRATIONS" => "yes")
    expect(result[:status]).not_to be_success
    expect(result[:stderr]).to include("must be true or false")
    expect(result[:calls]).to be_empty
  end

  [ "install", "exec bootsnap precompile --gemfile app/ lib/", "exec rails db:migrate:primary" ].each do |command|
    it "stops immediately when #{command} fails" do
      result = run_build("FAIL_COMMAND" => command)
      expect(result[:status].exitstatus).to eq(42)
      expect(result[:calls].last[4]).to eq(command)
    end
  end

  it "seeds the requested production dataset only after migrations when explicitly enabled" do
    result = run_build("SEED_EMPLOYEE_COUNT" => "10000", "ALLOW_PRODUCTION_SEEDS" => "true")
    expect(result[:status]).to be_success
    expect(result[:calls].map { |call| call[4] }).to eq([
      "install", "exec bootsnap precompile --gemfile app/ lib/",
      "exec rails db:migrate:primary", "exec rails db:seed"
    ])
    expect(result[:calls].last.last(2)).to eq([ "10000", "true" ])
  end

  [ nil, "false", "yes" ].each do |permission|
    it "rejects production seeding without exact opt-in #{permission.inspect}" do
      result = run_build("SEED_EMPLOYEE_COUNT" => "10000", "ALLOW_PRODUCTION_SEEDS" => permission)
      expect(result[:status]).not_to be_success
      expect(result[:stderr]).to include("ALLOW_PRODUCTION_SEEDS=true")
      expect(result[:calls]).to be_empty
    end
  end

  it "does not seed from the permission flag alone" do
    result = run_build("ALLOW_PRODUCTION_SEEDS" => "true")
    expect(result[:status]).to be_success
    expect(result[:calls].map { |call| call[4] }).not_to include("exec rails db:seed")
  end

  it "prevents build-time seeding before deferred pre-deploy migrations" do
    result = run_build("SEED_EMPLOYEE_COUNT" => "10000", "ALLOW_PRODUCTION_SEEDS" => "true",
      "RENDER_RUN_MIGRATIONS" => "false")
    expect(result[:status]).not_to be_success
    expect(result[:stderr]).to include("Build-time seeding requires RENDER_RUN_MIGRATIONS=true")
    expect(result[:calls]).to be_empty
  end

  it "fails the deployment when database seeding fails" do
    result = run_build("SEED_EMPLOYEE_COUNT" => "10000", "ALLOW_PRODUCTION_SEEDS" => "true",
      "FAIL_COMMAND" => "exec rails db:seed")
    expect(result[:status].exitstatus).to eq(42)
    expect(result[:calls].last[4]).to eq("exec rails db:seed")
  end

  it "provisions the HR account without requiring employee demo seeds" do
    result = run_build("SEED_HR_USER" => "true", "HR_LOGIN_PASSWORD" => "TestProvisioning!2026Access")
    expect(result[:status]).to be_success
    expect(result[:calls].map { |call| call[4] }).to eq([
      "install", "exec bootsnap precompile --gemfile app/ lib/",
      "exec rails db:migrate:primary", "exec rails db:seed"
    ])
    expect(result[:stdout]).to include("Provisioning the production HR account")
    expect(result[:stdout] + result[:stderr]).not_to include("TestProvisioning!2026Access")
  end

  it "provisions HR and employee data in one seed run after migrations" do
    result = run_build("SEED_HR_USER" => "true", "HR_LOGIN_PASSWORD" => "TestProvisioning!2026Access",
      "SEED_EMPLOYEE_COUNT" => "10000", "ALLOW_PRODUCTION_SEEDS" => "true")
    expect(result[:status]).to be_success
    expect(result[:calls].map { |call| call[4] }).to eq([
      "install", "exec bootsnap precompile --gemfile app/ lib/",
      "exec rails db:migrate:primary", "exec rails db:seed"
    ])
  end

  it "fails the deployment when HR account seeding fails" do
    result = run_build("SEED_HR_USER" => "true", "HR_LOGIN_PASSWORD" => "TestProvisioning!2026Access",
      "FAIL_COMMAND" => "exec rails db:seed")
    expect(result[:status].exitstatus).to eq(42)
    expect(result[:calls].last[4]).to eq("exec rails db:seed")
  end

  it "does not seed HR from credentials alone without opting in" do
    result = run_build("SEED_HR_USER" => "false", "HR_LOGIN_PASSWORD" => "TestProvisioning!2026Access")
    expect(result[:status]).to be_success
    expect(result[:calls].map { |call| call[4] }).not_to include("exec rails db:seed")
  end

  it "rejects HR provisioning without a configured password" do
    result = run_build("SEED_HR_USER" => "true")
    expect(result[:status]).not_to be_success
    expect(result[:stderr]).to include("HR_LOGIN_PASSWORD")
    expect(result[:calls]).to be_empty
  end

  it "does not provision users before deferred migrations" do
    result = run_build("SEED_HR_USER" => "true", "HR_LOGIN_PASSWORD" => "TestProvisioning!2026Access",
      "RENDER_RUN_MIGRATIONS" => "false")
    expect(result[:status]).not_to be_success
    expect(result[:calls]).to be_empty
  end

  it "rejects invalid HR provisioning flags" do
    result = run_build("SEED_HR_USER" => "yes")
    expect(result[:status]).not_to be_success
    expect(result[:calls]).to be_empty
  end
end

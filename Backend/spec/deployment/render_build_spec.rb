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
        printf '%s|%s|%s|%s|%s\n' "$PWD" "$RAILS_ENV" "$BUNDLE_FROZEN" "$BUNDLE_WITHOUT" "$*" >> "$COMMAND_LOG"
        if [[ "$*" == "${FAIL_COMMAND:-}" ]]; then exit 42; fi
      BASH
      FileUtils.chmod(0o755, bundle)
      environment = {
        "PATH" => "#{directory}:#{ENV.fetch('PATH')}", "COMMAND_LOG" => log,
        "DATABASE_URL" => "postgresql://example.invalid/employee_portal",
        "RAILS_ENV" => "development", "BUNDLE_WITHOUT" => nil,
        "RENDER_RUN_MIGRATIONS" => nil, "FAIL_COMMAND" => nil
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
    expect(result[:calls].map(&:last)).to eq([
      "install", "exec bootsnap precompile --gemfile app/ lib/", "exec rails db:migrate:primary"
    ])
    result[:calls].each do |call|
      expect(call.first(4)).to eq([ backend_root, "production", "true", "development:test" ])
    end
  end

  it "can defer migrations to Render's pre-deploy command" do
    result = run_build("RENDER_RUN_MIGRATIONS" => "false")
    expect(result[:status]).to be_success
    expect(result[:calls].map(&:last)).to eq([ "install", "exec bootsnap precompile --gemfile app/ lib/" ])
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
      expect(result[:calls].last.last).to eq(command)
    end
  end
end

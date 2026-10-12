ENV["RAILS_ENV"] ||= "test"
abort("Specs must run with RAILS_ENV=test") unless ENV["RAILS_ENV"] == "test"

require "spec_helper"
require_relative "../config/environment"
require "rspec/rails"

ActiveRecord::Migration.maintain_test_schema!

Rails.root.glob("spec/support/**/*.rb").sort.each { |file| require file }

RSpec.configure do |config|
  config.use_transactional_fixtures = true
  config.infer_spec_type_from_file_location!
  config.filter_rails_from_backtrace!
  config.include EmployeeSpecHelpers
end

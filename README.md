# Employee Portal Backend

Ruby 3.2.7, Rails 8.1 and PostgreSQL. The P0 feature specs are deliberately
in the TDD red phase: employee models, migrations, controllers, routes and
services have not been implemented. Missing features fail expectations;
examples are not skipped, pending or marked as expected failures in CI.

## Run Specs

Install/select Ruby 3.2.7 and start PostgreSQL, then run:

```sh
bundle install
RAILS_ENV=test bin/rails db:prepare
bundle exec rspec
bundle exec rspec spec/models/employee_spec.rb
```

Set `DATABASE_URL` to a dedicated test database if local PostgreSQL uses a
password or a different host. Specs require `RAILS_ENV=test` and use database
transactions. `config/master.key` is ignored by Git and must stay private.

GitHub Actions runs the specs with PostgreSQL 16. Failure is expected until
the P0 implementation is complete. The 10,000-employee dataset is deferred;
these specs use a few explicit records per example.

## Coverage

| P0 requirement | Specs |
| --- | --- |
| Employee directory | `spec/models/employee_spec.rb`, `spec/requests/employees_spec.rb` |
| Search, filters, salary sort | `spec/requests/employees_spec.rb` |
| Salary management with confirmation | `spec/requests/salaries_spec.rb`, `spec/services/salary_updater_spec.rb` |
| Salary history and traceability | `spec/models/salary_change_spec.rb`, `spec/requests/salaries_spec.rb` |
| Compensation insights | `spec/services/compensation_insights_spec.rb`, `spec/requests/compensation_insights_spec.rb` |
| Multi-currency totals | Employee, salary history and compensation specs |
| Data validation | Employee and salary history model specs, directory and salary request specs |

The detailed proposed API and model contract is in [docs/p0_contract.md](docs/p0_contract.md).

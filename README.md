# Employee Portal

Ruby 3.2.7, Rails 8.1 and PostgreSQL. The backend implements the P0 employee
directory, search and filters, salary management, salary history and
compensation insights. Salaries and financial summaries retain decimal
precision and keep currencies separate.

The Rails API lives in `Backend/`. The React/TypeScript UI lives in
`Frontend/` and uses Vite. It provides an employee directory, compensation
insights, salary updates with confirmation, and salary-history views.

## Run the API

Select Ruby 3.2.7 and start PostgreSQL, then run:

```sh
cd Backend
bundle install
bin/rails db:prepare
bin/rails server
```

The API is available under `/api/v1`; `GET /up` is the health endpoint.
See [Backend/docs/p0_contract.md](Backend/docs/p0_contract.md) for routes and request formats.
Employees can be created through `Employee.create!` in the Rails console.
Employee creation is not exposed as an API endpoint in the P0 contract.

For an optional development-only dataset of 32 employees, run from `Backend/`:

```sh
SEED_DEMO_EMPLOYEES=true bin/rails db:seed
```

The seed is idempotent and preserves existing employees. It runs only in
development when explicitly enabled.

## Run the UI

In a second terminal, from the repository root:

```sh
cd Frontend
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. Vite forwards `/api` to Rails on
`http://127.0.0.1:3000`. Set `API_TARGET` before starting Vite if Rails runs
elsewhere. For production, serve `Frontend/dist` and forward `/api` to Rails.

## Frontend Checks

Run from `Frontend/`:

```sh
npm run build
npm test
```

The seven Playwright tests run in desktop Chrome and cover pagination,
search and filters, salary sorting, confirmed salary updates and history,
currency-specific compensation, error recovery, and appearance settings.
Browser tests intercept API calls; Rails specs verify the API behavior.
Mobile testing is deferred. Local macOS tests use installed Google Chrome;
Linux CI installs Playwright Chromium. To install it manually on Linux:

```sh
npx playwright install chromium
```

## Run Specs

Install/select Ruby 3.2.7 and start PostgreSQL, then run:

```sh
cd Backend
bundle install
RAILS_ENV=test bin/rails db:prepare
bundle exec rspec
bundle exec rspec spec/models/employee_spec.rb
```

Set `DATABASE_URL` to a dedicated test database if local PostgreSQL uses a
password or a different host. Specs require `RAILS_ENV=test` and use database
transactions. `Backend/config/master.key` is ignored by Git and must stay private.

GitHub Actions runs the specs with PostgreSQL 16. The 10,000-employee
dataset is deferred; these specs use a few explicit records per example.

Confirmed salary changes lock the employee record and write salary and
audit history in a single transaction. Existing salary-history records
are read-only through Active Record. Database constraints enforce unique
employee IDs, required values, supported currencies and nonnegative pay.

## Coverage

Spec paths below are relative to `Backend/`.

| P0 requirement | Specs |
| --- | --- |
| Employee directory | `spec/models/employee_spec.rb`, `spec/requests/employees_spec.rb` |
| Search, filters, salary sort | `spec/requests/employees_spec.rb` |
| Salary management with confirmation | `spec/requests/salaries_spec.rb`, `spec/services/salary_updater_spec.rb` |
| Salary history and traceability | `spec/models/salary_change_spec.rb`, `spec/requests/salaries_spec.rb` |
| Compensation insights | `spec/services/compensation_insights_spec.rb`, `spec/requests/compensation_insights_spec.rb` |
| Multi-currency totals | Employee, salary history and compensation specs |
| Data validation | Employee and salary history model specs, directory and salary request specs |

The detailed API and model contract is in [Backend/docs/p0_contract.md](Backend/docs/p0_contract.md).

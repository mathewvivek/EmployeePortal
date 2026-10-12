# Employee Portal

Ruby 3.4.9, Rails 8.1 and PostgreSQL. The backend implements the P0 employee
directory, search and filters, salary management, salary history and
compensation insights. Salaries and financial summaries retain decimal
precision and keep currencies separate.

The Rails API lives in `Backend/`. The React/TypeScript UI lives in
`Frontend/` and uses Vite. It provides an employee directory, compensation
insights, new employee creation, salary updates with confirmation, and salary-history views.

## Run the API

Select Ruby 3.4.9 and start PostgreSQL, then run:

```sh
cd Backend
bundle install
bin/rails db:prepare
bin/rails server
```

The API is available under `/api/v1`; `GET /up` is the health endpoint.
See [Backend/docs/p0_contract.md](Backend/docs/p0_contract.md) for routes and request formats.
Add employees using **New employee** in the directory or `POST /api/v1/employees`.
The form validates employee details and initial compensation. After saving,
the directory searches for the new employee ID and refreshes insights.

For an optional development-only dataset of 32 employees, run from `Backend/`:

```sh
SEED_DEMO_EMPLOYEES=true bin/rails db:seed
```

The seed is idempotent and preserves existing employees. It runs only in
development when explicitly enabled.

To add 10,000 synthetic employees to the development database:

```sh
SEED_EMPLOYEE_COUNT=10000 bin/rails db:seed
```

This inserts IDs `SEED00001` through `SEED10000` in batches, covering six
departments, five countries/currencies and both statuses. Rerunning skips
existing IDs without overwriting records. Synthetic seeding is blocked in
production. Set `DATABASE_URL` explicitly when using a nondefault database.

Names use 100 first names and 100 last names, with all 10,000 combinations
shuffled reproducibly without duplicates. To refresh names on existing seeds:

```sh
SEED_EMPLOYEE_COUNT=10000 SEED_REFRESH_NAMES=true bin/rails db:seed
```

This updates only seeded names, preserving database IDs, salary details,
history and employees outside the requested seed IDs.

## Deploy API to Render

Create a Ruby web service connected to this repository, alongside a Render
PostgreSQL database in the same region. Configure:

| Setting | Value |
| --- | --- |
| Root directory | `Backend` |
| Build command | `./bin/render-build.sh` |
| Start command | `bundle exec puma -C config/puma.rb -b tcp://0.0.0.0:$PORT` |
| Health check path | `/up` |

Set `RAILS_ENV=production`, `RUBY_VERSION=3.4.9`, `DATABASE_URL` to the Render
database's internal connection URL, and `RAILS_MASTER_KEY` securely in Render's
environment settings. Do not commit credentials or point a deployment at a
development or test database.

The build script installs locked gems excluding development/test groups,
precompiles Bootsnap and runs `db:migrate:primary`. It does not compile frontend
assets, reset databases or seed employees. The existing database configuration
declares multiple production databases, so the script targets only `primary`.

On a paid web service, prefer setting `RENDER_RUN_MIGRATIONS=false` and using
`bundle exec rails db:migrate:primary` as the pre-deploy command. Free services
can keep the default build-time migrations. Use backward-compatible migrations
because the previous release can still be serving requests during deployment.
See [Render's Rails guide](https://render.com/docs/deploy-rails-8).

Authenticate and authorize API access before exposing real employee data.
The React UI is deployed separately and needs a production `/api` proxy or
an explicitly configured API origin with restricted CORS.

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

The ten Playwright tests run in desktop Chrome and cover employee creation,
required-field and duplicate-ID validation, pagination,
search and filters, salary sorting, confirmed salary updates and history,
currency-specific compensation, error recovery, and appearance settings.
Browser tests intercept API calls; Rails specs verify the API behavior.
Mobile testing is deferred. Local macOS tests use installed Google Chrome;
Linux CI installs Playwright Chromium. To install it manually on Linux:

```sh
npx playwright install chromium
```

## Run Specs

Install/select Ruby 3.4.9 and start PostgreSQL, then run:

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

GitHub Actions runs the specs with PostgreSQL 16. Seed specs verify generation
of 10,000 records and idempotent batched insertion. API and model specs use
small isolated datasets; they never modify the development database.

Confirmed salary changes lock the employee record and write salary and
audit history in a single transaction. Existing salary-history records
are read-only through Active Record. Database constraints enforce unique
employee IDs, required values, supported currencies and nonnegative pay.

## Coverage

Spec paths below are relative to `Backend/`.

| P0 requirement | Specs |
| --- | --- |
| Employee directory and creation | `spec/models/employee_spec.rb`, `spec/requests/employees_spec.rb`, `spec/requests/employee_creation_spec.rb` |
| Search, filters, salary sort | `spec/requests/employees_spec.rb` |
| Salary management with confirmation | `spec/requests/salaries_spec.rb`, `spec/services/salary_updater_spec.rb` |
| Salary history and traceability | `spec/models/salary_change_spec.rb`, `spec/requests/salaries_spec.rb` |
| Compensation insights | `spec/services/compensation_insights_spec.rb`, `spec/requests/compensation_insights_spec.rb` |
| Multi-currency totals | Employee, salary history and compensation specs |
| Data validation | Employee and salary history model specs, directory and salary request specs |

The detailed API and model contract is in [Backend/docs/p0_contract.md](Backend/docs/p0_contract.md).

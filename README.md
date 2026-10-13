# Employee Portal

Ruby 3.4.9, Rails 8.1 and PostgreSQL. The backend implements the P0 employee
directory, search and filters, salary management, salary history and
compensation insights. Salaries and financial summaries retain decimal
precision and keep currencies separate.

The Rails API lives in `Backend/`. The React/TypeScript UI lives in
`Frontend/` and uses Vite. It provides an employee directory, compensation
insights, new employee creation, salary updates with confirmation, and salary-history views.
An HR login protects the dashboard and every employee/compensation API endpoint.

## Run the API

Select Ruby 3.4.9 and start PostgreSQL, then run:

```sh
cd Backend
bundle install
bin/rails db:prepare
bin/rails server
```

The API is available under `/api/v1`; `GET /up` is the health endpoint.
Opening the backend's `/` URL shows a public API status page with application
liveness, a UTC check time and a link to the React portal. API endpoint details
and version/base-path metadata are not displayed on this public page.
JSON health remains available at `/?format=json` or with `Accept: application/json`.
The health endpoints indicate that Rails booted, not that PostgreSQL is available.
The page deliberately does not query employees, expose salaries or display
server credentials. Optional backend `FRONTEND_URL` configures the public portal
origin; production requires HTTPS without credentials, query strings or fragments.
The status page supports light and black themes. It follows native system
appearance until a visitor toggles it, then remembers the choice in browser storage.
Defaults are `http://127.0.0.1:5173` locally and
`https://employee-portal-frontend-1hdp.onrender.com` in production. Changing this
link does not change CORS permissions. Keep Render's health check path as `/up`.
See [Backend/docs/p0_contract.md](Backend/docs/p0_contract.md) for routes and request formats.
The [database schema PDF](reports/EmployeePortal-Database-Schema.pdf) includes
the ERD, table definitions, relationships, indexes and constraints. The
[SVG diagram](reports/EmployeePortal-Database-ERD.svg) and
[Mermaid source](reports/EmployeePortal-Database-ERD.mmd) are editable versions.
These document the local schema snapshot, not production data. Regenerate the
PDF from its metadata snapshot with `node reports/build-database-report.mjs --pdf`
after installing frontend dependencies (Chrome is used on macOS).
The [Planning & Design Notes](reports/EmployeePortal-Planning-Design-Notes.pdf)
document scope, architecture, workflows, security, testing, deployment and
remaining work, distinguishing current implementation from proposed changes.
Authenticated HR users can add employees using **New employee** in the directory
or `POST /api/v1/employees`.
The form validates employee details and initial compensation. After saving,
the directory searches for the new employee ID and refreshes insights.

To edit identity or employment details, use the pencil icon on a directory row,
or open the employee's compensation drawer and choose **Edit employee**. You can
update employee ID, name, designation, department, country and status. Saving
refreshes the directory and reports; salary and salary history remain unchanged.
The directory clears old filters and searches the saved employee ID so the
updated record stays visible. Salary edits still use **Review change > Confirm update**.

Both new and edit forms use country and department dropdowns from the authenticated
`GET /api/v1/employees/options` endpoint. Choices include the five standard countries,
six standard departments and existing custom values, even for inactive employees.
Options work without seeding; an existing value remains selected during editing.
These choices are a form catalog, not a new backend allowlist. No migration is required.

Compensation reports include annual averages per currency, country and department
rankings by total salary, average salary or headcount, department salary-band
counts, and consolidated country headcounts across currencies. Salary statistics
never mix currencies; the MVP uses per-currency averages rather than exchange-rate
normalization. See the P0 contract for the fixed annual salary-band boundaries.

Overview and compensation also show monthly base-payroll estimates (annual base
salary divided by 12) and lowest/highest annual salaries, separately per currency.
Salary analysis provides paginated role comparisons, high-salary outlier review
lists and employees below their department/currency average. It reuses the same
HR authorization and confirmed salary-edit workflow. Outlier cohorts share role,
country and currency and contain at least five employees; see the P0 contract
for the quartile/IQR rule and the zero-IQR fallback. These reports are indicators
for investigation, not conclusions about unfair pay. No new migration or seed
run is required for these reporting changes.

## Salary Data Quality

The authenticated **Data quality** view runs manual salary checks and stores
findings for HR review. It never changes employee records or salaries. Checks
cover active employees with zero pay, extreme same-country/role/currency peer
ratios, possible annual/monthly unit mistakes, large salary changes, currency
switches with an unchanged amount, dates over a year ahead, salary-history
mismatches and blank required employee details. Flags are review indicators,
not proof of a data error or unfair pay.

Apply the new review-table migration with `bin/rails db:migrate` before using
this view. On Render the existing migration-enabled build script applies it;
no new seed or environment variable is required. After deployment, sign in and
choose **Data quality > Run checks**. Checks run synchronously in 500-employee
batches with one grouped peer-statistics query and batched latest-history reads.
There is no automatic scheduled scan.

HR can mark a finding Pending, Investigating, Confirmed error or Legitimate.
Confirmed error and Legitimate require notes. Every decision records its author
and time in a read-only audit trail. Rechecking unchanged records preserves
decisions and does not duplicate findings. Changed findings need a fresh review;
corrected ones become Cleared on the next scan, retaining their history. The
queue defaults to active Pending findings; decision/currency/employee filters,
pagination and **Include cleared** are available. Scan counts cover all employees,
not only the filtered queue. Results are as of the last completed check.

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
production unless `ALLOW_PRODUCTION_SEEDS=true` is explicitly set. Set
`DATABASE_URL` explicitly when using a nondefault database.

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
assets, reset databases or seed employees by default. The existing database configuration
declares multiple production databases, so the script targets only `primary`.

On a paid web service, prefer setting `RENDER_RUN_MIGRATIONS=false` and using
`bundle exec rails db:migrate:primary` as the pre-deploy command. Free services
can keep the default build-time migrations. Use backward-compatible migrations
because the previous release can still be serving requests during deployment.
See [Render's Rails guide](https://render.com/docs/deploy-rails-8).

Authenticate and authorize API access before exposing real employee data.
The React UI is deployed separately and needs a production `/api` proxy or
an explicitly configured API origin with restricted CORS.

### One-Time Hosted Demo Seeds

Local employees are not copied to Render. To populate the hosted database with
10,000 synthetic employees, first deploy the updated build script and seed
loader. On the Rails backend service, temporarily set these environment values:

```sh
ALLOW_PRODUCTION_SEEDS=true
SEED_EMPLOYEE_COUNT=10000
RENDER_RUN_MIGRATIONS=true
```

Choose **Save, rebuild, and deploy**, using `./bin/render-build.sh` as the build
command. The script migrates the primary database, then inserts the seed records
into the same `DATABASE_URL` used by Rails. Look for `Added 10000 synthetic
employees` in the build logs and verify the directory's `meta.total_count`.
Reruns skip existing seed IDs without overwriting salary details or deleting
other employees. Remove `ALLOW_PRODUCTION_SEEDS` and `SEED_EMPLOYEE_COUNT` after
verification and restore your usual migration setting. Do not set
`SEED_REFRESH_NAMES` unless you explicitly want to replace existing seed names.

Alternatively, on a service with shell access, run once after migrations:

```sh
ALLOW_PRODUCTION_SEEDS=true SEED_EMPLOYEE_COUNT=10000 bundle exec rails db:seed
```

No Docker runtime switch is required. Do not change `RAILS_ENV` to development.

## HR Login

There is one initial HR superadmin account, with access to the dashboard,
employee creation, salary updates and salary-history review. Salary history
remains an immutable audit trail. There is no public account-registration route.

For local development, run `bin/rails db:migrate` and `bin/rails db:seed` from
`Backend/`. The local-only demo login is:

```text
Email: hr@employeeportal.test
Password: HrDemo!2026Access
```

Production never falls back to that demo password. For the first Render deploy,
set these values on the Rails backend service, then rebuild and deploy:

```sh
HR_LOGIN_EMAIL=hr@employeeportal.test
HR_LOGIN_PASSWORD=<your unique initial password>
SEED_HR_USER=true
RENDER_RUN_MIGRATIONS=true
```

`bin/render-build.sh` runs migrations and then `bundle exec rails db:seed`
automatically when `SEED_HR_USER=true`; no Render Shell or manual seed command
is needed. The seed provisions the single account using a bcrypt password hash.
HR provisioning does not require employee demo
seeding. After provisioning, remove `SEED_HR_USER`. Do not expose the password
through a `VITE_` variable or commit it. Deploy both backend and frontend changes
together because anonymous employee API requests now return `401`.

Rerunning the HR seed preserves the existing password and never adds a second
account for the same email. To rotate the password, set `HR_LOGIN_PASSWORD` to
the new value, enable `SEED_HR_USER=true` and `ROTATE_HR_PASSWORD=true`, then
rebuild/deploy once. This revokes existing sessions. Remove both provisioning
and rotation flags afterward; do not change the configured email to rotate a password.

`POST /api/v1/session` accepts `{ "session": { "email": "...", "password": "..." } }`
and returns the public user profile, an opaque token and an eight-hour expiry.
Pass `Authorization: Bearer <token>` for API calls. `GET /api/v1/session` verifies
the current session; `DELETE /api/v1/session` signs out and revokes it. The browser
uses per-tab `sessionStorage`, not permanent `localStorage`, and validates saved
sessions before showing the workspace. Only token digests are stored in PostgreSQL.
Health endpoints and login/CORS preflights remain public. Sign-in is limited to
10 attempts per IP per three minutes per Rails process; multi-instance deployments
need a shared rate-limit store for a global limit. Passwords and tokens are filtered
from Rails parameter logs. Use HTTPS and keep the frontend free of untrusted scripts.

## Run the UI

In a second terminal, from the repository root:

```sh
cd Frontend
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. Vite forwards `/api` to Rails on
`http://127.0.0.1:3000`. Set `API_TARGET` before starting Vite if Rails runs
elsewhere. `API_TARGET` only controls the local development proxy.

For a separately hosted backend, set this frontend build environment variable
(for example in Vercel):

```sh
VITE_API_BASE_URL=https://employeeportal-z31o.onrender.com/api/v1
```

The frontend reads `import.meta.env.VITE_API_BASE_URL` and appends endpoint paths
such as `/employees`. Include `/api/v1` in the configured base URL. Trailing
slashes are removed; a missing or blank value retains the same-origin `/api/v1`
proxy. `Frontend/.env.example` documents the local default.
`Frontend/.env.production` sets the deployed Render API as the production-build
default. Vercel's `VITE_API_BASE_URL` setting can override it. That tracked file
contains only the public API URL, never credentials.

Restart Vite after local environment changes; rebuild/redeploy the frontend
after changing hosted values because Vite embeds them at build time. These
values are public browser configuration, never a place for Rails keys or
database credentials. See [Vite environment variables](https://vite.dev/guide/env-and-mode).
Direct requests from a separate frontend domain require Rails CORS rules that
allow that domain, including preflight requests for employee and salary writes.
The backend currently allows only `https://employee-portal-frontend-1hdp.onrender.com`
for `/api/*`, with GET, POST, PUT, PATCH, DELETE and OPTIONS. Restart/redeploy
Rails after changing this origin. A different Vercel or preview hostname is not
automatically allowed. CORS is a browser policy, not authentication or authorization.

## Frontend Checks

Run from `Frontend/`:

```sh
npm run build
npm test
```

The Playwright suite includes 48 tests: five API-client configuration tests and
43 desktop browser tests covering HR login, logout, session expiry, employee creation,
required-field and duplicate-ID validation, pagination,
search and filters, salary sorting, confirmed salary updates and history,
currency-specific compensation, monthly estimates, salary ranges, role comparisons,
outlier review and below-average reports, employee detail editing and dropdown
loading/retries, salary data-quality scans and HR reviews,
error recovery, and appearance settings.
Five browser tests exercise the backend's actual theme script in an isolated
HTML fixture, including native appearance, persistence, blocked storage and cross-tab updates.
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
| Employee detail editing and form choices | `spec/requests/employee_update_spec.rb`, `spec/requests/employee_options_spec.rb` |
| Search, filters, salary sort | `spec/requests/employees_spec.rb` |
| Salary management with confirmation | `spec/requests/salaries_spec.rb`, `spec/services/salary_updater_spec.rb` |
| Salary history and traceability | `spec/models/salary_change_spec.rb`, `spec/requests/salaries_spec.rb` |
| Compensation insights | `spec/services/compensation_insights_spec.rb`, `spec/requests/compensation_insights_spec.rb` |
| Salary analysis | `spec/services/salary_analysis_spec.rb`, `spec/requests/salary_analysis_spec.rb` |
| Salary data-quality review | `spec/services/salary_data_quality_spec.rb`, `spec/requests/salary_data_quality_spec.rb`, `spec/models/salary_data_anomaly_spec.rb` |
| Multi-currency totals | Employee, salary history and compensation specs |
| Data validation | Employee and salary history model specs, directory and salary request specs |

The detailed API and model contract is in [Backend/docs/p0_contract.md](Backend/docs/p0_contract.md).

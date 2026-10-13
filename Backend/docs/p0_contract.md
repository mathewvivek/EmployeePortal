# P0 Spec Contract

The supplied requirements define behaviors but do not prescribe field names,
routes, statuses, supported currencies or JSON structure. The choices below
are the implemented contract exercised by the model, request and service
specs. Migrations define employee and salary-history records in PostgreSQL.

## Models

`Employee` persists `employee_id`, `name`, `department`, `country`,
`designation`, `status`, `base_salary`, `currency` and `effective_date`.
All are required. Textual details cannot be whitespace-only. Employee IDs
are unique; names need not be unique. Status is `active` or `inactive`.
Salary is numeric and nonnegative, including zero. Decimal values must
retain their precision. Supported currencies for this contract are `INR`,
`USD`, `GBP`, `EUR` and `JPY`; lowercase, malformed and unsupported codes
are invalid. Effective dates must be valid calendar dates; future dates
are accepted. No geographic or department allowlist is prescribed.

`SalaryChange` belongs to an employee and requires `old_base_salary`,
`new_base_salary`, `old_currency`, `new_currency`, `old_effective_date`,
`effective_date` and `changed_at`. Both amounts are nonnegative, both
currencies are supported and both dates are valid. Updating salary must
preserve previous history records.

## Directory API

All employee, salary, history and compensation endpoints require an active HR
superadmin session. Login through `POST /api/v1/session` with an `email` and
`password` in a `session` object; send the returned opaque token in
`Authorization: Bearer <token>`. Invalid credentials and missing/expired/revoked
tokens return JSON `401` errors. Sessions expire after eight hours and can be
revoked by `DELETE /api/v1/session`. Health checks remain public. Login responses
do not expose password digests, and protected responses use `Cache-Control: no-store`.

`GET /api/v1/employees` returns `{ data: [...], meta: {...} }`.
Each record contains employee details and current salary details.
`GET /api/v1/employees/:id` looks up the database primary key.

`POST /api/v1/employees` accepts an `employee` JSON object containing all
nine model fields above. For example:

```json
{
  "employee": {
    "employee_id": "EMP3001", "name": "Nora Patel", "department": "Engineering",
    "country": "India", "designation": "Software Engineer", "status": "active",
    "base_salary": "85000.25", "currency": "INR", "effective_date": "2026-11-01"
  }
}
```

Success returns `201`, a resource `Location` header and the serialized employee
in `data`. Invalid details or duplicate IDs return `422` with field-keyed
`errors`, without inserting a record. A missing, empty or incorrectly shaped
employee object returns `400` with JSON errors. Primary keys, timestamps and
nested salary history cannot be assigned. Initial compensation creates no
salary-change record; the employee participates in directory and insights
queries immediately.

| Parameter | Behavior |
| --- | --- |
| `q` | Name/employee-ID search; names are matched without regard to case; SQL and LIKE metacharacters are treated as text |
| `country`, `department`, `status` | Combined exact-value filters; unknown status is invalid |
| `page` | Positive integer, default 1 |
| `per_page` | Positive integer, default 25, capped at 100 |
| `sort` | `base_salary` for numeric salary sorting; default order is employee ID |
| `direction` | `asc` or `desc`; salary ties use employee ID ascending |

Metadata includes `page`, `per_page`, `total_count` and `total_pages`.
Counts reflect filters before pagination. No matches means zero total pages.
Pages beyond the last return an empty list. Salary sorting compares stored
amounts without exchange-rate conversion; financial aggregates remain
separate by currency.

## Employee Detail Editing

`PATCH /api/v1/employees/:id` and `PUT /api/v1/employees/:id` require HR authentication
and accept an `employee` object containing any of `employee_id`, `name`, `department`,
`country`, `designation` and `status`. Omitted fields remain unchanged. For example:

```json
{
  "employee": {
    "name": "Nora Morgan", "department": "Product", "country": "Germany",
    "designation": "Product Manager", "status": "inactive"
  }
}
```

Success returns `200` with the complete serialized employee in `data`. The numeric
primary key remains stable even when the business employee ID changes. Validation
and duplicate-ID failures return `422` without changing the original record;
unknown IDs return `404`; malformed/empty objects or objects without editable
fields return `400`. Updates lock the employee and change only supplied detail
fields. Primary keys, timestamps and nested salary history cannot be assigned.

Compensation cannot be updated through this endpoint. Including `base_salary`,
`currency` or `effective_date` alongside editable details rejects the entire request
with `422`; use the separate confirmed salary API. Profile edits never create or
modify salary history. They update employee timestamps, so stored anomaly evidence
becomes stale and needs a rescan before review. Profile changes do not currently
have a separate old/new audit table.

`GET /api/v1/employees/options` returns `{ "data": { "countries": [...],
"departments": [...] } }` with `Cache-Control: no-store`. It requires the same HR
session and is a collection route, not an employee lookup. Lists are sorted,
deduplicated unions of standard choices and distinct existing nonblank values;
inactive employees' custom values are included. No employee names or salary values
are returned.

Standard countries: Germany, India, Japan, United Kingdom, United States.
Standard departments: Design, Engineering, Finance, People, Product, Sales.
These are UI choices, not model allowlists: the existing API still accepts other
nonblank countries/departments, which then become dropdown options. Country changes
do not automatically change salary currency. Both new/edit forms require a
country/department selection; the edit form retains a current custom value.

## Salary API

`GET /api/v1/employees/:id/salary` returns current salary details in `data`.
`PATCH /api/v1/employees/:id/salary` accepts JSON:

```json
{
  "salary": {
    "base_salary": "75000.25",
    "currency": "USD",
    "effective_date": "2026-02-01",
    "confirmed": true
  }
}
```

Only boolean `true` confirms a change. Identity fields cannot be modified
through this endpoint. Successful updates return `200` with updated salary
details. Invalid data or missing confirmation returns `422` with nonempty
`errors`, without changing employee or history records.

`GET /api/v1/employees/:id/salary_history` returns an employee's own change
records in `data`, newest timestamp first. Each record includes all audit
fields above. History dates use ISO 8601; `changed_at` includes time.
No changes returns an empty list. Missing employees return `404`.

`SalaryUpdater.call(employee:, base_salary:, currency:, effective_date:,
confirmed:)` updates salary and audit history in one transaction. Invalid
confirmation raises `ArgumentError`; invalid data or history persistence
raises `ActiveRecord::RecordInvalid`. Identical values create no history.
Currency-only and date-only changes do create history.

## Compensation Insights

`GET /api/v1/compensation_insights` returns a summary in `data`. Country,
department and status filters combine; invalid status returns `422`.
Headcount includes both active and inactive employees unless filtered.

`CompensationInsights.call(employees:)` accepts an Active Record scope and
returns a hash with symbol metric keys and string currency/group keys:

```ruby
{
  headcount: 2,
  country_headcounts: { "India" => 2 },
  currencies: {
    "INR" => {
      headcount: 2,
      total_base_salary: "400.00",
      monthly_payroll_estimate: "33.33",
      average_base_salary: "200.00",
      median_base_salary: "200.00",
      minimum_base_salary: "200.00",
      maximum_base_salary: "200.00",
      salary_bands: [
        { lower_bound: "0.00", upper_bound: "500000.00", headcount: 2 },
        { lower_bound: "500000.00", upper_bound: "1000000.00", headcount: 0 },
        { lower_bound: "1000000.00", upper_bound: "2000000.00", headcount: 0 },
        { lower_bound: "2000000.00", upper_bound: nil, headcount: 0 }
      ],
      by_country: {
        "India" => {
          headcount: 2,
          total_base_salary: "400.00",
          monthly_payroll_estimate: "33.33",
          average_base_salary: "200.00",
          median_base_salary: "200.00",
          minimum_base_salary: "200.00",
          maximum_base_salary: "200.00",
          salary_bands: [ # Same bounds as the currency group; counts for this country.
            { lower_bound: "0.00", upper_bound: "500000.00", headcount: 2 },
            { lower_bound: "500000.00", upper_bound: "1000000.00", headcount: 0 },
            { lower_bound: "1000000.00", upper_bound: "2000000.00", headcount: 0 },
            { lower_bound: "2000000.00", upper_bound: nil, headcount: 0 }
          ]
        }
      },
      by_department: {
        "Engineering" => {
          headcount: 2,
          total_base_salary: "400.00",
          monthly_payroll_estimate: "33.33",
          average_base_salary: "200.00",
          median_base_salary: "200.00",
          minimum_base_salary: "200.00",
          maximum_base_salary: "200.00",
          salary_bands: [ # Same bounds as the currency group; counts for this department.
            { lower_bound: "0.00", upper_bound: "500000.00", headcount: 2 },
            { lower_bound: "500000.00", upper_bound: "1000000.00", headcount: 0 },
            { lower_bound: "1000000.00", upper_bound: "2000000.00", headcount: 0 },
            { lower_bound: "2000000.00", upper_bound: nil, headcount: 0 }
          ]
        }
      }
    }
  }
}
```

Amounts are fixed two-decimal strings in API responses and summaries.
Compute using decimal arithmetic; round only reported values. For an even
count, median averages the middle two salaries. Zero salaries participate
in all metrics. Empty scope returns
`{ headcount: 0, country_headcounts: {}, currencies: {} }`.
There is no cross-currency salary total, average or median. Country and
department distributions also keep currencies separate. Summaries use
current persisted salaries, including confirmed updates.

`country_headcounts` consolidates employee counts across all currencies; its
values sum to the overall headcount. Salary totals, averages and medians remain
currency-specific. This MVP uses annual average salary per currency in place
of a normalized cross-currency average; no exchange rates or currency conversion
are applied. Country and department rankings can be sorted descending by annual
total, annual average or headcount in the React UI, with names breaking ties.

`salary_bands` contains four annual base-salary ranges for each currency, country
and department group. Lower bounds are inclusive; upper bounds are exclusive.
The final `null` upper bound is open-ended. Zero-count bands are always included.
The boundaries are fixed reporting ranges, not pay-policy recommendations:

| Currency | First Boundary | Second Boundary | Third Boundary |
| --- | ---: | ---: | ---: |
| INR | 500,000 | 1,000,000 | 2,000,000 |
| USD / GBP / EUR | 50,000 | 100,000 | 150,000 |
| JPY | 3,000,000 | 6,000,000 | 9,000,000 |

Aggregation uses one PostgreSQL query with grouping sets and filtered band
counts; the server does not instantiate all employee records. Country,
department and status filters apply to every statistic and band count.

`monthly_payroll_estimate` is the current annual base-salary total divided by
12, computed before rounding. It is an estimate, not a payroll ledger: bonuses,
taxes, benefits, prorating and historical/future payroll scheduling are excluded.
`minimum_base_salary` and `maximum_base_salary` give the lowest and highest
current annual salary in each currency/country/department group. Zero salaries
participate. Defaults include active and inactive employees; use `status=active`
to restrict estimates to active staff.

## Salary Analysis

`GET /api/v1/salary_analysis` requires HR authentication and returns `{ data: [],
meta: { report, page, per_page, total_count, total_pages } }`. Parameters:

| Parameter | Values |
| --- | --- |
| `report` | `roles` (default), `outliers`, `below_department_average` |
| `country`, `department`, `status` | Same combined filters as insights |
| `currency` | Optional supported ISO currency; never converts salaries |
| `page`, `per_page` | Positive integers; default 1/25, maximum 100 rows |

Unsupported reports/currencies/statuses and invalid pagination return `422`.
Empty and out-of-range pages return an empty array with accurate count metadata.
Filters define the full comparison population before pagination. All reports use
current persisted salaries and refresh after confirmed edits. No database
migration or additional seed is needed for these reports.

- `roles`: groups by country, designation (role) and currency. Returns headcount,
  annual average, median, minimum, maximum and `salary_gap` (maximum minus minimum).
  Group rows sort by country, role and currency ascending.
- `outliers`: compares the same country/role/currency groups, with at least five
  employees including the employee under review. Uses PostgreSQL discrete 25th
  and 75th percentiles as Q1/Q3. Flags salaries strictly greater than
  `Q3 + 1.5 * (Q3 - Q1)`. If Q1 equals Q3, uses `1.5 * Q3` instead. Fewer than
  five employees never produces an outlier flag. Returns employee details plus
  `comparison_headcount`, `comparison_average`, `comparison_threshold` and
  `salary_difference` (salary minus threshold). Metadata includes
  `minimum_peer_count: 5`.
- `below_department_average`: compares each department within its currency.
  Lists salaries strictly below the unrounded department average, with employee
  details, `comparison_headcount`, `comparison_average` and `salary_difference`
  (average minus salary). Salaries equal to the average are not listed.

Employee reports sort by current salary descending and employee ID ascending.
SQL computes the full cohort statistics; only the requested page of employee
records is loaded. Reported amounts are rounded to two decimals, but selection
uses unrounded values. These are HR investigation indicators, not determinations
of unfair pay or evidence that a raise is required. Comparable experience,
seniority, hours and performance are not represented in this application's data.

## Salary Data Quality

All routes require the existing HR bearer session and return `Cache-Control:
no-store`. The new migration stores scans, findings and immutable review events;
checks do not write employees or salary-change history.

| Method | Route | Use |
| --- | --- | --- |
| POST | `/api/v1/salary_data_quality_scans` | Run a manual full-database check; returns `201` and scan counters |
| GET | `/api/v1/salary_data_anomalies` | Paginated review queue and latest completed scan metadata |
| GET | `/api/v1/salary_data_anomalies/:id` | Detection snapshot, check evidence and paginated HR review history |
| PATCH / PUT | `/api/v1/salary_data_anomalies/:id` | Record an HR decision and notes, without changing salary |

Queue parameters: combined `country`, `department`, employee `status`, `currency`
and name/ID `q`; optional `review_status`; `include_cleared=true/false` (default
false); positive `page` / `per_page` (default 1/25, capped at 100). Counts apply
to findings, not employees: an employee can have multiple findings. Scan metadata
is global, independent of queue filters. Detail pagination applies to review
events (newest first). Unknown IDs return `404`; invalid filters return `422`.

Scans process 500 employees per batch, use a PostgreSQL transaction advisory
lock to serialize overlapping scans, and roll back completely on failure.
Snapshots include employee identity, compensation and latest salary-change
values. The scan is a manual current-record inspection, not scheduled payroll
or a historical ledger. Results can become stale when source records change.
No currency conversion or automatic salary correction is performed.

| Rule Code | Trigger |
| --- | --- |
| `active_zero_salary` | Active employee with zero annual base salary |
| `extreme_peer_ratio` | Positive salary at least 10 times, or at most one tenth, a positive peer median; same country/role/currency, at least 5 employees including this employee |
| `annual_monthly_pattern` | Latest same-currency change is approximately 12 times or one twelfth the previous positive salary (2% tolerance) |
| `large_salary_change` | Latest same-currency change is at least fivefold or falls by at least 80%, unless already classified as the annual/monthly pattern |
| `currency_change_same_amount` | Latest change switches currency but retains an identical positive numeric amount (information, not an assumed conversion error) |
| `distant_effective_date` | Current effective date is more than 365 days after the check date (information); shorter future dates remain valid |
| `history_mismatch` | Current salary, currency or effective date differs from the latest audit row, ordered by `changed_at`, then ID descending |
| `missing_employee_details` | Employee ID, name, department, country or designation is blank, for example after a validation-bypassing import |

Existing validation and database constraints already reject negative salaries,
unsupported currencies, NULL required fields and duplicate employee IDs. This
review feature does not relax these protections. Zero pay and unusual values
can be legitimate. Peer cohorts include active and inactive employees; queue
filters do not recalculate check baselines. Inactive zero-pay records are not
flagged by the active-zero rule. Cross-currency amounts are never compared.

Decision body: `{ "review": { "status": "investigating", "notes": "Checking
the original compensation record" } }`. Status is one of `pending`,
`investigating`, `confirmed_error`, `legitimate`; the last two require nonblank
notes. Notes are limited to 2,000 characters. Invalid decisions return `422`;
a missing/malformed review object returns `400`. If the employee or latest
salary history changed, or the finding cleared, review returns `409` and HR
must rerun checks. This check is revalidated under record locks before saving.

Identical findings reuse a stable fingerprint and retain decisions on repeat
scans. A changed source or check reference creates a new Pending finding and
clears the prior one. Findings no longer detected become inactive with a
clear timestamp, not deleted. Every decision is appended as an immutable audit
event with reviewer and time. Classifying something as Confirmed error does
not clear it: correction uses the existing confirmed salary-edit workflow,
then another scan clears the finding. Fairness/context analysis is unchanged.

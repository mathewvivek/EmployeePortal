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
  currencies: {
    "INR" => {
      headcount: 2,
      total_base_salary: "400.00",
      average_base_salary: "200.00",
      median_base_salary: "200.00",
      by_country: {
        "India" => {
          headcount: 2,
          total_base_salary: "400.00",
          average_base_salary: "200.00",
          median_base_salary: "200.00"
        }
      },
      by_department: {
        "Engineering" => {
          headcount: 2,
          total_base_salary: "400.00",
          average_base_salary: "200.00",
          median_base_salary: "200.00"
        }
      }
    }
  }
}
```

Amounts are fixed two-decimal strings in API responses and summaries.
Compute using decimal arithmetic; round only reported values. For an even
count, median averages the middle two salaries. Zero salaries participate
in all metrics. Empty scope returns `{ headcount: 0, currencies: {} }`.
There is no cross-currency salary total, average or median. Country and
department distributions also keep currencies separate. Summaries use
current persisted salaries, including confirmed updates.

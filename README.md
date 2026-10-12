# Employee Portal Backend

Initial Rails API scaffold using Ruby 3.2.7, Rails 8.1 and PostgreSQL.

## Setup

Select Ruby 3.2.7 and start PostgreSQL, then run:

```sh
bundle install
bin/rails db:prepare
bin/rails server
```

Use `DATABASE_URL` when connecting to PostgreSQL with a custom host or
credentials. The health endpoint is `GET /up`.

## Checks

```sh
bin/rubocop
bin/brakeman --no-pager
RAILS_ENV=test bin/rails db:prepare
bin/rails test
```

GitHub Actions runs checks with PostgreSQL 16. Application features have
not been implemented yet. `config/master.key` is excluded from Git.

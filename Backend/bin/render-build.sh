#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

export RAILS_ENV=production
export BUNDLE_FROZEN=true
export BUNDLE_WITHOUT="${BUNDLE_WITHOUT:-development:test}"

: "${DATABASE_URL:?Set DATABASE_URL to your Render PostgreSQL connection URL}"

case "${RENDER_RUN_MIGRATIONS:-true}" in
  true|false) ;;
  *) printf '%s\n' 'RENDER_RUN_MIGRATIONS must be true or false' >&2; exit 1 ;;
esac

if [[ -n "${SEED_EMPLOYEE_COUNT:-}" ]]; then
  if [[ "${ALLOW_PRODUCTION_SEEDS:-false}" != "true" ]]; then
    printf '%s\n' 'Set ALLOW_PRODUCTION_SEEDS=true to seed the production database' >&2
    exit 1
  fi
  if [[ "${RENDER_RUN_MIGRATIONS:-true}" != "true" ]]; then
    printf '%s\n' 'Build-time seeding requires RENDER_RUN_MIGRATIONS=true; otherwise seed after pre-deploy migrations' >&2
    exit 1
  fi
fi

bundle install
bundle exec bootsnap precompile --gemfile app/ lib/

# This API has no asset pipeline; migrate only its employee database.
if [[ "${RENDER_RUN_MIGRATIONS:-true}" == "true" ]]; then
  bundle exec rails db:migrate:primary
fi

if [[ -n "${SEED_EMPLOYEE_COUNT:-}" ]]; then
  bundle exec rails db:seed
fi

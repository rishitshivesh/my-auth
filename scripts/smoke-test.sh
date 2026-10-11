#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# End-to-end smoke test for a running auth-service.
#
# Requires a FRESHLY MIGRATED + SEEDED database and a service that has just
# booted (it consumes the one-time first-run setup token).
#
#   BASE_URL=http://localhost:4000 SETUP_TOKEN=<token> scripts/smoke-test.sh
#
# SETUP_TOKEN is printed at boot ("FIRST RUN SETUP TOKEN") and written to
# $SENTRY_SETUP_LOG_DIR/setup.log. Exit code is non-zero on any failure.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:4000}"
TENANT="${TENANT_SLUG:-sentry}"
SETUP_TOKEN="${SETUP_TOKEN:?SETUP_TOKEN is required}"
EMAIL="${SMOKE_EMAIL:-smoke-admin@example.com}"
PASSWORD="${SMOKE_PASSWORD:-Sm0ke!Passw0rd#2026}"

JAR="$(mktemp)"; BODY="$(mktemp)"
trap 'rm -f "$JAR" "$BODY"' EXIT
pass=0; fail=0

expect() { # name actual expected
  if [[ "$2" == "$3" ]]; then echo "PASS  $1 ($2)"; pass=$((pass + 1))
  else echo "FAIL  $1 expected=$3 got=$2 :: $(head -c 300 "$BODY")"; fail=$((fail + 1)); fi
}
req() { # method path [data] [extra curl args...]
  local method="$1" path="$2" data="${3:-}"; shift 3 2>/dev/null || shift $#
  curl -s -o "$BODY" -w "%{http_code}" -X "$method" "$BASE_URL$path" \
    -H "content-type: application/json" -H "x-tenant-slug: $TENANT" \
    -b "$JAR" -c "$JAR" ${data:+-d "$data"} "$@"
}

expect "liveness"                "$(req GET /health)" 200
expect "readiness"               "$(req GET /health/ready)" 200
expect "jwks"                    "$(req GET /.well-known/jwks.json)" 200
grep -q '"keys":\[{' "$BODY" || { echo "FAIL  jwks body is not a raw JWKS"; fail=$((fail + 1)); }
expect "oidc discovery"          "$(req GET /.well-known/openid-configuration)" 200

expect "first-admin validation"  "$(req POST /superadmin/create-first-admin '{"email":"x"}' -H "x-setup-token: $SETUP_TOKEN")" 400
expect "first-admin create"      "$(req POST /superadmin/create-first-admin "{\"name\":\"Smoke Admin\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" -H "x-setup-token: $SETUP_TOKEN")" 201
rm -f "$JAR"; JAR="$(mktemp)"

expect "login"                   "$(req POST /auth/login "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")" 200
ACCESS_TOKEN="$(awk '$6=="accessToken"{print $7}' "$JAR")"
[[ -n "$ACCESS_TOKEN" ]] || { echo "FAIL  login did not set accessToken cookie"; fail=$((fail + 1)); }

expect "me (cookie)"             "$(req GET /auth/me)" 200
expect "me (bearer)"             "$(curl -s -o "$BODY" -w "%{http_code}" "$BASE_URL/auth/me" -H "x-tenant-slug: $TENANT" -H "authorization: Bearer $ACCESS_TOKEN")" 200
expect "protected audit route"   "$(req GET /audit)" 200
expect "refresh"                 "$(req POST /auth/refresh)" 200
expect "logout"                  "$(req POST /auth/logout)" 200
expect "revoked token rejected"  "$(curl -s -o "$BODY" -w "%{http_code}" "$BASE_URL/auth/me" -H "x-tenant-slug: $TENANT" -H "authorization: Bearer $ACCESS_TOKEN")" 401

expect "reset requires email"    "$(req POST /auth/reset-password '{"otp":"123456","password":"N3w!Passw0rd#2026"}')" 400

echo "──────── passed=$pass failed=$fail"
[[ $fail -eq 0 ]]

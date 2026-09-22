#!/usr/bin/env bash
set -euo pipefail
# 19-account headless clickthrough. Runs unionchant on :3100 against the LOCAL
# TEST DB with email hard-disabled — never touches prod or Resend.
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
TEST_DB="postgresql://galengoodwick@localhost:5432/unionchant_test"

echo "› ensuring postgres + test db + schema"
pg_isready -q || brew services start postgresql@16
createdb unionchant_test 2>/dev/null || true
DATABASE_URL="$TEST_DB" npx prisma db push --skip-generate >/dev/null 2>&1 || DATABASE_URL="$TEST_DB" npx prisma db push >/dev/null

echo "› ensuring playwright chromium"
npx playwright install chromium >/dev/null 2>&1 || true

echo "› running 19-account clickthrough (server on :3100, email OFF, test DB)"
mkdir -p e2e-full/screenshots
npx playwright test --config playwright.e2e19.config.ts "$@"

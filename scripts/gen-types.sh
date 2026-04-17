#!/usr/bin/env bash
# Generate typed Supabase database client definitions into `lib/database.types.ts`.
#
# Requires:
#   - supabase CLI installed (`brew install supabase/tap/supabase`)
#   - SUPABASE_PROJECT_ID env var (or pass as first arg)
#   - network access + service-role key
#
# Usage:
#   npm run gen:types                 # uses $SUPABASE_PROJECT_ID
#   ./scripts/gen-types.sh <project>  # override
set -euo pipefail

PROJECT_ID="${1:-${SUPABASE_PROJECT_ID:-}}"
if [[ -z "$PROJECT_ID" ]]; then
  echo "Error: SUPABASE_PROJECT_ID not set. Export it or pass as first argument." >&2
  exit 1
fi

OUT="lib/database.types.ts"
echo "-> Generating types for project $PROJECT_ID into $OUT"

supabase gen types typescript \
  --project-id "$PROJECT_ID" \
  --schema public,storage \
  > "$OUT"

echo "Done. Commit $OUT when the schema changes."

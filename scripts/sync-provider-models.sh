#!/usr/bin/env bash
# Show model definitions from OpenClaw for manual sync to provider-models.ts.
#
# Usage:
#   ./scripts/sync-provider-models.sh              # all providers
#   ./scripts/sync-provider-models.sh openai        # one provider
#   ./scripts/sync-provider-models.sh --current     # show what we have now
#
# Then update: components/Onboarding/provider-models.ts

OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/code/openclaw}"
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROVIDER_MODELS="$SCRIPT_DIR/components/Onboarding/provider-models.ts"

# provider_id:extension_dir:model_file
PROVIDERS="
anthropic:anthropic:register.runtime.ts
openai:openai:openai-provider.ts
google:google:provider-models.ts
mistral:mistral:model-definitions.ts
xai:xai:model-definitions.ts
deepseek:deepseek:models.ts
together:together:models.ts
moonshot:moonshot:provider-catalog.ts
nvidia:nvidia:provider-catalog.ts
openrouter:openrouter:provider-catalog.ts
huggingface:huggingface:models.ts
"

show_current() {
  echo "=== CURRENT provider-models.ts ==="
  echo ""
  grep -E '(^\s+id: "|{ id: ")' "$PROVIDER_MODELS" | sed 's/^  */  /'
  echo ""
}

show_provider() {
  local id="$1"
  local ext_dir="$2"
  local file="$3"
  local full_path="$OPENCLAW_DIR/extensions/$ext_dir/$file"

  if [ ! -f "$full_path" ]; then
    echo "[$id] not found: extensions/$ext_dir/$file"
    echo ""
    return
  fi

  echo "=== $id ==="
  echo "Source: extensions/$ext_dir/$file"
  echo ""
  grep -nE '(MODEL_ID|_DEFAULT_|"[a-z].*-.*".*,|label:|displayName|id: "|name: ")' "$full_path" \
    | grep -vE '(import |from |function |interface |type |\.id|\.name|provider.*Id|Provider)' \
    | head -40
  echo ""
}

if [ "${1:-}" = "--current" ]; then
  show_current
  exit 0
fi

if [ ! -d "$OPENCLAW_DIR/extensions" ]; then
  echo "OpenClaw repo not found at: $OPENCLAW_DIR"
  echo "Set OPENCLAW_DIR to override."
  exit 1
fi

FILTER="${1:-}"

echo "$PROVIDERS" | while IFS=: read -r id ext_dir file; do
  [ -z "$id" ] && continue
  if [ -n "$FILTER" ] && [ "$id" != "$FILTER" ]; then
    continue
  fi
  show_provider "$id" "$ext_dir" "$file"
done

echo "Update: $PROVIDER_MODELS"

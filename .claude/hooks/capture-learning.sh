#!/usr/bin/env bash
# Suggests capturing a learning when the session involved PR comment work.
# Uses decision:allow so Claude sees the nudge but is not forced to respond.
input=$(cat)

# Guard: never re-fire inside a stop-hook-induced turn
stop_hook_active=$(echo "$input" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(str(d.get('stop_hook_active', False)).lower())
" 2>/dev/null || echo "false")
if [[ "$stop_hook_active" == "true" ]]; then
    exit 0
fi

transcript_path=$(echo "$input" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(d.get('transcript_path', ''))
" 2>/dev/null || echo "")

if [[ -z "$transcript_path" || ! -f "$transcript_path" ]]; then
    exit 0
fi

# Detect PR-comment work signals in the transcript (command patterns only — reliable)
if grep -qE \
    'gh pr view.*(--comments|--json comments)|gh api .*/pulls/[0-9]+/comments|gh api .*/pulls/[0-9]+/reviews|gh pr comment|resolveReviewThread' \
    "$transcript_path" 2>/dev/null; then
    echo '{
  "decision": "allow",
  "reason": "Esta sesión involucró trabajo sobre comentarios de PR. Si surgió algo genuinamente útil — una corrección de reviewer, un patrón que no conocías, una restricción no obvia — considera registrarlo en learning/inbox/ siguiendo el schema de learning/README.md. Si no hay nada que valga la pena, no escribas nada."
}'
fi

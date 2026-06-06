#!/usr/bin/env bash
# Suggests capturing a learning when the session involved PR comment work.
# Stop hooks only surface a message via decision:block (allow/omit is silent — the
# reason is ignored). block forces one extra turn so Claude sees the nudge and decides;
# the stop_hook_active guard above prevents this from re-firing into a loop.
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

# Guard: only nudge once per session
session_id=$(echo "$input" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(d.get('session_id', ''))
" 2>/dev/null || echo "")
sentinel="/tmp/claude-learning-nudged-${session_id}"
if [[ -n "$session_id" && -f "$sentinel" ]]; then
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

# Detect PR creation or push-to-PR signals in the transcript
if grep -qE \
    'gh pr create|git push' \
    "$transcript_path" 2>/dev/null; then

    branch=$(git branch --show-current 2>/dev/null || echo "")
    branch_info=""
    [[ -n "$branch" ]] && branch_info=" (branch: ${branch})"

    [[ -n "$session_id" ]] && touch "$sentinel"

    echo "{
  \"decision\": \"block\",
  \"reason\": \"Esta sesión terminó con un PR creado o commits pusheados${branch_info}. Si surgió algo genuinamente útil — un patrón nuevo, una restricción no obvia, algo que te sorprendió — considera registrarlo en learning/inbox/ siguiendo el schema de learning/README.md. Si no hay nada que valga la pena, no escribas nada.\"
}"
fi

#!/usr/bin/env bash
# Blocks Read/Edit/Write access to .env to prevent accidental secret exposure.
# .env.example is always allowed.
# Registered on Read|Edit|Write in settings.json — matches on file_path only.
# (Not wired to Bash: matching command text blocks innocuous commands that
#  merely mention the filename, e.g. a commit message or grep.)
input=$(cat)
file=$(echo "$input" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null || echo "")
if [[ "$file" =~ (^|/)\.env$ ]]; then
    echo "ERROR: .env is off-limits (CLAUDE.md). Document new variables in .env.example instead." >&2
    exit 2
fi

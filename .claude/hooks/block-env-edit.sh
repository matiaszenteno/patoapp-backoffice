#!/usr/bin/env bash
# Blocks direct edits to .env to prevent accidental secret exposure.
# .env.example is always allowed.
input=$(cat)

file=$(echo "$input" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null || echo "")
command=$(echo "$input" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null || echo "")

file_blocked=false
if [[ "$file" =~ (^|/)\.env$ ]]; then
    file_blocked=true
fi

cmd_blocked=false
if [[ "$command" =~ (^|[[:space:]/])\.env([[:space:]]|$) ]]; then
    if [[ "$command" != *".example"* ]]; then
        cmd_blocked=true
    fi
fi

if $file_blocked || $cmd_blocked; then
    echo "ERROR: .env is off-limits (CLAUDE.md). Document new variables in .env.example instead." >&2
    exit 2
fi

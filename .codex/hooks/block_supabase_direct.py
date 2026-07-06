#!/usr/bin/env python3
"""Block direct Supabase mutations in this pure-consumer repository."""

import json
import re
import sys


try:
    payload = json.load(sys.stdin)
except (json.JSONDecodeError, OSError):
    raise SystemExit(0)

tool = payload.get("tool_name", "")
tool_input = payload.get("tool_input") or {}

messages = {
    "mcp__supabase__apply_migration": (
        "apply_migration is blocked (CODEX.md). This repository owns no migrations; "
        "write the migration in patoapp-scrapers and merge it there."
    ),
    "mcp__supabase__deploy_edge_function": (
        "deploy_edge_function is blocked (CODEX.md). This repository owns no Edge "
        "Functions; deployments run through GitHub Actions from the owning repository."
    ),
}

branch_tools = {
    "mcp__supabase__create_branch",
    "mcp__supabase__delete_branch",
    "mcp__supabase__merge_branch",
    "mcp__supabase__rebase_branch",
    "mcp__supabase__reset_branch",
}

message = messages.get(tool)
if tool in branch_tools:
    message = f"Supabase branch mutation {tool} is blocked; branch management must go through CI."
elif tool == "mcp__supabase__execute_sql":
    query = tool_input.get("query", "") if isinstance(tool_input, dict) else ""
    write_statement = re.compile(
        r"^\s*(CREATE|DROP|ALTER|TRUNCATE|RENAME|INSERT|UPDATE|DELETE|MERGE|COPY|GRANT|REVOKE)\b",
        re.IGNORECASE,
    )
    if any(write_statement.search(statement) for statement in query.split(";")):
        message = (
            "Write SQL via execute_sql is blocked (CODEX.md). Schema changes belong "
            "in patoapp-scrapers; production data writes go through the application or CI."
        )

if message:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(2)

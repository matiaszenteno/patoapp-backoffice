#!/usr/bin/env python3
"""Block edits to .env while allowing .env.example."""

import json
import re
import sys


try:
    payload = json.load(sys.stdin)
except (json.JSONDecodeError, OSError):
    raise SystemExit(0)

tool_input = payload.get("tool_input", {})
paths = []
if isinstance(tool_input, dict):
    file_path = tool_input.get("file_path")
    if isinstance(file_path, str):
        paths.append(file_path)

    patch = tool_input.get("patch") or tool_input.get("input")
    if isinstance(patch, str):
        paths.extend(
            re.findall(r"^\*\*\* (?:Add|Update|Delete) File: (.+)$", patch, re.MULTILINE)
        )

if any(re.search(r"(?:^|/)\.env$", path) for path in paths):
    print(
        "ERROR: .env is off-limits (CODEX.md). "
        "Document new variables in .env.example instead.",
        file=sys.stderr,
    )
    raise SystemExit(2)

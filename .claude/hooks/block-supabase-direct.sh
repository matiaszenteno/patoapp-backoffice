#!/usr/bin/env bash
# Blocks direct Supabase schema changes and Edge Function deploys.
# Este repo es pure consumer: no tiene migraciones ni EFs propias.
# Migraciones y EFs viven en patoapp-scrapers — los cambios van allá.
input=$(cat)
tool=$(echo "$input" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_name',''))" 2>/dev/null || echo "")

case "$tool" in
    mcp__supabase__apply_migration)
        echo "ERROR: apply_migration está bloqueado (CLAUDE.md). Este repo no tiene migraciones propias. Escribe la migración en patoapp-scrapers/supabase/migrations/ y mergea a main allá — el pipeline la aplica automáticamente." >&2
        exit 2
        ;;
    mcp__supabase__deploy_edge_function)
        echo "ERROR: deploy_edge_function está bloqueado (CLAUDE.md). Este repo no tiene Edge Functions propias. Las EFs viven en patoapp-scrapers — el deploy es automático via GH Actions al mergear a main allá." >&2
        exit 2
        ;;
    mcp__supabase__execute_sql)
        command=$(echo "$input" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('query',''))" 2>/dev/null || echo "")
        if echo "$command" | grep -qiE '^\s*(CREATE|DROP|ALTER|TRUNCATE|RENAME)'; then
            echo "ERROR: DDL via execute_sql está bloqueado (CLAUDE.md). Los cambios de schema van en patoapp-scrapers/supabase/migrations/." >&2
            exit 2
        fi
        ;;
esac

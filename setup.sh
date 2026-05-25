#!/usr/bin/env bash
set -euo pipefail

NEON_TOKEN="${NEON_TOKEN:-}"
VERCEL_TOKEN="${VERCEL_TOKEN:-}"

if [[ -z "$NEON_TOKEN" || -z "$VERCEL_TOKEN" ]]; then
  echo "Uso: NEON_TOKEN=xxx VERCEL_TOKEN=yyy bash setup.sh"
  exit 1
fi

echo "▶ Creando proyecto en Neon..."
NEON_RESP=$(curl -sf -X POST https://console.neon.tech/api/v2/projects \
  -H "Authorization: Bearer $NEON_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"project":{"name":"shopping-list","region_id":"aws-us-east-2"}}')

PROJECT_ID=$(echo "$NEON_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "  Proyecto: $PROJECT_ID"

echo "▶ Obteniendo connection string..."
CONN_RESP=$(curl -sf "https://console.neon.tech/api/v2/projects/$PROJECT_ID/connection_uri?role_name=neondb_owner&database_name=neondb&pooled=true" \
  -H "Authorization: Bearer $NEON_TOKEN")
DATABASE_URL=$(echo "$CONN_RESP" | grep -o '"uri":"[^"]*"' | cut -d'"' -f4)
echo "  DATABASE_URL obtenida"

echo "▶ Ejecutando schema SQL en Neon..."
BRANCH_RESP=$(curl -sf "https://console.neon.tech/api/v2/projects/$PROJECT_ID/branches" \
  -H "Authorization: Bearer $NEON_TOKEN")
BRANCH_ID=$(echo "$BRANCH_RESP" | grep -o '"id":"br-[^"]*"' | head -1 | cut -d'"' -f4)
ENDPOINT_ID=$(echo "$BRANCH_RESP" | grep -o '"endpoint_id":"ep-[^"]*"' | head -1 | cut -d'"' -f4 || true)

# Ejecutar SQL via Neon SQL API
SQL="CREATE TABLE IF NOT EXISTS lists (code CHAR(5) PRIMARY KEY, name TEXT NOT NULL DEFAULT '', items JSONB NOT NULL DEFAULT '[]', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());"
curl -sf -X POST "https://console.neon.tech/api/v2/projects/$PROJECT_ID/query" \
  -H "Authorization: Bearer $NEON_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"$SQL\",\"database_name\":\"neondb\"}" > /dev/null
echo "  Tabla 'lists' creada"

echo "▶ Instalando Vercel CLI..."
npm install -g vercel --silent 2>/dev/null || true

echo "▶ Desplegando en Vercel..."
cd "$(dirname "$0")"
vercel pull --yes --token "$VERCEL_TOKEN" 2>/dev/null || true
vercel build --prod --token "$VERCEL_TOKEN" --yes
vercel deploy --prebuilt --prod --token "$VERCEL_TOKEN" \
  --env DATABASE_URL="$DATABASE_URL" \
  -m githubCommitRef=claude/event-shopping-list-app-RSSop

echo ""
echo "✅ Todo listo"
echo "   DATABASE_URL=${DATABASE_URL:0:40}..."

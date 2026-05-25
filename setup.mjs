#!/usr/bin/env node
// NEON_TOKEN y VERCEL_TOKEN deben estar en el entorno
import { writeFileSync } from 'fs';

const NEON_TOKEN   = process.env.NEON_TOKEN;
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const GITHUB_REPO  = 'dougibanez/shopping-list';
const BRANCH       = 'claude/event-shopping-list-app-RSSop';
const PROJECT_NAME = 'shopping-list';

if (!NEON_TOKEN || !VERCEL_TOKEN) {
  console.error('Faltan NEON_TOKEN y/o VERCEL_TOKEN');
  process.exit(1);
}

const neon = (path, opts = {}) =>
  fetch(`https://console.neon.tech/api/v2${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${NEON_TOKEN}`, 'Content-Type': 'application/json', ...opts.headers }
  }).then(r => r.json());

const vercel = (path, opts = {}) =>
  fetch(`https://api.vercel.com${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json', ...opts.headers }
  }).then(r => r.json());

// ── 1. Reusar proyecto Neon existente o crear uno ────────────────────────────
console.log('\n▶ 1/4  Buscando proyecto Neon…');
const { projects } = await neon('/projects');
let project = projects?.find(p => p.name === PROJECT_NAME);
if (project) {
  console.log(`   Reutilizando proyecto existente: ${project.id}`);
} else {
  console.log('   Creando nuevo proyecto…');
  const res = await neon('/projects', {
    method: 'POST',
    body: JSON.stringify({ project: { name: PROJECT_NAME, region_id: 'aws-us-east-2' } })
  });
  project = res.project;
  console.log(`   Proyecto creado: ${project.id}`);
}

// ── 2. Obtener connection string ─────────────────────────────────────────────
console.log('▶ 2/4  Obteniendo connection string…');
const connRes = await neon(
  `/projects/${project.id}/connection_uri?role_name=neondb_owner&database_name=neondb&pooled=true`
);
const DATABASE_URL = connRes.uri;
if (!DATABASE_URL) throw new Error('No se pudo obtener DATABASE_URL: ' + JSON.stringify(connRes));
console.log(`   ${DATABASE_URL.slice(0, 50)}…`);
writeFileSync('/tmp/db_url.txt', DATABASE_URL);

// ── 3. Crear tabla lists via driver directo ──────────────────────────────────
console.log('▶ 3/4  Creando tabla lists…');
import { neon as neonSql } from '@neondatabase/serverless';
const sql = neonSql(DATABASE_URL);
await sql`CREATE TABLE IF NOT EXISTS lists (
  code       CHAR(5)      PRIMARY KEY,
  name       TEXT         NOT NULL DEFAULT '',
  items      JSONB        NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
)`;
console.log('   Tabla lists ✓');

// ── 4. Crear / obtener proyecto Vercel ───────────────────────────────────────
console.log('▶ 4/4  Configurando proyecto en Vercel…');
let vProject;

// Buscar si ya existe
const { projects: vProjects } = await vercel(`/v10/projects?search=${PROJECT_NAME}&limit=10`);
vProject = vProjects?.find(p => p.name === PROJECT_NAME);

if (!vProject) {
  const created = await vercel('/v10/projects', {
    method: 'POST',
    body: JSON.stringify({ name: PROJECT_NAME, framework: null })
  });
  if (created.error) throw new Error('Crear proyecto Vercel: ' + JSON.stringify(created.error));
  vProject = created;
  console.log(`   Proyecto Vercel creado: ${vProject.id}`);
} else {
  console.log(`   Proyecto Vercel existente: ${vProject.id}`);
}

// Agregar/actualizar DATABASE_URL
const envRes = await vercel(`/v10/projects/${vProject.id}/env`, {
  method: 'POST',
  body: JSON.stringify([{
    key: 'DATABASE_URL',
    value: DATABASE_URL,
    type: 'encrypted',
    target: ['production', 'preview', 'development']
  }])
});
if (envRes.error?.code === 'ENV_ALREADY_EXISTS') {
  // Obtener el ID del env existente y actualizarlo
  const envList = await vercel(`/v10/projects/${vProject.id}/env`);
  const existing = envList.envs?.find(e => e.key === 'DATABASE_URL');
  if (existing) {
    await vercel(`/v10/projects/${vProject.id}/env/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ value: DATABASE_URL, target: ['production', 'preview', 'development'] })
    });
    console.log('   DATABASE_URL actualizada');
  }
} else if (envRes.error) {
  console.warn('   Advertencia env:', JSON.stringify(envRes.error));
} else {
  console.log('   DATABASE_URL configurada');
}

console.log('\n✅ Neon y Vercel configurados');
console.log(`   PROJECT_ID: ${vProject.id}`);
console.log(`   Ejecutar: npx vercel --prod --token $VERCEL_TOKEN`);

// Escribir PROJECT_ID para el siguiente paso
writeFileSync('/tmp/vercel_project_id.txt', vProject.id);

#!/usr/bin/env node
// Ejecutar: NEON_TOKEN=xxx VERCEL_TOKEN=yyy node setup.mjs
// Requiere Node 18+

const NEON_TOKEN   = process.env.NEON_TOKEN;
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const GITHUB_REPO  = 'dougibanez/shopping-list';
const BRANCH       = 'claude/event-shopping-list-app-RSSop';

if (!NEON_TOKEN || !VERCEL_TOKEN) {
  console.error('Faltan variables: NEON_TOKEN y VERCEL_TOKEN son requeridas');
  process.exit(1);
}

const neon   = (path, opts = {}) => fetch(`https://console.neon.tech/api/v2${path}`, {
  ...opts, headers: { Authorization: `Bearer ${NEON_TOKEN}`, 'Content-Type': 'application/json', ...opts.headers }
}).then(r => r.ok ? r.json() : r.text().then(t => { throw new Error(`Neon ${path}: ${t}`) }));

const vercel = (path, opts = {}) => fetch(`https://api.vercel.com${path}`, {
  ...opts, headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json', ...opts.headers }
}).then(r => r.ok ? r.json() : r.text().then(t => { throw new Error(`Vercel ${path}: ${t}`) }));

// ── 1. Neon: crear proyecto ──────────────────────────────────────────────────
console.log('\n▶ 1/5  Creando proyecto en Neon…');
const { project } = await neon('/projects', {
  method: 'POST',
  body: JSON.stringify({ project: { name: 'shopping-list', region_id: 'aws-us-east-2' } })
});
console.log(`   proyecto: ${project.id}`);

// ── 2. Neon: connection string ───────────────────────────────────────────────
console.log('▶ 2/5  Obteniendo connection string…');
const connResp = await neon(
  `/projects/${project.id}/connection_uri?role_name=neondb_owner&database_name=neondb&pooled=true`
);
const DATABASE_URL = connResp.uri;
console.log(`   ${DATABASE_URL.slice(0, 45)}…`);

// ── 3. Neon: crear tabla ─────────────────────────────────────────────────────
console.log('▶ 3/5  Creando tabla lists en Neon…');
await neon(`/projects/${project.id}/query`, {
  method: 'POST',
  body: JSON.stringify({
    query: `CREATE TABLE IF NOT EXISTS lists (
      code       CHAR(5)      PRIMARY KEY,
      name       TEXT         NOT NULL DEFAULT '',
      items      JSONB        NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )`,
    database_name: 'neondb'
  })
});
console.log('   tabla lists ✓');

// ── 4. Vercel: crear proyecto vinculado al repo ──────────────────────────────
console.log('▶ 4/5  Creando proyecto en Vercel…');
const [owner, repo] = GITHUB_REPO.split('/');
let vProject;
try {
  vProject = await vercel('/v10/projects', {
    method: 'POST',
    body: JSON.stringify({
      name: 'shopping-list',
      framework: null,
      gitRepository: { type: 'github', repo: GITHUB_REPO },
      installCommand: 'npm install',
      buildCommand: null,
      outputDirectory: '.'
    })
  });
} catch (e) {
  // Si ya existe, obtenemos el existente
  if (e.message.includes('already exists') || e.message.includes('conflict')) {
    const list = await vercel(`/v10/projects?search=shopping-list&limit=5`);
    vProject = list.projects?.find(p => p.name === 'shopping-list');
    if (!vProject) throw e;
    console.log('   proyecto ya existía, usando el existente');
  } else throw e;
}
const projectId = vProject.id;
console.log(`   proyecto: ${projectId}`);

// ── 5. Vercel: agregar DATABASE_URL y desplegar ──────────────────────────────
console.log('▶ 5/5  Configurando env var y desplegando…');
await vercel(`/v10/projects/${projectId}/env`, {
  method: 'POST',
  body: JSON.stringify([{
    key: 'DATABASE_URL',
    value: DATABASE_URL,
    type: 'encrypted',
    target: ['production', 'preview', 'development']
  }])
}).catch(() => console.log('   (DATABASE_URL ya configurada)'));

const deployment = await vercel('/v13/deployments', {
  method: 'POST',
  body: JSON.stringify({
    name: 'shopping-list',
    project: projectId,
    gitSource: {
      type: 'github',
      repo: GITHUB_REPO,
      ref: BRANCH
    },
    projectSettings: {
      framework: null,
      installCommand: 'npm install',
      buildCommand: null,
      outputDirectory: '.'
    },
    target: 'production'
  })
});

const appUrl = `https://${deployment.url}`;
console.log(`\n✅ Deploy iniciado`);
console.log(`   URL: ${appUrl}`);
console.log(`   Estado: ${deployment.readyState ?? 'building…'}`);
console.log(`\n   Seguí el progreso en: https://vercel.com/dashboard`);

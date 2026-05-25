const { neon } = require('@neondatabase/serverless');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const code = ((req.query.code) || '').toUpperCase().trim();
  if (!code) return res.status(400).json({ error: 'Código requerido' });

  try {
    const sql = neon(process.env.DATABASE_URL);
    const [row] = await sql`SELECT name, items FROM lists WHERE code = ${code}`;

    if (!row) return res.status(404).json({ error: 'Lista no encontrada' });

    return res.status(200).json({ name: row.name, items: row.items });
  } catch (err) {
    console.error('[load]', err.message);
    return res.status(500).json({ error: 'Error al cargar la lista' });
  }
};

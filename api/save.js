const { neon } = require('@neondatabase/serverless');

function generateCode() {
  const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const D = '0123456789';
  return (
    L[Math.floor(Math.random() * 26)] +
    L[Math.floor(Math.random() * 26)] +
    D[Math.floor(Math.random() * 10)] +
    D[Math.floor(Math.random() * 10)] +
    D[Math.floor(Math.random() * 10)]
  );
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const { name = '', items } = req.body || {};
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items debe ser un array' });

    const sql = neon(process.env.DATABASE_URL);

    let code;
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateCode();
      const [existing] = await sql`SELECT 1 FROM lists WHERE code = ${candidate}`;
      if (!existing) { code = candidate; break; }
    }
    if (!code) return res.status(500).json({ error: 'No se pudo generar código único' });

    await sql`INSERT INTO lists (code, name, items) VALUES (${code}, ${name}, ${JSON.stringify(items)})`;

    return res.status(200).json({ code });
  } catch (err) {
    console.error('[save]', err.message);
    return res.status(500).json({ error: 'Error al guardar la lista' });
  }
};

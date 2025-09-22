// GET /api/contas -> lista
// POST /api/contas -> upsert
import { sql } from '../_db';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const rows = await sql`SELECT * FROM contas ORDER BY idconta`;
      return res.status(200).json(rows ?? []);
    }
    if (req.method === 'POST') {
      const { id, name } = await parse(req);
      const [row] = await sql`
        INSERT INTO contas (idconta, nome)
        VALUES (${id}, ${name})
        ON CONFLICT (idconta) DO UPDATE SET nome = ${name}
        RETURNING *`;
      return res.status(200).json(row);
    }
    res.status(405).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}

async function parse(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

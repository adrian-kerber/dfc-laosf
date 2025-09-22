// /api/contas.js
import { neon } from '@neondatabase/serverless';
export const config = { runtime: 'edge' };

const sql = neon(process.env.DATABASE_URL);

async function ensureTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS contas (
      idconta VARCHAR(50) PRIMARY KEY,
      nome    VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
}

export default async function handler(req) {
  try {
    await ensureTables();

    if (req.method === 'GET') {
      const rows = await sql`SELECT * FROM contas ORDER BY idconta`;
      return Response.json(rows ?? [], { status: 200 });
    }

    if (req.method === 'POST') {
      const { id, name } = await req.json();
      if (!id || !String(id).trim()) {
        return Response.json({ error: 'id inválido' }, { status: 400 });
      }
      const nome = (name ?? '').trim() || `Conta ${id}`;
      const rows = await sql`
        INSERT INTO contas (idconta, nome)
        VALUES (${String(id)}, ${nome})
        ON CONFLICT (idconta) DO UPDATE SET nome = ${nome}
        RETURNING *
      `;
      return Response.json(rows?.[0] ?? null, { status: 200 });
    }

    return new Response('Method Not Allowed', { status: 405 });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}

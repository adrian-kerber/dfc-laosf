// /api/agrupadores/contas.js
import { neon } from '@neondatabase/serverless';
export const config = { runtime: 'edge' };

const sql = neon(process.env.DATABASE_URL);

// garante a tabela de mapeamento global
async function ensureTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS conta_agrupador (
      id SERIAL PRIMARY KEY,
      idconta VARCHAR(50) NOT NULL UNIQUE,
      idagrupador INTEGER NULL
    )
  `;
}

export default async function handler(req) {
  try {
    await ensureTables();

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT idconta, idagrupador
        FROM conta_agrupador
        ORDER BY idconta
      `;
      return Response.json(rows ?? [], { status: 200 });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const list = Array.isArray(body.associations) ? body.associations : [];

      // validações simples
      for (const a of list) {
        if (typeof a.idconta !== 'string' || a.idconta.trim() === '') {
          return Response.json({ error: 'idconta inválido' }, { status: 400 });
        }
        if (a.idagrupador != null && Number.isNaN(Number(a.idagrupador))) {
          return Response.json({ error: 'idagrupador inválido' }, { status: 400 });
        }
      }

      // zera e regrava o mapeamento global atual
      await sql`TRUNCATE TABLE conta_agrupador`;
      for (const a of list) {
        await sql`
          INSERT INTO conta_agrupador (idconta, idagrupador)
          VALUES (${a.idconta}, ${a.idagrupador == null ? null : Number(a.idagrupador)})
        `;
      }

      return Response.json({ ok: true, saved: list.length }, { status: 200 });
    }

    return new Response('Method Not Allowed', { status: 405 });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}

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
      const rows = await sql`SELECT idconta, nome FROM contas ORDER BY idconta`;
      return Response.json(rows ?? [], { status: 200 });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const id = String(body.id ?? body.idconta ?? '').trim();
      const name = String(body.name ?? body.nome ?? '').trim() || `Conta ${id}`;
      if (!id) return Response.json({ error: 'id inválido' }, { status: 400 });

      const [row] = await sql`
        INSERT INTO contas (idconta, nome)
        VALUES (${id}, ${name})
        ON CONFLICT (idconta) DO NOTHING
        RETURNING idconta, nome
      `;
      // Se já existia, não retorna linha; devolvemos o id + nome provisório
      return Response.json(row ?? { idconta: id, nome: name }, { status: 200 });
    }

    return new Response('Method Not Allowed', { status: 405 });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}

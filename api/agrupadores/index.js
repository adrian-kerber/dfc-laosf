// /api/agrupadores/index.js
import { neon } from '@neondatabase/serverless';
export const config = { runtime: 'edge' };

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req) {
  try {
    const url = new URL(req.url);

    if (req.method === 'GET') {
      const rows = await sql`SELECT * FROM agrupadores ORDER BY nome`;
      return Response.json(rows ?? [], { status: 200 });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const nome = String(body?.nome || '').trim();
      if (!nome) return Response.json({ error: 'nome obrigatório' }, { status: 400 });

      const rows = await sql`
        INSERT INTO agrupadores (nome)
        VALUES (${nome})
        RETURNING *`;
      return Response.json(rows?.[0] ?? null, { status: 200 });
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      const body = await req.json();
      const id = Number(body?.id);
      const nome = String(body?.nome || '').trim();
      if (!id || !nome) return Response.json({ error: 'id/nome inválidos' }, { status: 400 });

      const rows = await sql`
        UPDATE agrupadores SET nome = ${nome}
        WHERE idagrupador = ${id}
        RETURNING *`;
      return Response.json(rows?.[0] ?? null, { status: 200 });
    }

    if (req.method === 'DELETE') {
      const id = Number(url.searchParams.get('id'));
      if (!id) return Response.json({ error: 'id inválido' }, { status: 400 });

      await sql`DELETE FROM agrupador_contas WHERE idagrupador = ${id}`;
      await sql`DELETE FROM agrupadores WHERE idagrupador = ${id}`;
      return Response.json({ ok: true }, { status: 200 });
    }

    return new Response('Method Not Allowed', { status: 405 });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

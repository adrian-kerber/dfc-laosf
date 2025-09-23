// /src/pages/api/contas.js (ou /app/api/contas/route.js no Next 13+)
import { neon } from '@neondatabase/serverless';
export const config = { runtime: 'edge' };
const sql = neon(process.env.DATABASE_URL);

export default async function handler(req) {
  try {
    const url = new URL(req.url);

    if (req.method === 'GET') {
      // ?empresa=1  | se omitir => todas
      const empresa = url.searchParams.get('empresa');

      let rows;
      if (empresa) {
        rows = await sql`
          SELECT idconta, nome, empresa_id
          FROM contas
          WHERE empresa_id = ${empresa}
          ORDER BY idconta
        `;
      } else {
        rows = await sql`
          SELECT idconta, nome, empresa_id
          FROM contas
          ORDER BY empresa_id, idconta
        `;
      }
      return Response.json(rows ?? [], { status: 200 });
    }

    if (req.method === 'POST') {
      // upsert por (empresa_id, idconta)
      const body = await req.json();
      const id = String(body.id);
      const nome = String(body.name || '');
      const empresa = String(body.empresa); // "1" ou "7"

      const rows = await sql`
        INSERT INTO contas (idconta, nome, empresa_id)
        VALUES (${id}, ${nome}, ${empresa})
        ON CONFLICT (empresa_id, idconta) DO UPDATE SET nome = EXCLUDED.nome
        RETURNING idconta, nome, empresa_id
      `;
      return Response.json(rows?.[0] ?? null, { status: 200 });
    }

    return new Response('Method Not Allowed', { status: 405 });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

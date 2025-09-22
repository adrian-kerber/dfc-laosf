import { neon } from '@neondatabase/serverless';
export const config = { runtime: 'edge' };

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req) {
  try {
    if (req.method === 'GET') {
      const rows = await sql`SELECT * FROM contas ORDER BY idconta`;
      return Response.json(rows ?? [], { status: 200 });
    }

    if (req.method === 'POST') {
      const { id, name } = await req.json();
      const rows = await sql`
        INSERT INTO contas (idconta, nome)
        VALUES (${id}, ${name})
        ON CONFLICT (idconta) DO UPDATE SET nome = ${name}
        RETURNING *`;
      return Response.json(rows?.[0] ?? null, { status: 200 });
    }

    return new Response('Method Not Allowed', { status: 405 });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

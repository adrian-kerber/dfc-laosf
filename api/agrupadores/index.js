import { neon } from '@neondatabase/serverless';
export const config = { runtime: 'edge' };

export default async function handler(req) {
  try {
    const url = process.env.DATABASE_URL;
    if (!url) return Response.json({ error: 'DATABASE_URL missing' }, { status: 500 });
    const sql = neon(url);

    if (req.method === 'GET') {
      // Se a tabela ainda não existir, vai dar erro de SQL (e veremos o texto)
      const rows = await sql`SELECT * FROM agrupadores ORDER BY nome`;
      return Response.json(rows ?? [], { status: 200 });
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const { nome } = body || {};
      if (!nome || typeof nome !== 'string') {
        return Response.json({ error: 'nome obrigatório' }, { status: 400 });
      }
      const rows = await sql`
        INSERT INTO agrupadores (nome) VALUES (${nome}) RETURNING *`;
      return Response.json(rows?.[0] ?? null, { status: 200 });
    }

    return new Response('Method Not Allowed', { status: 405 });
  } catch (e) {
    // Aqui, se for erro SQL (ex. tabela não existe), a mensagem aparece no JSON
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

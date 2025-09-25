// /api/agrupadores.js
import { neon } from '@neondatabase/serverless';
export const config = { runtime: 'edge' };
const sql = neon(process.env.DATABASE_URL);

async function ensureTables() {
  // Tabela de agrupadores permanece global
  await sql`
    CREATE TABLE IF NOT EXISTS agrupadores (
      idagrupador SERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  
  // Esta tabela não é mais usada - mantida para compatibilidade
  await sql`
    CREATE TABLE IF NOT EXISTS agrupadores_contas (
      id SERIAL PRIMARY KEY,
      idagrupador INTEGER REFERENCES agrupadores(idagrupador) ON DELETE CASCADE,
      idconta VARCHAR(50) REFERENCES contas(idconta) ON DELETE CASCADE
    )
  `;
}

export default async function handler(req) {
  try {
    await ensureTables();

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const ccParam = url.searchParams.get('cc');
      
      // Por enquanto, agrupadores são globais
      // Você pode implementar filtro por centro se quiser agrupadores específicos por centro
      const rows = await sql`SELECT * FROM agrupadores ORDER BY idagrupador`;
      return Response.json(rows ?? [], { status: 200 });
    }

    if (req.method === 'POST') {
      const { nome } = await req.json();
      if (!nome) return Response.json({ error: 'Nome obrigatório' }, { status: 400 });
      
      const rows = await sql`
        INSERT INTO agrupadores (nome) VALUES (${nome})
        RETURNING *
      `;
      return Response.json(rows?.[0], { status: 200 });
    }

    if (req.method === 'PATCH') {
      const { id, nome } = await req.json();
      if (!id || !nome) return Response.json({ error: 'id/nome obrigatórios' }, { status: 400 });
      
      const rows = await sql`
        UPDATE agrupadores SET nome = ${nome}
        WHERE idagrupador = ${id}
        RETURNING *
      `;
      return Response.json(rows?.[0], { status: 200 });
    }

    return new Response('Method Not Allowed', { status: 405 });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}
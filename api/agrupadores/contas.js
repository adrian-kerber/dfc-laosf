import { neon } from '@neondatabase/serverless';
export const config = { runtime: 'edge' }; // garante Edge

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req) {
  try {
    const url = new URL(req.url);

    if (req.method === 'GET') {
      const mes = url.searchParams.get('mes');
      const ano = url.searchParams.get('ano');

      const rows = await sql`
        SELECT ac.*, a.nome as agrupador_nome, c.nome as conta_nome, c.idconta
        FROM agrupador_contas ac
        JOIN agrupadores a ON ac.idagrupador = a.idagrupador
        JOIN contas c ON ac.idconta = c.idconta
        WHERE (${mes}::int IS NULL OR ac.mes = ${mes})
          AND (${ano}::int IS NULL OR ac.ano = ${ano})
        ORDER BY a.nome, c.idconta
      `;

      return Response.json(rows ?? [], { status: 200 });
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const mes = Number(body.mes);
      const ano = Number(body.ano);
      const associations = Array.isArray(body.associations) ? body.associations : [];

      // limpa período
      await sql`DELETE FROM agrupador_contas WHERE mes = ${mes} AND ano = ${ano}`;

      // se não houver nada pra inserir, ok
      if (associations.length === 0) {
        return Response.json({ ok: true, inserted: 0 }, { status: 200 });
      }

      // insere
      for (const assoc of associations) {
        await sql`
          INSERT INTO agrupador_contas (idagrupador, idconta, mes, ano)
          VALUES (${assoc.idagrupador}, ${assoc.idconta}, ${mes}, ${ano})
          ON CONFLICT (idagrupador, idconta, mes, ano) DO NOTHING
        `;
      }

      return Response.json({ ok: true, inserted: associations.length }, { status: 200 });
    }

    return new Response('Method Not Allowed', { status: 405 });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

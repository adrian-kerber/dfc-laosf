// /api/agrupadores/contas.js
import { neon } from '@neondatabase/serverless';
export const config = { runtime: 'edge' };

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req) {
  try {
    const url = new URL(req.url);

    if (req.method === 'GET') {
      const mes = url.searchParams.get('mes');
      const ano = url.searchParams.get('ano');

      let rows;
      if (mes && ano) {
        rows = await sql`
          SELECT ac.*, a.nome AS agrupador_nome, c.nome AS conta_nome, c.idconta
          FROM agrupador_contas ac
            JOIN agrupadores a ON ac.idagrupador = a.idagrupador
            JOIN contas c       ON ac.idconta     = c.idconta
          WHERE ac.mes = ${Number(mes)} AND ac.ano = ${Number(ano)}
          ORDER BY a.nome, c.idconta`;
      } else {
        rows = await sql`
          SELECT ac.*, a.nome AS agrupador_nome, c.nome AS conta_nome, c.idconta
          FROM agrupador_contas ac
            JOIN agrupadores a ON ac.idagrupador = a.idagrupador
            JOIN contas c       ON ac.idconta     = c.idconta
          ORDER BY a.nome, c.idconta`;
      }
      return Response.json(rows ?? [], { status: 200 });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const mes = Number(body?.mes);
      const ano = Number(body?.ano);
      const associations = Array.isArray(body?.associations) ? body.associations : [];

      if (!mes || !ano) {
        return Response.json({ error: 'mes/ano inválidos' }, { status: 400 });
      }

      // Limpa vínculos do período
      await sql`DELETE FROM agrupador_contas WHERE mes = ${mes} AND ano = ${ano}`;

      // Insere vínculos
      let inserted = 0;
      for (const a of associations) {
        const idagrupador = Number(a.idagrupador);
        const idconta = String(a.idconta);
        if (!idagrupador || !idconta) continue;

        await sql`
          INSERT INTO agrupador_contas (idagrupador, idconta, mes, ano)
          VALUES (${idagrupador}, ${idconta}, ${mes}, ${ano})
          ON CONFLICT (idagrupador, idconta, mes, ano) DO NOTHING`;
        inserted++;
      }

      return Response.json({ ok: true, inserted }, { status: 200 });
    }

    return new Response('Method Not Allowed', { status: 405 });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

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
          SELECT m.*, c.nome, c.idconta as codigo
          FROM movimentacoes m
          JOIN contas c ON m.idconta = c.idconta
          WHERE m.mes = ${mes} AND m.ano = ${ano}
          ORDER BY c.idconta`;
      } else if (ano) {
        rows = await sql`
          SELECT m.*, c.nome, c.idconta as codigo
          FROM movimentacoes m
          JOIN contas c ON m.idconta = c.idconta
          WHERE m.ano = ${ano}
          ORDER BY c.idconta, m.mes`;
      } else {
        rows = await sql`
          SELECT m.*, c.nome, c.idconta as codigo
          FROM movimentacoes m
          JOIN contas c ON m.idconta = c.idconta
          ORDER BY c.idconta, m.ano, m.mes`;
      }
      return Response.json(rows ?? [], { status: 200 });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const mes = Number(body.mes);
      const ano = Number(body.ano);
      const movs = Array.isArray(body.movimentacoes) ? body.movimentacoes : [];

      await sql`DELETE FROM movimentacoes WHERE mes = ${mes} AND ano = ${ano}`;

      for (const mov of movs) {
        await sql`
          INSERT INTO movimentacoes
          (idconta, mes, ano, debito, credito, idcentrocusto, centrocusto_nome, centrocusto_codigo)
          VALUES (${mov.idconta}, ${mes}, ${ano},
                  ${mov.debito || 0}, ${mov.credito || 0},
                  ${mov.idcentrocusto ?? null}, ${mov.centroCustoNome ?? null}, ${mov.centroCustoCodigo ?? null})
        `;
      }

      return Response.json({ ok: true, inserted: movs.length }, { status: 200 });
    }

    return new Response('Method Not Allowed', { status: 405 });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

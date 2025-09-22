// /api/movimentacoes.js
import { neon } from '@neondatabase/serverless';
export const config = { runtime: 'edge' };

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req) {
  try {
    const url = new URL(req.url);
    const method = req.method;

    if (method === 'GET') {
      const mes  = url.searchParams.get('mes'); // "1".."12" ou null
      const ano  = url.searchParams.get('ano'); // "2025" ou null
      const cc   = url.searchParams.get('cc');  // id centro de custo ou null

      const m = mes != null ? Number(mes) : null;
      const a = ano != null ? Number(ano) : null;
      const c = cc  != null ? Number(cc)  : null;

      let rows;

      // 1) Nenhum filtro
      if (a == null && m == null && c == null) {
        rows = await sql`
          SELECT m.*, ctas.nome, ctas.idconta AS codigo
          FROM movimentacoes m
          JOIN contas ctas ON m.idconta = ctas.idconta
          ORDER BY ctas.idconta, m.ano, m.mes
        `;
      }
      // 2) Só ano
      else if (a != null && m == null && c == null) {
        rows = await sql`
          SELECT m.*, ctas.nome, ctas.idconta AS codigo
          FROM movimentacoes m
          JOIN contas ctas ON m.idconta = ctas.idconta
          WHERE m.ano = ${a}
          ORDER BY ctas.idconta, m.mes
        `;
      }
      // 3) Ano + mês
      else if (a != null && m != null && c == null) {
        rows = await sql`
          SELECT m.*, ctas.nome, ctas.idconta AS codigo
          FROM movimentacoes m
          JOIN contas ctas ON m.idconta = ctas.idconta
          WHERE m.ano = ${a} AND m.mes = ${m}
          ORDER BY ctas.idconta
        `;
      }
      // 4) Ano + CC (todos os meses)
      else if (a != null && m == null && c != null) {
        rows = await sql`
          SELECT m.*, ctas.nome, ctas.idconta AS codigo
          FROM movimentacoes m
          JOIN contas ctas ON m.idconta = ctas.idconta
          WHERE m.ano = ${a} AND m.idcentrocusto = ${c}
          ORDER BY ctas.idconta, m.mes
        `;
      }
      // 5) Ano + mês + CC
      else if (a != null && m != null && c != null) {
        rows = await sql`
          SELECT m.*, ctas.nome, ctas.idconta AS codigo
          FROM movimentacoes m
          JOIN contas ctas ON m.idconta = ctas.idconta
          WHERE m.ano = ${a} AND m.mes = ${m} AND m.idcentrocusto = ${c}
          ORDER BY ctas.idconta
        `;
      }
      // 6) CC sem ano (evita erro, mas retorna todos anos daquele CC)
      else if (a == null && c != null && m == null) {
        rows = await sql`
          SELECT m.*, ctas.nome, ctas.idconta AS codigo
          FROM movimentacoes m
          JOIN contas ctas ON m.idconta = ctas.idconta
          WHERE m.idcentrocusto = ${c}
          ORDER BY ctas.idconta, m.ano, m.mes
        `;
      }
      // 7) fallback
      else {
        rows = await sql`
          SELECT m.*, ctas.nome, ctas.idconta AS codigo
          FROM movimentacoes m
          JOIN contas ctas ON m.idconta = ctas.idconta
          ORDER BY ctas.idconta, m.ano, m.mes
        `;
      }

      return Response.json(rows ?? [], { status: 200 });
    }

    if (method === 'POST') {
      const body = await req.json();
      const mes = Number(body.mes);
      const ano = Number(body.ano);
      const movs = Array.isArray(body.movimentacoes) ? body.movimentacoes : [];

      // INSERÇÃO EM LOTE — sem deletar nada
      for (const mov of movs) {
        await sql`
          INSERT INTO movimentacoes
            (idconta, mes, ano, debito, credito, idcentrocusto, centrocusto_nome, centrocusto_codigo)
          VALUES
            (${mov.idconta},
             ${mes},
             ${ano},
             ${mov.debito || 0},
             ${mov.credito || 0},
             ${mov.idcentrocusto ?? null},
             ${mov.centrocusto_nome ?? null},
             ${mov.centrocusto_codigo ?? null})
        `;
      }

      return Response.json({ ok: true, inserted: movs.length }, { status: 200 });
    }

    return new Response('Method Not Allowed', { status: 405 });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}

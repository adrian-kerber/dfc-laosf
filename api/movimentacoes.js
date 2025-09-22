// /api/movimentacoes.js
import { neon } from '@neondatabase/serverless';
export const config = { runtime: 'edge' };

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req) {
  try {
    const url = new URL(req.url);

    // ---------------- GET: lista movimentações (com filtros opcionais) ----------------
    if (req.method === 'GET') {
      const ano = url.searchParams.get('ano'); // string | null
      const mes = url.searchParams.get('mes'); // string | null
      const cc  = url.searchParams.get('cc');  // idcentrocusto opcional

      // Monte o WHERE usando helpers do Neon (NÃO use Array.join)
      const whereParts = [];
      if (ano) whereParts.push(sql`m.ano = ${Number(ano)}`);
      if (mes) whereParts.push(sql`m.mes = ${Number(mes)}`);
      if (cc)  whereParts.push(sql`m.idcentrocusto = ${Number(cc)}`);

      const rows = whereParts.length
        ? await sql`
            SELECT m.*, c.nome, c.idconta AS codigo
            FROM movimentacoes m
            JOIN contas c ON m.idconta = c.idconta
            WHERE ${sql.join(whereParts, sql` AND `)}
            ORDER BY c.idconta, m.ano, m.mes
          `
        : await sql`
            SELECT m.*, c.nome, c.idconta AS codigo
            FROM movimentacoes m
            JOIN contas c ON m.idconta = c.idconta
            ORDER BY c.idconta, m.ano, m.mes
          `;

      return Response.json(rows ?? [], { status: 200 });
    }

    // ---------------- POST: insere lote de movimentações (sem apagar nada) ----------------
    if (req.method === 'POST') {
      const body = await req.json();
      const mes = Number(body.mes);
      const ano = Number(body.ano);
      const movs = Array.isArray(body.movimentacoes) ? body.movimentacoes : [];

      // NADA de delete/upsert: apenas INSERT linha a linha
      for (const mov of movs) {
        await sql`
          INSERT INTO movimentacoes
            (idconta, mes, ano, debito, credito, idcentrocusto, centrocusto_nome, centrocusto_codigo)
          VALUES
            (${mov.idconta}, ${mes}, ${ano},
             ${mov.debito || 0}, ${mov.credito || 0},
             ${mov.idcentrocusto ?? null}, ${mov.centrocusto_nome ?? null}, ${mov.centrocusto_codigo ?? null})
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

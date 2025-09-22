import { neon } from '@neondatabase/serverless';
export const config = { runtime: 'edge' };

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req) {
  try {
    const url = new URL(req.url);

    // GET: retorna linhas brutas, você soma no client
    if (req.method === 'GET') {
      const mesParam   = url.searchParams.get('mes');     // opcional
      const anoParam   = url.searchParams.get('ano');     // obrigatório pra relatórios
      const centroParam= url.searchParams.get('centro');  // opcional (idcentrocusto)

      // monta WHERE dinâmico
      const parts = [];
      const vals  = [];

      if (anoParam) {
        parts.push(sql`m.ano = ${Number(anoParam)}`);
      }
      if (mesParam) {
        parts.push(sql`m.mes = ${Number(mesParam)}`);
      }
      if (centroParam && centroParam !== 'all') {
        parts.push(sql`m.idcentrocusto = ${Number(centroParam)}`);
      }

      const where = parts.length
        ? sql`WHERE ${sql.join(parts, sql` AND `)}`
        : sql``;

      const rows = await sql`
        SELECT m.*, c.nome, c.idconta AS codigo
        FROM movimentacoes m
        JOIN contas c ON m.idconta = c.idconta
        ${where}
        ORDER BY c.idconta, m.ano, m.mes, m.idmov
      `;
      return Response.json(rows ?? [], { status: 200 });
    }

    // POST: apenas INSERE; NÃO apaga, NÃO upsert
    if (req.method === 'POST') {
      const body = await req.json();
      const mes  = Number(body?.mes);
      const ano  = Number(body?.ano);
      const movs = Array.isArray(body?.movimentacoes) ? body.movimentacoes : [];

      if (!mes || !ano) {
        return Response.json({ error: 'mes/ano obrigatórios' }, { status: 400 });
      }

      let inserted = 0;
      for (const mov of movs) {
        const idconta = String(mov.idconta);
        const deb     = Number(mov.debito || 0);
        const cred    = Number(mov.credito || 0);
        const idcc    = mov.idcentrocusto != null ? Number(mov.idcentrocusto) : null;
        const ccNome  = mov.centrocusto_nome ?? null;
        const ccCod   = mov.centrocusto_codigo ?? null;

        if (!idconta) continue;

        await sql`
          INSERT INTO movimentacoes
            (idconta, mes, ano, debito, credito, idcentrocusto, centrocusto_nome, centrocusto_codigo)
          VALUES
            (${idconta}, ${mes}, ${ano}, ${deb}, ${cred}, ${idcc}, ${ccNome}, ${ccCod})
        `;
        inserted++;
      }

      return Response.json({ ok: true, inserted }, { status: 200 });
    }

    return new Response('Method Not Allowed', { status: 405 });
  } catch (e) {
    console.error('API /movimentacoes error:', e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

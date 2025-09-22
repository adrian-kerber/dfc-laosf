// pages/api/movimentacoes.js
import { neon } from "@neondatabase/serverless";
export const config = { runtime: "edge" };

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req) {
  try {
    const url = new URL(req.url);

    // =====================
    // GET movimentações
    // =====================
    if (req.method === "GET") {
      const mes = url.searchParams.get("mes");
      const ano = url.searchParams.get("ano");
      const idCentroCusto = url.searchParams.get("idcentrocusto"); // filtro extra opcional

      let query = `
        SELECT m.*, c.nome AS conta_nome, c.idconta AS codigo
        FROM movimentacoes m
        JOIN contas c ON m.idconta = c.idconta
      `;
      const conditions = [];
      const params = [];

      if (ano) {
        conditions.push(`m.ano = $${params.length + 1}`);
        params.push(ano);
      }
      if (mes) {
        conditions.push(`m.mes = $${params.length + 1}`);
        params.push(mes);
      }
      if (idCentroCusto) {
        conditions.push(`m.idcentrocusto = $${params.length + 1}`);
        params.push(idCentroCusto);
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(" AND ")}`;
      }
      query += ` ORDER BY c.idconta, m.ano, m.mes`;

      const rows = await sql(query, params);
      return Response.json(rows ?? [], { status: 200 });
    }

    // =====================
    // POST movimentações
    // =====================
    if (req.method === "POST") {
      const body = await req.json();
      const mes = Number(body.mes);
      const ano = Number(body.ano);
      const movs = Array.isArray(body.movimentacoes) ? body.movimentacoes : [];

      // limpa mês/ano antes de inserir
      await sql(
        `DELETE FROM movimentacoes WHERE mes = $1 AND ano = $2`,
        [mes, ano]
      );

      for (const mov of movs) {
        await sql(
          `
          INSERT INTO movimentacoes
          (idconta, mes, ano, debito, credito, idcentrocusto, centrocusto_nome, centrocusto_codigo)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
          [
            mov.idconta,
            mes,
            ano,
            mov.debito || 0,
            mov.credito || 0,
            mov.idcentrocusto ?? null,
            mov.centrocusto_nome ?? null,
            mov.centrocusto_codigo ?? null,
          ]
        );
      }

      return Response.json(
        { ok: true, inserted: movs.length },
        { status: 200 }
      );
    }

    return new Response("Method Not Allowed", { status: 405 });
  } catch (e) {
    console.error("Erro em /api/movimentacoes:", e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

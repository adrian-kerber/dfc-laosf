// GET /api/movimentacoes?mes=..&ano=..
// POST /api/movimentacoes  { movimentacoes, mes, ano }
import { sql } from '../_db';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { searchParams } = new URL(req.url, 'http://x');
      const mes = toInt(searchParams.get('mes'));
      const ano = toInt(searchParams.get('ano'));

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
      return res.status(200).json(rows ?? []);
    }

    if (req.method === 'POST') {
      const { movimentacoes, mes, ano } = await parse(req);

      await sql`DELETE FROM movimentacoes WHERE mes = ${mes} AND ano = ${ano}`;

      for (const mov of movimentacoes) {
        await sql`
          INSERT INTO movimentacoes
          (idconta, mes, ano, debito, credito, idcentrocusto, centrocusto_nome, centrocusto_codigo)
          VALUES (${mov.idconta}, ${mes}, ${ano},
                  ${mov.debito || 0}, ${mov.credito || 0},
                  ${mov.idcentrocusto ?? null}, ${mov.centroCustoNome ?? null}, ${mov.centroCustoCodigo ?? null});`;
      }
      return res.status(200).json({ ok: true });
    }

    res.status(405).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}

function toInt(x){ const n = Number(x); return Number.isFinite(n) ? n : null; }
async function parse(req) { const chunks=[]; for await (const c of req) chunks.push(c); return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}'); }

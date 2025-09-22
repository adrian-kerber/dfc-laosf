// /api/movimentacoes.js
import { neon } from '@neondatabase/serverless';
export const config = { runtime: 'edge' };

const sql = neon(process.env.DATABASE_URL);

async function ensureTables() {
  // contas
  await sql`
    CREATE TABLE IF NOT EXISTS contas (
      idconta VARCHAR(50) PRIMARY KEY,
      nome    VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // movimentacoes (sem delete por mes/ano; permite múltiplos CC)
  await sql`
    CREATE TABLE IF NOT EXISTS movimentacoes (
      idmov SERIAL PRIMARY KEY,
      idconta VARCHAR(50) REFERENCES contas(idconta) ON DELETE CASCADE,
      mes INTEGER NOT NULL CHECK (mes >= 1 AND mes <= 12),
      ano INTEGER NOT NULL,
      debito DECIMAL(15,2) DEFAULT 0,
      credito DECIMAL(15,2) DEFAULT 0,
      idcentrocusto INTEGER,
      centrocusto_nome VARCHAR(255),
      centrocusto_codigo VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
}

function toInt(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req) {
  try {
    await ensureTables();

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const mes  = url.searchParams.get('mes');
      const ano  = url.searchParams.get('ano');
      const cc   = url.searchParams.get('centro'); // opcional

      let where = [];
      let params = [];

      if (ano != null) {
        where.push(sql`m.ano = ${toInt(ano)}`);
      }
      if (mes != null) {
        where.push(sql`m.mes = ${toInt(mes)}`);
      }
      if (cc != null && cc !== 'all') {
        where.push(sql`m.idcentrocusto = ${toInt(cc)}`);
      }

      const cond = where.length
        ? sql`WHERE ${where.reduce((acc, w, i) => i ? sql`${acc} AND ${w}` : w)}`
        : sql``;

      const rows = await sql`
        SELECT m.*, c.nome, c.idconta AS codigo
        FROM movimentacoes m
        JOIN contas c ON m.idconta = c.idconta
        ${cond}
        ORDER BY c.idconta, m.ano, m.mes, m.idmov
      `;
      return Response.json(rows ?? [], { status: 200 });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const mes = toInt(body.mes);
      const ano = toInt(body.ano);
      const movs = Array.isArray(body.movimentacoes) ? body.movimentacoes : [];

      if (!mes || !ano) {
        return Response.json({ error: 'mes/ano inválidos' }, { status: 400 });
      }

      // NÃO apagar por mês/ano — pode haver múltiplos CC no mesmo período.
      // Apenas grava novas linhas.

      // Segurança: garante que TODAS as contas existem para não quebrar a FK
      const ids = [...new Set(movs.map(m => String(m.idconta)))];
      for (const id of ids) {
        // se não existir, cria com nome provisório
        await sql`
          INSERT INTO contas (idconta, nome)
          VALUES (${id}, ${'Conta ' + id})
          ON CONFLICT (idconta) DO NOTHING
        `;
      }

      // Insere movimentações
      for (const m of movs) {
        await sql`
          INSERT INTO movimentacoes
            (idconta, mes, ano, debito, credito, idcentrocusto, centrocusto_nome, centrocusto_codigo)
          VALUES
            (${String(m.idconta)},
             ${toInt(mes)},
             ${toInt(ano)},
             ${Number(m.debito || 0)},
             ${Number(m.credito || 0)},
             ${m.idcentrocusto == null ? null : toInt(m.idcentrocusto)},
             ${m.centroCustoNome ?? m.centrocusto_nome ?? null},
             ${m.centroCustoCodigo ?? m.centrocusto_codigo ?? null})
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

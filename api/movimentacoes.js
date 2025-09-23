// /api/movimentacoes.js
import { neon } from '@neondatabase/serverless';
export const config = { runtime: 'edge' };

const sql = neon(process.env.DATABASE_URL);

async function ensureTables() {
  // contas (igual ao seu, sem empresa aqui)
  await sql`
    CREATE TABLE IF NOT EXISTS contas (
      idconta VARCHAR(50) PRIMARY KEY,
      nome    VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // movimentacoes: agora com empresa_id (texto) para separar por empresa
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
      empresa_id TEXT NOT NULL DEFAULT '1',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // índice para consultas por empresa/ano/mês
  await sql`
    CREATE INDEX IF NOT EXISTS mov_empresa_ano_mes_idx
      ON movimentacoes (empresa_id, ano, mes)
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
      const mes     = url.searchParams.get('mes');     // opcional (null => ano todo)
      const ano     = url.searchParams.get('ano');     // opcional (null => todos)
      const cc      = url.searchParams.get('centro');  // opcional
      const empresa = url.searchParams.get('empresa'); // "1" | "7" | null => ambas

      // Monta condições usando fragmentos sql para manter tagged-template
      const where = [];
      if (ano != null)       where.push(sql`m.ano = ${toInt(ano)}`);
      if (mes != null)       where.push(sql`m.mes = ${toInt(mes)}`);
      if (cc != null && cc !== 'all') where.push(sql`m.idcentrocusto = ${toInt(cc)}`);
      if (empresa && empresa !== 'all') where.push(sql`m.empresa_id = ${empresa}`);

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
      const empresa = String(body.empresa ?? '').trim(); // "1" ou "7"
      const movs = Array.isArray(body.movimentacoes) ? body.movimentacoes : [];

      if (!mes || !ano || !empresa) {
        return Response.json({ error: 'mes/ano/empresa inválidos' }, { status: 400 });
      }

      // Não apagamos nada. Apenas inserimos.
      // Garante que todas as contas existem para não quebrar FK.
      const ids = [...new Set(movs.map(m => String(m.idconta)))];
      for (const id of ids) {
        await sql`
          INSERT INTO contas (idconta, nome)
          VALUES (${id}, ${'Conta ' + id})
          ON CONFLICT (idconta) DO NOTHING
        `;
      }

      // Inserir todas as linhas com empresa_id
      for (const m of movs) {
        await sql`
          INSERT INTO movimentacoes
            (idconta, mes, ano, debito, credito, idcentrocusto, centrocusto_nome, centrocusto_codigo, empresa_id)
          VALUES
            (${String(m.idconta)},
             ${mes},
             ${ano},
             ${Number(m.debito || 0)},
             ${Number(m.credito || 0)},
             ${m.idcentrocusto == null ? null : toInt(m.idcentrocusto)},
             ${m.centroCustoNome ?? m.centrocusto_nome ?? null},
             ${m.centroCustoCodigo ?? m.centrocusto_codigo ?? null},
             ${empresa})
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

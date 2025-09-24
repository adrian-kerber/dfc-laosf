// /api/movimentacoes.js
import { neon } from '@neondatabase/serverless';
export const config = { runtime: 'edge' };

const sql = neon(process.env.DATABASE_URL);

async function ensureTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS contas (
      idconta VARCHAR(50) PRIMARY KEY,
      nome    VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS movimentacoes (
      idmov SERIAL PRIMARY KEY,
      idconta VARCHAR(50) REFERENCES contas(idconta) ON DELETE CASCADE,
      mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
      ano INTEGER NOT NULL,
      debito DECIMAL(15,2) DEFAULT 0,
      credito DECIMAL(15,2) DEFAULT 0,
      idcentrocusto INTEGER,
      centrocusto_nome VARCHAR(255),
      centrocusto_codigo VARCHAR(50),
      empresa VARCHAR(10),         -- "1" ou "7"
      conta_nome VARCHAR(255),     -- nome capturado do Excel
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Best-effort para adicionar colunas caso a tabela já exista sem elas
  try { await sql`ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS empresa VARCHAR(10)`; } catch {}
  try { await sql`ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS conta_nome VARCHAR(255)`; } catch {}
}

const toInt = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

export default async function handler(req) {
  try {
    await ensureTables();

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const mes     = url.searchParams.get('mes');           // 1..12 ou null
      const ano     = url.searchParams.get('ano');           // ano ou null
      const cc      = url.searchParams.get('cc');            // idcentrocusto ou null
      const empresa = url.searchParams.get('emp');           // "1"/"7" ou null

      // Normalize and only add SQL fragments when converted values are valid.
// Convert to ints once
const anoInt = toInt(ano);
const mesInt = toInt(mes);
const ccInt  = toInt(cc);

const where = [];
if (anoInt !== null) where.push(sql`m.ano = ${anoInt}`);
if (mesInt !== null) where.push(sql`m.mes = ${mesInt}`);
// ccInt can be null -> don't add condition; if client wants "all", it should send null
if (ccInt !== null) where.push(sql`m.idcentrocusto = ${ccInt}`);

// Empresa is a string identifier ("1" or "7"). Add only if present and not 'all'
if (empresa && empresa !== 'all') where.push(sql`m.empresa = ${String(empresa)}`);


      const cond = where.length
        ? sql`WHERE ${where.reduce((acc, w, i) => i ? sql`${acc} AND ${w}` : w)}`
        : sql``;

      const rows = await sql`
        SELECT
          m.*,
          COALESCE(m.conta_nome, c.nome) AS nome,  -- preferimos o nome do Excel daquela linha
          c.idconta AS codigo
        FROM movimentacoes m
        LEFT JOIN contas c ON c.idconta = m.idconta
        ${cond}
        ORDER BY c.idconta, m.ano, m.mes, m.idmov
      `;
      return Response.json(rows ?? [], { status: 200 });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const mes     = toInt(body.mes);
      const ano     = toInt(body.ano);
      const empresa = String(body.empresa ?? body.company ?? '').trim() || null;
      const movs    = Array.isArray(body.movimentacoes) ? body.movimentacoes : [];

      if (!mes || !ano) {
        return Response.json({ error: 'mes/ano inválidos' }, { status: 400 });
      }

      // Garante contas (insert-only)
      const ids = [...new Set(movs.map(m => String(m.idconta)))];
      for (const id of ids) {
        await sql`
          INSERT INTO contas (idconta, nome)
          VALUES (${id}, ${'Conta ' + id})
          ON CONFLICT (idconta) DO NOTHING
        `;
      }

      for (const m of movs) {
        await sql`
          INSERT INTO movimentacoes
            (idconta, mes, ano, debito, credito,
             idcentrocusto, centrocusto_nome, centrocusto_codigo,
             empresa, conta_nome)
          VALUES
            (${String(m.idconta)},
             ${mes}, ${ano},
             ${Number(m.debito || 0)}, ${Number(m.credito || 0)},
             ${m.idcentrocusto == null ? null : toInt(m.idcentrocusto)},
             ${m.centroCustoNome ?? m.centrocusto_nome ?? null},
             ${m.centroCustoCodigo ?? m.centrocusto_codigo ?? null},
             ${empresa},
             ${m.conta_nome ?? m.descricao ?? null})
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

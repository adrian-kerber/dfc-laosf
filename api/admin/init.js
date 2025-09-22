// /api/admin/init.js
// ⚠️ Roda no servidor. Cria as tabelas se não existirem.
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  try {
    // contas
    await sql`CREATE TABLE IF NOT EXISTS contas (
      idconta VARCHAR(50) PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;

    // agrupadores
    await sql`CREATE TABLE IF NOT EXISTS agrupadores (
      idagrupador SERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;

    // movimentacoes (já com campos de centro de custo)
    await sql`CREATE TABLE IF NOT EXISTS movimentacoes (
      idmov SERIAL PRIMARY KEY,
      idconta VARCHAR(50) REFERENCES contas(idconta) ON DELETE CASCADE,
      mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
      ano INTEGER NOT NULL,
      debito DECIMAL(15,2) DEFAULT 0,
      credito DECIMAL(15,2) DEFAULT 0,
      idcentrocusto INTEGER NULL,
      centrocusto_nome TEXT NULL,
      centrocusto_codigo TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(idconta, mes, ano)
    )`;

    // relação agrupador-contas
    await sql`CREATE TABLE IF NOT EXISTS agrupador_contas (
      id SERIAL PRIMARY KEY,
      idagrupador INTEGER REFERENCES agrupadores(idagrupador) ON DELETE CASCADE,
      idconta VARCHAR(50) REFERENCES contas(idconta) ON DELETE CASCADE,
      mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
      ano INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(idagrupador, idconta, mes, ano)
    )`;

    // precos (soja/milho/suino por mês/ano)
    await sql`CREATE TABLE IF NOT EXISTS precos (
      id SERIAL PRIMARY KEY,
      tipo VARCHAR(20) NOT NULL,
      preco DECIMAL(10,2) NOT NULL,
      mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
      ano INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tipo, mes, ano)
    )`;

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
}

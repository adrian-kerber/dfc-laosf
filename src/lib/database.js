// /src/lib/database.js (CLIENTE) — NÃO usa neon aqui.
const j = (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };

export const db = {
  async getContas() {
    return fetch('/api/contas').then(j);
  },
  async upsertConta({ id, name }) {
    return fetch('/api/contas', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id, name })
    }).then(j);
  },
    async getMovimentacoes(mes = null, ano = null) {
    if (!sql) return [];
    try {
      let rows;
      if (mes !== null && ano !== null) {
        rows = await sql`
          SELECT m.*, c.nome, c.idconta as codigo
          FROM movimentacoes m
          JOIN contas c ON m.idconta = c.idconta
          WHERE m.mes = ${mes} AND m.ano = ${ano}
          ORDER BY c.idconta
        `;
      } else if (ano !== null) {
        rows = await sql`
          SELECT m.*, c.nome, c.idconta as codigo
          FROM movimentacoes m
          JOIN contas c ON m.idconta = c.idconta
          WHERE m.ano = ${ano}
          ORDER BY c.idconta, m.mes
        `;
      } else {
        rows = await sql`
          SELECT m.*, c.nome, c.idconta as codigo
          FROM movimentacoes m
          JOIN contas c ON m.idconta = c.idconta
          ORDER BY c.idconta, m.ano, m.mes
        `;
      }
      // rows tem: idconta, mes, ano, debito, credito, idcentrocusto, centrocusto_nome, centrocusto_codigo
      return rows || [];
    } catch (error) {
      console.error('Error fetching movimentacoes:', error);
      return [];
    }
  },

    async saveMovimentacoes(movimentacoes, mes, ano) {
    if (!sql) throw new Error('Database not configured');
    try {
      await sql`DELETE FROM movimentacoes WHERE mes = ${mes} AND ano = ${ano}`;
      if (movimentacoes.length > 0) {
        // faz insert um-a-um pra ficar simples (poucos registros por upload)
        for (const mov of movimentacoes) {
          await sql`
            INSERT INTO movimentacoes 
              (idconta, mes, ano, debito, credito, idcentrocusto, centrocusto_nome, centrocusto_codigo)
            VALUES 
              (${mov.idconta}, ${mes}, ${ano}, ${mov.debito || 0}, ${mov.credito || 0},
               ${mov.idcentrocusto ?? null}, ${mov.centrocusto_nome ?? null}, ${mov.centrocusto_codigo ?? null})
          `;
        }
      }
      return { ok: true, inserted: movimentacoes.length };
    } catch (error) {
      console.error('Error saving movimentacoes:', error);
      throw error;
    }
  },

  async getAgrupadores() {
    return fetch('/api/agrupadores').then(j);
  },
  async getAgrupadorContas(mes, ano) {
    const qs = new URLSearchParams({ mes, ano });
    return fetch(`/api/agrupadores/contas?${qs}`).then(j);
  },
  async saveAgrupadorContas(associations, mes, ano) {
    return fetch('/api/agrupadores/contas', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ associations, mes, ano })
    }).then(j);
  },
  async savePreco(tipo, preco, mes, ano) {
    return fetch('/api/precos', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ tipo, preco, mes, ano })
    }).then(j);
  },
  async getPrecos(mes, ano) {
    const qs = new URLSearchParams(); if(mes) qs.set('mes', mes); if(ano) qs.set('ano', ano);
    return fetch(`/api/precos?${qs}`).then(j);
  },
  async clearAllData() {
    // se precisar, cria rota admin/clear; evite fazer do client em prod
    throw new Error('Implement admin clear route server-side');
  },
  async getAvailablePeriods() {
    // crie rota se precisar
    return [];
  },
    async upsertCentroCusto({ codigo, nome }) {
    if (!sql) throw new Error('Database not configured');
    // aceita codigo null/undefined -> nesse caso só cria pelo nome (sem unique), mas recomendo ter codigo
    const rows = await sql`
      INSERT INTO centros_custo (codigo, nome)
      VALUES (${codigo ?? null}, ${nome})
      ON CONFLICT (codigo) DO UPDATE SET nome = ${nome}
      RETURNING *
    `;
    return rows?.[0];
  },

  async getCentrosCusto() {
    if (!sql) return [];
    const rows = await sql`SELECT * FROM centros_custo ORDER BY nome`;
    return rows || [];
  },
  async syncAgrupadorToAllMonths(){ /* opcional: mover p/ server se usar */ },
};

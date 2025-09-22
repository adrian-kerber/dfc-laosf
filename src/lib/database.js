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
  async getMovimentacoes(mes, ano) {
    const qs = new URLSearchParams();
    if (mes != null) qs.set('mes', mes);
    if (ano != null) qs.set('ano', ano);
    return fetch(`/api/movimentacoes?${qs}`).then(j);
  },
  async saveMovimentacoes(movimentacoes, mes, ano) {
    return fetch('/api/movimentacoes', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ movimentacoes, mes, ano })
    }).then(j);
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
    // idem: crie rota /api/centros (opcional)
    return null;
  },
  async syncAgrupadorToAllMonths(){ /* opcional: mover p/ server se usar */ },
};

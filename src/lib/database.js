const j = (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };

export const db = {
  // Contas
  getContas() {
    return fetch('/api/contas').then(j);
  },
  upsertConta({ id, name }) {
    return fetch('/api/contas', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id, name })
    }).then(j);
  },

  // Movimentações
  getMovimentacoes(mes = null, ano = null, centro = null) {
    const qs = new URLSearchParams();
    if (ano != null) qs.set('ano', ano);
    if (mes != null) qs.set('mes', mes);
    if (centro != null) qs.set('centro', centro); // 'all' ou id
    const url = qs.toString() ? `/api/movimentacoes?${qs}` : '/api/movimentacoes';
    return fetch(url).then(j);
  },
  saveMovimentacoes(movimentacoes, mes, ano) {
    return fetch('/api/movimentacoes', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ movimentacoes, mes, ano })
    }).then(j);
  },

  // Agrupadores (globais)
  getAgrupadores() {
    return fetch('/api/agrupadores').then(j);
  },
  createAgrupador(nome) {
    return fetch('/api/agrupadores', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ nome })
    }).then(j);
  },
  renameAgrupador(id, nome) {
    return fetch('/api/agrupadores', {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id, nome })
    }).then(j);
  },

  // Mapeamento global Conta→Agrupador
  getAgrupadorContas() {
    return fetch('/api/agrupadores/contas').then(j);
  },
  saveAgrupadorContas(associations) {
    // associations: [{ idconta, idagrupador|null }, ...]
    const payload = {
      associations: associations.map(a => ({
        idconta: String(a.idconta),
        idagrupador: a.idagrupador == null ? null : Number(a.idagrupador),
      })),
    };
    return fetch('/api/agrupadores/contas', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    }).then(j);
  },

  // Centros de custo
  getCentrosCusto() {
    return fetch('/api/centros-custo').then(j);
  },
  upsertCentroCusto({ codigo, nome }) {
    return fetch('/api/centros-custo', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ codigo, nome })
    }).then(j);
  },

  // Admin
  clearAllData() {
    return fetch('/api/admin/clear', { method:'POST' }).then(j);
  },
};

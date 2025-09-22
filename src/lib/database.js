// /src/lib/database.js
const j = (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };

export const db = {
  // Contas
  getContas() {
    return fetch('/api/contas').then(j);
  },
  upsertConta({ id, name }) {
    return fetch('/api/contas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name })
    }).then(j);
  },

  // Movimentações
  getMovimentacoes(mes = null, ano = null) {
    const qs = new URLSearchParams();
    if (mes != null) qs.set('mes', mes);
    if (ano != null) qs.set('ano', ano);
    const url = qs.toString() ? `/api/movimentacoes?${qs}` : '/api/movimentacoes';
    return fetch(url).then(j);
  },
  saveMovimentacoes(movimentacoes, mes, ano) {
    return fetch('/api/movimentacoes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movimentacoes, mes, ano })
    }).then(j);
  },

  // Agrupadores
  getAgrupadores() {
    return fetch('/api/agrupadores').then(j);
  },
  createAgrupador(nome) {
    return fetch('/api/agrupadores', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome })
    }).then(j);
  },
  renameAgrupador(id, nome) {
    return fetch('/api/agrupadores', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, nome })
    }).then(j);
  },
  deleteAgrupador(id) {
    const qs = new URLSearchParams({ id });
    return fetch(`/api/agrupadores?${qs}`, { method: 'DELETE' }).then(j);
  },

  // Ligações Agrupador-Contas
  getAgrupadorContas(mes, ano) {
    const qs = new URLSearchParams();
    if (mes != null) qs.set('mes', mes);
    if (ano != null) qs.set('ano', ano);
    return fetch(`/api/agrupadores/contas?${qs}`).then(j);
  },
  saveAgrupadorContas(associations, mes, ano) {
    // Garanta que idagrupador é NUMÉRICO aqui
    const payload = {
      associations: associations.map(a => ({
        idagrupador: Number(a.idagrupador),
        idconta: String(a.idconta)
      })),
      mes, ano
    };
    return fetch('/api/agrupadores/contas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(j);
  },

  // Centros de custo
  getCentrosCusto() {
    return fetch('/api/centros-custo').then(j);
  },
  upsertCentroCusto({ codigo, nome }) {
    return fetch('/api/centros-custo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, nome })
    }).then(j);
  },

  // Limpeza (admin)
  clearAllData() {
    return fetch('/api/admin/clear', { method: 'POST' }).then(j);
  },
};

// /src/lib/database.js (CLIENTE) — só chama API, não usa sql aqui.
const j = (r) => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

export const db = {
  // =========================
  // CONTAS
  // =========================
  async getContas() {
    return fetch("/api/contas").then(j);
  },

  async upsertConta({ id, name }) {
    return fetch("/api/contas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name }),
    }).then(j);
  },

  // =========================
  // MOVIMENTAÇÕES
  // =========================
  async getMovimentacoes(mes = null, ano = null, idcentrocusto = null) {
    const qs = new URLSearchParams();
    if (mes) qs.set("mes", mes);
    if (ano) qs.set("ano", ano);
    if (idcentrocusto) qs.set("idcentrocusto", idcentrocusto);
    return fetch(`/api/movimentacoes?${qs}`).then(j);
  },

  async saveMovimentacoes(movimentacoes, mes, ano) {
    return fetch("/api/movimentacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movimentacoes, mes, ano }),
    }).then(j);
  },

  // =========================
  // AGRUPADORES
  // =========================
  async getAgrupadores() {
    return fetch("/api/agrupadores").then(j);
  },

  async getAgrupadorContas(mes, ano) {
    const qs = new URLSearchParams({ mes, ano });
    return fetch(`/api/agrupadores/contas?${qs}`).then(j);
  },

  async saveAgrupadorContas(associations, mes, ano) {
    return fetch("/api/agrupadores/contas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ associations, mes, ano }),
    }).then(j);
  },

  // =========================
  // PREÇOS
  // =========================
  async savePreco(tipo, preco, mes, ano) {
    return fetch("/api/precos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, preco, mes, ano }),
    }).then(j);
  },

  async getPrecos(mes, ano) {
    const qs = new URLSearchParams();
    if (mes) qs.set("mes", mes);
    if (ano) qs.set("ano", ano);
    return fetch(`/api/precos?${qs}`).then(j);
  },

  // =========================
  // CENTROS DE CUSTO
  // =========================
  async upsertCentroCusto({ codigo, nome }) {
    return fetch("/api/centros-custo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo, nome }),
    }).then(j);
  },

  async getCentrosCusto() {
    return fetch("/api/centros-custo").then(j);
  },

  // =========================
  // ADMIN / LIMPEZA
  // =========================
 async clearAllData() {
  return fetch('/api/admin/clear', { method: 'POST' }).then(j);
},

  async getAvailablePeriods() {
    // idem — rota /api/periods
    return [];
  },

  async syncAgrupadorToAllMonths() {
    // opcional: mover p/ server
  },
};

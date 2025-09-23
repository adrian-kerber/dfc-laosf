// /src/lib/database.js
// Cliente: só chama as rotas /api via fetch. Nada de neon aqui.
const j = (r) => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

export const db = {
  // ---------------- Contas ----------------
  getContas() {
    return fetch('/api/contas').then(j);
  },

  upsertConta({ id, name }) {
    return fetch('/api/contas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name }),
    }).then(j);
  },

  // ---------------- Movimentações ----------------
  /**
   * Lê movimentações. Filtros:
   * - mes: 1..12 ou null (null => todos os meses)
   * - ano: número ou null (null => todos os anos)
   * - cc: id do centro de custo ou null (null => todos)
   * - empresa: "1" | "7" | "all" | null (null => ambas)
   */
  getMovimentacoes(mes = null, ano = null, cc = null, empresa = null) {
    const qs = new URLSearchParams();
    if (ano != null) qs.set('ano', ano);
    if (mes != null) qs.set('mes', mes);
    if (cc  != null) qs.set('centro', cc);     // <- API espera 'centro'
    if (empresa != null) qs.set('empresa', empresa); // <- "1" | "7" | "all"
    const url = qs.toString() ? `/api/movimentacoes?${qs}` : '/api/movimentacoes';
    return fetch(url).then(j);
  },

  /**
   * Insere lote de movimentações (NÃO apaga nada; o servidor só dá INSERT).
   * movimentacoes: [{ idconta, debito, credito, idcentrocusto?, centrocusto_nome?, centrocusto_codigo? }, ...]
   * mes, ano: números
   * empresa: "1" | "7"
   */
  saveMovimentacoes(movimentacoes, mes, ano, empresa) {
    return fetch('/api/movimentacoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movimentacoes, mes, ano, empresa }),
    }).then(j);
  },

  // ---------------- Agrupadores (globais) ----------------
  getAgrupadores() {
    return fetch('/api/agrupadores').then(j);
  },

  createAgrupador(nome) {
    return fetch('/api/agrupadores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome }),
    }).then(j);
  },

  renameAgrupador(id, nome) {
    return fetch('/api/agrupadores', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, nome }),
    }).then(j);
  },

  /**
   * Mapeamento global Conta→Agrupador (sem mês/ano/empresa).
   * Retorna algo como [{ idconta, idagrupador }, ...]
   */
  getAgrupadorContas() {
    return fetch('/api/agrupadores/contas').then(j);
  },

  /**
   * Salva TODO o mapeamento atual (substitui o que existe no server).
   * associations: [{ idconta: string, idagrupador: number|null }, ...]
   * - idagrupador null => remove vínculo (vai para "Sem agrupador")
   */
  saveAgrupadorContas(associations) {
    const payload = {
      associations: associations.map((a) => ({
        idconta: String(a.idconta),
        idagrupador: a.idagrupador == null ? null : Number(a.idagrupador),
      })),
    };
    return fetch('/api/agrupadores/contas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(j);
  },

  // ---------------- Centros de Custo ----------------
  getCentrosCusto() {
    return fetch('/api/centros-custo').then(j);
  },

  upsertCentroCusto({ codigo, nome }) {
    return fetch('/api/centros-custo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, nome }),
    }).then(j);
  },

  // ---------------- Admin / util ----------------
  clearAllData() {
    return fetch('/api/admin/clear', { method: 'POST' }).then(j);
  },

  // opcional: evita erro em telas que chamam
  getAvailablePeriods() {
    return Promise.resolve([]);
  },

  // no-op para compat se alguém chamar
  syncAgrupadorToAllMonths() {
    return Promise.resolve({ ok: true });
  },
};

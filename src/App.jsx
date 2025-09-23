// App.jsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import AggregatorConfig from "./components/AggregatorConfig";
import MonthYearSelector from "./components/MonthYearSelector";
import DataManager from "./components/DataManager";
import PriceManager from "./components/PriceManager";
import { db } from "./lib/database";
import "./App.css";

/**
 * Regras:
 * - Agrupadores e mapeamentos (conta -> agrupador) são GLOBAIS.
 * - Movimentações são por período; cada import INSERE (sem upsert e sem delete).
 * - Empresa: filtro nos relatórios/grupos (all/1/7) e empresa do arquivo no import (company).
 */

const COMPANIES = [
  { id: "1", name: "LUIZ ANTONIO ORTOLLAN SALLES" },
  { id: "7", name: "JORGE AUGUSTO SALLES E OUTRO" },
];

const TABS = [
  { id: "reports", label: "Relatórios" },
  { id: "groups", label: "Agrupadores" },
  { id: "import", label: "Importar" },
];

const ALL = "all";
const LS_COMPANY = "dfc-laosf:company";
const LS_FILTERS = "dfc-laosf:filters";

const MONTHS_PT = [
  "janeiro","fevereiro","março","abril","maio","junho",
  "julho","agosto","setembro","outubro","novembro","dezembro"
];

const readSavedFilters = () => {
  try { const raw = localStorage.getItem(LS_FILTERS); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
};

export default function App() {
  // Empresa usada no IMPORT (salva junto nas movimentações)
  const [company, setCompany] = useState(() => localStorage.getItem(LS_COMPANY) || COMPANIES[0].id);
  const [activeView, setActiveView] = useState("reports");

  // Período do upload
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Filtros globais (relatórios/grupos)
  const saved = readSavedFilters();
  const [currentMonth, setCurrentMonth] = useState(saved?.month ?? new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(saved?.year ?? new Date().getFullYear());
  const [currentCostCenter, setCurrentCostCenter] = useState(saved?.costCenter ?? ALL);
  const [companyFilter, setCompanyFilter] = useState(saved?.companyFilter ?? ALL); // "all" | "1" | "7"

  // Catálogo de CC
  const [costCenters, setCostCenters] = useState([]);

  // Dados
  const [aggregators, setAggregators] = useState({
    unassigned: { id: "unassigned", title: "Sem agrupador", accountIds: [] },
  });
  const [accounts, setAccounts] = useState({}); // { [id]: { id, name, valor, sign } }

  // UI
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [unit, setUnit] = useState("reais");
  const [currentPrices, setCurrentPrices] = useState({});
  const [reportFilters, setReportFilters] = useState({
    viewMode: "specific",
    month: saved?.month ?? currentMonth,
    year: saved?.year ?? currentYear,
    costCenter: saved?.costCenter ?? currentCostCenter,
    companyFilter: saved?.companyFilter ?? companyFilter,
  });

  const fileInputRef = useRef(null);

  // Helpers
  const parseBRNumber = (val) => {
    if (val == null) return 0;
    if (typeof val === "number" && Number.isFinite(val)) return val;
    const s = String(val).trim();
    if (!s) return 0;
    const n = parseFloat(s.replace(/\s+/g, "").replace(/\./g, "").replace(/,/g, "."));
    return Number.isFinite(n) ? n : 0;
  };
  const norm = (x) => String(x || "").toLowerCase().replace(/\s+/g, " ").trim();
  const findCol = (headerRow, candidates) => {
    const H = headerRow.map(norm);
    for (let i = 0; i < H.length; i++) {
      const cell = H[i]; if (!cell) continue;
      if (candidates.some((c) => cell.includes(c))) return i;
    }
    return -1;
  };
  const extractCostCenter = (rows) => {
    const MAX = Math.min(rows.length, 30);
    for (let i = 0; i < MAX; i++) {
      const row = rows[i] || [];
      for (let j = 0; j < row.length; j++) {
        const cell = norm(row[j]);
        if (!cell) continue;
        if (cell.includes("centro de custo")) {
          const raw = [row[j + 1], row[j + 2], row[j + 3]]
            .filter((x) => String(x || "").trim())
            .map((x) => String(x).trim())
            .join(" ")
            .trim();
          if (!raw) return null;
          let id = null, nome = raw;
          const m = raw.match(/^(\d+)\s*[-–—:]?\s*(.+)$/);
          if (m) { id = m[1].trim(); nome = m[2].trim(); }
          return { id: id || null, nome };
        }
      }
    }
    return null;
  };

  // Carregar dados (aplica filtros globais)
  const loadMonthData = useCallback(async () => {
    try {
      setLoading(true);

      // 1) CC
      try {
        const ccs = await db.getCentrosCusto?.();
        if (Array.isArray(ccs)) setCostCenters(ccs);
      } catch (e) { console.warn("getCentrosCusto indisponível:", e?.message || e); }

      // 2) Contas (catálogo base)
      const contas = await db.getContas();
      const contasMap = {};
      contas.forEach((c) => {
        contasMap[c.idconta] = { id: c.idconta, name: c.nome, valor: 0, sign: "+" };
      });

      // 3) Movimentações filtradas (mês pode ser null; CC null; empresa null)
      const monthParam = reportFilters.month === ALL ? null : Number(currentMonth);
      const yearParam = Number(currentYear);
      const centroParam = currentCostCenter === ALL ? null : currentCostCenter;
      const empresaParam = companyFilter === ALL ? null : companyFilter;

      const movs = await db.getMovimentacoes(monthParam, yearParam, centroParam, empresaParam);

      // 4) Atualiza nomes a partir do JOIN (se houver) e acumula valores
      Object.values(contasMap).forEach((c) => { c.valor = 0; c.sign = "+"; });

      movs.forEach((m) => {
        if (!contasMap[m.idconta]) {
          // Conta ainda não estava no catálogo (garantia extra)
          contasMap[m.idconta] = { id: m.idconta, name: m.nome || `Conta ${m.idconta}`, valor: 0, sign: "+" };
        } else if (m.nome) {
          // **AQUI** garantimos que o nome exibido é o nome real vindo do banco
          contasMap[m.idconta].name = m.nome;
        }

        const delta = (Number(m.credito) || 0) - (Number(m.debito) || 0);
        const atual = (contasMap[m.idconta].sign === "+" ? 1 : -1) * contasMap[m.idconta].valor;
        const novo = atual + delta;
        contasMap[m.idconta].valor = Math.abs(novo);
        contasMap[m.idconta].sign = novo >= 0 ? "+" : "-";
      });

      // 5) Agrupadores (globais)
      const grupos = await db.getAgrupadores();
      const gruposMap = { unassigned: { id: "unassigned", title: "Sem agrupador", accountIds: [] } };
      grupos.forEach((g) => {
        gruposMap[String(g.idagrupador)] = { id: String(g.idagrupador), title: g.nome, accountIds: [] };
      });

      // 6) Ligações Conta→Agrupador
      const liga = await db.getAgrupadorContas();
      liga.forEach((a) => {
        const gid = String(a.idagrupador);
        if (gruposMap[gid] && contasMap[a.idconta]) gruposMap[gid].accountIds.push(a.idconta);
      });

      // 7) Sem agrupador
      const assigned = new Set(
        Object.values(gruposMap).filter((g) => g.id !== "unassigned").flatMap((g) => g.accountIds || [])
      );
      gruposMap.unassigned.accountIds = Object.keys(contasMap).filter((id) => !assigned.has(id));

      setAccounts(contasMap);
      setAggregators(gruposMap);
    } catch (e) {
      console.error("Erro ao carregar dados:", e);
    } finally {
      setLoading(false);
    }
  }, [currentMonth, currentYear, currentCostCenter, reportFilters.month, companyFilter]);

  useEffect(() => { loadMonthData(); }, [loadMonthData]);

  // Persistência
  useEffect(() => { localStorage.setItem(LS_COMPANY, company); }, [company]);
  useEffect(() => {
    localStorage.setItem(
      LS_FILTERS,
      JSON.stringify({
        month: reportFilters.month,
        year: reportFilters.year,
        costCenter: reportFilters.costCenter,
        companyFilter,
      })
    );
  }, [reportFilters.month, reportFilters.year, reportFilters.costCenter, companyFilter]);

  // Salvar mapeamento global conta→agrupador
  const handleSaveGroups = async () => {
    try {
      const associations = [];
      Object.values(aggregators).forEach((agg) => {
        if (agg.id === "unassigned") return;
        (agg.accountIds || []).forEach((accountId) => {
          associations.push({ idconta: String(accountId), idagrupador: Number(agg.id) });
        });
      });
      const mapped = new Set(associations.map((a) => a.idconta));
      const unassignedItems = Object.keys(accounts)
        .filter((id) => !mapped.has(id))
        .map((id) => ({ idconta: String(id), idagrupador: null }));

      await db.saveAgrupadorContas([...associations, ...unassignedItems]);
      alert("Mapeamento de contas salvo (global).");
    } catch (e) {
      console.error(e);
      alert("Erro ao salvar agrupadores: " + e.message);
    }
  };

  // Trocar sinal de uma conta (visual)
  const toggleAccountSign = (id) => {
    setAccounts((prev) => {
      const a = prev[id]; if (!a) return prev;
      const novo = { ...prev, [id]: { ...a, sign: a.sign === "+" ? "-" : "+", } };
      return novo;
    });
  };

  // DnD
  const onDragEnd = ({ source, destination, draggableId }) => {
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const start = aggregators[source.droppableId];
    const finish = aggregators[destination.droppableId];

    const newStart = Array.from(start.accountIds || []);
    newStart.splice(source.index, 1);
    const newFinish = Array.from(finish.accountIds || []);
    newFinish.splice(destination.index, 0, draggableId);

    setAggregators((prev) => ({
      ...prev,
      [start.id]: { ...start, accountIds: newStart },
      [finish.id]: { ...finish, accountIds: newFinish },
    }));
  };

  // Importação (insere)
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!selectedMonth || !selectedYear) {
      alert("Selecione o mês e ano antes de importar o arquivo.");
      return;
    }
    setLoading(true);

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      if (!rows.length) return alert("Planilha vazia.");

      // 1) CC
      const centro = extractCostCenter(rows);
      let idCC = null;
      if (centro) {
        try {
          const savedCC = await db.upsertCentroCusto?.({ codigo: centro.id, nome: centro.nome });
          idCC = savedCC?.idcentrocusto ?? null;
        } catch (e1) { console.warn("upsertCentroCusto falhou:", e1?.message || e1); }
      }

      // 2) cabeçalho
      let headerIdx = -1;
      for (let i = 0; i < Math.min(rows.length, 60); i++) {
        const r = rows[i].map(norm);
        const hasDeb = r.some((c) => c.includes("débito") || c.includes("debito"));
        const hasCred = r.some((c) => c.includes("crédito") || c.includes("credito"));
        const hasConta = r.some((c) => c.includes("conta"));
        const hasCodigo = r.some((c) => c.includes("código") || c.includes("codigo"));
        const hasDesc = r.some((c) => c.includes("descrição") || c.includes("descricao"));
        if (hasDeb && hasCred && (hasConta || hasCodigo) && hasDesc) { headerIdx = i; break; }
      }
      if (headerIdx === -1) return alert("Não encontrei cabeçalhos (Conta/Código/Descrição/Débito/Crédito).");

      const header = rows[headerIdx];
      const colCodigo = findCol(header, ["código","codigo"]);
      const colDescricao = findCol(header, ["descrição","descricao"]);
      const colDeb = findCol(header, ["débito","debito"]);
      const colCred = findCol(header, ["crédito","credito"]);
      if (colDeb === -1 || colCred === -1) return alert("Colunas de Débito/Crédito não encontradas.");

      // 3) lote
      const newAccounts = {};
      const movimentacoes = [];

      for (let r = headerIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        // ... dentro do loop de linhas no handleFile
const codigoRaw = colCodigo !== -1 ? String(row[colCodigo] || "").trim() : "";
if (!codigoRaw || !/^\d+$/.test(codigoRaw)) continue;

const id = codigoRaw;

// Pega a DESCRIÇÃO da planilha (se não houver, cai num fallback)
const descricaoPlanilha = colDescricao !== -1
  ? String(row[colDescricao] || "").trim()
  : "";

// garante catálogo de contas (tentamos usar a descrição da planilha)
let idconta = id;
let nomeConta = descricaoPlanilha || `Conta ${id}`;
try {
  const conta = await db.upsertConta({ id, name: nomeConta });
  idconta = conta?.idconta ?? id;
  // se o backend retornar o nome, preferimos ele
  if (conta?.nome) nomeConta = conta.nome;
} catch (e2) {
  console.warn("upsertConta falhou:", e2?.message || e2);
}

// movimentação…
movimentacoes.push({
  idconta,
  mes: selectedMonth,
  ano: selectedYear,
  debito: deb,
  credito: cred,
  idcentrocusto: idCC,
  centrocusto_nome: centro?.nome ?? null,
  centrocusto_codigo: centro?.id ?? null,
});

// valor para feedback pós-import
const val = cred - deb;
newAccounts[idconta] = {
  id: idconta,
  name: nomeConta,       // <- usa o nome correto
  valor: Math.abs(val),
  sign: val >= 0 ? "+" : "-",
};

      }

      // 4) grava (INSERE) + empresa do import
      await db.saveMovimentacoes(movimentacoes, selectedMonth, selectedYear, company);

      // 5) UI rápida
      setAccounts(newAccounts);
      setAggregators({
        unassigned: { id: "unassigned", title: "Sem agrupador", accountIds: Object.keys(newAccounts) },
      });

      // 6) alinhar filtros
      setCurrentMonth(selectedMonth);
      setCurrentYear(selectedYear);
      setReportFilters((p) => ({ ...p, month: selectedMonth, year: selectedYear }));
      if (idCC) {
        setCurrentCostCenter(String(idCC));
        setReportFilters((p) => ({ ...p, costCenter: String(idCC) }));
      }

      alert(
        `Importadas ${Object.keys(newAccounts).length} contas para ${selectedMonth}/${selectedYear}` +
        `${centro ? ` (CC: ${centro.id ? centro.id + " - " : ""}${centro.nome})` : ""}` +
        ` (Empresa: ${company}).`
      );
      setActiveView("reports");
    } catch (err) {
      console.error("Erro ao importar:", err);
      alert("Erro ao importar dados: " + err.message);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const formatValue = (value) =>
    `R$ ${Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  return (
    <div className="container">
      <div className="sidebar">
        <h1>DFC Enhanced</h1>

        {/* Empresa do arquivo (IMPORT) */}
        <h2>Empresa (Importação)</h2>
        <select value={company} onChange={(e) => setCompany(e.target.value)}>
          {COMPANIES.map((c) => (
            <option key={c.id} value={c.id}>{c.id} - {c.name}</option>
          ))}
        </select>

        {/* Abas */}
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`tab-btn ${activeView === t.id ? "active" : ""}`}
              onClick={() => setActiveView(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Filtros globais */}
        <h2>Filtros do Relatório</h2>

        <label className="label">Mês</label>
        <select
          value={String(reportFilters.month)}
          onChange={(e) => {
            const v = e.target.value === "all" ? ALL : Number(e.target.value);
            setReportFilters((p) => ({ ...p, month: v }));
            if (v !== ALL) setCurrentMonth(v);
          }}
        >
          <option value="all">Todos os meses</option>
          {MONTHS_PT.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>

        <label className="label" style={{ marginTop: 8 }}>Ano</label>
        <select
          value={reportFilters.year}
          onChange={(e) => {
            const y = Number(e.target.value);
            setReportFilters((p) => ({ ...p, year: y }));
            setCurrentYear(y);
          }}
        >
          {Array.from({ length: 10 }, (_, k) => new Date().getFullYear() - 5 + k)
            .map((y) => <option key={y} value={y}>{y}</option>)}
        </select>

        <label className="label" style={{ marginTop: 8 }}>Centro de Custo</label>
        <select
          value={String(reportFilters.costCenter)}
          onChange={(e) => {
            const cc = e.target.value === "all" ? ALL : e.target.value;
            setReportFilters((p) => ({ ...p, costCenter: cc }));
            setCurrentCostCenter(cc);
          }}
        >
          <option value="all">Todos os Centros</option>
          {costCenters.map((cc) => (
            <option key={cc.idcentrocusto} value={cc.idcentrocusto}>
              {cc.codigo ? `${cc.codigo} - ` : ""}{cc.nome}
            </option>
          ))}
        </select>

        <label className="label" style={{ marginTop: 8 }}>Empresa (Filtro)</label>
        <select
          value={String(companyFilter)}
          onChange={(e) => {
            const v = e.target.value; // "all" | "1" | "7"
            setCompanyFilter(v);
            setReportFilters((p) => ({ ...p, companyFilter: v }));
          }}
        >
          <option value="all">Todas as empresas</option>
          {COMPANIES.map((c) => (
            <option key={c.id} value={c.id}>{c.id} - {c.name}</option>
          ))}
        </select>

        <h2 style={{ marginTop: 12 }}>Unidade de Medida</h2>
        <select value={unit} onChange={(e) => setUnit(e.target.value)}>
          <option value="reais">Reais (R$)</option>
          <option value="soja">Sacas de Soja</option>
          <option value="milho">Sacas de Milho</option>
          <option value="suino">Kg de Suíno</option>
        </select>
        {unit !== "reais" && (
          <PriceManager
            selectedMonth={reportFilters.month === ALL ? null : currentMonth}
            selectedYear={currentYear}
            onPriceChange={setCurrentPrices}
          />
        )}

        {activeView === "import" && (
          <>
            <hr className="sidebar-sep" />
            <MonthYearSelector
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              onMonthChange={setSelectedMonth}
              onYearChange={setSelectedYear}
              label="Período para Importação"
            />
            <div className="file-upload">
              <h3>Importar Balancete</h3>
              <p>Período: {selectedMonth}/{selectedYear} — Empresa: {company}</p>
              <input ref={fileInputRef} type="file" accept=".xls,.xlsx" onChange={handleFile} />
              {loading && <span>Carregando...</span>}
            </div>
            <DataManager onDataChange={loadMonthData} />
          </>
        )}

        {activeView === "groups" && (
          <>
            <hr className="sidebar-sep" />
            <AggregatorConfig aggregators={aggregators} onChanged={loadMonthData} />
            <button onClick={handleSaveGroups} className="btn-save">Salvar agrupadores</button>
          </>
        )}
      </div>

      {/* Conteúdo principal */}
      {activeView === "reports" && (
        <div className="report-list-view">
          <h2>
            Relatório - {currentYear}
            {reportFilters.month === ALL
              ? " - Todos os meses"
              : ` - ${new Date(currentYear, currentMonth - 1).toLocaleString("pt-BR", { month: "long" })}`}
            {currentCostCenter === ALL
              ? " - Todos os Centros"
              : (() => {
                  const cc = costCenters.find((c) => String(c.idcentrocusto) === String(currentCostCenter));
                  return cc ? ` - CC: ${cc.codigo ? cc.codigo + " - " : ""}${cc.nome}` : "";
                })()}
            {" - Empresa: "}
            {companyFilter === ALL ? "Todas" : (() => {
              const c = COMPANIES.find((x) => x.id === companyFilter);
              return c ? `${c.id} - ${c.name}` : companyFilter;
            })()}
          </h2>

          <table className="report-table">
            <thead>
              <tr>
                <th>Agrupador</th>
                <th>Receita</th>
                <th>Despesas</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const aggs = Object.values(aggregators);
                let totalRec = 0, totalDesp = 0;

                return aggs
                  .map((col) => {
                    const ids = col.id === "unassigned"
                      ? Object.keys(accounts).filter((id) =>
                          aggs.filter((a) => a.id !== "unassigned").every((a) => !(a.accountIds || []).includes(id))
                        )
                      : (col.accountIds || []).filter((id) => accounts[id]);

                    const rec = ids.reduce((s, id) => s + (accounts[id]?.sign === "+" ? accounts[id].valor : 0), 0);
                    const desp = ids.reduce((s, id) => s + (accounts[id]?.sign === "-" ? accounts[id].valor : 0), 0);
                    const res = rec - desp;
                    totalRec += rec; totalDesp += desp;

                    return (
                      <React.Fragment key={col.id}>
                        <tr
                          className="report-header-row"
                          onClick={() => setExpanded((p) => ({ ...p, [col.id]: !p[col.id] }))}
                          style={{ cursor: "pointer" }}
                        >
                          <td>{col.title}</td>
                          <td style={{ color: "var(--accent)" }}>{formatValue(rec)}</td>
                          <td style={{ color: "var(--danger)" }}>{formatValue(-desp)}</td>
                          <td style={{ color: res < 0 ? "var(--danger)" : "var(--accent)" }}>
                            {formatValue(res)}
                          </td>
                        </tr>

                        {expanded[col.id] && ids.map((id) => {
                          const a = accounts[id];
                          if (!a) return null;
                          const recA = a.sign === "+" ? a.valor : 0;
                          const despA = a.sign === "-" ? a.valor : 0;
                          const resA = recA - despA;
                          return (
                            <tr key={id} className="report-account-row">
                              <td style={{ paddingLeft: 20 }}>
                                {/* Exibe SEMPRE o código + nome */}
                                {id} – {a.name}
                              </td>
                              <td style={{ color: "var(--accent)" }}>{formatValue(recA)}</td>
                              <td style={{ color: "var(--danger)" }}>{formatValue(-despA)}</td>
                              <td style={{ color: resA < 0 ? "var(--danger)" : "var(--accent)" }}>
                                {formatValue(resA)}
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })
                  .concat([(() => {
                    const totRes = totalRec - totalDesp;
                    return (
                      <tr key="totalizador" className="report-total-row" style={{ fontWeight: 600 }}>
                        <td>Totalizador</td>
                        <td style={{ color: "var(--accent)" }}>{formatValue(totalRec)}</td>
                        <td style={{ color: "var(--danger)" }}>{formatValue(-totalDesp)}</td>
                        <td style={{ color: totRes < 0 ? "var(--danger)" : "var(--accent)" }}>
                          {formatValue(totRes)}
                        </td>
                      </tr>
                    );
                  })()]);
              })()}
            </tbody>
          </table>
        </div>
      )}

      {activeView === "groups" && (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid">
            {Object.values(aggregators).map((col) => {
              const otherAssigned = Object.values(aggregators)
                .filter((a) => a.id !== "unassigned")
                .flatMap((a) => a.accountIds || []);
              const validIds =
                col.id === "unassigned"
                  ? Object.keys(accounts).filter((id) => !otherAssigned.includes(id))
                  : (col.accountIds || []).filter((id) => accounts[id]);

              const signedTotal = validIds.reduce(
                (sum, id) => sum + (accounts[id]?.sign === "+" ? accounts[id].valor : -accounts[id].valor),
                0
              );

              return (
                <Droppable key={col.id} droppableId={col.id}>
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="column">
                      <h2>{col.title}</h2>
                      {/* total com sinal correto */}
                      <div className="aggregator-total" style={{ color: signedTotal < 0 ? "var(--danger)" : "var(--accent)" }}>
                        Total: {formatValue(signedTotal)}
                      </div>

                      {validIds.map((acctId, i) => (
                        <Draggable key={acctId} draggableId={acctId} index={i}>
                          {(prov) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              {...prov.dragHandleProps}
                              className="card"
                            >
                              <div className="card-header">
                                {/* Exibe código + nome */}
                                <span className="description">{acctId} – {accounts[acctId]?.name}</span>
                                {/* Botão +/- para inverter sinal visual */}
                                <button className="sign-btn" onClick={() => toggleAccountSign(acctId)}>
                                  {accounts[acctId]?.sign === "+" ? "+" : "–"}
                                </button>
                              </div>
                              <div className="card-body" style={{ color: accounts[acctId]?.sign === "+" ? "var(--accent)" : "var(--danger)" }}>
                                Resultado: {formatValue(
                                  accounts[acctId]?.sign === "+" ? accounts[acctId].valor : -accounts[acctId].valor
                                )}
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              );
            })}
          </div>
        </DragDropContext>
      )}

      {activeView === "import" && (
        <div className="report-list-view">
          <h2>Importar balancete</h2>
          {loading && <p>Processando...</p>}
        </div>
      )}
    </div>
  );
}

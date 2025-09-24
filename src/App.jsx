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
 * App principal
 * - adiciona "categories" (categoria = agrupador de agrupadores)
 * - tenta usar db.getCategorias() / db.getCategoriaAgrupadores() / db.saveCategorias()
 *   se backend tiver suporte. Caso contrário, usa localStorage como fallback.
 *
 * Estilo do código: direto, comentado — você pediu que eu comente tudo.
 */

/* ===== Constantes e utilitários ===== */
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
const LS_CATEGORIES = "dfc-laosf:categories";

const MONTHS_PT = [
  "janeiro","fevereiro","março","abril","maio","junho",
  "julho","agosto","setembro","outubro","novembro","dezembro"
];

const readSavedFilters = () => {
  try { const raw = localStorage.getItem(LS_FILTERS); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
};

/* ===== Componente principal ===== */
export default function App() {
  /* Sidebar retrátil (default fechada) */
  const [sidebarOpen, setSidebarOpen] = useState(false);

  /* Empresa usada no IMPORT (salva junto nas movimentações) */
  const [company, setCompany] = useState(() => localStorage.getItem(LS_COMPANY) || COMPANIES[0].id);
  const [activeView, setActiveView] = useState("reports");

  /* Período do upload */
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  /* Filtros globais (relatórios/grupos) */
  const saved = readSavedFilters();
  const [currentMonth, setCurrentMonth] = useState(saved?.month ?? new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(saved?.year ?? new Date().getFullYear());
  const [currentCostCenter, setCurrentCostCenter] = useState(saved?.costCenter ?? ALL);
  const [companyFilter, setCompanyFilter] = useState(saved?.companyFilter ?? ALL); // "all" | "1" | "7"

  /* Catálogo de CC */
  const [costCenters, setCostCenters] = useState([]);

  /* Dados: agrupadores (aggs), contas, categorias */
  const [aggregators, setAggregators] = useState({
    unassigned: { id: "unassigned", title: "Sem agrupador", accountIds: [] },
  });
  const [accounts, setAccounts] = useState({}); // { [id]: { id, name, valor, sign } }

  /* Categorias (novo): objeto { [id]: { id, title, agrupadorIds: [] } } */
  const [categories, setCategories] = useState({
    uncategorized: { id: "uncategorized", title: "Sem categoria", agrupadorIds: [] },
  });

  /* UI */
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [unit, setUnit] = useState("reais");
  const [currentPrices, setCurrentPrices] = useState({});
  const [reportFilters, setReportFilters] = useState({
    viewMode: "specific",
    month: saved?.month ?? new Date().getMonth() + 1,
    year: saved?.year ?? new Date().getFullYear(),
    costCenter: saved?.costCenter ?? ALL,
    companyFilter: saved?.companyFilter ?? ALL,
  });

  const fileInputRef = useRef(null);

  /* ===== Helpers ===== */
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

  /* ===== Carregar dados (aplica filtros globais) ===== */
  const loadMonthData = useCallback(async () => {
    try {
      setLoading(true);

      // 1) CC (centros de custo)
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
      // Normaliza filtros antes de chamar a API
      const monthParam = reportFilters.month === ALL ? null : Number(reportFilters.month);
      const yearParam = reportFilters.year == null ? Number(currentYear) : Number(reportFilters.year);
      const centroParam = (!reportFilters.costCenter || reportFilters.costCenter === ALL) 
        ? null 
        : Number(reportFilters.costCenter);
      const empresaParam = (!reportFilters.companyFilter || reportFilters.companyFilter === ALL)
        ? null
        : String(reportFilters.companyFilter);

      // Fallback: usamos db.getMovimentacoes (wrapper) - ele deve enviar 'cc' e 'emp'
      const movs = await db.getMovimentacoes(monthParam, yearParam, centroParam, empresaParam);

      // 4) Atualiza nomes e acumula valores
      Object.values(contasMap).forEach((c) => { c.valor = 0; c.sign = "+"; });

      (Array.isArray(movs) ? movs : []).forEach((m) => {
        if (!contasMap[m.idconta]) {
          contasMap[m.idconta] = { id: m.idconta, name: m.nome || m.conta_nome || `Conta ${m.idconta}`, valor: 0, sign: "+" };
        } else if (m.nome || m.conta_nome) {
          contasMap[m.idconta].name = m.nome || m.conta_nome;
        }
        // somamos: crédito - débito (o delta no nosso modelo)
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

      // 7) Sem agrupador (preenche o unassigned)
      const assigned = new Set(
        Object.values(gruposMap).filter((g) => g.id !== "unassigned").flatMap((g) => g.accountIds || [])
      );
      gruposMap.unassigned.accountIds = Object.keys(contasMap).filter((id) => !assigned.has(id));

      /* ===== Categorias (novo) =====
         - tenta carregar do backend via db.getCategorias() + db.getCategoriaAgrupadores()
         - fallback: localStorage
         - garante que todo agrupador esteja em alguma categoria (uncategorized)
      */
      let categoriasMap = { uncategorized: { id: "uncategorized", title: "Sem categoria", agrupadorIds: [] } };
      try {
        const dbCats = typeof db.getCategorias === "function" ? await db.getCategorias() : null;
        const dbCatLinks = typeof db.getCategoriaAgrupadores === "function" ? await db.getCategoriaAgrupadores() : null;

        if (Array.isArray(dbCats) && dbCats.length) {
          categoriasMap = {};
          dbCats.forEach((c) => {
            categoriasMap[String(c.idcategoria)] = { id: String(c.idcategoria), title: c.nome, agrupadorIds: [] };
          });
          if (Array.isArray(dbCatLinks)) {
            dbCatLinks.forEach((l) => {
              const cid = String(l.idcategoria);
              const gid = String(l.idagrupador);
              if (categoriasMap[cid] && gruposMap[gid]) categoriasMap[cid].agrupadorIds.push(gid);
            });
          }
        } else {
          const raw = localStorage.getItem(LS_CATEGORIES);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (parsed && typeof parsed === "object") categoriasMap = parsed;
            } catch {}
          }
        }
      } catch (e) {
        console.warn("Erro ao carregar categorias (fallback local):", e?.message || e);
      }

      // garante que todo agrupador esteja em alguma categoria
      const allGroupIds = Object.keys(gruposMap).filter((id) => id !== "unassigned");
      const assignedGroupIds = new Set(Object.values(categoriasMap).flatMap((c) => c.agrupadorIds || []));
      categoriasMap.uncategorized = categoriasMap.uncategorized || { id: "uncategorized", title: "Sem categoria", agrupadorIds: [] };
      categoriasMap.uncategorized.agrupadorIds = Array.from(
        new Set([...(categoriasMap.uncategorized.agrupadorIds || []), ...allGroupIds.filter((g) => !assignedGroupIds.has(g))])
      );

      // Atualiza estados
      setAccounts(contasMap);
      setAggregators(gruposMap);
      setCategories(categoriasMap);
    } catch (e) {
      console.error("Erro ao carregar dados:", e);
    } finally {
      setLoading(false);
    }
  }, [currentMonth, currentYear, currentCostCenter, reportFilters.month, companyFilter]);

  /* Carrega ao montar e quando loadMonthData mudar */
  useEffect(() => { loadMonthData(); }, [loadMonthData]);

  /* Persistência local */
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

  /* ===== Funções de manipulação ===== */

  // Salvar mapeamento global conta->agrupador
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
      // recarrega pra garantir consistência
      loadMonthData().catch(() => {});
    } catch (e) {
      console.error(e);
      alert("Erro ao salvar agrupadores: " + e.message);
    }
  };

  // Toggle visual do sinal de uma conta
  const toggleAccountSign = (id) => {
    setAccounts((prev) => {
      const a = prev[id]; if (!a) return prev;
      return { ...prev, [id]: { ...a, sign: a.sign === "+" ? "-" : "+" } };
    });
  };

  // DnD: mover contas entre agrupadores
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

  /* ===== Importação de Excel (mantive seu código) ===== */
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

      // 1) CC (opcional)
      const centro = extractCostCenter(rows);
      let idCC = null;
      if (centro) {
        try {
          const savedCC = await db.upsertCentroCusto?.({ codigo: centro.id, nome: centro.nome });
          idCC = savedCC?.idcentrocusto ?? null;
        } catch (e1) { console.warn("upsertCentroCusto falhou:", e1?.message || e1); }
      }

      // 2) Cabeçalho
      let headerIdx = -1;
      for (let i = 0; i < Math.min(rows.length, 60); i++) {
        const r = rows[i].map(norm);
        const hasDeb = r.some((c) => c.includes("débito") || c.includes("debito"));
        const hasCred = r.some((c) => c.includes("crédito") || c.includes("credito"));
        const hasCodigo = r.some((c) => c.includes("código") || c.includes("codigo"));
        const hasDesc = r.some((c) => c.includes("descrição") || c.includes("descricao"));
        if (hasDeb && hasCred && (hasCodigo) && hasDesc) { headerIdx = i; break; }
      }
      if (headerIdx === -1) return alert("Não encontrei cabeçalhos (Código/Descrição/Débito/Crédito).");

      const header = rows[headerIdx];
      const colCodigo = findCol(header, ["código","codigo"]);
      const colDescricao = findCol(header, ["descrição","descricao"]);
      const colDeb = findCol(header, ["débito","debito"]);
      const colCred = findCol(header, ["crédito","credito"]);
      if (colDeb === -1 || colCred === -1) return alert("Colunas de Débito/Crédito não encontradas.");

      // 3) Lote de movimentações
      const newAccounts = {};
      const movimentacoes = [];

      for (let r = headerIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        const codigoRaw = colCodigo !== -1 ? String(row[colCodigo] || "").trim() : "";
        if (!codigoRaw || !/^\d+$/.test(codigoRaw)) continue;

        const id = codigoRaw;
        const descricaoPlanilha = colDescricao !== -1 ? String(row[colDescricao] || "").trim() : "";

        // *** INVERTE CRÉDITO/DEBITO ***
        const deb = parseBRNumber(row[colCred]); // vira débito
        const cred = parseBRNumber(row[colDeb]); // vira crédito
        if (deb === 0 && cred === 0) continue;

        movimentacoes.push({
          idconta: id,
          mes: selectedMonth,
          ano: selectedYear,
          debito: deb,
          credito: cred,
          idcentrocusto: idCC,
          centrocusto_nome: centro?.nome ?? null,
          centrocusto_codigo: centro?.id ?? null,
          conta_nome: descricaoPlanilha || `Conta ${id}`,
        });

        const val = cred - deb;
        newAccounts[id] = {
          id,
          name: descricaoPlanilha || `Conta ${id}`,
          valor: Math.abs(val),
          sign: val >= 0 ? "+" : "-",
        };
      }

      // 4) Grava (INSERE) + empresa do import
      await db.saveMovimentacoes(movimentacoes, selectedMonth, selectedYear, company);

      // 5) UI rápida
      setAccounts(newAccounts);
      setAggregators({
        unassigned: { id: "unassigned", title: "Sem agrupador", accountIds: Object.keys(newAccounts) },
      });

      // 6) Alinhar filtros
      setCurrentMonth(selectedMonth);
      setCurrentYear(selectedYear);
      setReportFilters((p) => ({ ...p, month: selectedMonth, year: selectedYear }));
      if (idCC) {
        setCurrentCostCenter(String(idCC));
        setReportFilters((p) => ({ ...p, costCenter: String(idCC) })); // também persiste no filtro
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

  /* ===== Render ===== */
  return (
    <div className="container">
      {/* Botão toggle da sidebar */}
      <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
        {sidebarOpen ? "Fechar Menu" : "Abrir Menu"}
      </button>

      {sidebarOpen && (
        <div className="sidebar">
          <h1>DFC Enhanced</h1>
          <h2>Empresa (Importação)</h2>
          <select value={company} onChange={(e) => setCompany(e.target.value)}>
            {COMPANIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id} - {c.name}
              </option>
            ))}
          </select>

          <div className="tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`tab-btn ${activeView === t.id ? "active" : ""}`}
                onClick={() => setActiveView(t.id)}
              >
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
              // chama load direto pra garantir recarregamento imediato
              loadMonthData().catch((err) => {
                console.error("Erro ao recarregar dados após mudança de CC:", err);
              });
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
              {/* Passamos também categories e onSaveCategories para o config */}
              <AggregatorConfig
  aggregators={aggregators}
  categories={categories}
  onChanged={loadMonthData}
  onSaveCategories={async (newCats) => {
    setCategories(newCats);
    if (typeof db.saveCategorias === "function") {
      try { await db.saveCategorias(newCats); } catch (e) { console.warn("saveCategorias falhou:", e); }
    } else {
      localStorage.setItem("dfc-laosf:categories", JSON.stringify(newCats));
    }
    loadMonthData().catch(() => {});
  }}
  onSaveGroups={handleSaveGroups}
/>

              <button onClick={handleSaveGroups} className="btn-save">Salvar agrupadores</button>
            </>
          )}
        </div>
      )}

      {/* Conteúdo principal */}
      {activeView === "reports" && (
  <div className="report-list-view">
    <h2 style={{ textAlign: "center", marginBottom: 12 }}>
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

    <div className="categories-grid">
      {(() => {
        // coleta categorias (mantém ordem natural; se quiser ordem customizada, defina um array)
        const cats = Object.values(categories || {});
        // calcula valores por categoria
        return cats.map((cat) => {
          const catAggIds = (cat.agrupadorIds || []).filter((aid) => aggregators[aid]);

          let catRec = 0;
          let catCustos = 0;

          catAggIds.forEach((aggId) => {
            const col = aggregators[aggId];
            if (!col) return;
            const ids = col.id === "unassigned"
              ? Object.keys(accounts).filter((id) =>
                  Object.values(aggregators).filter((a) => a.id !== "unassigned").every((a) => !(a.accountIds || []).includes(id))
                )
              : (col.accountIds || []).filter((id) => accounts[id]);

            ids.forEach((id) => {
              const a = accounts[id];
              if (!a) return;
              if (a.sign === "+") catRec += Number(a.valor || 0);
              else catCustos += Number(a.valor || 0);
            });
          });

          const saldo = catRec - catCustos;

          return (
            <div className="category-card" key={`cat-${cat.id}`}>
              <div className="category-header">{cat.title}</div>

              <div className="category-body">
                <div className="row">
                  <div className="label">RECEITA</div>
                  <div className="value receita">{formatValue(catRec)}</div>
                </div>

                <div className="row">
                  <div className="label">CUSTOS</div>
                  <div className="value custos">{formatValue(-catCustos)}</div>
                </div>

                <div className="row saldo-row">
                  <div className="label">SALDO</div>
                  <div className={`value saldo ${saldo < 0 ? "neg" : "pos"}`}>{formatValue(saldo)}</div>
                </div>
              </div>
            </div>
          );
        });
      })()}
    </div>

    {/* Totalizador geral (opcional abaixo dos cards) */}
    <div style={{ marginTop: 18 }}>
      <div style={{ fontWeight: 700, textAlign: "right", color: "var(--accent)" }}>
        {/* Calcula totais */ }
        {(() => {
          const cats = Object.values(categories || {});
          let totalRec = 0, totalCustos = 0;
          cats.forEach((cat) => {
            const catAggIds = (cat.agrupadorIds || []).filter((aid) => aggregators[aid]);
            catAggIds.forEach((aggId) => {
              const col = aggregators[aggId];
              if (!col) return;
              const ids = col.id === "unassigned"
                ? Object.keys(accounts).filter((id) =>
                    Object.values(aggregators).filter((a) => a.id !== "unassigned").every((a) => !(a.accountIds || []).includes(id))
                  )
                : (col.accountIds || []).filter((id) => accounts[id]);
              ids.forEach((id) => {
                const a = accounts[id];
                if (!a) return;
                if (a.sign === "+") totalRec += Number(a.valor || 0);
                else totalCustos += Number(a.valor || 0);
              });
            });
          });
          const totalSaldo = totalRec - totalCustos;
          return (
            <div>
              Total Receita: {formatValue(totalRec)} &nbsp;&nbsp;|&nbsp;&nbsp;
              Total Custos: {formatValue(-totalCustos)} &nbsp;&nbsp;|&nbsp;&nbsp;
              Saldo: <span style={{ color: totalSaldo < 0 ? "var(--danger)" : "var(--accent)" }}>{formatValue(totalSaldo)}</span>
            </div>
          );
        })()}
      </div>
    </div>
  </div>
)}



      {/* Agrupadores (drag & drop) */}
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
                                <span className="description">
                                  {acctId} – {accounts[acctId]?.name || `Conta ${acctId}`}
                                </span>
                                <button className="sign-btn" onClick={() => toggleAccountSign(acctId)}>
                                  {accounts[acctId]?.sign === "+" ? "+" : "–"}
                                </button>
                              </div>
                              <div
                                className="card-body"
                                style={{ color: accounts[acctId]?.sign === "+" ? "var(--accent)" : "var(--danger)" }}
                              >
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

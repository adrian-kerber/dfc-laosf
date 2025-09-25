// App.jsx - Versão com estrutura por Centro de Custo
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
 * App.jsx - NOVA VERSÃO: estrutura por Centro de Custo
 * 
 * PRINCIPAIS MUDANÇAS:
 * - Cada centro de custo tem suas próprias categorias/agrupadores
 * - A mesma conta pode estar em categorias diferentes por centro
 * - localStorage e DB agora armazenam por centro de custo
 * - Interface mostra apenas dados do centro selecionado
 */

/* ===== Constantes ===== */
const COMPANIES = [
  { id: "1", name: "LUIZ ANTONIO ORTOLLAN SALLES" },
  { id: "7", name: "JORGE AUGUSTO SALLES E OUTRO" },
];

const TABS = [
  { id: "reports", label: "Relatórios" },
  { id: "groups", label: "Agrupadores" },
  { id: "categories", label: "Categorias" },
  { id: "import", label: "Importar" },
];

const ALL = "all";
const LS_COMPANY = "dfc-laosf:company";
const LS_FILTERS = "dfc-laosf:filters";
const LS_CATEGORIES_BY_CC = "dfc-laosf:categories-by-cc"; // NOVO: por centro de custo

/* Categorias padrão por centro de custo */
const DEFAULT_CATEGORIES_BY_CC = {
  // Cada centro de custo tem suas próprias categorias
  // Formato: { [centroId]: { [catId]: { id, title, agrupadorIds } } }
};

const MONTHS_PT = [
  "janeiro","fevereiro","março","abril","maio","junho",
  "julho","agosto","setembro","outubro","novembro","dezembro"
];

const readSavedFilters = () => {
  try { 
    const raw = localStorage.getItem(LS_FILTERS); 
    return raw ? JSON.parse(raw) : null; 
  } catch { 
    return null; 
  }
};

// NOVA FUNÇÃO: Lê categorias por centro de custo do localStorage
const readCategoriesByCC = () => {
  try {
    const raw = localStorage.getItem(LS_CATEGORIES_BY_CC);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

// NOVA FUNÇÃO: Salva categorias por centro de custo no localStorage  
const saveCategoriesByCC = (categoriesByCC) => {
  try {
    localStorage.setItem(LS_CATEGORIES_BY_CC, JSON.stringify(categoriesByCC));
  } catch (e) {
    console.warn("Erro ao salvar categorias por CC:", e);
  }
};

/* ===== App ===== */
export default function App() {
  /* UI / app state */
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [company, setCompany] = useState(() => localStorage.getItem(LS_COMPANY) || COMPANIES[0].id);
  const [activeView, setActiveView] = useState("reports");

  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const saved = readSavedFilters();
  const [currentMonth, setCurrentMonth] = useState(saved?.month ?? new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(saved?.year ?? new Date().getFullYear());
  const [currentCostCenter, setCurrentCostCenter] = useState(saved?.costCenter ?? ALL);
  const [companyFilter, setCompanyFilter] = useState(saved?.companyFilter ?? ALL);

  const [costCenters, setCostCenters] = useState([]);

  /* Dados principais */
  const [aggregators, setAggregators] = useState({
    unassigned: { id: "unassigned", title: "Sem agrupador", accountIds: [] },
  });
  const [accounts, setAccounts] = useState({});

  /* NOVA ESTRUTURA: Categorias por centro de custo */
  const [categoriesByCC, setCategoriesByCC] = useState(readCategoriesByCC);
  
  // Categorias do centro de custo atual (para compatibilidade com AggregatorConfig)
  const currentCategories = currentCostCenter === ALL 
    ? { uncategorized: { id: "uncategorized", title: "Sem categoria", agrupadorIds: [] } }
    : (categoriesByCC[currentCostCenter] || { uncategorized: { id: "uncategorized", title: "Sem categoria", agrupadorIds: [] } });

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
      const cell = H[i]; 
      if (!cell) continue;
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
          if (m) { 
            id = m[1].trim(); 
            nome = m[2].trim(); 
          }
          return { id: id || null, nome };
        }
      }
    }
    return null;
  };

  /* ===== NOVA FUNÇÃO: Load data por centro de custo ===== */
  const loadMonthData = useCallback(async () => {
    try {
      setLoading(true);

      // 1) Centros de custo
      try {
        const ccs = await db.getCentrosCusto?.();
        if (Array.isArray(ccs)) setCostCenters(ccs);
      } catch (e) { 
        console.warn("getCentrosCusto error:", e?.message || e); 
      }

      // 2) Contas (catalog)
      const contas = await db.getContas();
      const contasMap = {};
      contas.forEach((c) => { 
        contasMap[c.idconta] = { 
          id: c.idconta, 
          name: c.nome, 
          valor: 0, 
          sign: "+" 
        }; 
      });

      // 3) Movimentações (filtros) - IMPORTANTE: só do centro selecionado se não for ALL
      const monthParam = reportFilters.month === ALL ? null : Number(reportFilters.month);
      const yearParam = reportFilters.year == null ? Number(currentYear) : Number(reportFilters.year);
      const centroParam = (!reportFilters.costCenter || reportFilters.costCenter === ALL) 
        ? null 
        : Number(reportFilters.costCenter);
      const empresaParam = (!reportFilters.companyFilter || reportFilters.companyFilter === ALL) 
        ? null 
        : String(reportFilters.companyFilter);

      const movs = await db.getMovimentacoes(monthParam, yearParam, centroParam, empresaParam);

      // 4) Acumula valores
      Object.values(contasMap).forEach((c) => { 
        c.valor = 0; 
        c.sign = "+"; 
      });
      
      (Array.isArray(movs) ? movs : []).forEach((m) => {
        if (!contasMap[m.idconta]) {
          contasMap[m.idconta] = { 
            id: m.idconta, 
            name: m.nome || m.conta_nome || `Conta ${m.idconta}`, 
            valor: 0, 
            sign: "+" 
          };
        } else if (m.nome || m.conta_nome) {
          contasMap[m.idconta].name = m.nome || m.conta_nome;
        }
        
        const delta = (Number(m.credito) || 0) - (Number(m.debito) || 0);
        const atual = (contasMap[m.idconta].sign === "+" ? 1 : -1) * contasMap[m.idconta].valor;
        const novo = atual + delta;
        contasMap[m.idconta].valor = Math.abs(novo);
        contasMap[m.idconta].sign = novo >= 0 ? "+" : "-";
      });

      // 5) NOVA LÓGICA: Agrupadores por centro de custo
      let gruposMap = { 
        unassigned: { 
          id: "unassigned", 
          title: "Sem agrupador", 
          accountIds: [] 
        } 
      };

      if (centroParam) {
        // Se tem centro específico, busca agrupadores deste centro
        try {
          const grupos = await db.getAgrupadores(); // Você pode modificar para filtrar por centro
          grupos.forEach((g) => { 
            gruposMap[String(g.idagrupador)] = { 
              id: String(g.idagrupador), 
              title: g.nome, 
              accountIds: [] 
            }; 
          });

          // Ligações conta->agrupador (filtradas por centro se possível)
          const liga = await db.getAgrupadorContas(); // Você pode modificar para filtrar por centro
          liga.forEach((a) => {
            const gid = String(a.idagrupador);
            if (gruposMap[gid] && contasMap[a.idconta]) {
              gruposMap[gid].accountIds.push(a.idconta);
            }
          });
        } catch (e) {
          console.warn("Erro ao carregar agrupadores:", e);
        }
      }

      // Sem agrupador
      const assigned = new Set(
        Object.values(gruposMap)
          .filter((g) => g.id !== "unassigned")
          .flatMap((g) => g.accountIds || [])
      );
      gruposMap.unassigned.accountIds = Object.keys(contasMap).filter((id) => !assigned.has(id));

      // 6) NOVA LÓGICA: Categorias por centro de custo
      let currentCategoriesMap = { 
        uncategorized: { 
          id: "uncategorized", 
          title: "Sem categoria", 
          agrupadorIds: [] 
        } 
      };

      if (centroParam) {
        // Tenta carregar do banco para este centro específico
        try {
          // Você precisaria modificar estas funções para aceitar centro de custo
          const dbCats = typeof db.getCategorias === "function" 
            ? await db.getCategorias(centroParam) 
            : null;
          const dbLinks = typeof db.getCategoriaAgrupadores === "function" 
            ? await db.getCategoriaAgrupadores(centroParam) 
            : null;

          if (Array.isArray(dbCats) && dbCats.length) {
            currentCategoriesMap = {};
            dbCats.forEach((c) => {
              currentCategoriesMap[String(c.idcategoria)] = { 
                id: String(c.idcategoria), 
                title: c.nome, 
                agrupadorIds: [] 
              };
            });
            
            if (Array.isArray(dbLinks)) {
              dbLinks.forEach((l) => {
                const cid = String(l.idcategoria);
                const gid = String(l.idagrupador);
                if (currentCategoriesMap[cid] && gruposMap[gid]) {
                  currentCategoriesMap[cid].agrupadorIds.push(gid);
                }
              });
            }
          } else {
            // Fallback: localStorage por centro
            const categoriesByCC = readCategoriesByCC();
            currentCategoriesMap = categoriesByCC[String(centroParam)] || currentCategoriesMap;
          }
        } catch (e) {
          console.warn("Erro ao carregar categorias por centro:", e);
          // Fallback: localStorage
          const categoriesByCC = readCategoriesByCC();
          currentCategoriesMap = categoriesByCC[String(centroParam)] || currentCategoriesMap;
        }

        // Atualiza o estado global das categorias por centro
        setCategoriesByCC(prev => ({
          ...prev,
          [String(centroParam)]: currentCategoriesMap
        }));
      }

      // Garante que todo agrupador esteja em alguma categoria
      const allGroupIds = Object.keys(gruposMap).filter((id) => id !== "unassigned");
      const assignedGroupIds = new Set(
        Object.values(currentCategoriesMap).flatMap((c) => c.agrupadorIds || [])
      );
      
      currentCategoriesMap.uncategorized = currentCategoriesMap.uncategorized || { 
        id: "uncategorized", 
        title: "Sem categoria", 
        agrupadorIds: [] 
      };
      currentCategoriesMap.uncategorized.agrupadorIds = Array.from(
        new Set([
          ...(currentCategoriesMap.uncategorized.agrupadorIds || []), 
          ...allGroupIds.filter((g) => !assignedGroupIds.has(g))
        ])
      );

      // Atualiza estados
      setAccounts(contasMap);
      setAggregators(gruposMap);
      
    } catch (e) {
      console.error("Erro ao carregar dados:", e);
    } finally {
      setLoading(false);
    }
  }, [currentMonth, currentYear, currentCostCenter, reportFilters.month, reportFilters.year, reportFilters.costCenter, companyFilter]);

  /* Carregar on mount / quando filtros mudarem */
  useEffect(() => { 
    loadMonthData(); 
  }, [loadMonthData]);

  /* Persist filtros/company */
  useEffect(() => { 
    localStorage.setItem(LS_COMPANY, company); 
  }, [company]);
  
  useEffect(() => {
    localStorage.setItem(LS_FILTERS, JSON.stringify({
      month: reportFilters.month,
      year: reportFilters.year,
      costCenter: reportFilters.costCenter,
      companyFilter,
    }));
  }, [reportFilters.month, reportFilters.year, reportFilters.costCenter, companyFilter]);

  /* ===== NOVA FUNÇÃO: Salvar categorias por centro de custo ===== */
  const handleSaveCategories = async (newCats) => {
    if (currentCostCenter === ALL) {
      alert("Selecione um centro de custo específico para gerenciar categorias.");
      return;
    }

    try {
      setLoading(true);
      
      // Atualiza estrutura por centro de custo
      const newCategoriesByCC = {
        ...categoriesByCC,
        [String(currentCostCenter)]: newCats
      };
      
      setCategoriesByCC(newCategoriesByCC);
      saveCategoriesByCC(newCategoriesByCC);

      // Tenta salvar no banco (você precisaria modificar esta função)
      if (typeof db.saveCategorias === "function") {
        await db.saveCategorias(newCats, Number(currentCostCenter)); // Passa o centro de custo
        await loadMonthData();
        alert("Categorias salvas no banco para este centro de custo.");
      } else {
        alert("Categorias salvas localmente para este centro de custo.");
      }
    } catch (e) {
      console.error("Erro ao salvar categorias:", e);
      alert("Falha ao salvar categorias: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  /* ===== NOVA FUNÇÃO: Salvar agrupadores por centro de custo ===== */
  const handleSaveGroups = async () => {
    if (currentCostCenter === ALL) {
      alert("Selecione um centro de custo específico para gerenciar agrupadores.");
      return;
    }

    try {
      const associations = [];
      Object.values(aggregators).forEach((agg) => {
        if (agg.id === "unassigned") return;
        (agg.accountIds || []).forEach((accountId) => {
          associations.push({ 
            idconta: String(accountId), 
            idagrupador: Number(agg.id),
            idcentrocusto: Number(currentCostCenter) // NOVO: associa ao centro atual
          });
        });
      });

      const mapped = new Set(associations.map((a) => a.idconta));
      const unassignedItems = Object.keys(accounts)
        .filter((id) => !mapped.has(id))
        .map((id) => ({ 
          idconta: String(id), 
          idagrupador: null,
          idcentrocusto: Number(currentCostCenter) 
        }));

      // Você precisaria modificar esta função para aceitar centro de custo
      await db.saveAgrupadorContas([...associations, ...unassignedItems]);
      alert(`Mapeamento de contas salvo para centro de custo ${currentCostCenter}.`);
      loadMonthData().catch(() => {});
    } catch (e) {
      console.error(e);
      alert("Erro ao salvar agrupadores: " + e.message);
    }
  };

  /* ===== Demais funções mantidas iguais ===== */
  const toggleAccountSign = (id) => {
    setAccounts((prev) => {
      const a = prev[id]; 
      if (!a) return prev;
      return { ...prev, [id]: { ...a, sign: a.sign === "+" ? "-" : "+" } };
    });
  };

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
        } catch (e1) { 
          console.warn("upsertCentroCusto falhou:", e1?.message || e1); 
        }
      }

      // 2) Cabeçalho
      let headerIdx = -1;
      for (let i = 0; i < Math.min(rows.length, 60); i++) {
        const r = rows[i].map(norm);
        const hasDeb = r.some((c) => c.includes("débito") || c.includes("debito"));
        const hasCred = r.some((c) => c.includes("crédito") || c.includes("credito"));
        const hasCodigo = r.some((c) => c.includes("código") || c.includes("codigo"));
        const hasDesc = r.some((c) => c.includes("descrição") || c.includes("descricao"));
        if (hasDeb && hasCred && (hasCodigo) && hasDesc) { 
          headerIdx = i; 
          break; 
        }
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

        const deb = parseBRNumber(row[colCred]);
        const cred = parseBRNumber(row[colDeb]);
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

      // 4) Grava no banco
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

          {/* AVISO: Centro de custo agora é obrigatório para configurar */}
          <label className="label" style={{ marginTop: 8 }}>Centro de Custo</label>
          <select
            value={String(reportFilters.costCenter)}
            onChange={(e) => {
              const cc = e.target.value === "all" ? ALL : e.target.value;
              setReportFilters((p) => ({ ...p, costCenter: cc }));
              setCurrentCostCenter(cc);
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
              const v = e.target.value;
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

          {(activeView === "groups" || activeView === "categories") && (
            <>
              <hr className="sidebar-sep" />
              
              {/* NOVO AVISO: Centro de custo obrigatório */}
              {currentCostCenter === ALL ? (
                <div style={{ 
                  padding: 12, 
                  backgroundColor: "#fff3cd", 
                  border: "1px solid #ffeaa7", 
                  borderRadius: 4,
                  marginBottom: 12,
                  color: "#856404"
                }}>
                  <strong>⚠️ Selecione um Centro de Custo específico</strong>
                  <br />
                  Para configurar agrupadores e categorias, você precisa escolher um centro de custo específico acima.
                  Cada centro tem sua própria estrutura organizacional.
                </div>
              ) : (
                <>
                  <div style={{ 
                    padding: 8, 
                    backgroundColor: "#d4edda", 
                    border: "1px solid #c3e6cb",
                    borderRadius: 4,
                    marginBottom: 12,
                    color: "#155724",
                    fontSize: 14
                  }}>
                    <strong>📋 Configurando:</strong> {
                      (() => {
                        const cc = costCenters.find(c => String(c.idcentrocusto) === String(currentCostCenter));
                        return cc ? `${cc.codigo ? cc.codigo + ' - ' : ''}${cc.nome}` : `Centro ${currentCostCenter}`;
                      })()
                    }
                  </div>
                  
                  <AggregatorConfig
                    aggregators={aggregators}
                    categories={currentCategories}
                    onChanged={loadMonthData}
                    onSaveCategories={handleSaveCategories}
                    onSaveGroups={handleSaveGroups}
                  />
                </>
              )}
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

          {currentCostCenter === ALL ? (
            /* RELATÓRIO CONSOLIDADO - TODOS OS CENTROS */
            <div className="categories-grid">
              <div style={{ marginBottom: 20, textAlign: "center" }}>
                <h3>Relatório Consolidado - Todos os Centros de Custo</h3>
                <p style={{ color: "#666" }}>
                  Valores consolidados respeitando as categorias específicas de cada centro de custo
                </p>
              </div>
              
              {(() => {
                // Consolida dados de todos os centros de custo
                const consolidatedCategories = {};
                
                // Para cada centro de custo que tem dados
                costCenters.forEach(cc => {
                  const ccId = String(cc.idcentrocusto);
                  const ccCategories = categoriesByCC[ccId] || {};
                  
                  Object.values(ccCategories).forEach(cat => {
                    // Se categoria não existe no consolidado, cria
                    if (!consolidatedCategories[cat.title]) {
                      consolidatedCategories[cat.title] = {
                        title: cat.title,
                        receita: 0,
                        custos: 0,
                        centros: []
                      };
                    }
                    
                    // Calcula valores desta categoria neste centro
                    let catRec = 0, catCustos = 0;
                    
                    (cat.agrupadorIds || []).forEach(aggId => {
                      if (aggregators[aggId]) {
                        const col = aggregators[aggId];
                        const ids = col.id === "unassigned"
                          ? Object.keys(accounts).filter(id => 
                              Object.values(aggregators)
                                .filter(a => a.id !== "unassigned")
                                .every(a => !(a.accountIds || []).includes(id))
                            )
                          : (col.accountIds || []).filter(id => accounts[id]);
                          
                        ids.forEach(id => {
                          const a = accounts[id];
                          if (!a) return;
                          if (a.sign === "+") catRec += Number(a.valor || 0);
                          else catCustos += Number(a.valor || 0);
                        });
                      }
                    });
                    
                    consolidatedCategories[cat.title].receita += catRec;
                    consolidatedCategories[cat.title].custos += catCustos;
                    
                    if (catRec > 0 || catCustos > 0) {
                      consolidatedCategories[cat.title].centros.push({
                        nome: cc.nome,
                        codigo: cc.codigo,
                        receita: catRec,
                        custos: catCustos
                      });
                    }
                  });
                });
                
                return Object.values(consolidatedCategories).map(cat => {
                  const saldo = cat.receita - cat.custos;
                  
                  return (
                    <div className="category-card" key={`consolidated-${cat.title}`} style={{ position: "relative" }}>
                      <div className="category-header">
                        {cat.title}
                        <small style={{ fontSize: "0.8em", opacity: 0.7, display: "block" }}>
                          {cat.centros.length} centro(s) de custo
                        </small>
                      </div>

                      <div className="category-body">
                        <div className="row">
                          <div className="label">RECEITA</div>
                          <div className="value receita">{formatValue(cat.receita)}</div>
                        </div>

                        <div className="row">
                          <div className="label">CUSTOS</div>
                          <div className="value custos">{formatValue(-cat.custos)}</div>
                        </div>

                        <div className="row saldo-row">
                          <div className="label">SALDO</div>
                          <div className={`value saldo ${saldo < 0 ? "neg" : "pos"}`}>
                            {formatValue(saldo)}
                          </div>
                        </div>
                        
                        {/* Detalhamento por centro */}
                        <details style={{ marginTop: 12, fontSize: "0.85em" }}>
                          <summary style={{ cursor: "pointer", color: "#666" }}>
                            Ver detalhes por centro
                          </summary>
                          <div style={{ marginTop: 8, maxHeight: 150, overflow: "auto" }}>
                            {cat.centros.map(centro => (
                              <div key={centro.codigo || centro.nome} style={{ 
                                padding: "4px 0", 
                                borderBottom: "1px solid #eee",
                                display: "flex",
                                justifyContent: "space-between"
                              }}>
                                <span>{centro.codigo ? `${centro.codigo} - ` : ""}{centro.nome}</span>
                                <span style={{ color: centro.receita - centro.custos >= 0 ? "green" : "red" }}>
                                  {formatValue(centro.receita - centro.custos)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </details>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          ) : (
            /* RELATÓRIO POR CENTRO ESPECÍFICO */
            <div className="categories-grid">
              {(() => {
                const cats = Object.values(currentCategories || {});
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
          )}

          {/* Totalizador geral consolidado */}
          {currentCostCenter === ALL && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontWeight: 700, textAlign: "right", color: "var(--accent)" }}>
                {(() => {
                  let totalRec = 0, totalCustos = 0;
                  
                  // Soma todos os valores de todos os centros
                  costCenters.forEach(cc => {
                    const ccId = String(cc.idcentrocusto);
                    const ccCategories = categoriesByCC[ccId] || {};
                    
                    Object.values(ccCategories).forEach(cat => {
                      (cat.agrupadorIds || []).forEach(aggId => {
                        if (aggregators[aggId]) {
                          const col = aggregators[aggId];
                          const ids = col.id === "unassigned"
                            ? Object.keys(accounts).filter(id => 
                                Object.values(aggregators)
                                  .filter(a => a.id !== "unassigned")
                                  .every(a => !(a.accountIds || []).includes(id))
                              )
                            : (col.accountIds || []).filter(id => accounts[id]);
                            
                          ids.forEach(id => {
                            const a = accounts[id];
                            if (!a) return;
                            if (a.sign === "+") totalRec += Number(a.valor || 0);
                            else totalCustos += Number(a.valor || 0);
                          });
                        }
                      });
                    });
                  });
                  
                  const totalSaldo = totalRec - totalCustos;
                  return (
                    <div>
                      <div style={{ fontSize: "0.9em", color: "#666", marginBottom: 4 }}>
                        CONSOLIDADO - TODOS OS CENTROS:
                      </div>
                      Total Receita: {formatValue(totalRec)} &nbsp;&nbsp;|&nbsp;&nbsp;
                      Total Custos: {formatValue(-totalCustos)} &nbsp;&nbsp;|&nbsp;&nbsp;
                      Saldo: <span style={{ color: totalSaldo < 0 ? "var(--danger)" : "var(--accent)" }}>{formatValue(totalSaldo)}</span>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Totalizador por centro específico */}
          {currentCostCenter !== ALL && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontWeight: 700, textAlign: "right", color: "var(--accent)" }}>
                {(() => {
                  const cats = Object.values(currentCategories || {});
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
          )}
        </div>
      )}

      {/* Agrupadores (drag & drop) */}
      {activeView === "groups" && currentCostCenter !== ALL && (
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

      {/* Interface de Categorias */}
      {activeView === "categories" && (
        <div className="report-list-view">
          <h2>Gerenciamento de Categorias</h2>
          <p style={{ marginBottom: 16, color: "#666" }}>
            Use esta seção para criar categorias e atribuir agrupadores a elas por centro de custo.
            {currentCostCenter === ALL 
              ? " Selecione um centro de custo específico nos filtros para começar."
              : ` Configurando centro: ${(() => {
                  const cc = costCenters.find(c => String(c.idcentrocusto) === String(currentCostCenter));
                  return cc ? `${cc.codigo ? cc.codigo + ' - ' : ''}${cc.nome}` : currentCostCenter;
                })()}`
            }
          </p>
          {loading && <p>Carregando...</p>}
        </div>
      )}

      {activeView === "import" && (
        <div className="report-list-view">
          <h2>Importar balancete</h2>
          <p style={{ marginBottom: 16, color: "#666" }}>
            Selecione o período de importação na barra lateral e faça upload do arquivo Excel (.xls ou .xlsx).
          </p>
          {loading && <p>Processando...</p>}
        </div>
      )}
    </div>
  );
}
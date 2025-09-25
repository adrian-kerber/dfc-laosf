// App.jsx - VERSÃO FINAL COMPLETA: Categorias globais + mapeamentos por centro de custo
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
 * ESTRUTURA FINAL:
 * - CATEGORIAS: globais (mesmas para todos os centros)
 * - MAPEAMENTO agrupador→categoria: POR centro de custo
 * - MAPEAMENTO conta→agrupador: POR centro de custo
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

// CATEGORIAS PADRÃO GLOBAIS
const DEFAULT_GLOBAL_CATEGORIES = [
  "GRANJA DONA CLARA I",
  "GRANJA DONA CLARA II", 
  "AGRICULTURA",
  "APOIO",
  "DIRETORIA",
  "APICULTURA, AVICULTURA, BOVINOCULTURA E PISCICULTURA",
  "Sem categoria"
];

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

  /* NOVA ESTRUTURA: Categorias globais */
  const [globalCategories, setGlobalCategories] = useState([]); // [{ idcategoria, nome }, ...]
  const [categoryMappings, setCategoryMappings] = useState([]); // [{ idcategoria, idagrupador, idcentrocusto }, ...]
  
  // Para compatibilidade com AggregatorConfig, montamos o formato antigo
  const currentCategories = React.useMemo(() => {
    if (currentCostCenter === ALL) {
      return { uncategorized: { id: "uncategorized", title: "Sem categoria", agrupadorIds: [] } };
    }

    const categories = {};
    
    // Cria entrada para cada categoria global
    globalCategories.forEach(cat => {
      categories[cat.idcategoria] = {
        id: cat.idcategoria,
        title: cat.nome,
        agrupadorIds: []
      };
    });

    // Adiciona agrupadores baseado no mapeamento do centro atual
    categoryMappings.forEach(mapping => {
      if (Number(mapping.idcentrocusto) === Number(currentCostCenter) && categories[mapping.idcategoria]) {
        categories[mapping.idcategoria].agrupadorIds.push(String(mapping.idagrupador));
      }
    });

    // Garante categoria "Sem categoria"
    if (!categories.uncategorized) {
      categories.uncategorized = { id: "uncategorized", title: "Sem categoria", agrupadorIds: [] };
    }

    return categories;
  }, [globalCategories, categoryMappings, currentCostCenter]);

  const [loading, setLoading] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
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

  /* ===== NOVA FUNÇÃO: Load data com categorias globais ===== */
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

      // 3) Movimentações (filtros)
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

      // 5) Agrupadores (globais)
      const grupos = await db.getAgrupadores();
      const gruposMap = { 
        unassigned: { 
          id: "unassigned", 
          title: "Sem agrupador", 
          accountIds: [] 
        } 
      };
      grupos.forEach((g) => { 
        gruposMap[String(g.idagrupador)] = { 
          id: String(g.idagrupador), 
          title: g.nome, 
          accountIds: [] 
        }; 
      });

      // 6) Associações conta→agrupador por centro
      if (centroParam) {
        try {
          const liga = await db.getAgrupadorContas(centroParam);
          liga.forEach((a) => {
            const gid = String(a.idagrupador);
            if (gruposMap[gid] && contasMap[a.idconta]) {
              gruposMap[gid].accountIds.push(a.idconta);
            }
          });
        } catch (e) {
          console.warn("Erro ao carregar associações conta→agrupador:", e);
        }
      }

      // Sem agrupador
      const assigned = new Set(
        Object.values(gruposMap)
          .filter((g) => g.id !== "unassigned")
          .flatMap((g) => g.accountIds || [])
      );
      gruposMap.unassigned.accountIds = Object.keys(contasMap).filter((id) => !assigned.has(id));

      // 7) CATEGORIAS GLOBAIS
      try {
        const cats = await db.getCategorias();
        setGlobalCategories(Array.isArray(cats) ? cats : []);
      } catch (e) {
        console.warn("Erro ao carregar categorias globais:", e);
        setGlobalCategories([]);
      }

      // 8) MAPEAMENTOS categoria←→agrupador por centro  
      if (centroParam) {
        try {
          const mappings = await db.getCategoriaAgrupadores(centroParam);
          setCategoryMappings(Array.isArray(mappings) ? mappings : []);
        } catch (e) {
          console.warn("Erro ao carregar mapeamentos categoria←→agrupador:", e);
          setCategoryMappings([]);
        }
      } else {
        // Para relatórios consolidados, carrega todos os mapeamentos
        try {
          const allMappings = await db.getCategoriaAgrupadores();
          setCategoryMappings(Array.isArray(allMappings) ? allMappings : []);
        } catch (e) {
          console.warn("Erro ao carregar todos os mapeamentos:", e);
          setCategoryMappings([]);
        }
      }

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

  /* ===== NOVA FUNÇÃO: Salvar categorias (mapeamento) ===== */
  const handleSaveCategories = async (newCats) => {
    if (currentCostCenter === ALL) {
      alert("Selecione um centro de custo específico para gerenciar categorias.");
      return;
    }

    try {
      setLoading(true);
      
      // Converte formato do AggregatorConfig para novo formato
      const mapeamentos = [];
      Object.values(newCats).forEach(cat => {
        if (cat.agrupadorIds && Array.isArray(cat.agrupadorIds)) {
          cat.agrupadorIds.forEach(aggId => {
            // Encontra ID da categoria pelo nome
            const globalCat = globalCategories.find(gc => gc.nome === cat.title);
            if (globalCat && aggId) {
              mapeamentos.push({
                idcategoria: globalCat.idcategoria,
                idagrupador: Number(aggId)
              });
            }
          });
        }
      });

      // Salva mapeamento no backend
      await db.saveCategorias(newCats, Number(currentCostCenter));
      await loadMonthData();
      alert("Categorias salvas para este centro de custo.");
    } catch (e) {
      console.error("Erro ao salvar categorias:", e);
      alert("Falha ao salvar categorias: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  /* ===== Salvar agrupadores por centro de custo ===== */
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
            idcentrocusto: Number(currentCostCenter) 
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

  /* ===== NOVA FUNÇÃO DE IMPORTAÇÃO COM LAYOUT MELHORADO ===== */
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!selectedMonth || !selectedYear) {
      alert("Selecione o período (mês e ano) antes de importar o arquivo.");
      return;
    }
    
    setLoading(true);
    setImportProgress("Lendo arquivo...");

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      
      if (!rows.length) {
        alert("Arquivo está vazio ou não contém dados válidos.");
        return;
      }

      setImportProgress("Analisando estrutura...");

      // 1) Extrair centro de custo
      const centro = extractCostCenter(rows);
      let idCC = null;
      
      if (centro) {
        setImportProgress("Registrando centro de custo...");
        try {
          const savedCC = await db.upsertCentroCusto?.({ codigo: centro.id, nome: centro.nome });
          idCC = savedCC?.idcentrocusto ?? null;
        } catch (e1) { 
          console.warn("upsertCentroCusto falhou:", e1?.message || e1); 
        }
      }

      setImportProgress("Localizando cabeçalhos...");

      // 2) Encontrar cabeçalho
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
      
      if (headerIdx === -1) {
        alert("Não foi possível encontrar os cabeçalhos necessários (Código, Descrição, Débito, Crédito) no arquivo.");
        return;
      }

      const header = rows[headerIdx];
      const colCodigo = findCol(header, ["código","codigo"]);
      const colDescricao = findCol(header, ["descrição","descricao"]);
      const colDeb = findCol(header, ["débito","debito"]);
      const colCred = findCol(header, ["crédito","credito"]);
      
      if (colDeb === -1 || colCred === -1) {
        alert("Colunas de Débito e/ou Crédito não encontradas no arquivo.");
        return;
      }

      setImportProgress("Processando contas...");

      // 3) Processar dados
      const newAccounts = {};
      const movimentacoes = [];
      let processedCount = 0;

      for (let r = headerIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        const codigoRaw = colCodigo !== -1 ? String(row[colCodigo] || "").trim() : "";
        if (!codigoRaw || !/^\d+$/.test(codigoRaw)) continue;

        const id = codigoRaw;
        const descricaoPlanilha = colDescricao !== -1 ? String(row[colDescricao] || "").trim() : "";

        const deb = parseBRNumber(row[colCred]); // Inversão proposital
        const cred = parseBRNumber(row[colDeb]); // Inversão proposital
        
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
        
        processedCount++;
      }

      if (processedCount === 0) {
        alert("Nenhuma conta válida encontrada no arquivo.");
        return;
      }

      setImportProgress("Salvando no banco de dados...");

      // 4) Salvar no banco
      await db.saveMovimentacoes(movimentacoes, selectedMonth, selectedYear, company);

      setImportProgress("Atualizando interface...");

      // 5) Atualizar UI
      setAccounts(newAccounts);
      setAggregators({
        unassigned: { id: "unassigned", title: "Sem agrupador", accountIds: Object.keys(newAccounts) },
      });

      // 6) Ajustar filtros
      setCurrentMonth(selectedMonth);
      setCurrentYear(selectedYear);
      setReportFilters((p) => ({ ...p, month: selectedMonth, year: selectedYear }));
      
      if (idCC) {
        setCurrentCostCenter(String(idCC));
        setReportFilters((p) => ({ ...p, costCenter: String(idCC) }));
      }

      const successMessage = `✅ Importação concluída com sucesso!

📊 ${processedCount} contas processadas
📅 Período: ${selectedMonth}/${selectedYear}
🏢 Empresa: ${company}${centro ? `
🏭 Centro de Custo: ${centro.id ? centro.id + " - " : ""}${centro.nome}` : ""}

Os dados foram salvos e você pode configurar os agrupadores na aba "Agrupadores".`;

      alert(successMessage);
      setActiveView("reports");
      
    } catch (err) {
      console.error("Erro ao importar:", err);
      alert(`Erro durante a importação: ${err.message}
      
Verifique se o arquivo está no formato correto e tente novamente.`);
    } finally {
      setLoading(false);
      setImportProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const formatValue = (value) =>
    `R$ ${Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  /* ===== Função auxiliar para relatórios consolidados ===== */
  const getConsolidatedData = () => {
    const consolidatedCategories = {};
    
    // Para cada centro de custo
    costCenters.forEach(cc => {
      const ccId = Number(cc.idcentrocusto);
      
      // Busca mapeamentos deste centro
      const ccMappings = categoryMappings.filter(m => Number(m.idcentrocusto) === ccId);
      
      ccMappings.forEach(mapping => {
        const globalCat = globalCategories.find(gc => gc.idcategoria === mapping.idcategoria);
        if (!globalCat) return;
        
        const catTitle = globalCat.nome;
        
        // Se categoria não existe no consolidado, cria
        if (!consolidatedCategories[catTitle]) {
          consolidatedCategories[catTitle] = {
            title: catTitle,
            receita: 0,
            custos: 0,
            centros: []
          };
        }
        
        // Calcula valores desta categoria neste centro
        let catRec = 0, catCustos = 0;
        const aggId = String(mapping.idagrupador);
        
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
        
        consolidatedCategories[catTitle].receita += catRec;
        consolidatedCategories[catTitle].custos += catCustos;
        
        if (catRec > 0 || catCustos > 0) {
          consolidatedCategories[catTitle].centros.push({
            nome: cc.nome,
            codigo: cc.codigo,
            receita: catRec,
            custos: catCustos
          });
        }
      });
    });
    
    return Object.values(consolidatedCategories);
  };

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

          {/* NOVA INTERFACE DE IMPORTAÇÃO MELHORADA */}
          {activeView === "import" && (
            <>
              <hr className="sidebar-sep" />
              <div className="import-section">
                <h3>📊 Importar Balancete</h3>
                
                {/* Seleção de período */}
                <div className="import-step">
                  <h4>1. Selecione o Período</h4>
                  <div className="period-selector">
                    <MonthYearSelector
                      selectedMonth={selectedMonth}
                      selectedYear={selectedYear}
                      onMonthChange={setSelectedMonth}
                      onYearChange={setSelectedYear}
                      label="Período dos dados"
                    />
                  </div>
                </div>

                {/* Seleção de arquivo */}
                <div className="import-step">
                  <h4>2. Selecione o Arquivo</h4>
                  <div className="file-drop-zone" 
                       onClick={() => fileInputRef.current?.click()}
                       style={{
                         border: "2px dashed #ccc",
                         borderRadius: 8,
                         padding: 20,
                         textAlign: "center",
                         cursor: "pointer",
                         backgroundColor: loading ? "#f8f8f8" : "#fafafa",
                         transition: "all 0.2s"
                       }}
                       onMouseOver={(e) => {
                         if (!loading) e.target.style.borderColor = "#007bff";
                       }}
                       onMouseOut={(e) => {
                         e.target.style.borderColor = "#ccc";
                       }}>
                    <div style={{ fontSize: "2em", marginBottom: 8 }}>📁</div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      {loading ? "Processando..." : "Clique para selecionar arquivo"}
                    </div>
                    <div style={{ fontSize: "0.9em", color: "#666" }}>
                      Formatos aceitos: .xls, .xlsx
                    </div>
                    {importProgress && (
                      <div style={{ marginTop: 12, color: "#007bff", fontWeight: 500 }}>
                        {importProgress}
                      </div>
                    )}
                  </div>
                  <input 
                    ref={fileInputRef} 
                    type="file" 
                    accept=".xls,.xlsx" 
                    onChange={handleFile}
                    style={{ display: "none" }}
                    disabled={loading}
                  />
                </div>

                {/* Informações do que será importado */}
                <div className="import-info" style={{
                  backgroundColor: "#e3f2fd",
                  border: "1px solid #bbdefb",
                  borderRadius: 8,
                  padding: 12,
                  marginTop: 16,
                  fontSize: "0.9em"
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>ℹ️ Informações da Importação:</div>
                  <div>📅 <strong>Período:</strong> {selectedMonth}/{selectedYear}</div>
                  <div>🏢 <strong>Empresa:</strong> {COMPANIES.find(c => c.id === company)?.name}</div>
                  <div style={{ marginTop: 8, fontSize: "0.8em", color: "#666" }}>
                    • O centro de custo será detectado automaticamente do arquivo<br/>
                    • Colunas esperadas: Código, Descrição, Débito, Crédito<br/>
                    • Contas importadas aparecerão em "Sem agrupador"
                  </div>
                </div>

                {/* Dados históricos */}
                <div className="import-step">
                  <h4>3. Gerenciar Dados</h4>
                  <DataManager onDataChange={loadMonthData} />
                </div>
              </div>
            </>
          )}

          {(activeView === "groups" || activeView === "categories") && (
            <>
              <hr className="sidebar-sep" />
              
              {currentCostCenter === ALL ? (
                <div className="warning-box">
                  <div style={{ fontSize: "1.2em", marginBottom: 8 }}>⚠️</div>
                  <strong>Selecione um Centro de Custo específico</strong>
                  <div style={{ marginTop: 8, fontSize: "0.9em" }}>
                    Para configurar agrupadores e categorias, você precisa escolher um centro de custo específico acima.
                    Cada centro tem sua própria estrutura organizacional.
                  </div>
                </div>
              ) : (
                <>
                  <div className="info-box">
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
              
              {getConsolidatedData().map(cat => {
                const saldo = cat.receita - cat.custos;
                
                return (
                  <div className="category-card" key={`consolidated-${cat.title}`}>
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
              })}
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
                  const consolidatedData = getConsolidatedData();
                  let totalRec = 0, totalCustos = 0;
                  
                  consolidatedData.forEach(cat => {
                    totalRec += cat.receita;
                    totalCustos += cat.custos;
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
          <div style={{ marginTop: 16, color: "#666", fontSize: "0.9em" }}>
            <strong>Categorias Globais Disponíveis:</strong>
            <div style={{ marginTop: 8 }}>
              {globalCategories.map(cat => (
                <span key={cat.idcategoria} style={{ 
                  display: "inline-block", 
                  margin: "2px 4px", 
                  padding: "2px 8px", 
                  backgroundColor: "#f0f0f0", 
                  borderRadius: 12,
                  fontSize: "0.8em"
                }}>
                  {cat.nome}
                </span>
              ))}
            </div>
          </div>
          {loading && <p>Carregando...</p>}
        </div>
      )}

      {activeView === "import" && (
        <div className="report-list-view">
          <div style={{ textAlign: "center", padding: 40, color: "#666" }}>
            <div style={{ fontSize: "4em", marginBottom: 16 }}>📊</div>
            <h2>Importação de Balancetes</h2>
            <p style={{ marginBottom: 20, maxWidth: 500, margin: "0 auto 20px" }}>
              Configure o período e a empresa na barra lateral, depois selecione o arquivo Excel para importação.
              O sistema detectará automaticamente o centro de custo e organizará as contas.
            </p>
            <div style={{ 
              backgroundColor: "#f8f9fa", 
              borderRadius: 8, 
              padding: 20,
              maxWidth: 600,
              margin: "0 auto",
              textAlign: "left"
            }}>
              <h4>Formato esperado do arquivo:</h4>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li>Arquivo Excel (.xls ou .xlsx)</li>
                <li>Colunas: Código, Descrição, Débito, Crédito</li>
                <li>Centro de custo identificado automaticamente</li>
                <li>Valores em formato brasileiro (vírgula como decimal)</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
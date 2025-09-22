import React, { useState, useEffect, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import AggregatorConfig from "./components/AggregatorConfig";
import MonthYearSelector from "./components/MonthYearSelector";
import DataManager from "./components/DataManager";
import ReportFilters from "./components/ReportFilters";
import PriceManager from "./components/PriceManager";
import { db } from "./lib/database";
import "./App.css";

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

export default function App() {
  // empresa
  const [company, setCompany] = useState(
    () => localStorage.getItem("dfc-laosf:company") || COMPANIES[0].id
  );
  const [activeView, setActiveView] = useState("reports");

  // períodos
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  // centro de custo
  const [costCenters, setCostCenters] = useState([]);
  const [currentCostCenter, setCurrentCostCenter] = useState(ALL);

  // dados
  const [aggregators, setAggregators] = useState({
    unassigned: { id: "unassigned", title: "Sem agrupador", accountIds: [] },
  });
  const [accounts, setAccounts] = useState({});
  const [loading, setLoading] = useState(false);

  // ui
  const [expanded, setExpanded] = useState({});
  const [unit, setUnit] = useState("reais");
  const [currentPrices, setCurrentPrices] = useState({});
  const [reportFilters, setReportFilters] = useState({
    viewMode: "specific",
    month: currentMonth,
    year: currentYear,
    costCenter: currentCostCenter,
  });

  const fileInputRef = useRef(null);

  // helpers
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
      if (candidates.some((c) => H[i].includes(c))) return i;
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

  // carregar dados
  const loadMonthData = useCallback(async () => {
    try {
      setLoading(true);

      // centros de custo
      try {
        const ccs = await db.getCentrosCusto?.();
        if (Array.isArray(ccs)) setCostCenters(ccs);
      } catch {}

      // contas
      const contas = await db.getContas();
      const contasMap = {};
      contas.forEach((c) => {
        contasMap[c.idconta] = { id: c.idconta, name: c.nome, valor: 0, sign: "+" };
      });

      // movimentações
      const monthParam = reportFilters.month === ALL ? null : currentMonth;
      const movs = await db.getMovimentacoes(monthParam, currentYear);
      const movsFiltered =
        currentCostCenter === ALL
          ? movs
          : movs.filter((m) => String(m.idcentrocusto) === String(currentCostCenter));

      movsFiltered.forEach((m) => {
        if (!contasMap[m.idconta]) return;
        const v = (m.credito || 0) - (m.debito || 0);
        const prev = contasMap[m.idconta].valor * (contasMap[m.idconta].sign === "+" ? 1 : -1);
        const novo = prev + v;
        contasMap[m.idconta].valor = Math.abs(novo);
        contasMap[m.idconta].sign = novo >= 0 ? "+" : "-";
      });

      // agrupadores
      const grupos = await db.getAgrupadores();
      const gruposMap = {
        unassigned: { id: "unassigned", title: "Sem agrupador", accountIds: [] },
      };
      grupos.forEach((g) => {
        gruposMap[String(g.idagrupador)] = {
          id: String(g.idagrupador),
          title: g.nome,
          accountIds: [],
        };
      });

      // ligações
      const liga = await db.getAgrupadorContas(
        reportFilters.month === ALL ? null : currentMonth,
        currentYear
      );
      liga.forEach((a) => {
        const gid = String(a.idagrupador);
        if (gruposMap[gid] && contasMap[a.idconta]) gruposMap[gid].accountIds.push(a.idconta);
      });

      // não atribuídas
      const assigned = Object.values(gruposMap)
        .filter((g) => g.id !== "unassigned")
        .flatMap((g) => g.accountIds || []);
      gruposMap.unassigned.accountIds = Object.keys(contasMap).filter((id) => !assigned.includes(id));

      setAccounts(contasMap);
      setAggregators(gruposMap);
    } catch (e) {
      console.error("Erro ao carregar dados:", e);
    } finally {
      setLoading(false);
    }
  }, [currentMonth, currentYear, currentCostCenter, reportFilters.month]);

  useEffect(() => {
    loadMonthData();
  }, [loadMonthData]);

  // salvar agrupadores
  const handleSaveGroups = async () => {
    try {
      const associations = [];
      Object.values(aggregators).forEach((agg) => {
        if (agg.id !== "unassigned") {
          (agg.accountIds || []).forEach((accountId) => {
            associations.push({
              idagrupador: Number(agg.id),
              idconta: accountId,
              mes: selectedMonth,
              ano: selectedYear,
            });
          });
        }
      });
      await db.saveAgrupadorContas(associations, selectedMonth, selectedYear);
      alert("Agrupadores salvos!");
    } catch (error) {
      console.error("Erro ao salvar agrupadores:", error);
      alert("Falha ao salvar agrupadores!");
    }
  };

  // importar planilha
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!selectedMonth || !selectedYear) {
      alert("Selecione mês e ano antes de importar.");
      return;
    }
    setLoading(true);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      if (!rows.length) return alert("Planilha vazia.");

      const centro = extractCostCenter(rows);
      let idCC = null;
      if (centro) {
        try {
          const saved = await db.upsertCentroCusto?.({ codigo: centro.id, nome: centro.nome });
          idCC = saved?.idcentrocusto ?? null;
        } catch {}
      }

      let headerIdx = -1;
      for (let i = 0; i < Math.min(rows.length, 60); i++) {
        const r = rows[i].map(norm);
        if (r.some((c) => c.includes("debito")) && r.some((c) => c.includes("credito"))) {
          headerIdx = i;
          break;
        }
      }
      if (headerIdx === -1) return alert("Cabeçalhos não encontrados.");
      const header = rows[headerIdx];
      const colCodigo = findCol(header, ["código", "codigo"]);
      const colDescricao = findCol(header, ["descrição", "descricao"]);
      const colDeb = findCol(header, ["débito", "debito"]);
      const colCred = findCol(header, ["crédito", "credito"]);

      const newAccounts = {};
      const movimentacoes = [];

      for (let r = headerIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        const codigoRaw = colCodigo !== -1 ? String(row[colCodigo] || "").trim() : "";
        if (!codigoRaw || !/^\d+$/.test(codigoRaw)) continue;
        const id = codigoRaw;
        const descricao = colDescricao !== -1 ? String(row[colDescricao] || "").trim() : "Sem descrição";
        const deb = parseBRNumber(row[colDeb]);
        const cred = parseBRNumber(row[colCred]);
        if (deb === 0 && cred === 0) continue;

        let idconta = id;
        try {
          const conta = await db.upsertConta({ id, name: descricao });
          idconta = conta?.idconta ?? id;
        } catch {}

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

        const val = cred - deb;
        newAccounts[idconta] = {
          id: idconta,
          name: descricao,
          valor: Math.abs(val),
          sign: val >= 0 ? "+" : "-",
        };
      }

      await db.saveMovimentacoes(movimentacoes, selectedMonth, selectedYear);
      setAccounts(newAccounts);
      setAggregators({
        unassigned: { id: "unassigned", title: "Sem agrupador", accountIds: Object.keys(newAccounts) },
      });

      setCurrentMonth(selectedMonth);
      setCurrentYear(selectedYear);
      setReportFilters((p) => ({ ...p, month: selectedMonth, year: selectedYear }));
      if (idCC) {
        setCurrentCostCenter(String(idCC));
        setReportFilters((p) => ({ ...p, costCenter: String(idCC) }));
      }

      alert(`Importadas ${Object.keys(newAccounts).length} contas para ${selectedMonth}/${selectedYear}.`);
      setActiveView("reports");
    } catch (err) {
      console.error("Erro ao importar:", err);
      alert("Erro ao importar: " + err.message);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const formatValue = (value) => `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  return (
    <div className="container">
      <div className="sidebar">
        <h1>DFC Enhanced</h1>

        <h2>Selecione a Empresa</h2>
        <select value={company} onChange={(e) => setCompany(e.target.value)}>
          {COMPANIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id} - {c.name}
            </option>
          ))}
        </select>

        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`tab-btn ${activeView === t.id ? "active" : ""}`} onClick={() => setActiveView(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {activeView === "import" && (
          <>
            <MonthYearSelector
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              onMonthChange={setSelectedMonth}
              onYearChange={setSelectedYear}
              label="Período para Importação"
            />
            <div className="file-upload">
              <h3>Importar Balancete</h3>
              <p>Período: {selectedMonth}/{selectedYear}</p>
              <input ref={fileInputRef} type="file" accept=".xls,.xlsx" onChange={handleFile} />
              {loading && <span>Carregando...</span>}
            </div>
            <DataManager onDataChange={loadMonthData} />
          </>
        )}

        {activeView === "groups" && (
          <>
            <AggregatorConfig aggregators={aggregators} setAggregators={setAggregators} />
            <button onClick={handleSaveGroups} className="btn-save">Salvar agrupadores</button>
          </>
        )}

        {activeView === "reports" && (
          <ReportFilters
            onFilterChange={(f) => {
              setReportFilters(f);
              if (f.viewMode === "specific") {
                setCurrentYear(f.year);
                setCurrentMonth(f.month);
              }
              if (f.costCenter !== undefined) setCurrentCostCenter(f.costCenter);
            }}
            selectedMonth={reportFilters.month}
            selectedYear={reportFilters.year}
            onMonthChange={(m) => { setReportFilters((p) => ({ ...p, month: m })); setCurrentMonth(m); }}
            onYearChange={(y) => { setReportFilters((p) => ({ ...p, year: y })); setCurrentYear(y); }}
            costCenters={[{ idcentrocusto: ALL, nome: "Todos os Centros" }, ...costCenters]}
            selectedCostCenter={reportFilters.costCenter}
            onCostCenterChange={(cc) => { setReportFilters((p) => ({ ...p, costCenter: cc })); setCurrentCostCenter(cc); }}
            enableAllMonths
          />
        )}
      </div>

      {activeView === "reports" && (
        <div className="report-list-view">
          <h2>
            Relatório - {currentYear}
            {reportFilters.month === ALL ? " - Todos os meses" : ` - ${new Date(currentYear, currentMonth - 1).toLocaleString("pt-BR", { month: "long" })}`}
            {currentCostCenter === ALL ? " - Todos os Centros" : (() => {
              const cc = costCenters.find((c) => String(c.idcentrocusto) === String(currentCostCenter));
              return cc ? ` - CC: ${cc.codigo ? cc.codigo + " - " : ""}${cc.nome}` : "";
            })()}
          </h2>

          <table className="report-table">
            <thead>
              <tr><th>Agrupador</th><th>Receita</th><th>Despesas</th><th>Resultado</th></tr>
            </thead>
            <tbody>
              {Object.values(aggregators).map((col) => {
                const ids = col.id === "unassigned"
                  ? Object.keys(accounts).filter((id) => Object.values(aggregators).filter((a) => a.id !== "unassigned").every((a) => !(a.accountIds || []).includes(id)))
                  : (col.accountIds || []).filter((id) => accounts[id]);

                const rec = ids.reduce((s, id) => s + (accounts[id]?.sign === "+" ? accounts[id].valor : 0), 0);
                const desp = ids.reduce((s, id) => s + (accounts[id]?.sign === "-" ? accounts[id].valor : 0), 0);
                const res = rec - desp;

                return (
                  <tr key={col.id}>
                    <td>{col.title}</td>
                    <td>{formatValue(rec)}</td>
                    <td>{formatValue(-desp)}</td>
                    <td>{formatValue(res)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeView === "groups" && (
        <DragDropContext onDragEnd={() => {}}>
          <div className="grid">
            {Object.values(aggregators).map((col) => (
              <Droppable key={col.id} droppableId={col.id}>
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="column">
                    <h2>{col.title}</h2>
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            ))}
          </div>
        </DragDropContext>
      )}
    </div>
  );
}

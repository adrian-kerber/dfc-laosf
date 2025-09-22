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

// valor sentinela para "todos"
const ALL = "all";

export default function App() {
  // Empresa e abas
  const [company, setCompany] = useState(
    () => localStorage.getItem("dfc-laosf:company") || COMPANIES[0].id
  );
  const [activeView, setActiveView] = useState("reports");

  // Período de importação (UI do upload)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // 🔑 Período de visualização (Relatórios + Agrupadores)
  // month pode ser número 1..12 ou "all"
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  // Centro de Custo (filtro do relatório)
  const [costCenters, setCostCenters] = useState([]); // [{idcentrocusto, codigo, nome}]
  const [currentCostCenter, setCurrentCostCenter] = useState(ALL); // id numérico ou "all"

  // Dados
  const [aggregators, setAggregators] = useState({
    unassigned: { id: "unassigned", title: "Sem agrupador", accountIds: [] },
  });
  const [accounts, setAccounts] = useState({});
  const [loading, setLoading] = useState(false);

  // UI
  const [expanded, setExpanded] = useState({});
  const [unit, setUnit] = useState("reais");
  const [currentPrices, setCurrentPrices] = useState({});

  // Filtros (mostrados na UI)
  const [reportFilters, setReportFilters] = useState({
    viewMode: "specific",
    month: currentMonth, // pode virar "all"
    year: currentYear,
    costCenter: currentCostCenter, // "all" ou id
  });

  const fileInputRef = useRef(null);

  // ---------- helpers ----------
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
          let id = null,
            nome = raw;
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

  // ---------- LOAD (usa currentMonth/currentYear/currentCostCenter) ----------
  const loadMonthData = useCallback(async () => {
    try {
      setLoading(true);

      // 0) centros de custo (lista para filtro)
      try {
        const ccs = await db.getCentrosCusto?.();
        if (Array.isArray(ccs)) setCostCenters(ccs);
      } catch (e) {
        console.warn("getCentrosCusto indisponível:", e?.message || e);
      }

      // 1) Contas
      const contas = await db.getContas();
      const contasMap = {};
      contas.forEach((c) => {
        contasMap[c.idconta] = { id: c.idconta, name: c.nome, valor: 0, sign: "+" };
      });

      // 2) Movimentações
      const monthParam = reportFilters.month === ALL ? null : currentMonth; // null => ano inteiro
      const movs = await db.getMovimentacoes(monthParam, currentYear);
      const movsFiltered =
        currentCostCenter === ALL
          ? movs
          : movs.filter((m) => String(m.idcentrocusto) === String(currentCostCenter));

      movsFiltered.forEach((m) => {
        if (!contasMap[m.idconta]) return;
        const v = (m.credito || 0) - (m.debito || 0);
        // como pode vir múltiplos meses, vamos ACUMULAR
        const prev = contasMap[m.idconta].valor * (contasMap[m.idconta].sign === "+" ? 1 : -1);
        const novo = prev + v;
        contasMap[m.idconta].valor = Math.abs(novo);
        contasMap[m.idconta].sign = novo >= 0 ? "+" : "-";
      });

      // 3) Agrupadores
      const grupos = await db.getAgrupadores(); // [{idagrupador, nome}]
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

      // 4) Ligações (por período visível)
      const liga = await db.getAgrupadorContas(
        reportFilters.month === ALL ? null : currentMonth,
        currentYear
      );
      liga.forEach((a) => {
        const gid = String(a.idagrupador);
        if (gruposMap[gid] && contasMap[a.idconta]) gruposMap[gid].accountIds.push(a.idconta);
      });

      // 5) Unassigned
      const assigned = Object.values(gruposMap)
        .filter((g) => g.id !== "unassigned")
        .flatMap((g) => g.accountIds || []);
      gruposMap.unassigned.accountIds = Object.keys(contasMap).filter((id) => !assigned.includes(id));

      setAccounts(contasMap);
      setAggregators(gruposMap);
    } catch (e) {
      console.error("Erro ao carregar dados:", e);
      const aggKey = `dfc-laosf:${company}:aggregators`;
      const saved = localStorage.getItem(aggKey);
      if (saved) setAggregators(JSON.parse(saved));
    } finally {
      setLoading(false);
    }
  }, [currentMonth, currentYear, currentCostCenter, reportFilters.month, company]);

  useEffect(() => {
    loadMonthData();
  }, [loadMonthData]);

  useEffect(() => {
    localStorage.setItem("dfc-laosf:company", company);
  }, [company]);

  // ---------- IMPORT ----------
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

      // Centro de custo da faixa superior
      const centro = extractCostCenter(rows);
      let idCC = null;
      if (centro) {
        try {
          const saved = await db.upsertCentroCusto?.({ codigo: centro.id, nome: centro.nome });
          idCC = saved?.idcentrocusto ?? null;
        } catch (e2) {
          console.warn("upsertCentroCusto indisponível:", e2?.message || e2);
        }
      }

      // localizar cabeçalho
      let headerIdx = -1;
      for (let i = 0; i < Math.min(rows.length, 60); i++) {
        const r = rows[i].map(norm);
        const hasDeb = r.some((c) => c.includes("débito") || c.includes("debito"));
        const hasCred = r.some((c) => c.includes("crédito") || c.includes("credito"));
        const hasConta = r.some((c) => c.includes("conta"));
        const hasCodigo = r.some((c) => c.includes("código") || c.includes("codigo"));
        const hasDesc = r.some((c) => c.includes("descrição") || c.includes("descricao"));
        if (hasDeb && hasCred && (hasConta || hasCodigo) && hasDesc) {
          headerIdx = i;
          break;
        }
      }
      if (headerIdx === -1) {
        return alert("Não encontrei cabeçalhos (Conta/Código/Descrição/Débito/Crédito).");
      }
      const header = rows[headerIdx];
      const colCodigo = findCol(header, ["código", "codigo"]);
      const colDescricao = findCol(header, ["descrição", "descricao"]);
      const colDeb = findCol(header, ["débito", "debito"]);
      const colCred = findCol(header, ["crédito", "credito"]);
      if (colDeb === -1 || colCred === -1) {
        return alert("Cabeçalhos de Débito/Crédito não encontrados.");
      }

      const newAccounts = {};
      const movimentacoes = [];

      for (let r = headerIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        const codigoRaw = colCodigo !== -1 ? String(row[colCodigo] || "").trim() : "";
        if (!codigoRaw || !/^\d+$/.test(codigoRaw)) continue; // só código numérico

        const id = codigoRaw; // idconta = código
        const descricao = colDescricao !== -1 ? String(row[colDescricao] || "").trim() : "Sem descrição";
        const deb = parseBRNumber(row[colDeb]);
        const cred = parseBRNumber(row[colCred]);
        if (deb === 0 && cred === 0) continue;

        let idconta = id;
        try {
          const conta = await db.upsertConta({ id, name: descricao });
          idconta = conta?.idconta ?? id;
        } catch (e3) {
          console.warn("upsertConta falhou, fallback local:", e3?.message || e3);
        }

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

      try {
        await db.saveMovimentacoes(movimentacoes, selectedMonth, selectedYear);
      } catch (e4) {
        console.error("Erro ao salvar movimentações:", e4);
      }

      setAccounts(newAccounts);
      setAggregators({
        unassigned: {
          id: "unassigned",
          title: "Sem agrupador",
          accountIds: Object.keys(newAccounts),
        },
      });

      // alinhar período de visualização ao importado
      setCurrentMonth(selectedMonth);
      setCurrentYear(selectedYear);
      setReportFilters((p) => ({ ...p, month: selectedMonth, year: selectedYear }));

      // se importou com CC, já seleciona o CC na UI para o user ver o resultado daquele centro
      if (idCC) {
        setCurrentCostCenter(String(idCC));
        setReportFilters((p) => ({ ...p, costCenter: String(idCC) }));
      }

      alert(
        `Importadas ${Object.keys(newAccounts).length} contas para ${selectedMonth}/${selectedYear}${
          centro ? ` (CC: ${centro.id ? centro.id + " - " : ""}${centro.nome})` : ""
        }.`
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

  // ---------- DnD & salvar agrupadores ----------
  const onDragEnd = async ({ source, destination, draggableId }) => {
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const start = aggregators[source.droppableId];
    const finish = aggregators[destination.droppableId];

    const newStart = Array.from(start.accountIds || []);
    newStart.splice(source.index, 1);
    const newFinish = Array.from(finish.accountIds || []);
    newFinish.splice(destination.index, 0, draggableId);

    const newAggregators = {
      ...aggregators,
      [start.id]: { ...start, accountIds: newStart },
      [finish.id]: { ...finish, accountIds: newFinish },
    };
    setAggregators(newAggregators);

    try {
      if (finish.id !== "unassigned") {
        await db.syncAgrupadorToAllMonths?.(Number(finish.id), draggableId, "add");
      }
      if (start.id !== "unassigned") {
        await db.syncAgrupadorToAllMonths?.(Number(start.id), draggableId, "remove");
      }
    } catch (error) {
      console.error("Erro ao sincronizar agrupador:", error);
      const aggKey = `dfc-laosf:${company}:aggregators`;
      localStorage.setItem(aggKey, JSON.stringify(newAggregators));
    }
  };

  const toggleSign = (id) => {
    setAccounts((prev) => ({
      ...prev,
      [id]: { ...prev[id], sign: prev[id].sign === "+" ? "-" : "+" },
    }));
  };

// dentro do App.jsx
const handleClearAll = async () => {
  if (!window.confirm("Tem certeza que deseja limpar todos os dados?")) return;
  try {
    await db.clearAllData();
    alert("Todos os dados foram removidos do banco!");
    setAggregators({ unassigned: { id: "unassigned", title: "Sem agrupador", accountIds: [] } });
    setAccounts({});
    setExpanded({});
  } catch (error) {
    console.error("Erro ao limpar banco:", error);
    alert("Erro ao limpar dados: " + error.message);
  }
};


  const handleSaveGroups = async () => {
    try {
      const associations = [];
      Object.values(aggregators).forEach((agg) => {
        if (agg.id === "unassigned") return;
        const gid = Number(agg.id);
        if (!Number.isInteger(gid)) return;
        (agg.accountIds || []).forEach((accountId) => {
          associations.push({ idagrupador: gid, idconta: accountId });
        });
      });

      if (reportFilters.month === ALL) {
        // aplica para o ano inteiro
        for (let m = 1; m <= 12; m++) {
          await db.saveAgrupadorContas(associations, m, currentYear);
        }
        alert(`Agrupadores salvos para todos os meses de ${currentYear}.`);
      } else {
        await db.saveAgrupadorContas(associations, currentMonth, currentYear);
        alert("Agrupadores salvos!");
      }

      loadMonthData();
    } catch (error) {
      console.error("Erro ao salvar no banco:", error);
      const aggKey = `dfc-laosf:${company}:aggregators`;
      localStorage.setItem(aggKey, JSON.stringify(aggregators));
      alert("Agrupadores salvos localmente (fallback).");
    }
  };

  // ---------- format ----------
  const formatValue = (value) => {
    const absValue = Math.abs(value);
    switch (unit) {
      case "soja":
        if (!currentPrices.soja) return "-";
        return `${Math.round(absValue / parseFloat(currentPrices.soja)).toLocaleString("pt-BR")} sacas de soja`;
      case "milho":
        if (!currentPrices.milho) return "-";
        return `${Math.round(absValue / parseFloat(currentPrices.milho)).toLocaleString("pt-BR")} sacas de milho`;
      case "suino":
        if (!currentPrices.suino) return "-";
        return `${Math.round(absValue / parseFloat(currentPrices.suino)).toLocaleString("pt-BR")} kg suíno`;
      default:
        return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
    }
  };

  // ---------- render ----------
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
            <button
              key={t.id}
              className={`tab-btn ${activeView === t.id ? "active" : ""}`}
              onClick={() => setActiveView(t.id)}
              title={t.label}
            >
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
              <p style={{ fontSize: "12px", color: "#666" }}>
                Período: {selectedMonth}/{selectedYear}
              </p>
              <input ref={fileInputRef} type="file" accept=".xls,.xlsx" onChange={handleFile} />
              {loading && <span>Carregando...</span>}
            </div>

            <DataManager onDataChange={loadMonthData} />
            <button onClick={handleClearAll} className="btn-clear">
  Limpar tudo
</button>

          </>
        )}

        {activeView === "groups" && (
          <>
            <AggregatorConfig aggregators={aggregators} setAggregators={setAggregators} />
            <button onClick={handleSaveGroups} className="btn-save">
              Salvar agrupadores
            </button>
          </>
        )}

        {activeView === "reports" && (
          <>
            {/* Filtros do relatório */}
            <ReportFilters
              // quando mudar, sincronizo com currentMonth/currentYear/currentCostCenter
              onFilterChange={(f) => {
                setReportFilters(f);
                if (f.viewMode === "specific") {
                  setCurrentYear(f.year);
                  setCurrentMonth(f.month);
                }
                if (f.costCenter !== undefined) {
                  setCurrentCostCenter(f.costCenter);
                }
              }}
              // estado atual
              selectedMonth={reportFilters.month}
              selectedYear={reportFilters.year}
              onMonthChange={(month) => {
                setReportFilters((p) => ({ ...p, month }));
                setCurrentMonth(month);
              }}
              onYearChange={(year) => {
                setReportFilters((p) => ({ ...p, year }));
                setCurrentYear(year);
              }}
              // 💡 novos props para filtro de centro de custo
              costCenters={[{ idcentrocusto: ALL, nome: "Todos os Centros" }, ...costCenters]}
              selectedCostCenter={reportFilters.costCenter}
              onCostCenterChange={(cc) => {
                setReportFilters((p) => ({ ...p, costCenter: cc }));
                setCurrentCostCenter(cc);
              }}
              // habilita opção "Todos os meses"
              enableAllMonths
            />

            <h2>Unidade de Medida</h2>
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
              : ` - ${new Date(currentYear, currentMonth - 1).toLocaleString("pt-BR", {
                  month: "long",
                })}`}
            {currentCostCenter === ALL
              ? " - Todos os Centros"
              : (() => {
                  const cc = costCenters.find((c) => String(c.idcentrocusto) === String(currentCostCenter));
                  return cc ? ` - CC: ${cc.codigo ? cc.codigo + " - " : ""}${cc.nome}` : "";
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
                let totalRec = 0,
                  totalDesp = 0;

                return aggs
                  .map((col) => {
                    const ids =
                      col.id === "unassigned"
                        ? Object.keys(accounts).filter((id) =>
                            aggs
                              .filter((a) => a.id !== "unassigned")
                              .every((a) => !(a.accountIds || []).includes(id))
                          )
                        : (col.accountIds || []).filter((id) => accounts[id]);

                    const rec = ids.reduce(
                      (s, id) => s + (accounts[id]?.sign === "+" ? accounts[id].valor : 0),
                      0
                    );
                    const desp = ids.reduce(
                      (s, id) => s + (accounts[id]?.sign === "-" ? accounts[id].valor : 0),
                      0
                    );
                    const res = rec - desp;
                    totalRec += rec;
                    totalDesp += desp;

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

                        {expanded[col.id] &&
                          ids.map((id) => {
                            const a = accounts[id];
                            if (!a) return null;
                            const recA = a.sign === "+" ? a.valor : 0;
                            const despA = a.sign === "-" ? a.valor : 0;
                            const resA = recA - despA;
                            return (
                              <tr key={id} className="report-account-row">
                                <td style={{ paddingLeft: 20 }}>{a.name}</td>
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
                  .concat([
                    (() => {
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
                    })(),
                  ]);
              })()}
            </tbody>
          </table>
        </div>
      )}

      {activeView === "groups" && (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid">
            {Object.values(aggregators).map((col) => {
              let validIds;
              if (col.id === "unassigned") {
                const assigned = Object.values(aggregators)
                  .filter((a) => a.id !== "unassigned")
                  .flatMap((a) => a.accountIds || []);
                validIds = Object.keys(accounts).filter((id) => !assigned.includes(id));
              } else {
                validIds = (col.accountIds || []).filter((id) => accounts[id]);
              }

              const total = validIds.reduce(
                (sum, id) => sum + (accounts[id]?.sign === "+" ? accounts[id].valor : -accounts[id].valor),
                0
              );

              return (
                <Droppable key={col.id} droppableId={col.id}>
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="column">
                      <h2>{col.title}</h2>
                      <div className="aggregator-total">
                        Total: R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
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
                                <span className="description">{accounts[acctId]?.name}</span>
                                <button onClick={() => toggleSign(acctId)} className="sign-btn" title="Alternar sinal">
                                  {accounts[acctId]?.sign}
                                </button>
                              </div>
                              <div className="card-body">
                                Resultado: R{"$ "}
                                {(
                                  accounts[acctId]?.sign === "+"
                                    ? accounts[acctId].valor
                                    : -accounts[acctId].valor
                                ).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
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
        </div>
      )}
    </div>
  );
}

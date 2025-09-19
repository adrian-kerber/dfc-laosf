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

export default function App() {
  // Estado básico
  const [company, setCompany] = useState(
    () => localStorage.getItem("dfc-laosf:company") || COMPANIES[0].id
  );

  // Seleção de mês/ano para importação
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Estado dos dados
  const [aggregators, setAggregators] = useState({
    unassigned: { id: "unassigned", title: "Sem agrupador", accountIds: [] }
  });
  const [accounts, setAccounts] = useState({});
  const [loading, setLoading] = useState(false);

  // Estado da UI
  const [showReport, setShowReport] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [unit, setUnit] = useState("reais");

  // Filtros do relatório
  const [reportFilters, setReportFilters] = useState({
    viewMode: 'specific',
    month: selectedMonth,
    year: selectedYear
  });

  // Preços para conversão
  const [currentPrices, setCurrentPrices] = useState({});

  const fileInputRef = useRef(null);

  const loadMonthData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Carrega contas do banco
      const contas = await db.getContas();
      const contasMap = {};
      
      // Carrega movimentações do mês/ano selecionado
      const movimentacoes = await db.getMovimentacoes(selectedMonth, selectedYear);
      
      // Monta mapa de contas com valores
      contas.forEach(conta => {
        contasMap[conta.idconta] = {
          id: conta.idconta,
          name: conta.nome,
          valor: 0,
          sign: "+"
        };
      });

      // Aplica movimentações
      movimentacoes.forEach(mov => {
        if (contasMap[mov.idconta]) {
          const valor = (mov.credito || 0) - (mov.debito || 0);
          contasMap[mov.idconta].valor = Math.abs(valor);
          contasMap[mov.idconta].sign = valor >= 0 ? "+" : "-";
        }
      });

      // Carrega agrupadores do banco
      const agrupadores = await db.getAgrupadores();
      const agrupadorContas = await db.getAgrupadorContas(selectedMonth, selectedYear);
      
      const aggMap = {
        unassigned: { id: "unassigned", title: "Sem agrupador", accountIds: [] }
      };

      // Monta agrupadores
      agrupadores.forEach(agg => {
        aggMap[agg.idagrupador] = {
          id: agg.idagrupador,
          title: agg.nome,
          accountIds: []
        };
      });

      // Associa contas aos agrupadores
      agrupadorContas.forEach(assoc => {
        if (aggMap[assoc.idagrupador] && contasMap[assoc.idconta]) {
          aggMap[assoc.idagrupador].accountIds.push(assoc.idconta);
        }
      });

      // Contas não agrupadas
      const assignedAccounts = Object.values(aggMap)
        .filter(agg => agg.id !== "unassigned")
        .flatMap(agg => agg.accountIds);
      
      aggMap.unassigned.accountIds = Object.keys(contasMap)
        .filter(id => !assignedAccounts.includes(id));

      setAccounts(contasMap);
      setAggregators(aggMap);

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      // Fallback para dados locais se banco não estiver disponível
      const aggKey = `dfc-laosf:${company}:aggregators`;
      const saved = localStorage.getItem(aggKey);
      if (saved) {
        setAggregators(JSON.parse(saved));
      }
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear, company]);

  // Carrega dados quando mês/ano muda
  useEffect(() => {
    loadMonthData();
  }, [loadMonthData]);

  // Salva empresa selecionada
  useEffect(() => {
    localStorage.setItem("dfc-laosf:company", company);
  }, [company]);

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

      if (!rows.length) {
        alert("Planilha vazia.");
        return;
      }

      // Localiza linha de cabeçalho
      let headerIdx = -1;
      for (let i = 0; i < Math.min(rows.length, 60); i++) {
        const row = rows[i].map(cell => 
          String(cell || "").toLowerCase().replace(/\s+/g, " ").trim()
        );
        const hasDeb = row.some((c) => c.includes("débito") || c.includes("debito"));
        const hasCred = row.some((c) => c.includes("crédito") || c.includes("credito"));
        const hasConta = row.some((c) => c.includes("conta"));
        const hasCodigo = row.some((c) => c.includes("código") || c.includes("codigo"));
        const hasDesc = row.some((c) => c.includes("descrição") || c.includes("descricao"));
        
        if (hasDeb && hasCred && (hasConta || hasCodigo) && hasDesc) {
          headerIdx = i;
          break;
        }
      }

      if (headerIdx === -1) {
        alert("Não encontrei cabeçalhos (Conta/Código/Descrição/Débito/Crédito).");
        return;
      }

      const header = rows[headerIdx];

      // Encontra índices das colunas
      const findCol = (headerRow, candidates) => {
        const H = headerRow.map(cell => 
          String(cell || "").toLowerCase().replace(/\s+/g, " ").trim()
        );
        for (let i = 0; i < H.length; i++) {
          const cell = H[i];
          if (!cell) continue;
          if (candidates.some((c) => cell.includes(c))) return i;
        }
        return -1;
      };

      const colConta = findCol(header, ["conta"]);
      const colCodigo = findCol(header, ["código", "codigo"]);
      const colDescricao = findCol(header, ["descrição", "descricao"]);
      const colDeb = findCol(header, ["débito", "debito"]);
      const colCred = findCol(header, ["crédito", "credito"]);

      if (colDeb === -1 || colCred === -1) {
        alert("Cabeçalhos de Débito/Crédito não encontrados.");
        return;
      }

      // Processa dados
      const newAccounts = {};
      const movimentacoes = [];

      const parseBRNumber = (val) => {
        if (val == null) return 0;
        if (typeof val === "number" && Number.isFinite(val)) return val;
        const s = String(val).trim();
        if (!s) return 0;
        const n = parseFloat(s.replace(/\s+/g, "").replace(/\./g, "").replace(/,/g, "."));
        return Number.isFinite(n) ? n : 0;
      };

      for (let r = headerIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        const contaRaw = colConta !== -1 ? String(row[colConta] || "").trim() : "";
        const codigoRaw = colCodigo !== -1 ? String(row[colCodigo] || "").trim() : "";
        const descricaoRaw = colDescricao !== -1 ? String(row[colDescricao] || "").trim() : "";

        let id = contaRaw || codigoRaw;
        id = String(id || "").trim();
        
        if (!id || !/^[\d.]+$/.test(id)) continue;

        const name = descricaoRaw || codigoRaw || "Sem descrição";
        const deb = parseBRNumber(row[colDeb]);
        const cred = parseBRNumber(row[colCred]);
        
        if (deb === 0 && cred === 0) continue;

        try {
          // Salva conta no banco
          const conta = await db.upsertConta({ id, name });
          
          // Prepara movimentação
          movimentacoes.push({
            idconta: conta.idconta,
            mes: selectedMonth,
            ano: selectedYear,
            debito: deb,
            credito: cred
          });

          const val = cred - deb;
          newAccounts[conta.idconta] = {
            id: conta.idconta,
            name,
            valor: Math.abs(val),
            sign: val >= 0 ? "+" : "-"
          };
        } catch (error) {
          console.error('Erro ao salvar conta:', error);
          // Fallback para localStorage
          const val = cred - deb;
          newAccounts[id] = {
            id,
            name,
            valor: Math.abs(val),
            sign: val >= 0 ? "+" : "-"
          };
        }
      }

      // Salva movimentações no banco
      try {
        await db.saveMovimentacoes(movimentacoes, selectedMonth, selectedYear);
      } catch (error) {
        console.error('Erro ao salvar movimentações:', error);
      }

      // Atualiza estado local
      setAccounts(newAccounts);
      
      // Reset agrupadores para não agrupados
      setAggregators({
        unassigned: {
          id: "unassigned",
          title: "Sem agrupador",
          accountIds: Object.keys(newAccounts)
        }
      });

      alert(`Importadas ${Object.keys(newAccounts).length} contas para ${selectedMonth}/${selectedYear}.`);
      
    } catch (err) {
      console.error("Erro ao importar:", err);
      alert("Erro ao importar dados: " + err.message);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onDragEnd = async ({ source, destination, draggableId }) => {
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const start = aggregators[source.droppableId];
    const finish = aggregators[destination.droppableId];

    const newStart = Array.from(start.accountIds || []);
    newStart.splice(source.index, 1);

    const newFinish = Array.from(finish.accountIds || []);
    newFinish.splice(destination.index, 0, draggableId);

    // Atualiza estado local
    const newAggregators = {
      ...aggregators,
      [start.id]: { ...start, accountIds: newStart },
      [finish.id]: { ...finish, accountIds: newFinish }
    };
    
    setAggregators(newAggregators);

    // Salva no banco se possível
    try {
      if (finish.id !== "unassigned") {
        await db.syncAgrupadorToAllMonths(finish.id, draggableId, 'add');
      }
      if (start.id !== "unassigned") {
        await db.syncAgrupadorToAllMonths(start.id, draggableId, 'remove');
      }
    } catch (error) {
      console.error('Erro ao sincronizar agrupador:', error);
      // Fallback para localStorage
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

  const handleSave = async () => {
    try {
      // Tenta salvar no banco
      const associations = [];
      Object.values(aggregators).forEach(agg => {
        if (agg.id !== "unassigned") {
          agg.accountIds.forEach(accountId => {
            associations.push({
              idagrupador: agg.id,
              idconta: accountId
            });
          });
        }
      });
      
      await db.saveAgrupadorContas(associations, selectedMonth, selectedYear);
      alert("Agrupadores salvos no banco de dados!");
    } catch (error) {
      console.error('Erro ao salvar no banco:', error);
      // Fallback para localStorage
      const aggKey = `dfc-laosf:${company}:aggregators`;
      localStorage.setItem(aggKey, JSON.stringify(aggregators));
      alert("Agrupadores salvos localmente.");
    }
  };

  const clearAll = async () => {
    if (!window.confirm("Tem certeza que deseja limpar todos os dados?")) return;
    
    try {
      await db.clearAllData();
      alert("Todos os dados foram removidos do banco!");
    } catch (error) {
      console.error('Erro ao limpar banco:', error);
      // Limpa localStorage como fallback
      const aggKey = `dfc-laosf:${company}:aggregators`;
      localStorage.removeItem(aggKey);
      alert("Dados locais limpos.");
    }
    
    setAggregators({ unassigned: { id: "unassigned", title: "Sem agrupador", accountIds: [] } });
    setAccounts({});
    setExpanded({});
  };

  const toggleExpand = (id) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

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

        <MonthYearSelector
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          onMonthChange={setSelectedMonth}
          onYearChange={setSelectedYear}
          label="Período para Importação"
        />
        <AggregatorConfig 
          aggregators={aggregators} 
          setAggregators={setAggregators}
        />

        <div className="file-upload">
          <h3>Importar Balancete</h3>
          <p style={{ fontSize: '12px', color: '#666' }}>
            Período selecionado: {selectedMonth}/{selectedYear}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xls,.xlsx"
            onChange={handleFile}
          />
          {loading && <span>Carregando...</span>}
        </div>

        <DataManager onDataChange={loadMonthData} />

        <div className="actions">
          <button
            onClick={() => setShowReport(!showReport)}
            className="btn-save"
            style={{ marginTop: 8 }}
          >
            {showReport ? "Voltar" : "Mostrar Relatório"}
          </button>
        </div>

        {showReport && (
          <>
            <ReportFilters
              onFilterChange={setReportFilters}
              selectedMonth={reportFilters.month}
              selectedYear={reportFilters.year}
              onMonthChange={(month) => setReportFilters(prev => ({ ...prev, month }))}
              onYearChange={(year) => setReportFilters(prev => ({ ...prev, year }))}
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
                selectedMonth={reportFilters.month}
                selectedYear={reportFilters.year}
                onPriceChange={setCurrentPrices}
              />
            )}
          </>
        )}
      </div>

      {showReport ? (
        <div className="report-list-view">
          <h2>
            Relatório - {reportFilters.year}
            {reportFilters.month && reportFilters.viewMode === 'specific' 
              ? ` - ${new Date(reportFilters.year, reportFilters.month - 1).toLocaleString('pt-BR', { month: 'long' })}`
              : reportFilters.viewMode === 'yearly' ? ' - Ano Completo' : ''
            }
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
                          aggs
                            .filter((a) => a.id !== "unassigned")
                            .every((a) => !(a.accountIds || []).includes(id))
                        )
                      : (col.accountIds || []).filter((id) => accounts[id]);

                    const rec = ids.reduce((s, id) => 
                      s + (accounts[id]?.sign === "+" ? accounts[id].valor : 0), 0
                    );
                    const desp = ids.reduce((s, id) => 
                      s + (accounts[id]?.sign === "-" ? accounts[id].valor : 0), 0
                    );
                    const res = rec - desp;
                    totalRec += rec;
                    totalDesp += desp;

                    return (
                      <React.Fragment key={col.id}>
                        <tr 
                          className="report-header-row" 
                          onClick={() => toggleExpand(col.id)} 
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
                    })()
                  ]);
              })()}
            </tbody>
          </table>
        </div>
      ) : (
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
                                <button 
                                  onClick={() => toggleSign(acctId)} 
                                  className="sign-btn" 
                                  title="Alternar sinal"
                                >
                                  {accounts[acctId]?.sign}
                                </button>
                              </div>
                              <div className="card-body">
                                Resultado: R$ {(
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
    </div>
  );
}
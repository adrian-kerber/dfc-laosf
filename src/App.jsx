import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import AggregatorConfig from "./components/AggregatorConfig";
import "./App.css";

// Empresas disponíveis
const COMPANIES = [
  { id: "1", name: "LUIZ ANTONIO ORTOLLAN SALLES" },
  { id: "7", name: "JORGE AUGUSTO SALLES E OUTRO" },
];

export default function App() {
  const [company, setCompany] = useState(
    () => localStorage.getItem("dfc-laosf:company") || COMPANIES[0].id
  );
  const [aggregators, setAggregators] = useState({
    unassigned: { id: "unassigned", title: "Sem agrupador", accountIds: [] },
  });
  const [accounts, setAccounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [expanded, setExpanded] = useState({});

  const aggKey = `dfc-laosf:${company}:aggregators`;
  const accKey = `dfc-laosf:${company}:accounts`;

  useEffect(() => {
    localStorage.setItem("dfc-laosf:company", company);
  }, [company]);

  useEffect(() => {
    const savedAgg = JSON.parse(localStorage.getItem(aggKey));
    const savedAcc = JSON.parse(localStorage.getItem(accKey));
    setAggregators(
      savedAgg || { unassigned: { id: "unassigned", title: "Sem agrupador", accountIds: [] } }
    );
    setAccounts(savedAcc || {});
    setExpanded({});
  }, [company]);

  const handleSave = () => {
    localStorage.setItem(aggKey, JSON.stringify(aggregators));
    localStorage.setItem(accKey, JSON.stringify(accounts));
    alert("Dados salvos com sucesso.");
  };

  const toggleSign = (id) => {
    setAccounts((prev) => ({
      ...prev,
      [id]: { ...prev[id], sign: prev[id].sign === "+" ? "-" : "+" },
    }));
  };

  const onDragEnd = ({ source, destination, draggableId }) => {
    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) return;
    const start = aggregators[source.droppableId];
    const finish = aggregators[destination.droppableId];
    const newStart = Array.from(start.accountIds);
    newStart.splice(source.index, 1);
    const newFinish = Array.from(finish.accountIds);
    newFinish.splice(destination.index, 0, draggableId);
    setAggregators((prev) => ({
      ...prev,
      [start.id]: { ...start, accountIds: newStart },
      [finish.id]: { ...finish, accountIds: newFinish },
    }));
  };

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      const parseNumber = (val) =>
        typeof val === "number"
          ? val
          : parseFloat(val.toString().replace(/\./g, "").replace(/,/g, ".")) || 0;
      const dataRows = rows.filter((row) => {
        const code = String(row[0] || "").trim();
        const name = String(row[2] || "").trim();
        if (!/^[0-9]{2,}/.test(code) || !name) return false;
        const entrada = parseNumber(row[9]);
        const saida = parseNumber(row[10]);
        return entrada !== 0 || saida !== 0;
      });
      const newAcc = {};
      const ids = [];
      dataRows.forEach((row) => {
        const code = String(row[0]).trim();
        const name = String(row[2]).trim();
        const entrada = parseNumber(row[9]);
        const saida = parseNumber(row[10]);
        const result = entrada - saida;
        newAcc[code] = { id: code, code, name, valor: Math.abs(result), sign: result >= 0 ? "+" : "-" };
        ids.push(code);
      });
      setAccounts(newAcc);
      setAggregators((prev) => ({
        ...prev,
        unassigned: { ...prev.unassigned, accountIds: ids },
      }));
    } catch {
      alert("Erro ao ler o arquivo Excel.");
    } finally {
      setLoading(false);
    }
  };

  const clearAll = () => {
    localStorage.removeItem(aggKey);
    localStorage.removeItem(accKey);
    setAggregators({ unassigned: { id: "unassigned", title: "Sem agrupador", accountIds: [] } });
    setAccounts({});
  };

  const toggleExpand = (id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="container">
      {/* Sidebar */}
      <div>
        <h1>DFC</h1>
        <h2>Selecione a Empresa</h2>
        <select value={company} onChange={(e) => setCompany(e.target.value)}>
          {COMPANIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id} - {c.name}
            </option>
          ))}
        </select>
        <AggregatorConfig aggregators={aggregators} setAggregators={setAggregators} />
        <div className="file-upload">
          <input type="file" accept=".xls,.xlsx" onChange={handleFile} />
          {loading && <span>Carregando...</span>}
        </div>
        <div className="actions">
          <button onClick={handleSave} className="btn-save">Salvar</button>
          <button onClick={clearAll} className="btn-clear">Limpar tudo</button>
          <button
            onClick={() => setShowReport(!showReport)}
            className="btn-save"
            style={{ marginTop: '8px' }}
          >
            {showReport ? 'Voltar' : 'Mostrar Relatório'}
          </button>
        </div>
      </div>

      {/* Main area */}
      {showReport ? (
        <div className="report-grid">
          {Object.values(aggregators).map((col) => {
            const total = col.accountIds.reduce(
              (sum, id) =>
                sum + (accounts[id]?.sign === "+" ? accounts[id].valor : -accounts[id].valor),
              0
            );
            return (
              <div key={col.id} className="report-section">
                <div className="report-header" onClick={() => toggleExpand(col.id)}>
                  <span className="report-title">{col.title}</span>
                  <span className="report-total">
                    {total.toLocaleString('pt-BR',{minimumFractionDigits:2})}
                  </span>
                </div>
                {expanded[col.id] && (
                  <ul className="report-list">
                    {col.accountIds.map((id) => {
                      const acct = accounts[id];
                      const applied = acct.sign === "+" ? acct.valor : -acct.valor;
                      return (
                        <li key={id} className="report-item">
                          {acct.name}: {applied.toLocaleString('pt-BR',{minimumFractionDigits:2})}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid">
            {Object.values(aggregators).map((col) => {
              const total = col.accountIds.reduce(
                (sum, id) =>
                  sum + (accounts[id]?.sign === "+" ? accounts[id].valor : -accounts[id].valor),
                0
              );
              return (
                <Droppable key={col.id} droppableId={col.id}>
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="column"
                    >
                      <h2>{col.title}</h2>
                      <div className="aggregator-total">
                        Total: {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </div>
                      {col.accountIds.map((acctId, index) => {
                        const acct = accounts[acctId];
                        const applied = acct.sign === "+" ? acct.valor : -acct.valor;
                        return (
                          <Draggable key={acctId} draggableId={acctId} index={index}>
                            {(prov) => (
                              <div
                                ref={prov.innerRef}
                                {...prov.draggableProps}
                                {...prov.dragHandleProps}
                                className="card"
                              >
                                <div className="card-header">
                                  <span className="description">{acct.name}</span>
                                  <button
                                    onClick={() => toggleSign(acct.id)}
                                    className="sign-btn"
                                  >
                                    {acct.sign}
                                  </button>
                                </div>
                                <div className="card-body">
                                  Resultado: {applied.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                </div>
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
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
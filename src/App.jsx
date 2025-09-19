import React, { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import AggregatorConfig from "./components/AggregatorConfig";
import "./App.css";

/*
  ==========================================
  App.jsx — DFC (importação + agrupadores)
  - Lê Excel de balancete detectando colunas por nome
  - Normaliza números pt-BR
  - Permite arrastar contas entre agrupadores
  - Gera relatório com múltiplas unidades (R$, soja, milho, suíno)
  ==========================================
*/

// Empresas disponíveis
const COMPANIES = [
  { id: "1", name: "LUIZ ANTONIO ORTOLLAN SALLES" },
  { id: "7", name: "JORGE AUGUSTO SALLES E OUTRO" },
];

export default function App() {
  /* =========================
     ESTADO BÁSICO
     ========================= */
  // Empresa selecionada
  const [company, setCompany] = useState(
    () => localStorage.getItem("dfc-laosf:company") || COMPANIES[0].id
  );

  // Chave dos agrupadores na empresa atual
  const aggKey = `dfc-laosf:${company}:aggregators`;

  // Agrupadores (IDs de conta por agrupador). Sempre mantém "unassigned".
  const [aggregators, setAggregators] = useState(() => {
    const saved = localStorage.getItem(aggKey);
    return saved
      ? JSON.parse(saved)
      : { unassigned: { id: "unassigned", title: "Sem agrupador", accountIds: [] } };
  });

  // Contas carregadas do último upload (mapa id-> {id,name,valor,sign})
  const [accounts, setAccounts] = useState({});
  const [loading, setLoading] = useState(false);

  // Relatório: visibilidade, expansão e unidade
  const [showReport, setShowReport] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [unit, setUnit] = useState("reais"); // 'reais', 'soja', 'milho', 'suino'
  const [priceSoy, setPriceSoy] = useState("");
  const [priceCorn, setPriceCorn] = useState("");
  const [pricePig, setPricePig] = useState("");

  // Ref para resetar o input de arquivo (permite reenviar o mesmo arquivo)
  const fileInputRef = useRef(null);

  const toggleExpand = (id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  /* =========================
     EFEITO: troca de empresa
     ========================= */
  useEffect(() => {
    localStorage.setItem("dfc-laosf:company", company);
    const savedAgg = localStorage.getItem(aggKey);
    setAggregators(
      savedAgg
        ? JSON.parse(savedAgg)
        : { unassigned: { id: "unassigned", title: "Sem agrupador", accountIds: [] } }
    );
    setAccounts({});
    setExpanded({});
    setShowReport(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company]);

  /* =========================
     AÇÕES BÁSICAS
     ========================= */
  const handleSave = () => {
    localStorage.setItem(aggKey, JSON.stringify(aggregators));
    alert("Agrupadores salvos com sucesso.");
  };

  const toggleSign = (id) => {
    setAccounts((prev) => ({
      ...prev,
      [id]: { ...prev[id], sign: prev[id].sign === "+" ? "-" : "+" },
    }));
  };

  // Drag & Drop entre colunas (agrupadores)
  const onDragEnd = ({ source, destination, draggableId }) => {
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index)
      return;

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

  const clearAll = () => {
    localStorage.removeItem(aggKey);
    setAggregators({ unassigned: { id: "unassigned", title: "Sem agrupador", accountIds: [] } });
    setAccounts({});
    setExpanded({});
  };

  /* =========================
     HELPERS DE PARSE
     ========================= */

  // Normaliza número pt-BR (pontos como milhar, vírgula como decimal) e aceita number
  const parseBRNumber = (val) => {
    if (val == null) return 0;
    if (typeof val === "number" && Number.isFinite(val)) return val;
    const s = String(val).trim();
    if (!s) return 0;
    const n = parseFloat(s.replace(/\s+/g, "").replace(/\./g, "").replace(/,/g, "."));
    return Number.isFinite(n) ? n : 0;
  };

  // Encontra índice de coluna por nome (usa includes e normalização)
  const findCol = (headerRow, candidates) => {
    const norm = (x) => String(x || "").toLowerCase().replace(/\s+/g, " ").trim();
    const H = headerRow.map(norm);
    for (let i = 0; i < H.length; i++) {
      const cell = H[i];
      if (!cell) continue;
      if (candidates.some((c) => cell.includes(c))) return i;
    }
    return -1;
  };

  /* =========================
     IMPORTAÇÃO DO EXCEL (ROBUSTA)
     ========================= */
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });

      // Usa a primeira aba
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

      if (!rows.length) {
        console.warn("Planilha vazia.");
        alert("Planilha vazia.");
        return;
      }

      // 1) Detecta a linha de cabeçalho procurando por 'conta' + ('débito' e 'crédito') nas primeiras 40 linhas
      let headerIdx = -1;
      for (let i = 0; i < Math.min(rows.length, 40); i++) {
        const row = rows[i].map((x) => String(x || "").toLowerCase());
        const hasConta = row.some((c) => c.includes("conta"));
        const hasDeb = row.some((c) => c.includes("débito") || c.includes("debito"));
        const hasCred = row.some((c) => c.includes("crédito") || c.includes("credito"));
        if (hasConta && hasDeb && hasCred) {
          headerIdx = i;
          break;
        }
      }
      if (headerIdx === -1) {
        console.warn("Cabeçalho não encontrado.");
        alert("Não encontrei os cabeçalhos (Conta/Débito/Crédito). Me envie um print da linha de títulos.");
        return;
      }

      const header = rows[headerIdx];

      // 2) Índices das colunas relevantes
      const colConta = findCol(header, ["conta", "código", "codigo"]);
      const colDesc = findCol(header, ["descrição", "descricao"]);
      const colDeb = findCol(header, ["débito", "debito"]);
      const colCred = findCol(header, ["crédito", "credito"]);

      const required = { colConta, colDesc, colDeb, colCred };
      for (const [k, v] of Object.entries(required)) {
        if (v === -1) {
          console.warn(`Coluna obrigatória ausente: ${k}`);
          alert(`Não encontrei a coluna obrigatória (${k}).`);
          return;
        }
      }

      // 3) Percorre as linhas de dados após o cabeçalho
      const newAcc = {};
      const allIds = [];

      for (let r = headerIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        const rawCode = String(row[colConta] || "").trim();
        const name = String(row[colDesc] || "").trim();
        if (!rawCode || !name) continue;

        // Aceita códigos com dígitos e pontos (ex.: 1.1.1.01)
        const looksLikeAccount = /^[0-9.]+$/.test(rawCode);
        if (!looksLikeAccount) continue;

        const deb = parseBRNumber(row[colDeb]);
        const cred = parseBRNumber(row[colCred]);

        // Ignora linhas totalmente zeradas
        if (deb === 0 && cred === 0) continue;

        // Escolha do sinal: aqui considero RESULTADO = CRÉDITO - DÉBITO
        // Se preferir o contrário (Débito - Crédito), troque a linha abaixo.
        const val = cred - deb;

        newAcc[rawCode] = {
          id: rawCode,
          name,
          valor: Math.abs(val),
          sign: val >= 0 ? "+" : "-",
        };
        allIds.push(rawCode);
      }

      if (!allIds.length) {
        console.warn("Nenhuma conta válida encontrada após o cabeçalho.");
        alert(
          "Não encontrei linhas de contas com Débito/Crédito. Confira se os números estão na mesma planilha e colunas corretas."
        );
        return;
      }

      // 4) Atualiza os agrupadores mantendo apenas contas existentes
      const upd = {};
      Object.values(aggregators).forEach((agg) => {
        upd[agg.id] = {
          ...agg,
          accountIds: (agg.accountIds || []).filter((id) => newAcc[id]),
        };
      });
      const assigned = Object.values(upd).flatMap((a) => a.accountIds || []);
      upd.unassigned = {
        ...(upd.unassigned || { id: "unassigned", title: "Sem agrupador", accountIds: [] }),
        accountIds: allIds.filter((id) => !assigned.includes(id)),
      };

      setAccounts(newAcc);
      setAggregators(upd);
      setExpanded({});
      console.log(`Importadas ${allIds.length} contas.`, {
        cols: { colConta, colDesc, colDeb, colCred },
      });
      alert(`Importadas ${allIds.length} contas com sucesso.`);
    } catch (err) {
      console.error("Erro ao ler o Excel:", err);
      alert("Erro ao ler o Excel. Me manda um print da linha de cabeçalhos que eu ajusto o parser.");
    } finally {
      setLoading(false);
      // Permite reenviar o mesmo arquivo
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  /* =========================
     FORMATAÇÃO DO RELATÓRIO
     ========================= */
  const formatValue = (value) => {
    const absValue = value >= 0 ? value : -value;
    switch (unit) {
      case "soja":
        if (!priceSoy) return "-";
        return `${Math.round(absValue / parseFloat(priceSoy)).toLocaleString("pt-BR")} sacas de soja`;
      case "milho":
        if (!priceCorn) return "-";
        return `${Math.round(absValue / parseFloat(priceCorn)).toLocaleString("pt-BR")} sacas de milho`;
      case "suino":
        if (!pricePig) return "-";
        return `${Math.round(absValue / parseFloat(pricePig)).toLocaleString("pt-BR")} kg suíno`;
      case "reais":
      default:
        return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
    }
  };

  /* =========================
     RENDER
     ========================= */
  return (
    <div className="container">
      {/* Sidebar com seleção de empresa, config e upload */}
      <div className="sidebar">
        <h1>DFC</h1>

        <h2>Selecione a Empresa</h2>
        <select value={company} onChange={(e) => setCompany(e.target.value)}>
          {COMPANIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id} - {c.name}
            </option>
          ))}
        </select>

        <h2>Configurações de Agrupadores</h2>
        <AggregatorConfig aggregators={aggregators} setAggregators={setAggregators} />

        <div className="file-upload">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xls,.xlsx"
            onChange={handleFile}
          />
          {loading && <span>Carregando...</span>}
        </div>

        <div className="actions">
          <button onClick={handleSave} className="btn-save">
            Salvar
          </button>
          <button onClick={clearAll} className="btn-clear">
            Limpar tudo
          </button>
          <button
            onClick={() => setShowReport(!showReport)}
            className="btn-save"
            style={{ marginTop: "8px" }}
          >
            {showReport ? "Voltar" : "Mostrar Relatório"}
          </button>
        </div>

        {showReport && (
          <>
            <h2>Unidade de Medida</h2>
            <select value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="reais">Reais (R$)</option>
              <option value="soja">Sacas de Soja</option>
              <option value="milho">Sacas de Milho</option>
              <option value="suino">Kg de Suíno</option>
            </select>

            {unit === "soja" && (
              <input
                type="number"
                placeholder="Preço saco soja (R$)"
                value={priceSoy}
                onChange={(e) => setPriceSoy(e.target.value)}
              />
            )}
            {unit === "milho" && (
              <input
                type="number"
                placeholder="Preço saco milho (R$)"
                value={priceCorn}
                onChange={(e) => setPriceCorn(e.target.value)}
              />
            )}
            {unit === "suino" && (
              <input
                type="number"
                placeholder="Preço kg suíno (R$)"
                value={pricePig}
                onChange={(e) => setPricePig(e.target.value)}
              />
            )}
          </>
        )}
      </div>

      {/* Conteúdo principal: relatório ou board de DnD */}
      {showReport ? (
        <div className="report-list-view">
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
                    // Contas do agrupador (tratando unassigned dinamicamente)
                    const ids =
                      col.id === "unassigned"
                        ? Object.keys(accounts).filter((id) =>
                            aggs
                              .filter((a) => a.id !== "unassigned")
                              .every((a) => !(a.accountIds || []).includes(id))
                          )
                        : (col.accountIds || []).filter((id) => accounts[id]);

                    const rec = ids.reduce(
                      (s, id) => s + (accounts[id].sign === "+" ? accounts[id].valor : 0),
                      0
                    );
                    const desp = ids.reduce(
                      (s, id) => s + (accounts[id].sign === "-" ? accounts[id].valor : 0),
                      0
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
                          <td
                            style={{
                              color: res < 0 ? "var(--danger)" : "var(--accent)",
                            }}
                          >
                            {formatValue(res)}
                          </td>
                        </tr>

                        {expanded[col.id] &&
                          ids.map((id) => {
                            const acct = accounts[id];
                            const recA = acct.sign === "+" ? acct.valor : 0;
                            const despA = acct.sign === "-" ? acct.valor : 0;
                            const resA = recA - despA;
                            return (
                              <tr key={id} className="report-account-row">
                                <td style={{ paddingLeft: "20px" }}>{acct.name}</td>
                                <td style={{ color: "var(--accent)" }}>
                                  {formatValue(recA)}
                                </td>
                                <td style={{ color: "var(--danger)" }}>
                                  {formatValue(-despA)}
                                </td>
                                <td
                                  style={{
                                    color: resA < 0 ? "var(--danger)" : "var(--accent)",
                                  }}
                                >
                                  {formatValue(resA)}
                                </td>
                              </tr>
                            );
                          })}
                      </React.Fragment>
                    );
                  })
                  .concat(
                    // Linha totalizadora
                    (() => {
                      const totRes = totalRec - totalDesp;
                      return (
                        <tr
                          key="totalizador"
                          className="report-total-row"
                          style={{ fontWeight: 600 }}
                        >
                          <td>Totalizador</td>
                          <td style={{ color: "var(--accent)" }}>
                            {formatValue(totalRec)}
                          </td>
                          <td style={{ color: "var(--danger)" }}>
                            {formatValue(-totalDesp)}
                          </td>
                          <td
                            style={{
                              color: totRes < 0 ? "var(--danger)" : "var(--accent)",
                            }}
                          >
                            {formatValue(totRes)}
                          </td>
                        </tr>
                      );
                    })()
                  );
              })()}
            </tbody>
          </table>
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid">
            {Object.values(aggregators).map((col) => {
              // Resolve os IDs válidos desta coluna
              let validIds;
              if (col.id === "unassigned") {
                const assigned = Object.values(aggregators)
                  .filter((a) => a.id !== "unassigned")
                  .flatMap((a) => a.accountIds || []);
                validIds = Object.keys(accounts).filter((id) => !assigned.includes(id));
              } else {
                validIds = (col.accountIds || []).filter((id) => accounts[id]);
              }

              // Total da coluna (conta + => soma; conta - => subtrai)
              const total = validIds.reduce(
                (sum, id) =>
                  sum + (accounts[id].sign === "+" ? accounts[id].valor : -accounts[id].valor),
                0
              );

              return (
                <Droppable key={col.id} droppableId={col.id}>
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="column">
                      <h2>{col.title}</h2>
                      <div className="aggregator-total">
                        Total: {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
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
                                <span className="description">{accounts[acctId].name}</span>
                                <button
                                  onClick={() => toggleSign(acctId)}
                                  className="sign-btn"
                                  title="Alternar sinal (Receita/Despesa)"
                                >
                                  {accounts[acctId].sign}
                                </button>
                              </div>
                              <div className="card-body">
                                Resultado:{" "}
                                {(
                                  accounts[acctId].sign === "+"
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

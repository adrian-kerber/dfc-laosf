import React, { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import AggregatorConfig from "./components/AggregatorConfig";
import "./App.css";

/*
  ==========================================
  App.jsx — DFC (importação + agrupadores)
  >>> Usa APENAS: Conta, Código, Descrição, Débito, Crédito <<<
  - Detecta cabeçalhos por nome (também aceita "Código Descrição")
  - Normaliza números pt-BR
  - Arrasta contas entre agrupadores
  - Relatório com conversão de unidade (opcional)
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
  const [company, setCompany] = useState(
    () => localStorage.getItem("dfc-laosf:company") || COMPANIES[0].id
  );

  const aggKey = `dfc-laosf:${company}:aggregators`;

  const [aggregators, setAggregators] = useState(() => {
    const saved = localStorage.getItem(aggKey);
    return saved
      ? JSON.parse(saved)
      : { unassigned: { id: "unassigned", title: "Sem agrupador", accountIds: [] } };
  });

  const [accounts, setAccounts] = useState({});  // mapa id-> {id,name,valor,sign}
  const [loading, setLoading] = useState(false);

  // Relatório
  const [showReport, setShowReport] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [unit, setUnit] = useState("reais"); // 'reais', 'soja', 'milho', 'suino'
  const [priceSoy, setPriceSoy] = useState("");
  const [priceCorn, setPriceCorn] = useState("");
  const [pricePig, setPricePig] = useState("");

  const fileInputRef = useRef(null); // pra resetar o <input>

  const toggleExpand = (id) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  /* =========================
     TROCA DE EMPRESA
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
     AÇÕES
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

  const clearAll = () => {
    localStorage.removeItem(aggKey);
    setAggregators({ unassigned: { id: "unassigned", title: "Sem agrupador", accountIds: [] } });
    setAccounts({});
    setExpanded({});
  };

  /* =========================
     HELPERS DE PARSE
     ========================= */
  const parseBRNumber = (val) => {
    // aceita number nativo ou string pt-BR
    if (val == null) return 0;
    if (typeof val === "number" && Number.isFinite(val)) return val;
    const s = String(val).trim();
    if (!s) return 0;
    const n = parseFloat(s.replace(/\s+/g, "").replace(/\./g, "").replace(/,/g, "."));
    return Number.isFinite(n) ? n : 0;
  };

  const normStr = (x) => String(x || "").toLowerCase().replace(/\s+/g, " ").trim();

  // encontra índice de coluna por "includes" de candidatos
  const findCol = (headerRow, candidates) => {
    const H = headerRow.map(normStr);
    for (let i = 0; i < H.length; i++) {
      const cell = H[i];
      if (!cell) continue;
      if (candidates.some((c) => cell.includes(c))) return i;
    }
    return -1;
  };

  // tenta separar "Código Descrição" em {codigo, descricao}
  const splitCodigoDescricao = (value) => {
    const s = String(value || "").trim();
    if (!s) return { codigo: "", descricao: "" };
    // pega prefixo numérico (com pontos) no começo
    const m = s.match(/^([\d.]+)\s*[-–—:]?\s*(.+)$/);
    if (m) return { codigo: m[1].trim(), descricao: m[2].trim() };
    // fallback: primeira palavra numérica vira código
    const parts = s.split(/\s+/);
    if (/^[\d.]+$/.test(parts[0] || "")) {
      return { codigo: parts[0], descricao: s.slice(parts[0].length).trim() };
    }
    return { codigo: "", descricao: s };
  };

  /* =========================
     IMPORTAÇÃO (usa apenas Conta/Código/Descrição/Débito/Crédito)
     ========================= */
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
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

      // 1) Localiza linha de cabeçalho procurando pelas colunas-alvo
      let headerIdx = -1;
      for (let i = 0; i < Math.min(rows.length, 60); i++) {
        const row = rows[i].map(normStr);
        const hasDeb = row.some((c) => c.includes("débito") || c.includes("debito"));
        const hasCred = row.some((c) => c.includes("crédito") || c.includes("credito"));
        const hasConta = row.some((c) => c.includes("conta"));
        const hasCodigo = row.some((c) => c.includes("código") || c.includes("codigo"));
        const hasDesc =
          row.some((c) => c.includes("descrição") || c.includes("descricao")) ||
          row.some((c) => c.includes("código descrição") || c.includes("codigo descrição"));
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

      // 2) Descobre índices (suporta "Código Descrição" combinado)
      const colConta = findCol(header, ["conta"]);
      let colCodigo = findCol(header, ["código", "codigo"]);
      let colDescricao = findCol(header, ["descrição", "descricao"]);
      const colCodDesc = findCol(header, ["código descrição", "codigo descrição"]); // combinado
      const colDeb = findCol(header, ["débito", "debito"]);
      const colCred = findCol(header, ["crédito", "credito"]);

      // pelo menos Débito e Crédito precisam existir
      if (colDeb === -1 || colCred === -1) {
        alert("Cabeçalhos de Débito/Crédito não encontrados.");
        return;
      }
      // precisamos de alguma forma de ID e nome: Conta e (Código+Descrição OU Código Descrição)
      if (colConta === -1) {
        // se não houver "Conta", tentamos usar "Código" como ID
        if (colCodigo === -1 && colCodDesc === -1) {
          alert("Não encontrei a coluna 'Conta' nem 'Código'.");
          return;
        }
      }
      if (colDescricao === -1 && colCodDesc === -1) {
        alert("Não encontrei 'Descrição' (nem 'Código Descrição').");
        return;
      }

      // 3) Varrer linhas de dados
      const newAcc = {};
      const allIds = [];

      for (let r = headerIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        // Extrai campos
        const contaRaw = colConta !== -1 ? String(row[colConta] || "").trim() : "";
        const codigoRaw = colCodigo !== -1 ? String(row[colCodigo] || "").trim() : "";
        let descricaoRaw = colDescricao !== -1 ? String(row[colDescricao] || "").trim() : "";

        // Se vier "Código Descrição" num campo único, separamos
        if (colCodDesc !== -1 && (!codigoRaw || !descricaoRaw)) {
          const { codigo, descricao } = splitCodigoDescricao(row[colCodDesc]);
          if (!codigoRaw) colCodigo = colCodigo; // no-op pra satisfazer linter
          if (!descricaoRaw) descricaoRaw = descricao;
          // se não houver coluna "Código" dedicada, tentamos usar esse código
          if (!codigoRaw && codigo) {
            // apenas se quiser armazenar ou exibir depois
          }
        }

        // Determina o ID da conta:
        // 1) preferimos "Conta" (ex.: 1.1.1.01)
        // 2) se não houver, usamos "Código"
        let id = contaRaw || codigoRaw;
        id = String(id || "").trim();
        // precisa parecer um código (dígitos e pontos) — evita linhas de subtítulo
        if (!id || !/^[\d.]+$/.test(id)) continue;

        // Nome/descrição
        const name =
          descricaoRaw ||
          // fallback: se não houver descrição, tenta usar código (pior caso)
          (codigoRaw ? `Código ${codigoRaw}` : "Sem descrição");

        // Valores
        const deb = parseBRNumber(row[colDeb]);
        const cred = parseBRNumber(row[colCred]);
        if (deb === 0 && cred === 0) continue; // ignora linha sem movimento

        // ====== REGRA DO RESULTADO ======
        // Usamos Crédito - Débito (positivo = receita / negativo = despesa)
        // Se quiser inverter, troque para: const val = deb - cred;
        const val = cred - deb;

        newAcc[id] = {
          id,
          name,
          valor: Math.abs(val),
          sign: val >= 0 ? "+" : "-", // controla em qual coluna (receita/despesa) cai
        };
        allIds.push(id);
      }

      if (!allIds.length) {
        alert("Não encontrei linhas de contas com Débito/Crédito.");
        return;
      }

      // 4) Atualiza agrupadores mantendo apenas contas existentes
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
      alert(`Importadas ${allIds.length} contas com sucesso.`);
    } catch (err) {
      console.error("Erro ao ler o Excel:", err);
      alert("Erro ao ler o Excel. Se puder, me mande os nomes EXATOS dos cabeçalhos.");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = ""; // permite reenviar o mesmo arquivo
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
      default:
        return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
    }
  };

  /* =========================
     RENDER
     ========================= */
  return (
    <div className="container">
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
          <button onClick={handleSave} className="btn-save">Salvar</button>
          <button onClick={clearAll} className="btn-clear">Limpar tudo</button>
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
                let totalRec = 0, totalDesp = 0;

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

                    const rec = ids.reduce((s, id) => s + (accounts[id].sign === "+" ? accounts[id].valor : 0), 0);
                    const desp = ids.reduce((s, id) => s + (accounts[id].sign === "-" ? accounts[id].valor : 0), 0);
                    const res = rec - desp;
                    totalRec += rec;
                    totalDesp += desp;

                    return (
                      <React.Fragment key={col.id}>
                        <tr className="report-header-row" onClick={() => toggleExpand(col.id)} style={{ cursor: "pointer" }}>
                          <td>{col.title}</td>
                          <td style={{ color: "var(--accent)" }}>{formatValue(rec)}</td>
                          <td style={{ color: "var(--danger)" }}>{formatValue(-desp)}</td>
                          <td style={{ color: res < 0 ? "var(--danger)" : "var(--accent)" }}>{formatValue(res)}</td>
                        </tr>

                        {expanded[col.id] &&
                          ids.map((id) => {
                            const a = accounts[id];
                            const recA = a.sign === "+" ? a.valor : 0;
                            const despA = a.sign === "-" ? a.valor : 0;
                            const resA = recA - despA;
                            return (
                              <tr key={id} className="report-account-row">
                                <td style={{ paddingLeft: 20 }}>{a.name}</td>
                                <td style={{ color: "var(--accent)" }}>{formatValue(recA)}</td>
                                <td style={{ color: "var(--danger)" }}>{formatValue(-despA)}</td>
                                <td style={{ color: resA < 0 ? "var(--danger)" : "var(--accent)" }}>{formatValue(resA)}</td>
                              </tr>
                            );
                          })}
                      </React.Fragment>
                    );
                  })
                  .concat(
                    (() => {
                      const totRes = totalRec - totalDesp;
                      return (
                        <tr key="totalizador" className="report-total-row" style={{ fontWeight: 600 }}>
                          <td>Totalizador</td>
                          <td style={{ color: "var(--accent)" }}>{formatValue(totalRec)}</td>
                          <td style={{ color: "var(--danger)" }}>{formatValue(-totalDesp)}</td>
                          <td style={{ color: totRes < 0 ? "var(--danger)" : "var(--accent)" }}>{formatValue(totRes)}</td>
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
                (sum, id) => sum + (accounts[id].sign === "+" ? accounts[id].valor : -accounts[id].valor),
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
                                <button onClick={() => toggleSign(acctId)} className="sign-btn" title="Alternar sinal">
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

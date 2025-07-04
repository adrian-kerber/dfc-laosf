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
  // Empresa selecionada
  const [company, setCompany] = useState(
    () => localStorage.getItem("dfc-laosf:company") || COMPANIES[0].id
  );

  // Chaves de storage
  const aggKey = `dfc-laosf:${company}:aggregators`;

  // Aggregators (IDs de conta)
  const [aggregators, setAggregators] = useState(() => {
    const saved = localStorage.getItem(aggKey);
    return (
      saved
        ? JSON.parse(saved)
        : { unassigned: { id: 'unassigned', title: 'Sem agrupador', accountIds: [] } }
    );
  });

  // Contas do último upload
  const [accounts, setAccounts] = useState({});
  const [loading, setLoading] = useState(false);

  // Relatório: toggle, expand/collapse e unidade de medida
  const [showReport, setShowReport] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [unit, setUnit] = useState('reais'); // 'reais', 'soja', 'milho', 'suino'
  const [priceSoy, setPriceSoy] = useState('');
  const [priceCorn, setPriceCorn] = useState('');
  const [pricePig, setPricePig] = useState('');

  const toggleExpand = (id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Ao trocar empresa
  useEffect(() => {
    localStorage.setItem('dfc-laosf:company', company);
    const savedAgg = localStorage.getItem(aggKey);
    setAggregators(
      savedAgg
        ? JSON.parse(savedAgg)
        : { unassigned: { id: 'unassigned', title: 'Sem agrupador', accountIds: [] } }
    );
    setAccounts({});
    setExpanded({});
    setShowReport(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company]);

  // Salvar agrupadores
  const handleSave = () => {
    localStorage.setItem(aggKey, JSON.stringify(aggregators));
    alert('Agrupadores salvos com sucesso.');
  };

  const toggleSign = (id) => {
    setAccounts(prev => ({
      ...prev,
      [id]: { ...prev[id], sign: prev[id].sign === '+' ? '-' : '+' }
    }));
  };

  // Drag & Drop
  const onDragEnd = ({ source, destination, draggableId }) => {
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    const start = aggregators[source.droppableId];
    const finish = aggregators[destination.droppableId];
    const newStart = Array.from(start.accountIds);
    newStart.splice(source.index, 1);
    const newFinish = Array.from(finish.accountIds);
    newFinish.splice(destination.index, 0, draggableId);
    setAggregators(prev => ({
      ...prev,
      [start.id]: { ...start, accountIds: newStart },
      [finish.id]: { ...finish, accountIds: newFinish }
    }));
  };

  // Importar Excel
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      const parseNumber = val => typeof val === 'number' ? val : parseFloat(val.toString().replace(/\./g,'').replace(/,/g,'.')) || 0;
      const dataRows = rows.filter(r => {
        const code = String(r[0]||'').trim();
        const name = String(r[2]||'').trim();
        if (!/^[0-9]{2,}/.test(code) || !name) return false;
        return parseNumber(r[9]) !== 0 || parseNumber(r[10]) !== 0;
      });
      const newAcc = {}, allIds = [];
      dataRows.forEach(r => {
        const code = String(r[0]).trim();
        const name = String(r[2]).trim();
        const val = parseNumber(r[9]) - parseNumber(r[10]);
        newAcc[code] = { id: code, name, valor: Math.abs(val), sign: val>=0?'+':'-' };
        allIds.push(code);
      });
      // Atualiza agregadores mantendo apenas contas existentes
      const upd = {};
      Object.values(aggregators).forEach(agg => {
        upd[agg.id] = { ...agg, accountIds: agg.accountIds.filter(id => newAcc[id]) };
      });
      const assigned = Object.values(upd).flatMap(a=>a.accountIds);
      upd.unassigned = { ...upd.unassigned, accountIds: allIds.filter(id=>!assigned.includes(id)) };
      setAccounts(newAcc);
      setAggregators(upd);
      setExpanded({});
    } catch {
      alert('Erro ao ler o Excel.');
    } finally { setLoading(false); }
  };

  const clearAll = () => {
    localStorage.removeItem(aggKey);
    setAggregators({ unassigned:{ id:'unassigned', title:'Sem agrupador', accountIds:[] } });
    setAccounts({});
    setExpanded({});
  };

  // Função para formatar valor conforme unidade
  const formatValue = (value) => {
    const absValue = value >= 0 ? value : -value;
    switch (unit) {
      case 'soja':
        if (!priceSoy) return '-';
        return `${Math.round(absValue / parseFloat(priceSoy)).toLocaleString('pt-BR')} sacas de soja`;
      case 'milho':
        if (!priceCorn) return '-';
        return `${Math.round(absValue / parseFloat(priceCorn)).toLocaleString('pt-BR')} sacas de milho`;
      case 'suino':
        if (!pricePig) return '-';
        return `${Math.round(absValue / parseFloat(pricePig)).toLocaleString('pt-BR')} kg suíno`;
      case 'reais':
      default:
        return `R$ ${value.toLocaleString('pt-BR',{minimumFractionDigits:2})}`;
    }
  };

  return (
    <div className="container">
      <div className="sidebar">
        <h1>DFC</h1>
        <h2>Selecione a Empresa</h2>
        <select value={company} onChange={e=>setCompany(e.target.value)}>
          {COMPANIES.map(c=><option key={c.id} value={c.id}>{c.id} - {c.name}</option>)}
        </select>
        <h2>Configurações de Agrupadores</h2>
        <AggregatorConfig aggregators={aggregators} setAggregators={setAggregators} />
        <div className="file-upload">
          <input type="file" accept=".xls,.xlsx" onChange={handleFile} />
          {loading && <span>Carregando...</span>}
        </div>
        <div className="actions">
          <button onClick={handleSave} className="btn-save">Salvar</button>
          <button onClick={clearAll} className="btn-clear">Limpar tudo</button>
          <button onClick={()=>setShowReport(!showReport)} className="btn-save" style={{marginTop:'8px'}}>
            {showReport?'Voltar':'Mostrar Relatório'}
          </button>
        </div>
        {showReport && (
          <>
            <h2>Unidade de Medida</h2>
            <select value={unit} onChange={e=>setUnit(e.target.value)}>
              <option value="reais">Reais (R$)</option>
              <option value="soja">Sacas de Soja</option>
              <option value="milho">Sacas de Milho</option>
              <option value="suino">Kg de Suíno</option>
            </select>
            {unit==='soja' && <input type="number" placeholder="Preço saco soja (R$)" value={priceSoy} onChange={e=>setPriceSoy(e.target.value)} />}
            {unit==='milho'&&<input type="number" placeholder="Preço saco milho (R$)" value={priceCorn} onChange={e=>setPriceCorn(e.target.value)} />}
            {unit==='suino'&&<input type="number" placeholder="Preço kg suíno (R$)" value={pricePig} onChange={e=>setPricePig(e.target.value)} />}
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
                return aggs.map(col => {
                  const ids = col.id === 'unassigned'
                    ? Object.keys(accounts).filter(id => !aggs.filter(a => a.id !== 'unassigned').flatMap(a => a.accountIds).includes(id))
                    : col.accountIds.filter(id => accounts[id]);
                  const rec = ids.reduce((s,id) => s + (accounts[id].sign === '+' ? accounts[id].valor : 0), 0);
                  const desp = ids.reduce((s,id) => s + (accounts[id].sign === '-' ? accounts[id].valor : 0), 0);
                  const res = rec - desp;
                  totalRec += rec;
                  totalDesp += desp;
                  return (
                    <React.Fragment key={col.id}>
                      <tr className="report-header-row" onClick={() => toggleExpand(col.id)} style={{ cursor: 'pointer' }}>
                        <td>{col.title}</td>
                        <td style={{ color: 'var(--accent)' }}>{formatValue(rec)}</td>
                        <td style={{ color: 'var(--danger)' }}>{formatValue(-desp)}</td>
                        <td style={{ color: res < 0 ? 'var(--danger)' : 'var(--accent)' }}>{formatValue(res)}</td>
                      </tr>
                      {expanded[col.id] && ids.map(id => {
                        const acct = accounts[id];
                        const recA = acct.sign === '+' ? acct.valor : 0;
                        const despA = acct.sign === '-' ? acct.valor : 0;
                        const resA = recA - despA;
                        return (
                          <tr key={id} className="report-account-row">
                            <td style={{ paddingLeft: '20px' }}>{acct.name}</td>
                            <td style={{ color: 'var(--accent)' }}>{formatValue(recA)}</td>
                            <td style={{ color: 'var(--danger)' }}>{formatValue(-despA)}</td>
                            <td style={{ color: resA < 0 ? 'var(--danger)' : 'var(--accent)' }}>{formatValue(resA)}</td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                }).concat(
                  // totalizador usando formatValue and unit
                  (() => {
                    const totRes = totalRec - totalDesp;
                    return (
                      <tr key="totalizador" className="report-total-row" style={{ fontWeight: '600' }}>
                        <td>Totalizador</td>
                        <td style={{ color: 'var(--accent)' }}>{formatValue(totalRec)}</td>
                        <td style={{ color: 'var(--danger)' }}>{formatValue(-totalDesp)}</td>
                        <td style={{ color: totRes < 0 ? 'var(--danger)' : 'var(--accent)' }}>{formatValue(totRes)}</td>
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
            {Object.values(aggregators).map(col=>{
              let validIds;
              if(col.id==='unassigned'){
                const assigned = Object.values(aggregators)
                  .filter(a=>a.id!=='unassigned')
                  .flatMap(a=>a.accountIds);
                validIds = Object.keys(accounts).filter(id=>!assigned.includes(id));
              } else validIds=col.accountIds.filter(id=>accounts[id]);
              const total = validIds.reduce((sum,id)=> sum + (accounts[id].sign==='+'?accounts[id].valor:-accounts[id].valor),0);
              return (
                <Droppable key={col.id} droppableId={col.id}>
                  {provided=>(
                    <div ref={provided.innerRef} {...provided.droppableProps} className="column">
                      <h2>{col.title}</h2>
                      <div className="aggregator-total">Total: {total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
                      {validIds.map((acctId,i)=>(
                        <Draggable key={acctId} draggableId={acctId} index={i}>
                          {prov=>(
                            <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps} className="card">
                              <div className="card-header">
                                <span className="description">{accounts[acctId].name}</span>
                                <button onClick={()=>toggleSign(acctId)} className="sign-btn">{accounts[acctId].sign}</button>
                              </div>
                              <div className="card-body">Resultado: {(accounts[acctId].sign==='+'?accounts[acctId].valor:-accounts[acctId].valor).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
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

// src/components/AggregatorConfig.jsx
import React, { useEffect, useState } from "react";
import { db } from "../lib/database";

/**
 * AggregatorConfig (estendido)
 *
 * Baseado no seu componente atual — mantive:
 *  - criar agrupador (db.createAgrupador)
 *  - renomear agrupador (db.renameAgrupador)
 *  - onChanged() para recarregar a partir do App
 *
 * Acrescentei:
 *  - Gerenciamento de CATEGORIAS (categoria = agrupador de agrupadores)
 *    - criar, renomear, excluir (local/back-end quando disponível)
 *    - atribuir agrupadores a categorias (select)
 *  - Persistência: tenta usar db.saveCategorias()/db.getCategorias() se houver,
 *    senão usa localStorage (chave: 'dfc-laosf:categories')
 *
 * Props:
 * - aggregators: { [id]: { id, title, accountIds } } (do App)
 * - onChanged: () => void   -> chame para o App recarregar do DB após alterações
 * - categories: optional map { id: { id, title, agrupadorIds: [] } } (opcional, App pode prover)
 * - onSaveCategories: optional async (newCategories) => {} (opcional, App pode prover)
 * - onSaveGroups: optional async () => {} (opcional: salva mapeamento conta->agrupador)
 */

const LS_CATEGORIES = "dfc-laosf:categories";

export default function AggregatorConfig({
  aggregators = {},
  onChanged,
  categories = null,
  onSaveCategories = null,
  onSaveGroups = null,
}) {
  // Estados simples para CRUD de agrupadores (seu original)
  const [novoNome, setNovoNome] = useState("");
  const [renomearId, setRenomearId] = useState("");
  const [renomearNome, setRenomearNome] = useState("");

  // Estados para categorias (local edit)
  const [localCats, setLocalCats] = useState(() => {
    // inicializa de prop categories (se fornecida) ou de localStorage
    if (categories && typeof categories === "object") return { ...categories };
    try {
      const raw = localStorage.getItem(LS_CATEGORIES);
      if (raw) return JSON.parse(raw);
    } catch {}
    // padrão mínimo
    return { uncategorized: { id: "uncategorized", title: "Sem categoria", agrupadorIds: [] } };
  });
  const [newCatTitle, setNewCatTitle] = useState("");
  const [savingCats, setSavingCats] = useState(false);

  // sincroniza localCats se parent fornecer `categories` atualizado
  useEffect(() => {
    if (categories && typeof categories === "object") setLocalCats({ ...categories });
  }, [categories]);

  // lista de agrupadores ordenada (sem 'unassigned')
  const lista = Object.values(aggregators)
    .filter((a) => a.id !== "unassigned")
    .sort((a, b) => String(a.title).localeCompare(String(b.title)));

  /* ----------------- Funções de agrupadores (seu comportamento existente) ----------------- */

  const handleCreate = async () => {
    const nome = novoNome.trim();
    if (!nome) return;
    try {
      await db.createAgrupador(nome); // grava no banco - você já tem isso
      setNovoNome("");
      onChanged?.();
    } catch (e) {
      console.error("Erro ao criar agrupador:", e);
      alert("Erro ao criar agrupador: " + (e?.message || e));
    }
  };

  const handleRename = async () => {
    if (!renomearId) return;
    const nome = renomearNome.trim();
    if (!nome) return;
    try {
      await db.renameAgrupador(Number(renomearId), nome); // grava no banco
      setRenomearId("");
      setRenomearNome("");
      onChanged?.();
    } catch (e) {
      console.error("Erro ao renomear agrupador:", e);
      alert("Erro ao renomear agrupador: " + (e?.message || e));
    }
  };

  // (Opcional) delete agrupador - mantive comentado como no seu original
  // const handleDelete = async (id) => {
  //   if (!confirm("Excluir este agrupador definitivamente?")) return;
  //   await db.deleteAgrupador(Number(id));
  //   onChanged?.();
  // };

  /* ----------------- Funções de categorias ----------------- */

  // Gera um id simples para categoria nova (único local)
  const genCatId = () => `cat-${Date.now()}`;

  // Cria categoria local
  const handleAddCategory = () => {
    const title = String(newCatTitle || "").trim();
    if (!title) return alert("Nome da categoria vazio");
    const id = genCatId();
    setLocalCats((p) => ({ ...p, [id]: { id, title, agrupadorIds: [] } }));
    setNewCatTitle("");
  };

  // Renomeia categoria local
  const handleEditCategoryTitle = (id, title) => {
    setLocalCats((p) => ({ ...p, [id]: { ...p[id], title } }));
  };

  // Remove categoria local: seus agrupadores vão para uncategorized
  const handleDeleteCategory = (id) => {
    if (id === "uncategorized") return alert("Não é possível excluir a categoria padrão.");
    if (!confirm("Excluir esta categoria? Os agrupadores serão movidos para 'Sem categoria'.")) return;
    setLocalCats((p) => {
      const next = { ...p };
      const removed = next[id] ? next[id].agrupadorIds || [] : [];
      delete next[id];
      next.uncategorized = next.uncategorized || { id: "uncategorized", title: "Sem categoria", agrupadorIds: [] };
      next.uncategorized.agrupadorIds = Array.from(new Set([...(next.uncategorized.agrupadorIds || []), ...removed]));
      return next;
    });
  };

  // Ajuda: encontra categoria atual de um agrupador (consultando localCats)
  const findCategoryOfAgg = (aggId) => {
    const found = Object.values(localCats).find((c) => (c.agrupadorIds || []).includes(aggId));
    return found ? found.id : "uncategorized";
  };

  // Atribui agrupador a categoria (local)
  const assignAggToCat = (aggId, catId) => {
    setLocalCats((prev) => {
      const next = Object.keys(prev).reduce((acc, k) => {
        acc[k] = { ...prev[k], agrupadorIds: Array.isArray(prev[k].agrupadorIds) ? [...prev[k].agrupadorIds] : [] };
        return acc;
      }, {});
      // remove agg de todas
      Object.keys(next).forEach((k) => {
        next[k].agrupadorIds = next[k].agrupadorIds.filter((x) => x !== aggId);
      });
      // adiciona na nova categoria
      next[catId] = next[catId] || { id: catId, title: catId === "uncategorized" ? "Sem categoria" : catId, agrupadorIds: [] };
      next[catId].agrupadorIds = [...new Set([...(next[catId].agrupadorIds || []), aggId])];
      return next;
    });
  };

  // Salva categorias: usa callback do parent (onSaveCategories) se existir, senão localStorage
  const handleSaveCategories = async () => {
    setSavingCats(true);
    try {
      const normalized = Object.keys(localCats).reduce((acc, k) => {
        const c = localCats[k];
        if (!c || !c.title) return acc;
        acc[k] = { id: c.id, title: c.title, agrupadorIds: Array.isArray(c.agrupadorIds) ? c.agrupadorIds : [] };
        return acc;
      }, {});
      if (typeof onSaveCategories === "function") {
        await onSaveCategories(normalized);
      } else {
        localStorage.setItem(LS_CATEGORIES, JSON.stringify(normalized));
      }
      onChanged?.(); // pede recarregar ao App
      alert("Categorias salvas.");
    } catch (e) {
      console.error("Erro ao salvar categorias:", e);
      alert("Erro ao salvar categorias: " + (e?.message || e));
    } finally {
      setSavingCats(false);
    }
  };

  /* ----------------- UI ----------------- */

  return (
    <div style={{ padding: 8 }}>
      <h2>Configurações de Agrupadores</h2>

      {/* --- Criar agrupador (seu fluxo existente) --- */}
      <div style={{ marginBottom: 12 }}>
        <input
          placeholder="Novo agrupador"
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
        />
        <button onClick={handleCreate}>Adicionar</button>
      </div>

      {/* --- Renomear agrupador (seu fluxo existente) --- */}
      <div style={{ marginBottom: 12 }}>
        <select
          value={renomearId}
          onChange={(e) => {
            const id = e.target.value;
            setRenomearId(id);
            const atual = lista.find((x) => String(x.id) === String(id));
            setRenomearNome(atual?.title ?? "");
          }}
        >
          <option value="">— escolher para renomear —</option>
          {lista.map((a) => (
            <option key={a.id} value={a.id}>{a.title}</option>
          ))}
        </select>
        <input
          placeholder="Novo nome"
          value={renomearNome}
          onChange={(e) => setRenomearNome(e.target.value)}
        />
        <button onClick={handleRename} disabled={!renomearId}>Renomear</button>
      </div>

      {/* --- Lista simples de agrupadores (seu original) --- */}
      <div style={{ marginTop: 8, marginBottom: 20 }}>
        <strong>Lista de agrupadores</strong>
        <ul style={{ marginTop: 8 }}>
          {lista.map((a) => (
            <li key={a.id}>
              {a.title} {a.accountIds?.length ? `(${a.accountIds.length} contas)` : "(vazio)"}
            </li>
          ))}
        </ul>
      </div>

      <hr />

      {/* === Gerenciamento de Categorias === */}
      <h3>Gerenciar Categorias</h3>

      <div style={{ display: "flex", gap: 16 }}>
        {/* Coluna: categorias */}
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ marginBottom: 8 }}>
            <input
              placeholder="Nova categoria"
              value={newCatTitle}
              onChange={(e) => setNewCatTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddCategory(); }}
              style={{ width: "70%", marginRight: 8 }}
            />
            <button onClick={handleAddCategory}>Adicionar</button>
          </div>

          <div style={{ maxHeight: 300, overflow: "auto", border: "1px solid #eee", padding: 8 }}>
            {Object.values(localCats).map((c) => (
              <div key={c.id} style={{ padding: 6, borderBottom: "1px solid #f0f0f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <input
                    value={c.title}
                    onChange={(e) => handleEditCategoryTitle(c.id, e.target.value)}
                    style={{ fontWeight: 700, width: "70%" }}
                  />
                  <div>
                    {c.id !== "uncategorized" && (
                      <button style={{ marginLeft: 8 }} onClick={() => handleDeleteCategory(c.id)}>Excluir</button>
                    )}
                  </div>
                </div>
                <small>{(c.agrupadorIds || []).length} agrupador(es)</small>
              </div>
            ))}
          </div>
        </div>

        {/* Coluna: atribuir agrupadores */}
        <div style={{ flex: 1.6 }}>
          <div style={{ marginBottom: 6 }}>
            <strong>Atribuir agrupadores a categorias</strong>
            <div style={{ fontSize: 12, color: "#666" }}>Escolha a categoria para cada agrupador abaixo.</div>
          </div>

          <div style={{ maxHeight: 420, overflow: "auto", border: "1px solid #eee", padding: 8 }}>
            {Object.values(aggregators).map((agg) => (
              <div key={agg.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 6, borderBottom: "1px solid #f7f7f7" }}>
                <div style={{ fontWeight: 600 }}>{agg.title}</div>
                <div>
                  <select value={findCategoryOfAgg(agg.id)} onChange={(e) => assignAggToCat(agg.id, e.target.value)}>
                    {Object.values(localCats).map((c) => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ações */}
      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button onClick={handleSaveCategories} disabled={savingCats}>{savingCats ? "Salvando..." : "Salvar categorias"}</button>
        <button onClick={() => {
          // restora do prop categories se existir, senão do localStorage
          if (categories && typeof categories === "object") setLocalCats({ ...categories });
          else {
            try {
              const raw = localStorage.getItem(LS_CATEGORIES);
              setLocalCats(raw ? JSON.parse(raw) : { uncategorized: { id: "uncategorized", title: "Sem categoria", agrupadorIds: [] } });
            } catch {
              setLocalCats({ uncategorized: { id: "uncategorized", title: "Sem categoria", agrupadorIds: [] } });
            }
          }
        }}>Cancelar</button>

        {typeof onSaveGroups === "function" && (
          <button onClick={() => onSaveGroups()}>Salvar agrupadores (mapa contas→agrupador)</button>
        )}
      </div>
    </div>
  );
}

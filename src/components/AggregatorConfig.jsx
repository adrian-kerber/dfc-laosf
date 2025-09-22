import React, { useState } from "react";
import { db } from "../lib/database";

/**
 * Mostra a lista de agrupadores e permite:
 * - Criar (grava em DB)
 * - Renomear (grava em DB)
 * - (Opcional) Deletar (grava em DB) – só inclua se quiser expor no app
 *
 * Props:
 * - aggregators: { [id]: { id, title, accountIds } } (já carregado do DB pelo App)
 * - onChanged: () => void   -> chame para o App recarregar do DB após alterações
 */
export default function AggregatorConfig({ aggregators, onChanged }) {
  const [novoNome, setNovoNome] = useState("");
  const [renomearId, setRenomearId] = useState("");
  const [renomearNome, setRenomearNome] = useState("");

  const lista = Object.values(aggregators)
    .filter(a => a.id !== "unassigned")
    .sort((a,b) => String(a.title).localeCompare(String(b.title)));

  const handleCreate = async () => {
    const nome = novoNome.trim();
    if (!nome) return;
    await db.createAgrupador(nome);   // <-- grava no banco!
    setNovoNome("");
    onChanged?.();                    // recarrega do DB
  };

  const handleRename = async () => {
    if (!renomearId) return;
    const nome = renomearNome.trim();
    if (!nome) return;
    await db.renameAgrupador(Number(renomearId), nome); // <-- grava no banco!
    setRenomearId("");
    setRenomearNome("");
    onChanged?.();                                   // recarrega do DB
  };

  // (Opcional) só se quiser expor delete no app
  // const handleDelete = async (id) => {
  //   if (!confirm("Excluir este agrupador definitivamente?")) return;
  //   await db.deleteAgrupador(Number(id));
  //   onChanged?.();
  // };

  return (
    <div>
      <h2>Configurações de Agrupadores</h2>

      <div style={{ marginBottom: 12 }}>
        <input
          placeholder="Novo agrupador"
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
        />
        <button onClick={handleCreate}>Adicionar</button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <select
          value={renomearId}
          onChange={(e) => {
            const id = e.target.value;
            setRenomearId(id);
            const atual = lista.find(x => String(x.id) === String(id));
            setRenomearNome(atual?.title ?? "");
          }}
        >
          <option value="">— escolher para renomear —</option>
          {lista.map(a => (
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

      <ul style={{ marginTop: 8 }}>
        {lista.map(a => (
          <li key={a.id}>
            {a.title} {a.accountIds?.length ? `(${a.accountIds.length} contas)` : "(vazio)"}
            {/* <button onClick={() => handleDelete(a.id)}>Excluir</button> */}
          </li>
        ))}
      </ul>
    </div>
  );
}

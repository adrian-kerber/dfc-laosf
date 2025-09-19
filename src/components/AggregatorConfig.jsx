// src/components/AggregatorConfig.jsx
import React, { useState } from "react";

export default function AggregatorConfig({ aggregators, setAggregators }) {
  const [newTitle, setNewTitle] = useState("");

  // Adiciona um novo agrupador
  const addAggregator = () => {
    const id = newTitle.trim().toLowerCase().replace(/\s+/g, "_");
    if (!newTitle || aggregators[id]) return;
    setAggregators({
      ...aggregators,
      [id]: { id, title: newTitle.trim(), accountIds: [] },
    });
    setNewTitle("");
  };

  // Atualiza título de um agrupador
  const renameAggregator = (id) => {
    const title = prompt("Novo nome para o agrupador:", aggregators[id].title);
    if (!title) return;
    setAggregators({
      ...aggregators,
      [id]: { ...aggregators[id], title },
    });
  };

  // Remove um agrupador (joga contas no 'unassigned')
  const deleteAggregator = (id) => {
    if (!window.confirm("Deletar agrupador e devolver contas ao não agrupadas?"))
      return;
    const { [id]: removed, ...rest } = aggregators;
    const unassigned = {
      ...rest.unassigned,
      accountIds: [...rest.unassigned.accountIds, ...removed.accountIds],
    };
    setAggregators({ ...rest, unassigned });
  };

  return (
    <div className="mb-4 border rounded p-2">
      <h2 className="font-semibold mb-2">Configurações de Agrupadores</h2>
      <div className="flex space-x-2 mb-2">
        <input
          type="text"
          placeholder="Novo agrupador"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className="border p-1 flex-1"
        />
        <button onClick={addAggregator} className="p-1 bg-blue-600 text-white rounded">
          Adicionar
        </button>
      </div>
      <ul>
        {Object.values(aggregators)
          .filter((a) => a.id !== "unassigned")
          .map((agg) => (
            <li key={agg.id} className="flex items-center justify-between mb-1">
              <span>{agg.title}</span>
              <div className="space-x-1">
                <button onClick={() => renameAggregator(agg.id)} className="text-sm">
                  Renomear
                </button>
                <button onClick={() => deleteAggregator(agg.id)} className="text-sm text-red-600">
                  Deletar
                </button>
              </div>
            </li>
          ))}
      </ul>
    </div>
);
}

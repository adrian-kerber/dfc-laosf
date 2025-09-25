// /api/categorias.js - Categorias globais + mapeamento por centro de custo
import { neon } from "@neondatabase/serverless";
export const config = { runtime: "edge" };
const sql = neon(process.env.DATABASE_URL);

async function ensureTables() {
  // CATEGORIAS: globais (mesmas para todos os centros)
  await sql`
    CREATE TABLE IF NOT EXISTS categorias (
      idcategoria SERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  
  // MAPEAMENTO: agrupador → categoria POR centro de custo
  await sql`
    CREATE TABLE IF NOT EXISTS categoria_agrupadores (
      id SERIAL PRIMARY KEY,
      idcategoria INTEGER REFERENCES categorias(idcategoria) ON DELETE CASCADE,
      idagrupador INTEGER NOT NULL,
      idcentrocusto INTEGER NOT NULL,
      UNIQUE(idagrupador, idcentrocusto)
    )
  `;
}

export default async function handler(req) {
  try {
    await ensureTables();

    if (req.method === "GET") {
      const url = new URL(req.url);
      const ccParam = url.searchParams.get('cc');

      // Categorias sempre globais
      const cats = await sql`
        SELECT idcategoria, nome 
        FROM categorias 
        ORDER BY nome
      `;

      let links;
      if (ccParam) {
        // Links filtrados por centro de custo específico
        links = await sql`
          SELECT idcategoria, idagrupador, idcentrocusto 
          FROM categoria_agrupadores 
          WHERE idcentrocusto = ${Number(ccParam)}
        `;
      } else {
        // Todos os links (para relatórios consolidados)
        links = await sql`
          SELECT idcategoria, idagrupador, idcentrocusto 
          FROM categoria_agrupadores
          ORDER BY idcentrocusto, idcategoria
        `;
      }
      
      return Response.json({ categorias: cats, links }, { status: 200 });
    }

    if (req.method === "POST") {
      const body = await req.json();
      
      if (body.acao === "salvar_categorias_globais") {
        // Salva lista de categorias globais
        const categorias = body.categorias || [];
        
        // Remove categorias não utilizadas e adiciona novas
        await sql`DELETE FROM categoria_agrupadores`; // limpa mapeamentos
        await sql`DELETE FROM categorias`; // limpa categorias
        
        for (const cat of categorias) {
          if (!cat.nome || !cat.nome.trim()) continue;
          
          await sql`
            INSERT INTO categorias (nome) 
            VALUES (${cat.nome.trim()})
            ON CONFLICT (nome) DO NOTHING
          `;
        }
        
        return Response.json({ ok: true }, { status: 200 });
      }
      
      if (body.acao === "salvar_mapeamento") {
        // Salva mapeamento agrupador→categoria para um centro específico
        const { mapeamentos, idcentrocusto } = body;
        
        if (!idcentrocusto || Number.isNaN(Number(idcentrocusto))) {
          return Response.json({ error: "idcentrocusto obrigatório" }, { status: 400 });
        }
        
        if (!Array.isArray(mapeamentos)) {
          return Response.json({ error: "mapeamentos deve ser array" }, { status: 400 });
        }
        
        const ccNumber = Number(idcentrocusto);
        
        // Remove mapeamentos existentes deste centro
        await sql`DELETE FROM categoria_agrupadores WHERE idcentrocusto = ${ccNumber}`;
        
        // Insere novos mapeamentos
        for (const map of mapeamentos) {
          if (!map.idagrupador || !map.idcategoria) continue;
          
          await sql`
            INSERT INTO categoria_agrupadores (idcategoria, idagrupador, idcentrocusto)
            VALUES (${Number(map.idcategoria)}, ${Number(map.idagrupador)}, ${ccNumber})
          `;
        }
        
        return Response.json({ ok: true }, { status: 200 });
      }
      
      // Formato antigo - compatibilidade temporária
      const inputCats = body.categorias;
      const idcentrocusto = body.idcentrocusto;
      
      if (!inputCats || typeof inputCats !== "object") {
        return Response.json({ error: "payload inválido" }, { status: 400 });
      }
      
      if (!idcentrocusto || Number.isNaN(Number(idcentrocusto))) {
        return Response.json({ error: "idcentrocusto obrigatório" }, { status: 400 });
      }
      
      const ccNumber = Number(idcentrocusto);
      
      // Garante que todas as categorias existam (globais)
      for (const key of Object.keys(inputCats)) {
        const c = inputCats[key];
        if (!c || !c.title) continue;
        
        await sql`
          INSERT INTO categorias (nome) 
          VALUES (${c.title})
          ON CONFLICT (nome) DO NOTHING
        `;
      }
      
      // Remove mapeamentos existentes deste centro
      await sql`DELETE FROM categoria_agrupadores WHERE idcentrocusto = ${ccNumber}`;
      
      // Insere novos mapeamentos
      for (const key of Object.keys(inputCats)) {
        const c = inputCats[key];
        if (!c || !c.title) continue;
        
        // Busca ID da categoria
        const catResult = await sql`
          SELECT idcategoria FROM categorias WHERE nome = ${c.title}
        `;
        
        const catId = catResult?.[0]?.idcategoria;
        if (!catId) continue;
        
        // Insere mapeamentos agrupador→categoria para este centro
        const ids = Array.isArray(c.agrupadorIds) ? c.agrupadorIds : [];
        for (const aggIdRaw of ids) {
          if (aggIdRaw == null || aggIdRaw === "") continue;
          const aggId = Number(String(aggIdRaw).trim());
          if (!Number.isFinite(aggId)) continue;
          
          await sql`
            INSERT INTO categoria_agrupadores (idcategoria, idagrupador, idcentrocusto)
            VALUES (${catId}, ${aggId}, ${ccNumber})
            ON CONFLICT (idagrupador, idcentrocusto) DO UPDATE SET
            idcategoria = ${catId}
          `;
        }
      }
      
      return Response.json({ ok: true }, { status: 200 });
    }

    return new Response("Method Not Allowed", { status: 405 });
  } catch (e) {
    console.error("Erro em /api/categorias:", e);
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}
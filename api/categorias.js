// /api/categorias.js
import { neon } from "@neondatabase/serverless";
export const config = { runtime: "edge" };
const sql = neon(process.env.DATABASE_URL);

// cria/garante tabelas
async function ensureTables() {
  // ATUALIZADO: categorias agora têm centro de custo
  await sql`
    CREATE TABLE IF NOT EXISTS categorias (
      idcategoria SERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      idcentrocusto INTEGER NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  
  // ATUALIZADO: categoria_agrupadores agora têm centro de custo
  await sql`
    CREATE TABLE IF NOT EXISTS categoria_agrupadores (
      id SERIAL PRIMARY KEY,
      idcategoria INTEGER REFERENCES categorias(idcategoria) ON DELETE CASCADE,
      idagrupador INTEGER NOT NULL,
      idcentrocusto INTEGER NULL
    )
  `;
}

export default async function handler(req) {
  try {
    await ensureTables();

    if (req.method === "GET") {
      const url = new URL(req.url);
      const ccParam = url.searchParams.get('cc');

      let cats, links;
      
      if (ccParam) {
        // Filtra por centro de custo específico
        cats = await sql`
          SELECT idcategoria, nome, idcentrocusto 
          FROM categorias 
          WHERE idcentrocusto = ${Number(ccParam)}
          ORDER BY idcategoria
        `;
        
        links = await sql`
          SELECT idcategoria, idagrupador, idcentrocusto 
          FROM categoria_agrupadores 
          WHERE idcentrocusto = ${Number(ccParam)}
        `;
      } else {
        // Retorna todas
        cats = await sql`
          SELECT idcategoria, nome, idcentrocusto 
          FROM categorias 
          ORDER BY idcentrocusto, idcategoria
        `;
        
        links = await sql`
          SELECT idcategoria, idagrupador, idcentrocusto 
          FROM categoria_agrupadores
        `;
      }
      
      return Response.json({ categorias: cats, links }, { status: 200 });
    }

    if (req.method === "POST") {
      // ATUALIZADO: Payload agora inclui idcentrocusto
      // { categorias: { id: { id, title, agrupadorIds: [] }, ... }, idcentrocusto: number }
      const body = await req.json();
      const inputCats = body.categorias;
      const idcentrocusto = body.idcentrocusto;

      if (!inputCats || typeof inputCats !== "object") {
        return Response.json({ error: "payload inválido" }, { status: 400 });
      }

      if (!idcentrocusto || Number.isNaN(Number(idcentrocusto))) {
        return Response.json({ error: "idcentrocusto obrigatório" }, { status: 400 });
      }

      const ccNumber = Number(idcentrocusto);

      // Remove categorias e links do centro de custo específico
      await sql`DELETE FROM categoria_agrupadores WHERE idcentrocusto = ${ccNumber}`;
      await sql`DELETE FROM categorias WHERE idcentrocusto = ${ccNumber}`;

      // Inserir categorias em ordem das chaves do objeto
      for (const key of Object.keys(inputCats)) {
        const c = inputCats[key];
        if (!c || !c.title) continue;

        // Insere categoria com centro de custo
        const inserted = await sql`
          INSERT INTO categorias (nome, idcentrocusto) 
          VALUES (${c.title}, ${ccNumber})
          RETURNING idcategoria
        `;

        const newId = inserted?.[0]?.idcategoria;
        if (!newId) continue;

        // Insere links com centro de custo
        const ids = Array.isArray(c.agrupadorIds) ? c.agrupadorIds : [];
        for (const aggIdRaw of ids) {
          if (aggIdRaw == null || aggIdRaw === "") continue;
          const aggId = Number(String(aggIdRaw).trim());
          if (!Number.isFinite(aggId)) continue;
          
          await sql`
            INSERT INTO categoria_agrupadores (idcategoria, idagrupador, idcentrocusto)
            VALUES (${newId}, ${aggId}, ${ccNumber})
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
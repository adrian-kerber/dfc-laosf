// /api/categorias.js
import { neon } from "@neondatabase/serverless";
export const config = { runtime: "edge" };
const sql = neon(process.env.DATABASE_URL);

// cria/garante tabelas
async function ensureTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS categorias (
      idcategoria SERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS categoria_agrupadores (
      id SERIAL PRIMARY KEY,
      idcategoria INTEGER REFERENCES categorias(idcategoria) ON DELETE CASCADE,
      idagrupador INTEGER NOT NULL
    )
  `;
}

export default async function handler(req) {
  try {
    await ensureTables();

    if (req.method === "GET") {
      // retorna categorias e ligações
      const cats = await sql`SELECT idcategoria, nome FROM categorias ORDER BY idcategoria`;
      const links = await sql`SELECT idcategoria, idagrupador FROM categoria_agrupadores`;
      return Response.json({ categorias: cats, links }, { status: 200 });
    }

    if (req.method === "POST") {
      // Payload: { categorias: { id: { id, title, agrupadorIds: [] }, ... } }
      const body = await req.json();
      const inputCats = body.categorias;

      if (!inputCats || typeof inputCats !== "object") {
        return Response.json({ error: "payload inválido" }, { status: 400 });
      }

      // Simples approach: remove tudo e re-inserir.
      // NÃO usamos sql.begin (não disponível no client); executamos de forma sequencial.
      // Se quiser transação de verdade, eu escrevo com driver que suporte begin/commit.
      await sql`DELETE FROM categoria_agrupadores`;
      await sql`DELETE FROM categorias`;

      // Inserir categorias em ordem das chaves do objeto (mantém ordem enviada)
      for (const key of Object.keys(inputCats)) {
        const c = inputCats[key];
        if (!c || !c.title) continue;

        // Insere categoria e pega novo id
        const inserted = await sql`
          INSERT INTO categorias (nome) VALUES (${c.title})
          RETURNING idcategoria
        `;

        const newId = inserted?.[0]?.idcategoria;
        if (!newId) continue;

        // Insere links (usar for..of para garantir await)
        const ids = Array.isArray(c.agrupadorIds) ? c.agrupadorIds : [];
        for (const aggIdRaw of ids) {
          if (aggIdRaw == null || aggIdRaw === "") continue;
          const aggId = Number(String(aggIdRaw).trim());
          if (!Number.isFinite(aggId)) continue;
          await sql`
            INSERT INTO categoria_agrupadores (idcategoria, idagrupador)
            VALUES (${newId}, ${aggId})
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

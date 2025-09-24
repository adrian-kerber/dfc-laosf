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

      // Simples approach: truncate and re-insert (só se quiser persistência full)
      // Para segurança usamos transação
      await sql.begin(async (tx) => {
        // remover links e categorias existentes (custo aceitável para uso administrativo)
        await tx`DELETE FROM categoria_agrupadores`;
        await tx`DELETE FROM categorias`;

        // inserir categorias (mantendo a ordem das keys)
        for (const key of Object.keys(inputCats)) {
          const c = inputCats[key];
          // se a categoria vier com id que é numeric, respeitamos, mas preferimos inserir novo
          const inserted = await tx`
            INSERT INTO categorias (nome) VALUES (${c.title})
            RETURNING idcategoria
          `;
          const newId = inserted[0].idcategoria;
          // inserir links
          (c.agrupadorIds || []).forEach(async (aggId) => {
            if (!aggId) return;
            await tx`INSERT INTO categoria_agrupadores (idcategoria, idagrupador) VALUES (${newId}, ${Number(aggId)})`;
          });
        }
      });

      return Response.json({ ok: true }, { status: 200 });
    }

    return new Response("Method Not Allowed", { status: 405 });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}

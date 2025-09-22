import { neon } from "@neondatabase/serverless";
export const config = { runtime: "edge" };

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req) {
  try {
    if (req.method === "GET") {
      // Lista todos os centros de custo
      const rows = await sql`SELECT * FROM centros_custo ORDER BY nome`;
      return Response.json(rows ?? [], { status: 200 });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const codigo = body.codigo ? String(body.codigo).trim() : null;
      const nome = body.nome ? String(body.nome).trim() : null;

      if (!nome) {
        return Response.json({ error: "Nome é obrigatório" }, { status: 400 });
      }

      const rows = await sql`
        INSERT INTO centros_custo (codigo, nome)
        VALUES (${codigo}, ${nome})
        ON CONFLICT (codigo) DO UPDATE SET nome = ${nome}
        RETURNING *
      `;
      return Response.json(rows?.[0] ?? null, { status: 200 });
    }

    return new Response("Method Not Allowed", { status: 405 });
  } catch (e) {
    console.error("Erro em /api/centros-custo:", e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

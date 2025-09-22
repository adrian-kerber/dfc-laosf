// /api/admin/clear.js
import { neon } from "@neondatabase/serverless";
export const config = { runtime: "edge" };

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    // ordem importa por causa das foreign keys
    await sql`DELETE FROM agrupador_contas`;
    await sql`DELETE FROM movimentacoes`;
    await sql`DELETE FROM precos`;
    await sql`DELETE FROM agrupadores`;
    await sql`DELETE FROM contas`;
    await sql`DELETE FROM centros_custo`;

    return Response.json({ ok: true, cleared: true }, { status: 200 });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

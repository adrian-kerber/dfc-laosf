// pages/api/centros_custo.js
import { sql } from "@vercel/postgres";

export default async function handler(req, res) {
  try {
    switch (req.method) {
      case "GET": {
        const { rows } = await sql`SELECT * FROM centros_custo ORDER BY idcentrocusto`;
        return res.status(200).json(rows);
      }
      case "POST": {
        const { codigo, nome } = req.body;
        const { rows } = await sql`
          INSERT INTO centros_custo (codigo, nome)
          VALUES (${codigo}, ${nome})
          ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome
          RETURNING *;
        `;
        return res.status(200).json(rows[0]);
      }
      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (err) {
    console.error("Erro centros_custo:", err);
    return res.status(500).json({ error: err.message });
  }
}

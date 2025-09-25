// /api/agrupadores/contas.js
import { neon } from '@neondatabase/serverless';
export const config = { runtime: 'edge' };

const sql = neon(process.env.DATABASE_URL);

async function ensureTables() {
  // ATUALIZADO: mapeamento conta → agrupador por centro de custo
  await sql`
    CREATE TABLE IF NOT EXISTS conta_agrupador (
      id SERIAL PRIMARY KEY,
      idconta VARCHAR(50) NOT NULL,
      idagrupador INTEGER NULL,
      idcentrocusto INTEGER NULL,
      UNIQUE(idconta, idcentrocusto)
    )
  `;
}

export default async function handler(req) {
  try {
    await ensureTables();

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const ccParam = url.searchParams.get('cc');
      
      let rows;
      if (ccParam) {
        // Filtra por centro de custo específico
        rows = await sql`
          SELECT idconta, idagrupador, idcentrocusto
          FROM conta_agrupador
          WHERE idcentrocusto = ${Number(ccParam)}
          ORDER BY idconta
        `;
      } else {
        // Retorna todos
        rows = await sql`
          SELECT idconta, idagrupador, idcentrocusto
          FROM conta_agrupador
          ORDER BY idcentrocusto, idconta
        `;
      }
      
      return Response.json(rows ?? [], { status: 200 });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const list = Array.isArray(body.associations) ? body.associations : [];

      // Validação
      for (const a of list) {
        if (typeof a.idconta !== 'string' || a.idconta.trim() === '') {
          return Response.json({ error: 'idconta inválido' }, { status: 400 });
        }
        if (a.idagrupador != null && Number.isNaN(Number(a.idagrupador))) {
          return Response.json({ error: 'idagrupador inválido' }, { status: 400 });
        }
        if (a.idcentrocusto == null || Number.isNaN(Number(a.idcentrocusto))) {
          return Response.json({ error: 'idcentrocusto obrigatório' }, { status: 400 });
        }
      }

      // Agrupa por centro de custo para limpar apenas os centros que estão sendo atualizados
      const centros = [...new Set(list.map(a => Number(a.idcentrocusto)))];
      
      // Remove associações dos centros que estão sendo atualizados
      for (const cc of centros) {
        await sql`DELETE FROM conta_agrupador WHERE idcentrocusto = ${cc}`;
      }

      // Insere novas associações
      for (const a of list) {
        if (a.idagrupador != null) {
          await sql`
            INSERT INTO conta_agrupador (idconta, idagrupador, idcentrocusto)
            VALUES (${a.idconta}, ${Number(a.idagrupador)}, ${Number(a.idcentrocusto)})
            ON CONFLICT (idconta, idcentrocusto) DO UPDATE SET
            idagrupador = ${Number(a.idagrupador)}
          `;
        }
      }

      return Response.json({ ok: true, saved: list.length }, { status: 200 });
    }

    return new Response('Method Not Allowed', { status: 405 });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}
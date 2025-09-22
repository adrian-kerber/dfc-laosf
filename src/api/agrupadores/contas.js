// /api/agrupadores/contas.js
import { sql } from '../../_db';

export default async function handler(req,res){
  try{
    if(req.method==='GET'){
      const { searchParams } = new URL(req.url, 'http://x');
      const mes = Number(searchParams.get('mes'));
      const ano = Number(searchParams.get('ano'));
      const rows = mes && ano
        ? await sql`
          SELECT ac.*, a.nome as agrupador_nome, c.nome as conta_nome, c.idconta
          FROM agrupador_contas ac
          JOIN agrupadores a ON ac.idagrupador = a.idagrupador
          JOIN contas c ON ac.idconta = c.idconta
          WHERE ac.mes=${mes} AND ac.ano=${ano}
          ORDER BY a.nome, c.idconta`
        : await sql`
          SELECT ac.*, a.nome as agrupador_nome, c.nome as conta_nome, c.idconta
          FROM agrupador_contas ac
          JOIN agrupadores a ON ac.idagrupador = a.idagrupador
          JOIN contas c ON ac.idconta = c.idconta
          ORDER BY a.nome, c.idconta`;
      return res.status(200).json(rows ?? []);
    }
    if(req.method==='POST'){
      const { associations, mes, ano } = await parse(req);
      await sql`DELETE FROM agrupador_contas WHERE mes=${mes} AND ano=${ano}`;
      for(const assoc of associations){
        await sql`
          INSERT INTO agrupador_contas (idagrupador, idconta, mes, ano)
          VALUES (${assoc.idagrupador}, ${assoc.idconta}, ${mes}, ${ano})
          ON CONFLICT (idagrupador, idconta, mes, ano) DO NOTHING`;
      }
      return res.status(200).json({ ok:true });
    }
    res.status(405).end();
  }catch(e){ console.error(e); res.status(500).json({error:e.message}); }
}
async function parse(req){ const ch=[]; for await(const c of req) ch.push(c); return JSON.parse(Buffer.concat(ch).toString('utf8')||'{}'); }

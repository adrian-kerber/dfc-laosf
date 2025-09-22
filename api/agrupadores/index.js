// /api/agrupadores/index.js
import { sql } from '../_db';
export default async function handler(req,res){
  try{
    if(req.method==='GET'){
      const rows = await sql`SELECT * FROM agrupadores ORDER BY nome`;
      return res.status(200).json(rows ?? []);
    }
    if(req.method==='POST'){
      const body = await parse(req);
      const [row] = await sql`
        INSERT INTO agrupadores (nome) VALUES (${body.nome}) RETURNING *`;
      return res.status(200).json(row);
    }
    res.status(405).end();
  }catch(e){ console.error(e); res.status(500).json({error:e.message}); }
}
async function parse(req){ const ch=[]; for await(const c of req) ch.push(c); return JSON.parse(Buffer.concat(ch).toString('utf8')||'{}'); }

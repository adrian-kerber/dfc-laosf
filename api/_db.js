// /api/_db.js
// Sempre no servidor. NÃO importe isso no client.
import { neon } from '@neondatabase/serverless';

/** Inicializa conexão segura com Neon usando env da Vercel (só no server) */
export const sql = (() => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Missing DATABASE_URL');
  return neon(url);
})();

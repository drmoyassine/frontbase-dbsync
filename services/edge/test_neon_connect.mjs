/**
 * Test connecting to Supabase pooler via @neondatabase/serverless
 * using the scoped role credentials.
 */
import { Pool } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

const dbUrl = readFileSync('db_url.txt', 'utf8').trim();
const masked = dbUrl.replace(/:([^@]+)@/, ':***@');
console.log('Connecting with:', masked);

try {
  const pool = new Pool({ connectionString: dbUrl });
  const result = await pool.query('SELECT 1 as test');
  console.log('SUCCESS!', result.rows);
  await pool.end();
} catch (e) {
  console.error('FAILED:', e.message);
}

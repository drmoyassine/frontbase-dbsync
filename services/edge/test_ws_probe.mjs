/**
 * Probe whether Supabase's pooler accepts WebSocket connections.
 * Tests multiple wsProxy configurations.
 * 
 * Usage: node test_ws_probe.mjs <POSTGRES_URL>
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

const dbUrl = process.argv[2];
if (!dbUrl) {
  console.error('Usage: node test_ws_probe.mjs <POSTGRES_URL>');
  process.exit(1);
}

const urlObj = new URL(dbUrl.replace('postgres://', 'http://'));
const host = urlObj.hostname;
const port = urlObj.port || '6543';
console.log(`Host: ${host}, Port: ${port}\n`);

const proxyConfigs = [
  { name: 'Default (host/v2)',    fn: (h, p) => `${h}/v2` },
  { name: 'host:port/v2',        fn: (h, p) => `${h}:${p}/v2` },
  { name: 'host/v1',             fn: (h, p) => `${h}/v1` },
  { name: 'host:port/v1',        fn: (h, p) => `${h}:${p}/v1` },
  { name: 'host (no path)',       fn: (h, p) => `${h}` },
  { name: 'host:port (no path)', fn: (h, p) => `${h}:${p}` },
];

for (const config of proxyConfigs) {
  console.log(`--- Testing: ${config.name} → ${config.fn(host, port)}`);
  try {
    neonConfig.webSocketConstructor = ws;
    neonConfig.wsProxy = config.fn;
    neonConfig.useSecureWebSocket = true;
    neonConfig.forceDisablePgSSL = true;
    neonConfig.pipelineConnect = false;
    neonConfig.pipelineTLS = false;

    const pool = new Pool({ connectionString: dbUrl });
    const result = await Promise.race([
      pool.query('SELECT 1 as test'),
      new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT 5s')), 5000)),
    ]);
    console.log(`✅ SUCCESS!`, result.rows);
    await pool.end();
    process.exit(0);
  } catch (e) {
    console.log(`❌ ${e.message?.substring(0, 120)}\n`);
  }
}
console.log('\n🚫 No working wsProxy config found.');

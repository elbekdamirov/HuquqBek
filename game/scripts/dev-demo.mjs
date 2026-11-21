// Development demo: Vite + local API with HUQUQBEK_DEV_MODE=1 (sandbox payments, self-attested identity,
// practice exam bank) on a separate demo database so real learner progress is never touched.
// Refuses to run with NODE_ENV=production.
import { fileURLToPath } from 'node:url';
if (process.env.NODE_ENV === 'production') { console.error('dev-demo is disabled in production.'); process.exit(1); }
process.env.HUQUQBEK_DEV_MODE = '1';
process.env.HUQUQBEK_LEARNING_DB ||= fileURLToPath(new URL('../.local/demo.sqlite', import.meta.url));
const { createServer } = await import('vite');
const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { host: '127.0.0.1', port: Number(process.env.PORT || 5173) } });
await server.listen();
server.printUrls();
console.log('HuquqBek DEV MODE: sandbox payments, demo DB at', process.env.HUQUQBEK_LEARNING_DB);

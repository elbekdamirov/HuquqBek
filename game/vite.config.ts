import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { handleApi } from './server/api.mjs';

const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
export default defineConfig({
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(version) },
  plugins: [
    react(),
    {
      name: 'qonunverse-local-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/__huquqbek_health' || req.url === '/__qonunverse_health') {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify({ app: 'HuquqBek', version }));
            return;
          }
          void handleApi(req, res).then(handled => {
            if (!handled) next();
          }, next);
        });
      },
    },
  ],
  optimizeDeps: {
    // Bundle the lazy courtroom imports before Vite serves the academy entry point.
    include: ['@react-three/fiber', '@react-three/drei', 'three', 'three/addons/utils/SkeletonUtils.js'],
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.local/**', '**/server/**'] },
  },
  build: { chunkSizeWarningLimit: 1200 },
});

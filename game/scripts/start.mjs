import { spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const folder = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.HUQUQBEK_PORT || 4197);
const url = `http://127.0.0.1:${port}/`;
const expected = JSON.parse(await readFile(path.join(folder, '..', 'package.json'), 'utf8')).version;
await access(path.join(folder, '..', 'dist', 'index.html'));
const healthy = async () => { try { const response = await fetch(url + '__huquqbek_health', { signal: AbortSignal.timeout(1000) }); return (await response.json()).app === 'HuquqBek'; } catch { return false; } };
if (!(await healthy())) {
  const child = spawn(process.execPath, [path.join(folder, 'serve.mjs')], { detached: true, windowsHide: true, stdio: 'ignore' }); child.unref();
  for (let i = 0; i < 30 && !(await healthy()); i++) await new Promise(resolve => setTimeout(resolve, 150));
}
if (!(await healthy())) throw Error(`Could not start HuquqBek on port ${port}. Run node scripts/serve.mjs to see diagnostics.`);
const running = await fetch(url + '__huquqbek_health').then(r => r.json());
if (running.version !== expected) throw Error(`HuquqBek ${running.version} is still running; expected ${expected}. Restart the local server before opening the updated game.`);
const opener = process.platform === 'win32' ? spawn('explorer.exe', [url], { detached: true, stdio: 'ignore', windowsHide: true }) : spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }); opener.unref();
console.log(`Opened ${url}`);

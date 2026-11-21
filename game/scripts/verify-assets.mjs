import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const root = path.resolve('public/assets');
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
let files = 0, bytes = 0;
async function verify(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const filename = path.join(folder, entry.name);
    if (entry.isDirectory()) { await verify(filename); continue; }
    const buffer = await readFile(filename); bytes += buffer.length;
    if (!entry.name.endsWith('.glb')) continue;
    assert.equal(buffer.readUInt32LE(0), 0x46546c67, filename);
    assert.equal(buffer.readUInt32LE(4), 2, filename);
    assert.equal(buffer.readUInt32LE(8), buffer.length, filename);
    const json = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString('utf8'));
    assert.equal(json.asset.version, '2.0');
    assert.ok((json.nodes || []).length > 0); files++;
  }
}
await verify(root);
for (const c of manifest.characters) for (const url of Object.values(c.files)) await readFile(path.join('public', url));
assert.equal(manifest.action_map.humans.walk, 'Walk');
assert.ok(manifest.environment.markers.SPAWN_advokat);
console.log(`${files} valid GLB containers; ${(bytes / 1e6).toFixed(1)} MB complete source asset package; all manifest character URLs exist.`);
// When running beside the original asset project, prove the copied payloads are unchanged.
const original = path.resolve('..', 'public', 'assets');
let compared = 0;
async function compare(folder, relative = '') {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const rel = path.join(relative, entry.name), file = path.join(folder, entry.name);
    if (entry.isDirectory()) { await compare(file, rel); continue; }
    if (!entry.name.endsWith('.glb') && entry.name !== 'manifest.json') continue;
    const [a, b] = await Promise.all([readFile(file), readFile(path.join(original, rel))]);
    const hash = value => createHash('sha256').update(value).digest('hex');
    assert.equal(hash(a), hash(b), `Changed source asset ${rel}`); compared++;
  }
}
try { await readdir(original); await compare(root); console.log(`${compared} GLBs/manifests match the original SHA-256 hashes.`); } catch (error) { if (error.code !== 'ENOENT') throw error; console.log('Original asset root not present; portable container validation completed.'); }

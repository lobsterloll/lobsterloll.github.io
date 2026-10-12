const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');
const textures = [
  'grass_block_top', 'dirt', 'stone', 'oak_planks', 'glass',
  'bricks', 'bookshelf', 'oak_leaves', 'cobblestone', 'sand',
  'oak_log', 'stone_bricks', 'obsidian', 'diamond_block',
  'crafting_table_front', 'grass_block_side'
];
const atlas = Buffer.alloc(256 * 16 * 4);

textures.forEach((name, tile) => {
  const filename = path.join(root, 'textures', `${name}.png`);
  const png = PNG.sync.read(fs.readFileSync(filename));
  if (png.width !== 16 || png.height !== 16) throw Error(`${filename} must be 16×16`);
  const background = name === 'glass' ? [171, 221, 238] : [78, 129, 70];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const src = (y * 16 + x) * 4;
    const dst = (y * 256 + tile * 16 + x) * 4;
    const alpha = png.data[src + 3] / 255;
    for (let c = 0; c < 3; c++) atlas[dst + c] = Math.round(png.data[src + c] * alpha + background[c] * (1 - alpha));
    atlas[dst + 3] = 255;
  }
});

const source = fs.readFileSync(path.join(root, 'src', 'voxel-world.js'), 'utf8');
if (!source.includes('__ATLAS_RGBA_BASE64__')) throw Error('Atlas marker missing from source');
const bundled = source.replace('__ATLAS_RGBA_BASE64__', atlas.toString('base64'));
fs.writeFileSync(path.join(root, 'voxel-bookmarklet.js'), bundled);
const minified = esbuild.transformSync(bundled, { minify: true, target: 'es2019', legalComments: 'none' }).code.trim();
const bookmarklet = `javascript:${minified}`;
fs.writeFileSync(path.join(root, 'bookmarklet.txt'), bookmarklet + '\n');

const escape = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const installer = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PageCraft bookmarklet installer</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:780px;margin:6vw auto;padding:0 20px;background:#f4f5f1;color:#1e2832}h1{font-size:2rem}a.bookmark{display:inline-block;background:#336d42;color:white;padding:14px 20px;border-radius:9px;font-weight:700;text-decoration:none;box-shadow:0 4px #234a2c}button{font:inherit;padding:8px 12px;border:1px solid #556;border-radius:7px;background:#fff;cursor:pointer}code{background:#e7e9e5;padding:2px 5px;border-radius:4px}section{background:#fff;padding:20px;border-radius:12px;margin:20px 0}small{color:#53616d}</style>
<h1>Play an endless voxel world on any website</h1><p>Save the game link below as a bookmark. Click it on a website to open a terrain world over that page. The page stays underneath until you exit.</p>
<section><h2>1. Save the game bookmark</h2><p>Show your bookmarks bar and <strong>drag this green link onto it</strong>:</p>
<p><a class="bookmark" href="${escape(bookmarklet)}" onclick="return false">⛏ Play Minecraft-style world</a></p>
<p>Do not bookmark this installer page or the demo page. A normal website bookmark only takes you back to that page.</p>
<p>Can't drag it? <button id="copy">Copy the game bookmark URL</button>, create a new bookmark, and paste it into the bookmark's <strong>URL/address</strong> field.</p><small id="copy-status"></small></section>
<section><h2>2. Use it on another website</h2><p>Visit any website, then click <strong>⛏ Play Minecraft-style world</strong> in your bookmarks bar. The world loads 24 surrounding chunks plus the chunk you are in as you explore. Click the 3D view to lock your mouse. Use WASD to move, Space to jump, Shift to sneak, Ctrl to sprint, and left/right click to break/place. Choose hotbar slots with the wheel or 1–9; press E for the creative inventory. Press Q or Exit to return to the page.</p>
<p>The <a href="demo.html">demo page</a> is optional. It is only a place to test the game.</p></section>
<p><small>Browser Content Security Policy may block bookmarklets. See README.md for limitations and texture credits.</small></p>
<script>document.getElementById('copy').addEventListener('click',async()=>{const url=${JSON.stringify(bookmarklet)};try{await navigator.clipboard.writeText(url);document.getElementById('copy-status').textContent='Copied. Paste into the bookmark URL field.'}catch(e){const t=document.createElement('textarea');t.value=url;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();document.getElementById('copy-status').textContent='Copied if your browser allows clipboard access; otherwise use bookmarklet.txt.'}})</script>
</html>`;
fs.writeFileSync(path.join(root, 'installer.html'), installer);
console.log(`Built ${textures.length} sourced texture tiles; bookmarklet URL: ${bookmarklet.length} characters`);

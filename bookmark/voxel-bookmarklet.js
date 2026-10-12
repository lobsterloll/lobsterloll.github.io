/* PageCraft: a self-contained voxel-world bookmarklet.
   The build embeds licensed Pixel Perfection CE block textures here.
   Save the generated bookmarklet.txt as a browser bookmark URL. */
(function () {
  "use strict";

  if (window.__pageCraftVoxel) {
    window.__pageCraftVoxel.destroy();
    return;
  }

  const CHUNK_SIZE = 16;
  const CHUNK_RADIUS = 2;
  const blocks = new Map();
  const loadedChunks = new Map();
  const blockEdits = new Map();
  let centerChunkX = NaN;
  let centerChunkZ = NaN;
  const key = (x, y, z) => x + "," + y + "," + z;
  const chunkKey = (x, z) => x + "," + z;
  const blockChunkKey = (x, z) => chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
  const get = (x, y, z) => blocks.get(key(x, y, z));
  const put = (x, y, z, block) => blocks.set(key(x, y, z), block);
  const remove = (x, y, z) => blocks.delete(key(x, y, z));
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const names = ["grass", "dirt", "stone", "oak planks", "glass", "bricks", "bookshelf", "oak leaves", "cobblestone", "sand", "oak log", "stone bricks", "obsidian", "diamond block", "crafting table"];
  const hotbarItems = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  let selectedSlot = 3;
  let currentType = hotbarItems[selectedSlot];
  let inventoryOpen = false;
  let destroyed = false;
  let frame = 0;
  let meshDirty = true;
  let blockCount = 0;
  let statusUntil = 0;
  const held = Object.create(null);
  const player = { x: 24, y: 1, z: -11, vy: 0, yaw: 0, pitch: -0.13, grounded: true };
  let jumpQueued = false;

  function terrainHeight(x, z) {
    const waves = 1.8 + 1.25 * Math.sin(x * .18) + 1.15 * Math.cos(z * .17)
      + .7 * Math.sin((x + z) * .12) + .25 * Math.sin(x * .62 - z * .43);
    const spawnClearing = Math.max(clamp(Math.abs(x - 23.5) / 6, 0, 1), clamp((z + 8) / 7, 0, 1));
    return clamp(Math.floor(waves * spawnClearing), 0, 4);
  }

  function surfaceType(x, z, top) {
    return top === 4 ? 2 : top === 0 && z > 4 && Math.sin(x * .23 + z * .17) > .1 ? 9 : 0;
  }

  function treeAt(x, z) {
    if (Math.abs(x - 24) < 6 && Math.abs(z + 11) < 6) return false;
    const gx = Math.floor(x / 12);
    const gz = Math.floor(z / 12);
    const seed = (Math.imul(gx, 92837111) ^ Math.imul(gz, 689287499)) >>> 0;
    return seed % 3 === 0 && x === gx * 12 + 3 + (seed >>> 3) % 6
      && z === gz * 12 + 3 + (seed >>> 8) % 6;
  }

  function loadChunk(cx, cz) {
    const id = chunkKey(cx, cz);
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const keys = new Set();
    function add(x, y, z, block) {
      if (x < x0 || x >= x0 + CHUNK_SIZE || z < z0 || z >= z0 + CHUNK_SIZE) return;
      const id = key(x, y, z);
      blocks.set(id, block);
      keys.add(id);
    }
    for (let x = x0; x < x0 + CHUNK_SIZE; x++) {
      for (let z = z0; z < z0 + CHUNK_SIZE; z++) {
        const top = terrainHeight(x, z);
        const surface = surfaceType(x, z, top);
        for (let y = -2; y <= top; y++) {
          const type = y === top ? surface : y >= top - 2 && surface !== 2 ? (surface === 9 ? 9 : 1) : 2;
          add(x, y, z, { type, color: type === 0 ? [0.87, 1, 0.8] : [1, 1, 1] });
        }
      }
    }
    for (let x = x0 - 2; x < x0 + CHUNK_SIZE + 2; x++) {
      for (let z = z0 - 2; z < z0 + CHUNK_SIZE + 2; z++) {
        if (!treeAt(x, z)) continue;
        const ground = terrainHeight(x, z);
        if (surfaceType(x, z, ground) !== 0) continue;
        for (let y = ground + 1; y <= ground + 3; y++) add(x, y, z, { type: 10, color: [1, 1, 1] });
        for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
          for (let dy = 3; dy <= 5; dy++) {
            if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy - 4) > 4) continue;
            if (dx === 0 && dz === 0 && dy === 3) continue;
            add(x + dx, ground + dy, z + dz, { type: 7, color: [1, 1, 1] });
          }
        }
      }
    }
    const edits = blockEdits.get(id);
    if (edits) for (const [blockId, block] of edits) {
      if (block) blocks.set(blockId, block);
      else blocks.delete(blockId);
      keys.add(blockId);
    }
    loadedChunks.set(id, keys);
  }

  function syncChunks() {
    const cx = Math.floor(player.x / CHUNK_SIZE);
    const cz = Math.floor(player.z / CHUNK_SIZE);
    if (cx === centerChunkX && cz === centerChunkZ) return;
    const wanted = new Set();
    for (let dx = -CHUNK_RADIUS; dx <= CHUNK_RADIUS; dx++) {
      for (let dz = -CHUNK_RADIUS; dz <= CHUNK_RADIUS; dz++) wanted.add(chunkKey(cx + dx, cz + dz));
    }
    for (const [id, keys] of loadedChunks) {
      if (wanted.has(id)) continue;
      for (const blockId of keys) blocks.delete(blockId);
      loadedChunks.delete(id);
    }
    let changed = false;
    for (let dx = -CHUNK_RADIUS; dx <= CHUNK_RADIUS; dx++) {
      for (let dz = -CHUNK_RADIUS; dz <= CHUNK_RADIUS; dz++) {
        const x = cx + dx, z = cz + dz;
        if (loadedChunks.has(chunkKey(x, z))) continue;
        loadChunk(x, z);
        changed = true;
      }
    }
    if (changed) {
      meshDirty = true;
    }
    centerChunkX = cx;
    centerChunkZ = cz;
  }

  const root = document.createElement("div");
  root.dataset.pagecraftUi = "1";
  root.style.cssText = "position:fixed!important;inset:0!important;z-index:2147483647!important;background:#8ecbff!important;margin:0!important;padding:0!important;overflow:hidden!important;touch-action:none!important;";
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display:block!important;width:100%!important;height:100%!important;cursor:crosshair!important;";
  root.appendChild(canvas);
  const status = document.createElement("div");
  status.style.cssText = "display:none;position:absolute;left:50%;bottom:116px;transform:translateX(-50%);padding:5px 10px;background:#171717bd;color:#ffe8a3;font:14px monospace;text-align:center;text-shadow:1px 1px #000;pointer-events:none;white-space:nowrap";
  root.appendChild(status);
  const crosshair = document.createElement("div");
  crosshair.style.cssText = "position:absolute;left:50%;top:50%;width:18px;height:18px;transform:translate(-50%,-50%);pointer-events:none;background:linear-gradient(transparent 8px,#fff 8px,#fff 10px,transparent 10px),linear-gradient(90deg,transparent 8px,#fff 8px,#fff 10px,transparent 10px);filter:drop-shadow(0 1px 1px #000)";
  root.appendChild(crosshair);
  const quit = document.createElement("button");
  quit.textContent = "Exit ×";
  quit.style.cssText = "position:absolute;top:14px;right:16px;border:0;border-radius:8px;padding:8px 12px;background:#17212e;color:#fff;font:14px system-ui;cursor:pointer";
  root.appendChild(quit);
  document.documentElement.appendChild(root);

  function message(s) {
    status.textContent = s;
    status.style.display = "block";
    statusUntil = performance.now() + 2500;
  }

  const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
  if (!gl) {
    message("WebGL is unavailable in this browser or page.");
    quit.addEventListener("click", destroy);
    window.__pageCraftVoxel = { destroy };
    return;
  }
  syncChunks();

  function shader(type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
    return s;
  }
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, `
    attribute vec3 aPosition;
    attribute vec2 aUv;
    attribute vec3 aColor;
    attribute float aShade;
    uniform vec3 uEye, uRight, uUp, uForward;
    uniform float uAspect, uTan;
    varying vec2 vUv;
    varying vec3 vColor;
    varying float vDistance;
    void main() {
      vec3 d = aPosition - uEye;
      vec3 p = vec3(dot(d,uRight), dot(d,uUp), dot(d,uForward));
      gl_Position = vec4(p.x/(uAspect*uTan), p.y/uTan, 1.001*p.z-0.100, p.z);
      vUv = aUv;
      vColor = aColor * aShade;
      vDistance = length(d);
    }`));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform sampler2D uAtlas;
    varying vec2 vUv;
    varying vec3 vColor;
    varying float vDistance;
    void main() {
      vec3 tex = texture2D(uAtlas,vUv).rgb;
      vec3 lit = tex * vColor;
      float fog = clamp((vDistance-28.0)/60.0,0.0,0.72);
      gl_FragColor = vec4(mix(lit,vec3(0.56,0.79,1.0),fog),1.0);
    }`));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);

  const attrib = {
    pos: gl.getAttribLocation(program, "aPosition"), uv: gl.getAttribLocation(program, "aUv"),
    color: gl.getAttribLocation(program, "aColor"), shade: gl.getAttribLocation(program, "aShade")
  };
  const uniform = {
    eye: gl.getUniformLocation(program, "uEye"), right: gl.getUniformLocation(program, "uRight"),
    up: gl.getUniformLocation(program, "uUp"), forward: gl.getUniformLocation(program, "uForward"),
    aspect: gl.getUniformLocation(program, "uAspect"), tan: gl.getUniformLocation(program, "uTan")
  };

  function makeAtlas() {
    const bytes = atob("hHlq/4R5av+EeWr/hHlq/5aKdv+Winb/hHlq/4R5av+EeWr/qJyG/4R5av+EeWr/hHlq/4R5av+EeWr/qJyG/3NZS/9zWUv/c1lL/2ZOQf9zWUv/c1lL/3NZS/9mTkH/Zk5B/2ZOQf9mTkH/WUU6/2ZOQf9zWUv/c1lL/2ZOQf+Jfnb/gHJr/4Bya/+Acmv/iX52/4l+dv+Acmv/iX52/5KJgv+jmZT/gHJr/4l+dv+Jfnb/eGhi/4Bya/+Acmv/iWVN/4llTf+JZU3/iWVN/4llTf+JZU3/jmlN/45pTf+OaU3/jmlN/45pTf+OaU3/iWVN/4llTf+JZU3/iWVN/1Q+MP9UPjD/WUEx/1lBMf9ZQTH/WUEx/1lBMf84KiX/Py8o/0w4Lf9UPjD/TDgt/1lBMf9ZQTH/WUEx/1lBMf+MSDr/jEg6/38/Nf9mMiz/m2pX/5tqV/+balf/m2pX/5NcSf+TXEn/hk49/1EsLP+ZVEb/mVRG/5lURv+ZVEb/XktB/15LQf9vVEb/b1RG/29URv9eS0H/XktB/15LQf9eS0H/ZlBF/2ZQRf9mUEX/ZlBF/15LQf9eS0H/UUI7/3VtYv+Winb/lop2/06BRv+vo4z/ToFG/06BRv9OgUb/lop2/5aKdv+Winb/ToFG/06BRv+EeWr/lop2/06BRv+Fdm//T0ZD/2tbVf94aGL/eGhi/2tbVf94aGL/eGhi/3hoYv9PRkP/eGhi/4V2b/+Fdm//lId//09GQ/+Fdm//zp97/86fe//On3v/3ayA/92sgP/qtoP/6raD/+q2g//qtoP/6raD//nChv/On3v/wZF2/8GRdv/On3v/zp97/1lHPv9ZRz7/TEA3/0xAN/9yVkf/clZH/0xAN/9yVkf/fF1J/1lHPv9mTkT/Zk5E/0xAN/9ZRz7/WUc+/z83MP+Acmv/gHJr/4Bya/94aGL/gHJr/3hoYv+Acmv/gHJr/4Bya/+Jfnb/Wk9M/0pCQP9iVlL/iX52/4l+dv+Acmv/UUNG/0A3OP8tKSv/QDc4/1FDRv9ANzj/LSkr/y0pK/9ANzj/QDc4/y0pK/8tKSv/QDc4/0A3OP9ANzj/JiMl/1TB5f9UweX/VMHl/1es1v9XrNb/VpjE/1aYxP9WmMT/T4Gt/0+Brf9Pga3/T4Gt/0+Brf9Pga3/VpjE/1es1v+tj27/rY9u/62Pbv+tj27/rY9u/62Pbv+gg2j/rY9u/6CDaP+tj27/oINo/6CDaP+gg2j/oINo/62Pbv+tj27/PGYz/zxmM/9Jej3/PGYz/zxmM/9Jej3/SXo9/zxmM/88ZjP/SXo9/0l6Pf88ZjP/PGYz/zxmM/9Jej3/PGYz/4R5av+EeWr/hHlq/3VtYv+Winb/lop2/5aKdv+EeWr/hHlq/6ichv+onIb/hHlq/6ichv+Winb/hHlq/4R5av9mTkH/c1lL/3NZS/9ZRTr/c1lL/3NZS/9mTkH/WUU6/3NZS/9zWUv/WUU6/3NZS/9zWUv/Zk5B/2ZOQf9mTkH/iX52/4l+dv+Acmv/gHJr/5KJgv+Jfnb/eGhi/4l+dv+Jfnb/gHJr/4Bya/+SiYL/komC/3hoYv94aGL/gHJr/5lyUv+FY0z/hWNM/4VjTP+OaU3/jmlN/45pTf+FY0z/eFpI/3haSP94Wkj/eFpI/3haSP94Wkj/eFpI/4VjTP9UPjD/q93u/6vd7v+r3e7/q93u/6vd7v+r3e7/VD4w/0w4Lf+r3e7/q93u/6vd7v+r3e7/q93u/6vd7v9jSDT/fz81/4xIOv9/PzX/ZjIs/5tqV/+balf/hk49/4ZOPf+TXEn/k1xJ/4ZOPf9mMiz/mVRG/38/Nf9/PzX/fz81/3haSP8jHh3/o1o5/4xNMv87Nlv/LihC/yMeHf8jHh3/KVQh/x0/Gv8jHh3/Ix4d/2NdWP9UT0z/Ix4d/15LQf9OgUb/lop2/5aKdv91bWL/r6OM/6+jjP+EeWr/dW1i/5aKdv+Winb/ToFG/06BRv+Winb/lop2/5aKdv9OgUb/T0ZD/3hoYv94aGL/T0ZD/09GQ/9rW1X/eGhi/3hoYv9rW1X/T0ZD/3hoYv+Fdm//hXZv/4V2b/9rW1X/T0ZD/86fe//On3v/3ayA/92sgP/qtoP/+cKG//nChv/qtoP/3ayA/92sgP/On3v/wZF2/8GRdv/On3v/zp97/86fe/9ZRz7/clZH/3JWR/9MQDf/Zk5E/2ZORP9ZRz7/clZH/3JWR/9MQDf/Zk5E/2ZORP9MQDf/TEA3/2ZORP9MQDf/iX52/4l+dv+Acmv/iX52/3hoYv+Acmv/eGhi/4Bya/+Jfnb/eGhi/0pCQP9KQkD/eGhi/3hoYv+Jfnb/iX52/0A3OP8tKSv/UUNG/1FDRv9RQ0b/QDc4/y0pK/8hHyH/UUNG/0A3OP8hHyH/QDc4/2ZTWP9RQ0b/LSkr/yYjJf9Pga3/VMHl/1TB5f9UweX/V6zW/1TB5f9XrNb/VpjE/1aYxP9WmMT/VpjE/1es1v9XrNb/V6zW/1TB5f9HbJH/rY9u/6CDaP+gg2j/oINo/5N5ZP+TeWT/k3lk/6CDaP+gg2j/oINo/6CDaP+TeWT/k3lk/5N5ZP+TeWT/oINo/0l6Pf8wVSb/SXo9/0l6Pf8wVSb/Vo9K/1aPSv88ZjP/SXo9/0l6Pf9Jej3/MFUm/zxmM/9Jej3/SXo9/zBVJv+EeWr/hHlq/5aKdv91bWL/dW1i/6ichv+onIb/hHlq/4R5av+onIb/qJyG/5aKdv+onIb/qJyG/3VtYv91bWL/hWVU/4VlVP9ZRTr/WUU6/2ZOQf9mTkH/WUU6/2ZOQf9zWUv/c1lL/3NZS/9zWUv/c1lL/3NZS/9mTkH/c1lL/4Bya/+Acmv/gHJr/4l+dv+Jfnb/gHJr/3BfWf+SiYL/komC/4Bya/+Acmv/o5mU/5KJgv+Acmv/iX52/4Bya/+ZclL/mXJS/5lyUv+ZclL/mXJS/45pTf+OaU3/jmlN/45pTf+OaU3/jmlN/4VjTP+FY0z/hWNM/4VjTP+FY0z/VD4w/6vd7v+r3e7/q93u/6vd7v+r3e7/q93u/1lBMf9UPjD/q93u/6vd7v+r3e7/q93u/6vd7v+r3e7/a0w2/38/Nf9/PzX/fz81/2YyLP+balf/hk49/4ZOPf+TXEn/hk49/5NcSf+GTj3/ZjIs/38/Nf+MSDr/fz81/38/Nf+FY0z/GRgX/8Z0Pf+jWjn/R0N3/1BOjv8jHh3/GRgX/zlrKP8pVCH/aykk/1khIP9/dWz/Y11Y/xkYF/9mUEX/ToFG/06BRv91bWL/dW1i/5aKdv+Winb/lop2/3VtYv91bWL/ToFG/06BRv91bWL/lop2/5aKdv91bWL/dW1i/2tbVf94aGL/eGhi/4V2b/+Fdm//hXZv/2tbVf9PRkP/a1tV/4V2b/+Fdm//a1tV/2tbVf9rW1X/hXZv/3hoYv/drID/3ayA/+q2g//5wob/+cKG//nChv/5wob/3ayA/92sgP/drID/zp97/86fe//On3v/zp97/86fe//drID/TEA3/3JWR/9mTkT/TEA3/2ZORP9ZRz7/WUc+/3JWR/98XUn/TEA3/2ZORP98XUn/TEA3/2ZORP9mTkT/TEA3/2JWUv9aT0z/YlZS/1pPTP9iVlL/YlZS/2JWUv9iVlL/YlZS/2JWUv9KQkD/SkJA/3hoYv94aGL/YlZS/1pPTP8mIyX/LSkr/0A3OP9RQ0b/QDc4/y0pK/8hHyH/IR8h/y0pK/8hHyH/IR8h/1FDRv9mU1j/LSkr/y0pK/8mIyX/T4Gt/0+Brf+K8fz/ivH8/4rx/P9e1/L/Xtfy/17X8v9e1/L/Xtfy/1TB5f9UweX/V6zW/1TB5f9HbJH/R2yR/15LQf9eS0H/XktB/15LQf9eS0H/ZlBF/2ZQRf9mUEX/ZlBF/15LQf9eS0H/XktB/15LQf9eS0H/XktB/15LQf9Jej3/SXo9/zBVJv9Wj0r/SXo9/zxmM/9Wj0r/SXo9/0l6Pf9Jej3/MFUm/1aPSv9Jej3/SXo9/zBVJv8wVSb/qJyG/4R5av+Winb/lop2/4R5av+EeWr/qJyG/4R5av91bWL/dW1i/5aKdv+Winb/hHlq/3VtYv+onIb/dW1i/3NZS/9zWUv/hWVU/2ZOQf9mTkH/Zk5B/2ZOQf9ZRTr/WUU6/2ZOQf9zWUv/c1lL/3NZS/+FZVT/Zk5B/3NZS/+Jfnb/iX52/4Bya/+Acmv/iX52/4Bya/94aGL/komC/4l+dv94aGL/gHJr/4l+dv+Jfnb/iX52/4l+dv+Acmv/ZlBF/2ZQRf9mUEX/XktB/15LQf9eS0H/XktB/15LQf9eS0H/XktB/2ZQRf9mUEX/ZlBF/2ZQRf9mUEX/ZlBF/0w4Lf+r3e7/q93u/6vd7v+r3e7/q93u/6vd7v9rTDb/VD4w/6vd7v+r3e7/q93u/6vd7v+r3e7/q93u/2tMNv+ZVEb/fz81/4xIOv9RLCz/hk49/5tqV/+balf/m2pX/5tqV/+GTj3/hk49/2YyLP+MSDr/jEg6/5lURv+ZVEb/hWNM/xkYF//GdD3/o1o5/y4oQv9QTo7/LihC/xkYF/85ayj/KVQh/5M0J/9rKST/f3Vs/2NdWP8ZGBf/hWNM/06BRv9OgUb/lop2/5aKdv+EeWr/lop2/5aKdv9gW1P/YFtT/6+jjP+vo4z/r6OM/3VtYv+Winb/lop2/3VtYv94aGL/T0ZD/2tbVf+Fdm//hXZv/4V2b/9PRkP/T0ZD/4V2b/+Fdm//lId//5SHf/9rW1X/hXZv/4V2b/94aGL/6raD/+q2g//5wob/+cKG//nChv/5wob/zp97/8GRdv/BkXb/wZF2/86fe//On3v/zp97/92sgP/drID/3ayA/0xAN/9mTkT/Zk5E/0xAN/9MQDf/WUc+/1lHPv98XUn/fF1J/1lHPv9yVkf/clZH/0xAN/9yVkf/clZH/0xAN/9aT0z/YlZS/1pPTP9iVlL/YlZS/3BfWf9iVlL/YlZS/2JWUv9wX1n/SkJA/1pPTP9wX1n/eGhi/1pPTP9aT0z/IR8h/yEfIf8hHyH/JiMl/yYjJf8hHyH/IR8h/0A3OP9RQ0b/QDc4/y0pK/8tKSv/LSkr/y0pK/9RQ0b/QDc4/0+Brf9Pga3/ivH8/1es1v9XrNb/V6zW/1aYxP9WmMT/VpjE/1es1v9XrNb/VMHl/1TB5f9WmMT/R2yR/0+Brf9vVEb/b1RG/15LQf9vVEb/b1RG/29URv9vVEb/b1RG/29URv9vVEb/b1RG/29URv9vVEb/XktB/29URv9vVEb/SXo9/0l6Pf9Wj0r/MFUm/0l6Pf9Jej3/PGYz/0l6Pf88ZjP/MFUm/zBVJv9Wj0r/SXo9/0l6Pf8lQBf/PGYz/6ichv+onIb/hHlq/5aKdv+EeWr/hHlq/4R5av+Winb/qJyG/3VtYv+EeWr/hHlq/4R5av+onIb/qJyG/4R5av9zWUv/c1lL/3NZS/9zWUv/hWVU/3NZS/9zWUv/WUU6/3NZS/9zWUv/WUU6/3NZS/+FZVT/c1lL/1lFOv9zWUv/iX52/5KJgv+Acmv/o5mU/5KJgv94aGL/eGhi/4Bya/94aGL/eGhi/4Bya/+SiYL/gHJr/5KJgv+Jfnb/gHJr/5lyUv+ZclL/mXJS/5lyUv+OaU3/hWNM/3haSP+FY0z/jmlN/5lyUv+ZclL/mXJS/5lyUv+ZclL/mXJS/5lyUv9MOC3/q93u/6vd7v+r3e7/q93u/6vd7v+r3e7/a0w2/1lBMf+r3e7/q93u/6vd7v+r3e7/q93u/6vd7v9rTDb/ZjIs/2YyLP9RLCz/USws/1EsLP9mMiz/ZjIs/2YyLP9mMiz/ZjIs/2YyLP9mMiz/ZjIs/2YyLP9mMiz/ZjIs/3haSP8ZGBf/tWo7/6NaOf8jHh3/R0N3/0dDd/8jHh3/OWso/ylUIf+CMin/aykk/3JqY/9jXVj/GRgX/45pTf9OgUb/r6OM/5aKdv+Winb/ToFG/4R5av+Winb/YFtT/5aKdv+Winb/r6OM/4R5av9OgUb/lop2/5aKdv+Winb/T0ZD/09GQ/9rW1X/hXZv/3hoYv+Uh3//lId//2tbVf+Fdm//lId//5SHf/+Uh3//T0ZD/4V2b/94aGL/eGhi/+q2g//5wob/+cKG//nChv/qtoP/zp97/8GRdv/BkXb/wZF2/86fe//On3v/3ayA/+q2g//drID/6raD/+q2g/9MQDf/clZH/3JWR/9MQDf/Zk5E/3xdSf9ZRz7/clZH/3JWR/9ZRz7/clZH/3JWR/9MQDf/clZH/3JWR/8/NzD/YlZS/2JWUv9iVlL/YlZS/3BfWf9iVlL/YlZS/2JWUv9wX1n/cF9Z/1pPTP9KQkD/cF9Z/3hoYv9iVlL/Wk9M/yEfIf8tKSv/QDc4/0A3OP8tKSv/LSkr/0A3OP9ANzj/QDc4/1FDRv8hHyH/LSkr/0A3OP9ANzj/UUNG/1FDRv9WmMT/T4Gt/4rx/P9e1/L/V6zW/1es1v9XrNb/VpjE/1aYxP9WmMT/V6zW/1es1v9UweX/VMHl/0+Brf9Pga3/jmlN/45pTf9mUEX/eFpI/4VjTP+FY0z/eFpI/6CDaP+TeWT/eFpI/4VjTP+FY0z/eFpI/2ZQRf+FY0z/jmlN/0l6Pf9Wj0r/Vo9K/yVAF/9Jej3/SXo9/zBVJv9Jej3/SXo9/zxmM/8lQBf/Vo9K/1aPSv8wVSb/PGYz/zBVJv+onIb/qJyG/5aKdv+EeWr/hHlq/4R5av+Winb/qJyG/6ichv+EeWr/hHlq/4R5av+Winb/qJyG/6ichv+EeWr/c1lL/3NZS/9mTkH/hWVU/3NZS/9zWUv/c1lL/2ZOQf9zWUv/c1lL/3NZS/9mTkH/Zk5B/1lFOv9ZRTr/WUU6/6OZlP+SiYL/eGhi/4l+dv+SiYL/eGhi/4Bya/+Jfnb/iX52/4Bya/+Acmv/gHJr/4Bya/+SiYL/komC/3hoYv+FY0z/hWNM/4VjTP+FY0z/hWNM/4VjTP94Wkj/eFpI/45pTf+OaU3/hWNM/3haSP94Wkj/eFpI/4VjTP+FY0z/TDgt/6vd7v+r3e7/q93u/6vd7v+r3e7/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dW1i/6ichv91bWL/hHlq/4R5av+EeWr/hHlq/5aKdv9zWUv/c1lL/2ZOQf9mTkH/c1lL/3NZS/9mTkH/Zk5B/3NZS/9zWUv/WUU6/3NZS/9zWUv/c1lL/3NZS/9mTkH/iX52/5KJgv94aGL/gHJr/4Bya/+Acmv/gHJr/5KJgv+SiYL/gHJr/5KJgv+Jfnb/gHJr/3hoYv9wX1n/eGhi/15LQf9eS0H/XktB/15LQf9RQjv/UUI7/1FCO/9RQjv/UUI7/15LQf9eS0H/UUI7/1FCO/9RQjv/XktB/15LQf84KiX/WUEx/2NINP9jSDT/a0w2/2tMNv9rTDb/a0w2/1Q+MP9jSDT/a0w2/2tMNv9rTDb/Y0g0/1lBMf9EMyr/jEg6/5lURv9/PzX/fz81/38/Nf9/PzX/fz81/4xIOv9RLCz/ZjIs/5tqV/+GTj3/k1xJ/4ZOPf+balf/ZjIs/45pTf+OaU3/mXJS/5lyUv+ZclL/jmlN/45pTf+OaU3/jmlN/5lyUv+ZclL/jmlN/45pTf+OaU3/mXJS/29URv9OgUb/YFtT/2BbU/+Winb/lop2/5aKdv9gW1P/ToFG/06BRv+Winb/lop2/3VtYv+Winb/lop2/06BRv9OgUb/T0ZD/4V2b/+Fdm//T0ZD/3hoYv+Fdm//hXZv/3hoYv9PRkP/eGhi/2tbVf9rW1X/T0ZD/5SHf/+Fdm//hXZv/8GRdv/BkXb/zp97/86fe//On3v/zp97/86fe//qtoP/+cKG//nChv/5wob/6raD/92sgP/drID/3ayA/86fe/9ZRz7/WUc+/0xAN/9MQDf/Zk5E/2ZORP9MQDf/fF1J/3JWR/9ZRz7/TEA3/z83MP8/NzD/WUc+/0xAN/8/NzD/SkJA/0pCQP9KQkD/SkJA/0pCQP9KQkD/PTc2/z03Nv89Nzb/PTc2/z03Nv89Nzb/PTc2/0pCQP9KQkD/SkJA/0A3OP9RQ0b/LSkr/y0pK/8hHyH/IR8h/yYjJf8mIyX/IR8h/yEfIf9mU1j/UUNG/1FDRv9RQ0b/LSkr/yEfIf9WmMT/T4Gt/17X8v9WmMT/V6zW/1es1v9UweX/VMHl/1TB5f9UweX/VMHl/1TB5f9UweX/VMHl/0dskf9WmMT/jmlN/45pTf9mUEX/eFpI/45pTf+OaU3/jmlN/45pTf+FY0z/hWNM/4VjTP+FY0z/eFpI/15LQf+ZclL/mXJS/2ZOQf9ZRTr/Zk5B/1lFOv9mTkH/WUU6/1lFOv9JOjP/SToz/zxmM/9ZRTr/SToz/1lFOv9ZRTr/SToz/1lFOv+EeWr/hHlq/5aKdv+Winb/dW1i/5aKdv+Winb/hHlq/6ichv+onIb/hHlq/4R5av+EeWr/lop2/5aKdv+Winb/c1lL/3NZS/9mTkH/WUU6/2ZOQf9mTkH/Zk5B/4VlVP+FZVT/c1lL/3NZS/9zWUv/c1lL/3NZS/9zWUv/Zk5B/4l+dv+SiYL/iX52/4Bya/+Jfnb/gHJr/4l+dv+SiYL/o5mU/4Bya/+SiYL/komC/4Bya/+Jfnb/eGhi/4Bya/9vVEb/b1RG/29URv9vVEb/b1RG/29URv9vVEb/b1RG/29URv9vVEb/b1RG/29URv9vVEb/b1RG/29URv9vVEb/Py8o/0w4Lf9MOC3/TDgt/1lBMf9ZQTH/WUEx/1lBMf9EMyr/TDgt/0w4Lf9UPjD/WUEx/1lBMf9ZQTH/OCol/4xIOv+ZVEb/fz81/4xIOv9/PzX/jEg6/38/Nf+MSDr/ZjIs/2YyLP+balf/k1xJ/4ZOPf+GTj3/hk49/2YyLP9eS0H/XktB/2ZQRf9mUEX/b1RG/29URv9vVEb/XktB/15LQf9eS0H/ZlBF/2ZQRf9eS0H/XktB/15LQf9RQjv/dW1i/3VtYv+vo4z/lop2/5aKdv9OgUb/dW1i/3VtYv9OgUb/ToFG/3VtYv91bWL/lop2/5aKdv+Winb/ToFG/5SHf/+Uh3//lId//4V2b/9rW1X/a1tV/09GQ/9PRkP/T0ZD/3hoYv94aGL/a1tV/2tbVf94aGL/hXZv/4V2b//BkXb/zp97/86fe//drID/3ayA/92sgP/qtoP/6raD/+q2g//drID/zp97/86fe//On3v/zp97/86fe//BkXb/WUc+/3JWR/9mTkT/TEA3/3JWR/9yVkf/WUc+/3JWR/9yVkf/WUc+/0xAN/9MQDf/Zk5E/3JWR/9yVkf/Pzcw/4Bya/94aGL/eGhi/3hoYv94aGL/YlZS/1pPTP89Nzb/iX52/4Bya/+Acmv/gHJr/4Bya/+Acmv/gHJr/4Bya/8mIyX/JiMl/y0pK/9ANzj/UUNG/0A3OP8mIyX/QDc4/1FDRv8tKSv/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T0ZD/4V2b/+Fdm//T0ZD/+q2g//qtoP/3ayA/92sgP/qtoP/6raD/8GRdv/BkXb/wZF2/86fe//On3v/zp97/86fe//drID/6raD/+q2g/9MQDf/fF1J/3JWR/9MQDf/TEA3/1lHPv9ZRz7/WUc+/2ZORP9mTkT/TEA3/2ZORP9mTkT/Zk5E/2ZORP8/NzD/YlZS/2JWUv9wX1n/cF9Z/3BfWf9aT0z/Wk9M/0pCQP94aGL/iX52/2JWUv9wX1n/YlZS/2JWUv9iVlL/YlZS/y0pK/9RQ0b/UUNG/0A3OP9RQ0b/LSkr/yYjJf8mIyX/LSkr/y0pK/8tKSv/IR8h/yEfIf9ANzj/ZlNY/2ZTWP9WmMT/T4Gt/1es1v9WmMT/VpjE/1es1v9XrNb/V6zW/1aYxP9WmMT/VpjE/1aYxP9WmMT/VMHl/0dskf9Pga3/jmlN/5lyUv9eS0H/ZlBF/2ZQRf9mUEX/ZlBF/2ZQRf9mUEX/ZlBF/2ZQRf9mUEX/ZlBF/15LQf+OaU3/hWNM/4VlVP9zWUv/hWVU/3NZS/9zWUv/hWVU/4VlVP9zWUv/c1lL/3NZS/9zWUv/c1lL/3NZS/9zWUv/c1lL/3NZS/+EeWr/lop2/5aKdv+EeWr/lop2/5aKdv+EeWr/hHlq/4R5av+Winb/hHlq/5aKdv+onIb/hHlq/4R5av+EeWr/c1lL/1lFOv9mTkH/c1lL/4VlVP9zWUv/WUU6/3NZS/9zWUv/c1lL/2ZOQf9zWUv/c1lL/1lFOv9zWUv/c1lL/4Bya/9wX1n/iX52/4l+dv+Acmv/gHJr/5KJgv+Jfnb/gHJr/3hoYv+SiYL/komC/3hoYv+Acmv/iX52/5KJgv9eS0H/XktB/1FCO/9RQjv/UUI7/1FCO/9eS0H/XktB/2ZQRf9mUEX/XktB/15LQf9eS0H/XktB/2ZQRf9mUEX/VD4w/6vd7v+r3e7/q93u/6vd7v+r3e7/q93u/2tMNv9ZQTH/q93u/6vd7v+r3e7/q93u/6vd7v+r3e7/a0w2/5lURv+ZVEb/mVRG/5lURv+MSDr/jEg6/4xIOv9RLCz/mVRG/5lURv+ZVEb/mVRG/38/Nf9RLCz/fz81/5lURv+FY0z/GRgX/5M0J/9rKST/UE6O/zs2W/8ZGBf/N1p6/zFKaP/GdD3/o1o5/xkYF/8pVCH/OWso/ylUIf+FY0z/lop2/5aKdv9OgUb/ToFG/06BRv9gW1P/YFtT/4R5av+vo4z/r6OM/06BRv9OgUb/ToFG/3VtYv+vo4z/dW1i/4V2b/+Fdm//hXZv/09GQ/94aGL/lId//5SHf/+Fdm//hXZv/09GQ/+Uh3//lId//4V2b/9rW1X/a1tV/09GQ//qtoP/6raD/+q2g//qtoP/+cKG/8GRdv/BkXb/wZF2/86fe//On3v/3ayA/+q2g//qtoP/6raD/+q2g//qtoP/TEA3/3JWR/9yVkf/TEA3/2ZORP9ZRz7/clZH/3JWR/9mTkT/Zk5E/3xdSf98XUn/TEA3/2ZORP9mTkT/Pzcw/2JWUv9aT0z/cF9Z/2JWUv9wX1n/Wk9M/1pPTP9KQkD/eGhi/3hoYv9wX1n/YlZS/2JWUv9iVlL/YlZS/1pPTP8tKSv/QDc4/1FDRv9RQ0b/LSkr/y0pK/9ANzj/QDc4/0A3OP8tKSv/IR8h/yEfIf9ANzj/UUNG/1FDRv9ANzj/VpjE/0+Brf9XrNb/V6zW/1es1v9XrNb/V6zW/1es1v9XrNb/V6zW/1aYxP9WmMT/VpjE/1es1v9HbJH/R2yR/5lyUv+OaU3/ZlBF/3haSP+FY0z/hWNM/4VjTP+FY0z/jmlN/45pTf+OaU3/jmlN/3haSP9mUEX/hWNM/45pTf9zWUv/c1lL/3NZS/9zWUv/c1lL/3NZS/9zWUv/c1lL/3NZS/9zWUv/c1lL/3NZS/9zWUv/c1lL/2ZOQf9zWUv/lop2/5aKdv+EeWr/hHlq/4R5av+EeWr/lop2/5aKdv+EeWr/lop2/5aKdv91bWL/qJyG/3VtYv+EeWr/hHlq/3NZS/9mTkH/c1lL/4VlVP9zWUv/c1lL/2ZOQf9mTkH/WUU6/1lFOv9mTkH/c1lL/3NZS/9ZRTr/WUU6/3NZS/+Acmv/eGhi/4l+dv+SiYL/gHJr/4l+dv+Jfnb/gHJr/5KJgv+Jfnb/iX52/4l+dv94aGL/eGhi/4l+dv+Jfnb/hWNM/4VjTP+FY0z/b1RG/4VjTP+OaU3/jmlN/45pTf+OaU3/mXJS/5lyUv+ZclL/mXJS/5lyUv+ZclL/jmlN/1lBMf+r3e7/q93u/6vd7v+r3e7/q93u/6vd7v9rTDb/VD4w/6vd7v+r3e7/q93u/6vd7v+r3e7/q93u/2tMNv9/PzX/fz81/4xIOv9/PzX/fz81/38/Nf9RLCz/USws/5lURv+MSDr/jEg6/38/Nf9/PzX/USws/38/Nf+ZVEb/hWNM/xkYF/+CMin/aykk/1BOjv87Nlv/GRgX/z9+nv83Wnr/tWo7/6NaOf8ZGBf/KVQh/zlrKP8pVCH/hWNM/5aKdv+Winb/lop2/06BRv9OgUb/lop2/5aKdv9OgUb/hHlq/6+jjP9OgUb/lop2/5aKdv91bWL/dW1i/3VtYv9rW1X/a1tV/09GQ/87NDP/T0ZD/4V2b/+Fdm//hXZv/2tbVf+Fdm//oZeP/5SHf/+Uh3//eGhi/09GQ/9PRkP/6raD/+q2g//qtoP/+cKG/86fe//On3v/zp97/86fe//drID/6raD/+q2g//qtoP/6raD//nChv/5wob/+cKG/0xAN/98XUn/Zk5E/0xAN/98XUn/iWVN/2ZORP9yVkf/WUc+/2ZORP+JZU3/fF1J/0xAN/9ZRz7/Pzcw/z83MP9iVlL/YlZS/2JWUv9wX1n/YlZS/1pPTP9iVlL/SkJA/3hoYv94aGL/YlZS/2JWUv9iVlL/YlZS/2JWUv9iVlL/LSkr/y0pK/8hHyH/IR8h/yEfIf9ANzj/UUNG/1FDRv9ANzj/QDc4/yYjJf8mIyX/QDc4/0A3OP9ANzj/QDc4/0+Brf9Pga3/VpjE/1TB5f9XrNb/V6zW/1es1v9XrNb/V6zW/1es1v9XrNb/VpjE/1aYxP9XrNb/R2yR/0dskf+FY0z/mXJS/2ZQRf+FY0z/jmlN/4VjTP94Wkj/oINo/5N5ZP94Wkj/hWNM/45pTf94Wkj/ZlBF/45pTf+FY0z/c1lL/3NZS/9zWUv/Zk5B/1lFOv9mTkH/c1lL/3NZS/9zWUv/Zk5B/1lFOv9ZRTr/Zk5B/1lFOv9mTkH/c1lL/4R5av+EeWr/lop2/5aKdv+EeWr/hHlq/5aKdv+Winb/qJyG/4R5av+Winb/dW1i/3VtYv+Winb/lop2/4R5av9ZRTr/WUU6/3NZS/9zWUv/c1lL/3NZS/9mTkH/c1lL/3NZS/+FZVT/c1lL/2ZOQf9mTkH/c1lL/2ZOQf9mTkH/gHJr/3hoYv+SiYL/komC/3hoYv+SiYL/iX52/4Bya/+SiYL/komC/3hoYv+Jfnb/eGhi/4l+dv+Jfnb/komC/3haSP+FY0z/hWNM/3haSP94Wkj/jmlN/3haSP94Wkj/eFpI/3haSP+FY0z/hWNM/4VjTP94Wkj/eFpI/3haSP9ZQTH/q93u/6vd7v+r3e7/q93u/6vd7v+r3e7/a0w2/1Q+MP+r3e7/q93u/6vd7v+r3e7/q93u/6vd7v9rTDb/fz81/4xIOv+MSDr/fz81/38/Nf+ZVEb/USws/2YyLP+ZVEb/fz81/4xIOv9/PzX/mVRG/2YyLP9/PzX/mVRG/3haSP8ZGBf/gjIp/1khIP9HQ3f/OzZb/xkYF/88bIz/N1p6/7VqO/+jWjn/Ix4d/ylUIf85ayj/HT8a/3haSP+Winb/lop2/5aKdv91bWL/dW1i/5aKdv+Winb/r6OM/06BRv9OgUb/ToFG/5aKdv+Winb/lop2/3VtYv9OgUb/a1tV/2tbVf+Fdm//lId//zs0M/9PRkP/a1tV/09GQ/9PRkP/hXZv/4V2b/+hl4//lId//3hoYv+Fdm//lId//+q2g//drID/zp97/86fe//drID/3ayA/86fe//drID/6raD/+q2g//qtoP/6raD//nChv/5wob/+cKG/+q2g/9MQDf/Zk5E/2ZORP9MQDf/iWVN/3xdSf9MQDf/TEA3/0xAN/9mTkT/clZH/3JWR/9MQDf/TEA3/1lHPv8/NzD/cF9Z/3BfWf9wX1n/cF9Z/3BfWf9aT0z/YlZS/0pCQP9iVlL/eGhi/3BfWf9wX1n/cF9Z/3BfWf9wX1n/cF9Z/y0pK/8tKSv/LSkr/yEfIf9RQ0b/ZlNY/1FDRv9ANzj/UUNG/0A3OP8mIyX/UUNG/1FDRv9ANzj/QDc4/y0pK/9Pga3/T4Gt/1es1v9WmMT/VMHl/1TB5f9UweX/VMHl/1es1v9XrNb/V6zW/1aYxP9WmMT/V6zW/0+Brf9HbJH/jmlN/4VjTP9eS0H/hWNM/45pTf+OaU3/hWNM/4VjTP+FY0z/hWNM/4VjTP+FY0z/eFpI/15LQf+FY0z/hWNM/2ZOQf9mTkH/WUU6/1lFOv9mTkH/Zk5B/2ZOQf9zWUv/hWVU/4VlVP9zWUv/Zk5B/2ZOQf9mTkH/WUU6/1lFOv+EeWr/qJyG/5aKdv+Winb/hHlq/5aKdv+EeWr/qJyG/6ichv+EeWr/lop2/5aKdv+EeWr/lop2/5aKdv+onIb/Zk5B/1lFOv9mTkH/c1lL/3NZS/9ZRTr/WUU6/3NZS/9zWUv/c1lL/4VlVP9zWUv/c1lL/2ZOQf9zWUv/c1lL/4Bya/+Jfnb/iX52/4l+dv94aGL/iX52/5KJgv+Acmv/gHJr/4Bya/+Acmv/iX52/3BfWf+Jfnb/o5mU/5KJgv+FY0z/hWNM/4VjTP94Wkj/hWNM/45pTf+OaU3/mXJS/5lyUv+ZclL/jmlN/4VjTP+FY0z/hWNM/4VjTP+FY0z/WUEx/6vd7v+r3e7/q93u/6vd7v+r3e7/q93u/1lBMf9MOC3/q93u/6vd7v+r3e7/q93u/6vd7v+r3e7/Y0g0/4xIOv9/PzX/jEg6/4xIOv+ZVEb/fz81/2YyLP9mMiz/fz81/38/Nf9/PzX/mVRG/4xIOv9mMiz/fz81/5lURv93W0n/Ix4d/2spJP9ZISD/OzZb/y4oQv8jHh3/N1p6/zFKaP+jWjn/jE0y/yMeHf8dPxr/KVQh/x0/Gv93W0n/ToFG/4R5av+Winb/dW1i/2BbU/+EeWr/r6OM/6+jjP9OgUb/ToFG/5aKdv9OgUb/lop2/5aKdv9OgUb/ToFG/5SHf/9rW1X/lId//4V2b/+Fdm//a1tV/2tbVf9rW1X/T0ZD/4V2b/+Fdm//hXZv/2tbVf9PRkP/lId//5SHf//BkXb/zp97/86fe//On3v/3ayA/92sgP/drID/6raD/+q2g//qtoP/6raD/+q2g//qtoP/6raD/86fe//On3v/TEA3/3JWR/9mTkT/TEA3/2ZORP9mTkT/TEA3/3JWR/9ZRz7/WUc+/3JWR/9yVkf/TEA3/3JWR/9yVkf/Pzcw/1pPTP9aT0z/Wk9M/1pPTP9aT0z/Wk9M/1pPTP89Nzb/Wk9M/1pPTP9aT0z/Wk9M/1pPTP9aT0z/Wk9M/1pPTP8tKSv/QDc4/0A3OP8tKSv/QDc4/2ZTWP9mU1j/UUNG/y0pK/8hHyH/IR8h/0A3OP9RQ0b/QDc4/y0pK/8hHyH/T4Gt/1es1v9Pga3/R2yR/0dskf9HbJH/R2yR/0dskf9HbJH/R2yR/0dskf9HbJH/T4Gt/0+Brf9XrNb/T4Gt/4VjTP+OaU3/XktB/2ZQRf9mUEX/ZlBF/2ZQRf9mUEX/ZlBF/2ZQRf9mUEX/ZlBF/15LQf9eS0H/hWNM/4VjTP9mTkH/c1lL/2ZOQf9zWUv/hWVU/3NZS/9mTkH/c1lL/4VlVP9zWUv/c1lL/3NZS/9zWUv/Zk5B/3NZS/+FZVT/qJyG/6ichv+Winb/hHlq/4R5av+Winb/lop2/4R5av+onIb/hHlq/5aKdv+Winb/hHlq/4R5av+onIb/qJyG/3NZS/9zWUv/c1lL/2ZOQf9zWUv/c1lL/3NZS/9mTkH/c1lL/3NZS/9mTkH/c1lL/3NZS/9zWUv/c1lL/3NZS/+Acmv/komC/5KJgv94aGL/eGhi/4Bya/+Acmv/gHJr/5KJgv+Jfnb/gHJr/4Bya/94aGL/iX52/4l+dv+Acmv/ZlBF/2ZQRf9eS0H/XktB/15LQf9eS0H/XktB/2ZQRf9mUEX/ZlBF/2ZQRf9vVEb/b1RG/29URv9vVEb/ZlBF/1lBMf9ZQTH/a0w2/2tMNv9rTDb/VD4w/1lBMf9EMyr/OCol/1lBMf9rTDb/a0w2/2tMNv9jSDT/WUEx/2NINP9mMiz/ZjIs/2YyLP9mMiz/ZjIs/2YyLP9mMiz/ZjIs/2YyLP9mMiz/USws/1EsLP9mMiz/ZjIs/2YyLP9mMiz/jmlN/45pTf+OaU3/mXJS/5lyUv+ZclL/jmlN/45pTf+OaU3/mXJS/5lyUv+ZclL/jmlN/45pTf+OaU3/b1RG/3VtYv91bWL/dW1i/06BRv9gW1P/dW1i/3VtYv+vo4z/ToFG/5aKdv+Winb/ToFG/06BRv9OgUb/ToFG/06BRv+Fdm//a1tV/3hoYv94aGL/eGhi/2tbVf9rW1X/eGhi/3hoYv9PRkP/T0ZD/4V2b/+Fdm//T0ZD/4V2b/+Fdm//zp97/86fe//On3v/zp97/86fe//qtoP/6raD/+q2g//qtoP/6raD/+q2g//5wob/zp97/86fe//On3v/wZF2/0xAN/9mTkT/Zk5E/0xAN/9mTkT/clZH/0xAN/98XUn/fF1J/1lHPv9yVkf/Zk5E/0xAN/9ZRz7/WUc+/z83MP9KQkD/SkJA/0pCQP9KQkD/SkJA/z03Nv89Nzb/PTc2/z03Nv89Nzb/PTc2/z03Nv89Nzb/SkJA/0pCQP9KQkD/UUNG/1FDRv9ANzj/LSkr/y0pK/8tKSv/LSkr/y0pK/8hHyH/IR8h/yEfIf8tKSv/LSkr/y0pK/8hHyH/IR8h/1aYxP9Pga3/R2yR/0dskf9HbJH/R2yR/0+Brf9Pga3/T4Gt/0+Brf9Pga3/T4Gt/0+Brf9Pga3/T4Gt/1aYxP94Wkj/eFpI/15LQf94Wkj/eFpI/3haSP94Wkj/eFpI/3haSP94Wkj/eFpI/3haSP94Wkj/XktB/3haSP94Wkj/c1lL/3NZS/9zWUv/hWVU/3NZS/9zWUv/c1lL/2ZOQf9zWUv/c1lL/2ZOQf9zWUv/c1lL/3NZS/9zWUv/c1lL/w==");
    const image = Uint8Array.from(bytes, c => c.charCodeAt(0));
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 16, 0, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return image;
  }
  const atlasPixels = makeAtlas();
  const hotbar = document.createElement("canvas");
  hotbar.width = 9 * 52 + 8;
  hotbar.height = 60;
  hotbar.style.cssText = "position:absolute;left:50%;bottom:18px;transform:translateX(-50%);width:min(476px,calc(100vw - 24px));height:auto;image-rendering:pixelated;pointer-events:none";
  root.appendChild(hotbar);
  const hotbarContext = hotbar.getContext("2d");
  const tileCanvas = document.createElement("canvas");
  tileCanvas.width = tileCanvas.height = 16;
  const tileContext = tileCanvas.getContext("2d");
  function drawTile(context, type, x, y, size) {
    const image = tileContext.createImageData(16, 16);
    for (let row = 0; row < 16; row++) for (let col = 0; col < 16; col++) {
      const src = (row * 256 + type * 16 + col) * 4;
      const dst = (row * 16 + col) * 4;
      for (let c = 0; c < 4; c++) image.data[dst + c] = atlasPixels[src + c];
    }
    tileContext.putImageData(image, 0, 0);
    context.imageSmoothingEnabled = false;
    context.drawImage(tileCanvas, x, y, size, size);
  }
  function drawHotbar() {
    hotbarContext.clearRect(0, 0, hotbar.width, hotbar.height);
    for (let slot = 0; slot < 9; slot++) {
      const left = 4 + slot * 52;
      hotbarContext.fillStyle = slot === selectedSlot ? "#f5f3dd" : "#303030";
      hotbarContext.fillRect(left, 4, 50, 50);
      hotbarContext.fillStyle = "#797979";
      hotbarContext.fillRect(left + 3, 7, 44, 44);
      drawTile(hotbarContext, hotbarItems[slot], left + 9, 13, 32);
      hotbarContext.fillStyle = "white";
      hotbarContext.font = "12px monospace";
      hotbarContext.fillText(String(slot + 1), left + 5, 18);
    }
  }
  const selectedName = document.createElement("div");
  selectedName.style.cssText = "position:absolute;left:50%;bottom:85px;transform:translateX(-50%);padding:3px 10px;background:#171717b8;color:white;font:bold 15px monospace;text-transform:capitalize;text-shadow:1px 1px #000;pointer-events:none";
  root.appendChild(selectedName);
  function selectSlot(slot) {
    selectedSlot = (slot + 9) % 9;
    currentType = hotbarItems[selectedSlot];
    selectedName.textContent = names[currentType];
    drawHotbar();
    for (let i = 0; i < inventoryHotbar.children.length; i++) {
      const button = inventoryHotbar.children[i];
      button.style.outline = i === selectedSlot ? "3px solid #f7f2cf" : "none";
      button.style.outlineOffset = "-3px";
      button.setAttribute("aria-pressed", i === selectedSlot ? "true" : "false");
    }
    inventoryTip.textContent = "Slot " + (selectedSlot + 1) + ": " + names[currentType];
  }
  const inventory = document.createElement("div");
  inventory.style.cssText = "display:none;position:absolute;inset:0;align-items:center;justify-content:center;background:#0008";
  const inventoryPanel = document.createElement("div");
  inventoryPanel.style.cssText = "width:min(500px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;box-sizing:border-box;padding:18px;background:#c6c6c6;border:4px solid #222;box-shadow:inset 4px 4px #fff,inset -4px -4px #555,0 12px 35px #0009;color:#333;font:15px monospace";
  inventoryPanel.innerHTML = '<div style="font:bold 19px monospace;margin-bottom:14px;text-shadow:1px 1px #fff">Creative Inventory</div><div style="margin-bottom:5px">Building Blocks</div>';
  const inventoryGrid = document.createElement("div");
  inventoryGrid.style.cssText = "display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:2px";
  const slotStyle = "min-width:0;aspect-ratio:1;padding:0;background:#8b8b8b;border:2px solid #373737;border-radius:0;box-shadow:inset 2px 2px #555,inset -2px -2px #ddd;cursor:pointer";
  for (let type = 0; type < 18; type++) {
    const item = document.createElement("button");
    item.type = "button";
    item.style.cssText = slotStyle;
    if (type >= names.length) { item.disabled = true; inventoryGrid.appendChild(item); continue; }
    item.title = names[type];
    item.setAttribute("aria-label", "Select " + names[type]);
    const icon = document.createElement("canvas");
    icon.width = icon.height = 16;
    icon.style.cssText = "display:block;width:min(34px,80%);height:auto;margin:auto;image-rendering:pixelated";
    drawTile(icon.getContext("2d"), type, 0, 0, 16);
    item.appendChild(icon);
    item.addEventListener("click", () => {
      hotbarItems[selectedSlot] = type;
      const selected = inventoryHotbar.children[selectedSlot];
      drawTile(selected.querySelector("canvas").getContext("2d"), type, 0, 0, 16);
      selected.setAttribute("aria-label", "Hotbar slot " + (selectedSlot + 1) + ": " + names[type]);
      selectSlot(selectedSlot);
    });
    inventoryGrid.appendChild(item);
  }
  inventoryPanel.appendChild(inventoryGrid);
  const hotbarLabel = document.createElement("div");
  hotbarLabel.textContent = "Hotbar · click a slot, then choose a block";
  hotbarLabel.style.cssText = "margin:18px 0 5px;font:13px monospace";
  inventoryPanel.appendChild(hotbarLabel);
  const inventoryHotbar = document.createElement("div");
  inventoryHotbar.style.cssText = inventoryGrid.style.cssText;
  for (let slot = 0; slot < 9; slot++) {
    const button = document.createElement("button");
    button.type = "button";
    button.style.cssText = slotStyle;
    button.setAttribute("aria-label", "Hotbar slot " + (slot + 1) + ": " + names[hotbarItems[slot]]);
    const icon = document.createElement("canvas");
    icon.width = icon.height = 16;
    icon.style.cssText = "display:block;width:min(34px,80%);height:auto;margin:auto;image-rendering:pixelated";
    drawTile(icon.getContext("2d"), hotbarItems[slot], 0, 0, 16);
    button.appendChild(icon);
    button.addEventListener("click", () => selectSlot(slot));
    inventoryHotbar.appendChild(button);
  }
  inventoryPanel.appendChild(inventoryHotbar);
  const inventoryTip = document.createElement("div");
  inventoryTip.style.cssText = "margin-top:12px;font:13px monospace;color:#444";
  inventoryPanel.appendChild(inventoryTip);
  inventory.appendChild(inventoryPanel);
  root.appendChild(inventory);
  function setInventoryOpen(open) {
    inventoryOpen = open;
    inventory.style.display = open ? "flex" : "none";
    hotbar.style.display = open ? "none" : "block";
    selectedName.style.display = open ? "none" : "block";
    crosshair.style.display = open ? "none" : "block";
    if (open) {
      for (const code of Object.keys(held)) held[code] = false;
      jumpQueued = false;
      status.style.display = "none";
      statusUntil = 0;
      if (document.pointerLockElement === canvas && document.exitPointerLock) document.exitPointerLock();
    } else message("Click the world to resume mouse look.");
  }
  selectSlot(selectedSlot);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const stride = 9 * 4;
  gl.enableVertexAttribArray(attrib.pos);
  gl.enableVertexAttribArray(attrib.uv);
  gl.enableVertexAttribArray(attrib.color);
  gl.enableVertexAttribArray(attrib.shade);
  gl.vertexAttribPointer(attrib.pos, 3, gl.FLOAT, false, stride, 0);
  gl.vertexAttribPointer(attrib.uv, 2, gl.FLOAT, false, stride, 12);
  gl.vertexAttribPointer(attrib.color, 3, gl.FLOAT, false, stride, 20);
  gl.vertexAttribPointer(attrib.shade, 1, gl.FLOAT, false, stride, 32);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.clearColor(0.56, 0.79, 1, 1);
  const faces = [
    { d: [0, 1, 0], shade: 1, p: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]] },
    { d: [0,-1, 0], shade: .56, p: [[0,0,1],[0,0,0],[1,0,0],[1,0,1]] },
    { d: [1, 0, 0], shade: .72, p: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },
    { d: [-1,0, 0], shade: .72, p: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]] },
    { d: [0, 0, 1], shade: .84, p: [[1,0,1],[1,1,1],[0,1,1],[0,0,1]] },
    { d: [0, 0,-1], shade: .84, p: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]] }
  ];
  let vertexCount = 0;
  function rebuildMesh() {
    const vertices = [];
    const corners = [[0,0],[0,1],[1,1],[0,0],[1,1],[1,0]];
    const order = [0,1,2,0,2,3];
    for (const [id, block] of blocks) {
      const [x, y, z] = id.split(",").map(Number);
      for (const face of faces) {
        if (get(x + face.d[0], y + face.d[1], z + face.d[2])) continue;
        for (let i = 0; i < 6; i++) {
          const p = face.p[order[i]];
          const uv = corners[i];
          const tile = block.type === 0 ? (face.d[1] === 1 ? 0 : face.d[1] === -1 ? 1 : 15) : block.type;
          const u = (tile * 16 + .5 + uv[0] * 15) / 256;
          // The atlas bytes are top-first, while WebGL addresses their first row at v=0.
          const v = (15.5 - uv[1] * 15) / 16;
          const biome = block.type === 0 && face.d[1] === 1 ? [.55, .88, .48] : block.type === 7 ? [.55, .78, .54] : [1, 1, 1];
          vertices.push(x+p[0], y+p[1], z+p[2], u, v,
            block.color[0] * biome[0], block.color[1] * biome[1], block.color[2] * biome[2], face.shade);
        }
      }
    }
    vertexCount = vertices.length / 9;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    blockCount = blocks.size;
    meshDirty = false;
  }

  function collides(x, y, z) {
    for (let bx = Math.floor(x - .27); bx <= Math.floor(x + .27); bx++)
      for (let by = Math.floor(y + .02); by <= Math.floor(y + 1.68); by++)
        for (let bz = Math.floor(z - .27); bz <= Math.floor(z + .27); bz++)
          if (get(bx, by, bz)) return true;
    return false;
  }
  function moveAxis(axis, amount) {
    if (!amount) return;
    const old = player[axis];
    player[axis] += amount;
    if (collides(player.x, player.y, player.z) ||
      ((held.ShiftLeft || held.ShiftRight) && player.grounded && !collides(player.x, player.y - .08, player.z))) player[axis] = old;
  }
  function update(dt) {
    const forward = (held.KeyW ? 1 : 0) - (held.KeyS ? 1 : 0);
    const sideways = (held.KeyD ? 1 : 0) - (held.KeyA ? 1 : 0);
    const length = Math.hypot(forward, sideways) || 1;
    const speed = held.ShiftLeft || held.ShiftRight ? 2 : held.ControlLeft || held.ControlRight ? 7.5 : 4.5;
    const dx = (Math.sin(player.yaw) * forward + Math.cos(player.yaw) * sideways) / length * speed * dt;
    const dz = (Math.cos(player.yaw) * forward - Math.sin(player.yaw) * sideways) / length * speed * dt;
    moveAxis("x", dx);
    moveAxis("z", dz);
    player.grounded = player.vy <= 0 && collides(player.x, player.y - .03, player.z);
    if (jumpQueued && player.grounded) {
      player.vy = 7.1;
      player.grounded = false;
    }
    jumpQueued = false;
    if (player.grounded) {
      player.y = Math.round(player.y);
      player.vy = 0;
    } else {
      player.vy = Math.max(-18, player.vy - 19 * dt);
      const dy = player.vy * dt;
      const steps = Math.max(1, Math.ceil(Math.abs(dy) / .12));
      for (let i = 0; i < steps; i++) {
        const old = player.y;
        player.y += dy / steps;
        if (collides(player.x, player.y, player.z)) {
          player.y = player.vy < 0 ? Math.ceil(player.y) : old;
          player.vy = 0;
          break;
        }
      }
    }
    if (held.ArrowLeft) player.yaw -= 1.7 * dt;
    if (held.ArrowRight) player.yaw += 1.7 * dt;
    if (held.ArrowUp) player.pitch = clamp(player.pitch + 1.4 * dt, -1.48, 1.48);
    if (held.ArrowDown) player.pitch = clamp(player.pitch - 1.4 * dt, -1.48, 1.48);
    if (player.y < -12) { player.x = 24; player.y = 1; player.z = -11; player.vy = 0; }
    syncChunks();
  }

  function viewDirection() {
    const c = Math.cos(player.pitch);
    return [Math.sin(player.yaw) * c, Math.sin(player.pitch), Math.cos(player.yaw) * c];
  }
  function eyeHeight() { return held.ShiftLeft || held.ShiftRight ? 1.35 : 1.55; }
  function raycast() {
    const dir = viewDirection();
    const eye = [player.x, player.y + eyeHeight(), player.z];
    let previous = null;
    let last = "";
    for (let d = 0; d <= 7; d += .05) {
      const x = Math.floor(eye[0] + dir[0] * d);
      const y = Math.floor(eye[1] + dir[1] * d);
      const z = Math.floor(eye[2] + dir[2] * d);
      const id = key(x, y, z);
      if (id === last) continue;
      last = id;
      if (get(x, y, z)) return { hit: [x, y, z], previous };
      previous = [x, y, z];
    }
    return null;
  }

  function changeBlock(place) {
    const target = raycast();
    if (!target) { message("Aim at a block within 7 blocks."); return; }
    let changed;
    if (place) {
      if (!target.previous) return;
      const [x, y, z] = target.previous;
      if (get(x, y, z)) return;
      const block = { type: currentType, color: [1, 1, 1] };
      put(x, y, z, block);
      if (collides(player.x, player.y, player.z)) { remove(x, y, z); return; }
      changed = { x, y, z, block };
    } else {
      const [x, y, z] = target.hit;
      remove(x, y, z);
      changed = { x, y, z, block: null };
    }
    const { x, y, z, block } = changed;
    const chunk = blockChunkKey(x, z);
    let edits = blockEdits.get(chunk);
    if (!edits) { edits = new Map(); blockEdits.set(chunk, edits); }
    const id = key(x, y, z);
    edits.set(id, block);
    loadedChunks.get(chunk).add(id);
    meshDirty = true;
  }

  function resize() {
    const scale = Math.min(1.5, devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(canvas.clientWidth * scale));
    const h = Math.max(1, Math.floor(canvas.clientHeight * scale));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
  }
  let lastTime = performance.now();
  function draw(now) {
    if (destroyed) return;
    const dt = Math.min(.04, (now - lastTime) / 1000);
    lastTime = now;
    update(dt);
    resize();
    if (meshDirty) rebuildMesh();
    const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
    const sp = Math.sin(player.pitch), cp = Math.cos(player.pitch);
    gl.uniform3f(uniform.eye, player.x, player.y + eyeHeight(), player.z);
    gl.uniform3f(uniform.right, cy, 0, -sy);
    gl.uniform3f(uniform.up, -sy * sp, cp, -cy * sp);
    gl.uniform3f(uniform.forward, sy * cp, sp, cy * cp);
    gl.uniform1f(uniform.aspect, canvas.width / canvas.height);
    gl.uniform1f(uniform.tan, Math.tan(72 * Math.PI / 360));
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    if (statusUntil && now > statusUntil) { status.style.display = "none"; statusUntil = 0; }
    frame = requestAnimationFrame(draw);
  }

  function onKeyDown(e) {
    const code = e.code;
    if (code === "KeyQ") { e.preventDefault(); destroy(); return; }
    if (code === "KeyE") { e.preventDefault(); if (!e.repeat) setInventoryOpen(!inventoryOpen); return; }
    if (code === "Escape" && inventoryOpen) { e.preventDefault(); setInventoryOpen(false); return; }
    if (/^(Key[WASD]|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight|ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Digit[1-9])$/.test(code)) e.preventDefault();
    if (inventoryOpen) return;
    if (code === "Space" && !held.Space) jumpQueued = true;
    const digit = /^Digit([1-9])$/.exec(code);
    if (digit) { selectSlot(Number(digit[1]) - 1); message("Selected " + names[currentType] + " block"); }
    held[code] = true;
  }
  function onKeyUp(e) { held[e.code] = false; }
  function onWheel(e) {
    if (inventoryOpen || !root.contains(e.target) || !e.deltaY) return;
    e.preventDefault();
    selectSlot(selectedSlot + (e.deltaY > 0 ? 1 : -1));
  }
  function onMouseMove(e) {
    if (document.pointerLockElement !== canvas) return;
    player.yaw += e.movementX * .0025;
    player.pitch = clamp(player.pitch - e.movementY * .0025, -1.48, 1.48);
  }
  function onMouseDown(e) {
    if (inventoryOpen || e.target !== canvas) return;
    e.preventDefault();
    if (document.pointerLockElement !== canvas) {
      if (canvas.requestPointerLock) {
        const p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => message("Pointer lock blocked. Use arrow keys to look."));
      } else message("Pointer lock unavailable. Use arrow keys to look.");
      return;
    }
    if (e.button === 0) changeBlock(false);
    if (e.button === 2) changeBlock(true);
  }
  function onContext(e) { if (root.contains(e.target)) e.preventDefault(); }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(frame);
    if (document.pointerLockElement === canvas && document.exitPointerLock) document.exitPointerLock();
    removeEventListener("keydown", onKeyDown, true);
    removeEventListener("keyup", onKeyUp, true);
    removeEventListener("mousemove", onMouseMove, true);
    removeEventListener("mousedown", onMouseDown, true);
    removeEventListener("wheel", onWheel, true);
    removeEventListener("contextmenu", onContext, true);
    quit.removeEventListener("click", destroy);
    root.remove();
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    delete window.__pageCraftVoxel;
  }
  addEventListener("keydown", onKeyDown, true);
  addEventListener("keyup", onKeyUp, true);
  addEventListener("mousemove", onMouseMove, true);
  addEventListener("mousedown", onMouseDown, true);
  addEventListener("wheel", onWheel, { capture: true, passive: false });
  addEventListener("contextmenu", onContext, true);
  quit.addEventListener("click", destroy);
  window.__pageCraftVoxel = { destroy, stats: () => ({ loadedChunks: loadedChunks.size, blockCount, vertexCount, player: { ...player } }) };
  message("Click the world to capture the mouse. Arrow keys also look around.");
  frame = requestAnimationFrame(draw);
})();

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
    const bytes = atob("__ATLAS_RGBA_BASE64__");
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

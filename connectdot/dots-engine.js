(function (global) {
  "use strict";

  const MAX_PROCESS_DIM = 560;

  function extractRgb(imageData) {
    const { data, width, height } = imageData;
    const size = width * height;
    const r = new Float32Array(size);
    const g = new Float32Array(size);
    const b = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const p = i * 4;
      const alpha = data[p + 3] / 255;
      r[i] = data[p] * alpha + 255 * (1 - alpha);
      g[i] = data[p + 1] * alpha + 255 * (1 - alpha);
      b[i] = data[p + 2] * alpha + 255 * (1 - alpha);
    }
    return { r, g, b };
  }

  function bilateralFilter5x5Rgb(src, width, height, sigmaColor) {
    const size = width * height;
    const dstR = new Float32Array(size);
    const dstG = new Float32Array(size);
    const dstB = new Float32Array(size);
    const invTwoSigmaColorSq = 1 / (2 * 3 * sigmaColor * sigmaColor);
    const spatialWeights = [
      0.3679, 0.6065, 0.7788, 0.6065, 0.3679,
      0.6065, 0.8825, 0.9692, 0.8825, 0.6065,
      0.7788, 0.9692, 1.0000, 0.9692, 0.7788,
      0.6065, 0.8825, 0.9692, 0.8825, 0.6065,
      0.3679, 0.6065, 0.7788, 0.6065, 0.3679,
    ];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const centerIdx = y * width + x;
        const cr = src.r[centerIdx];
        const cg = src.g[centerIdx];
        const cb = src.b[centerIdx];
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let wSum = 0;
        let k = 0;

        for (let dy = -2; dy <= 2; dy++) {
          const ny = Math.max(0, Math.min(height - 1, y + dy));
          for (let dx = -2; dx <= 2; dx++) {
            const nx = Math.max(0, Math.min(width - 1, x + dx));
            const nIdx = ny * width + nx;
            const vr = src.r[nIdx];
            const vg = src.g[nIdx];
            const vb = src.b[nIdx];
            const dr = vr - cr;
            const dg = vg - cg;
            const db = vb - cb;
            const w = spatialWeights[k++] * Math.exp(-(dr * dr + dg * dg + db * db) * invTwoSigmaColorSq);
            sumR += vr * w;
            sumG += vg * w;
            sumB += vb * w;
            wSum += w;
          }
        }

        dstR[centerIdx] = sumR / wSum;
        dstG[centerIdx] = sumG / wSum;
        dstB[centerIdx] = sumB / wSum;
      }
    }
    return { r: dstR, g: dstG, b: dstB };
  }

  function posterizeRgb(rgb, levels) {
    const step = 255 / (levels - 1);
    const len = rgb.r.length;
    const r = new Float32Array(len);
    const g = new Float32Array(len);
    const b = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      r[i] = Math.round(rgb.r[i] / step) * step;
      g[i] = Math.round(rgb.g[i] / step) * step;
      b[i] = Math.round(rgb.b[i] / step) * step;
    }
    return { r, g, b };
  }

  function channelSobel(ch, idx, x, y, width) {
    const tl = ch[(y - 1) * width + (x - 1)];
    const tc = ch[(y - 1) * width + x];
    const tr = ch[(y - 1) * width + (x + 1)];
    const ml = ch[y * width + (x - 1)];
    const mr = ch[y * width + (x + 1)];
    const bl = ch[(y + 1) * width + (x - 1)];
    const bc = ch[(y + 1) * width + x];
    const br = ch[(y + 1) * width + (x + 1)];
    const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
    const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
    return { gx, gy, magSq: gx * gx + gy * gy };
  }

  function detectEdges(rgb, width, height, sensitivity) {
    const size = width * height;
    const mag = new Float32Array(size);
    const dir = new Uint8Array(size);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const sr = channelSobel(rgb.r, idx, x, y, width);
        const sg = channelSobel(rgb.g, idx, x, y, width);
        const sb = channelSobel(rgb.b, idx, x, y, width);

        let best = sr;
        if (sg.magSq > best.magSq) best = sg;
        if (sb.magSq > best.magSq) best = sb;

        mag[idx] = Math.sqrt(best.magSq);

        let angle = (Math.atan2(best.gy, best.gx) * 180) / Math.PI;
        if (angle < 0) angle += 180;
        if (angle < 22.5 || angle >= 157.5) dir[idx] = 0;
        else if (angle < 67.5) dir[idx] = 1;
        else if (angle < 112.5) dir[idx] = 2;
        else dir[idx] = 3;
      }
    }

    const suppressed = new Float32Array(size);
    const nonZero = [];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const m = mag[idx];
        if (m === 0) continue;

        let n1 = 0;
        let n2 = 0;
        const d = dir[idx];
        if (d === 0) {
          n1 = mag[idx - 1];
          n2 = mag[idx + 1];
        } else if (d === 1) {
          n1 = mag[(y - 1) * width + (x - 1)];
          n2 = mag[(y + 1) * width + (x + 1)];
        } else if (d === 2) {
          n1 = mag[(y - 1) * width + x];
          n2 = mag[(y + 1) * width + x];
        } else {
          n1 = mag[(y - 1) * width + (x + 1)];
          n2 = mag[(y + 1) * width + (x - 1)];
        }

        if (m >= n1 && m >= n2) {
          suppressed[idx] = m;
          nonZero.push(m);
        }
      }
    }

    if (nonZero.length === 0) {
      return { edges: new Uint8Array(size), strength: suppressed };
    }

    nonZero.sort((a, b) => a - b);
    // Higher sensitivity (0.1..0.9) lowers the percentile threshold to keep finer edges.
    const quantile = Math.min(0.92, Math.max(0.30, 0.88 - sensitivity * 0.58));
    const qIdx = Math.floor(nonZero.length * quantile);
    const globalHigh = Math.max(14, nonZero[qIdx]);

    // Compute per-tile thresholds (8x8 grid) so subtle interior details aren't drowned out by outer silhouettes.
    const grid = 8;
    const tileW = Math.max(1, Math.ceil(width / grid));
    const tileH = Math.max(1, Math.ceil(height / grid));
    const tileBuckets = Array.from({ length: grid * grid }, () => []);

    for (let y = 1; y < height - 1; y++) {
      const ty = Math.min(grid - 1, Math.floor(y / tileH));
      for (let x = 1; x < width - 1; x++) {
        const val = suppressed[y * width + x];
        if (val > 0) {
          const tx = Math.min(grid - 1, Math.floor(x / tileW));
          tileBuckets[ty * grid + tx].push(val);
        }
      }
    }

    const tileHigh = new Float32Array(grid * grid);
    for (let t = 0; t < tileBuckets.length; t++) {
      const bucket = tileBuckets[t];
      if (bucket.length < 8) {
        tileHigh[t] = globalHigh;
      } else {
        bucket.sort((a, b) => a - b);
        const localThresh = bucket[Math.floor(bucket.length * quantile)];
        tileHigh[t] = Math.max(14, localThresh * 0.7 + globalHigh * 0.3);
      }
    }

    const edges = new Uint8Array(size);
    const stack = [];

    for (let y = 1; y < height - 1; y++) {
      const ty = Math.min(grid - 1, Math.floor(y / tileH));
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const val = suppressed[idx];
        if (val === 0) continue;
        const tx = Math.min(grid - 1, Math.floor(x / tileW));
        const highThresh = tileHigh[ty * grid + tx];
        const lowThresh = highThresh * 0.35;
        if (val >= highThresh) {
          edges[idx] = 2;
          stack.push(idx);
        } else if (val >= lowThresh) {
          edges[idx] = 1;
        }
      }
    }

    while (stack.length > 0) {
      const idx = stack.pop();
      const x = idx % width;
      const y = (idx - x) / width;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx <= 0 || nx >= width - 1 || ny <= 0 || ny >= height - 1) continue;
          const nIdx = ny * width + nx;
          if (edges[nIdx] === 1) {
            edges[nIdx] = 2;
            stack.push(nIdx);
          }
        }
      }
    }

    for (let i = 0; i < size; i++) {
      edges[i] = edges[i] === 2 ? 1 : 0;
    }
    return { edges, strength: suppressed };
  }

  function traceContours(edges, width, height) {
    const visited = new Uint8Array(edges.length);
    const chains = [];
    const neighbors = [
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [-1, -1],
      [0, -1],
      [1, -1],
    ];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const startIdx = y * width + x;
        if (!edges[startIdx] || visited[startIdx]) continue;

        const chain = [];
        let cx = x;
        let cy = y;
        let prevDx = 0;
        let prevDy = 0;

        while (true) {
          const cIdx = cy * width + cx;
          visited[cIdx] = 1;
          chain.push({ x: cx, y: cy });

          let bestNx = -1;
          let bestNy = -1;
          let bestScore = -Infinity;

          for (let k = 0; k < neighbors.length; k++) {
            const dx = neighbors[k][0];
            const dy = neighbors[k][1];
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx <= 0 || nx >= width - 1 || ny <= 0 || ny >= height - 1) continue;
            const nIdx = ny * width + nx;
            if (!edges[nIdx] || visited[nIdx]) continue;

            // Prefer continuing straight along the current tangent.
            const align = dx * prevDx + dy * prevDy;
            const diagPenalty = dx !== 0 && dy !== 0 ? -0.1 : 0;
            const score = align + diagPenalty;
            if (score > bestScore) {
              bestScore = score;
              bestNx = nx;
              bestNy = ny;
            }
          }

          if (bestNx === -1) break;
          prevDx = bestNx - cx;
          prevDy = bestNy - cy;
          cx = bestNx;
          cy = bestNy;
        }

        if (chain.length >= 8) {
          chains.push(chain);
        }
      }
    }

    return chains;
  }

  function mergeChains(chains, maxGap) {
    if (chains.length <= 1) return chains;
    const gapSq = maxGap * maxGap;
    const active = chains.map((c) => c.slice());
    let merged = true;

    while (merged) {
      merged = false;
      for (let i = 0; i < active.length; i++) {
        if (!active[i]) continue;
        const a = active[i];
        const aEnd = a[a.length - 1];

        let bestJ = -1;
        let bestDistSq = gapSq;
        let reverseB = false;

        for (let j = 0; j < active.length; j++) {
          if (i === j || !active[j]) continue;
          const b = active[j];
          const bStart = b[0];
          const bEnd = b[b.length - 1];

          const d1 = (aEnd.x - bStart.x) ** 2 + (aEnd.y - bStart.y) ** 2;
          if (d1 <= bestDistSq) {
            bestDistSq = d1;
            bestJ = j;
            reverseB = false;
          }

          const d2 = (aEnd.x - bEnd.x) ** 2 + (aEnd.y - bEnd.y) ** 2;
          if (d2 <= bestDistSq) {
            bestDistSq = d2;
            bestJ = j;
            reverseB = true;
          }
        }

        if (bestJ !== -1) {
          const b = reverseB ? active[bestJ].reverse() : active[bestJ];
          active[i] = a.concat(b);
          active[bestJ] = null;
          merged = true;
        }
      }
    }

    return active.filter(Boolean);
  }

  function orderChains(chains) {
    if (chains.length <= 1) return chains;

    // Start with the longest chain so the main subject outline comes first.
    let startIdx = 0;
    for (let i = 1; i < chains.length; i++) {
      if (chains[i].length > chains[startIdx].length) {
        startIdx = i;
      }
    }

    const used = new Uint8Array(chains.length);
    const ordered = [chains[startIdx]];
    used[startIdx] = 1;

    for (let step = 1; step < chains.length; step++) {
      const prev = ordered[ordered.length - 1];
      const tail = prev[prev.length - 1];

      let bestIdx = -1;
      let bestDist = Infinity;
      let reverse = false;

      for (let i = 0; i < chains.length; i++) {
        if (used[i]) continue;
        const c = chains[i];
        const first = c[0];
        const last = c[c.length - 1];

        const dStart = (first.x - tail.x) ** 2 + (first.y - tail.y) ** 2;
        if (dStart < bestDist) {
          bestDist = dStart;
          bestIdx = i;
          reverse = false;
        }

        const dEnd = (last.x - tail.x) ** 2 + (last.y - tail.y) ** 2;
        if (dEnd < bestDist) {
          bestDist = dEnd;
          bestIdx = i;
          reverse = true;
        }
      }

      if (bestIdx === -1) break;
      used[bestIdx] = 1;
      ordered.push(reverse ? chains[bestIdx].slice().reverse() : chains[bestIdx]);
    }

    return ordered;
  }

  function pointToSegmentDistSq(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return (p.x - a.x) ** 2 + (p.y - a.y) ** 2;
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = a.x + t * dx;
    const projY = a.y + t * dy;
    return (p.x - projX) ** 2 + (p.y - projY) ** 2;
  }

  function rdpSimplify(points, epsilon) {
    if (points.length <= 2) return points.slice();
    const epsSq = epsilon * epsilon;
    let maxDistSq = 0;
    let index = 0;

    const start = points[0];
    const end = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
      const dSq = pointToSegmentDistSq(points[i], start, end);
      if (dSq > maxDistSq) {
        maxDistSq = dSq;
        index = i;
      }
    }

    if (maxDistSq > epsSq) {
      const left = rdpSimplify(points.slice(0, index + 1), epsilon);
      const right = rdpSimplify(points.slice(index), epsilon);
      return left.slice(0, -1).concat(right);
    }

    return [start, end];
  }

  function sampleChains(chains, epsilon, minSpacing, maxSpacing, globalMinDist) {
    const dots = [];
    const minSq = minSpacing * minSpacing;
    const globalSq = (globalMinDist || 0) * (globalMinDist || 0);
    const jumpSq = 16 * 16;

    const isTooCloseGlobally = (x, y) => {
      if (globalSq <= 0) return false;
      for (let i = dots.length - 1; i >= 0; i--) {
        if ((x - dots[i].x) ** 2 + (y - dots[i].y) ** 2 < globalSq) {
          return true;
        }
      }
      return false;
    };

    for (let c = 0; c < chains.length; c++) {
      const simplified = rdpSimplify(chains[c], epsilon);
      const chainDots = [];

      for (let i = 0; i < simplified.length; i++) {
        const pt = simplified[i];
        if (i > 0 && maxSpacing > 0) {
          const prev = simplified[i - 1];
          const dist = Math.hypot(pt.x - prev.x, pt.y - prev.y);
          if (dist > maxSpacing) {
            const steps = Math.floor(dist / maxSpacing);
            for (let s = 1; s <= steps; s++) {
              const t = s / (steps + 1);
              const ix = prev.x + (pt.x - prev.x) * t;
              const iy = prev.y + (pt.y - prev.y) * t;
              const last = chainDots[chainDots.length - 1];
              if ((!last || (ix - last.x) ** 2 + (iy - last.y) ** 2 >= minSq) && !isTooCloseGlobally(ix, iy)) {
                chainDots.push({ x: ix, y: iy, breakBefore: false });
              }
            }
          }
        }

        const isLastPoint = i === simplified.length - 1;
        const last = chainDots[chainDots.length - 1];
        const farFromPrev = !last || (pt.x - last.x) ** 2 + (pt.y - last.y) ** 2 >= minSq;
        if (farFromPrev && !isTooCloseGlobally(pt.x, pt.y)) {
          chainDots.push({ x: pt.x, y: pt.y, breakBefore: false });
        } else if (isLastPoint && chainDots.length === 1 && farFromPrev) {
          chainDots.push({ x: pt.x, y: pt.y, breakBefore: false });
        }
      }

      if (chainDots.length < 2) continue;
      if (dots.length > 0) {
        const prevDot = dots[dots.length - 1];
        const firstDot = chainDots[0];
        if ((firstDot.x - prevDot.x) ** 2 + (firstDot.y - prevDot.y) ** 2 > jumpSq) {
          firstDot.breakBefore = true;
        }
      }

      for (let i = 0; i < chainDots.length; i++) {
        dots.push(chainDots[i]);
      }
    }

    return dots;
  }

  function assignLabelOffsets(dots, width, height) {
    const dirs = [
      [1, -1],
      [1, 1],
      [-1, -1],
      [-1, 1],
      [0, -1.2],
      [1.2, 0],
      [0, 1.2],
      [-1.2, 0],
    ];
    const placedLabels = [];
    const offsetDist = 11;

    return dots.map((dot, index) => {
      let bestDir = dirs[0];
      let bestScore = -Infinity;

      for (let d = 0; d < dirs.length; d++) {
        const lx = dot.x + dirs[d][0] * offsetDist;
        const ly = dot.y + dirs[d][1] * offsetDist;

        if (lx < 10 || lx > width - 10 || ly < 10 || ly > height - 10) {
          continue;
        }

        let minDistSq = Infinity;
        for (let i = Math.max(0, index - 25); i < Math.min(dots.length, index + 25); i++) {
          const distSq = (lx - dots[i].x) ** 2 + (ly - dots[i].y) ** 2;
          if (distSq < minDistSq) minDistSq = distSq;
        }
        for (let i = Math.max(0, placedLabels.length - 25); i < placedLabels.length; i++) {
          const distSq = (lx - placedLabels[i].x) ** 2 + (ly - placedLabels[i].y) ** 2;
          if (distSq < minDistSq) minDistSq = distSq;
        }

        if (minDistSq > bestScore) {
          bestScore = minDistSq;
          bestDir = dirs[d];
        }
      }

      placedLabels.push({
        x: dot.x + bestDir[0] * offsetDist,
        y: dot.y + bestDir[1] * offsetDist,
      });

      return {
        number: index + 1,
        x: dot.x,
        y: dot.y,
        breakBefore: Boolean(dot.breakBefore),
        labelDx: bestDir[0],
        labelDy: bestDir[1],
      };
    });
  }

  function generateDots(image, options) {
    const targetDots = options.targetDots || 220;
    const sensitivity = (options.sensitivity || 50) / 100;
    const smoothing = options.smoothing !== undefined ? options.smoothing : 1;

    const scale = Math.min(1, MAX_PROCESS_DIM / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    const width = Math.max(32, Math.round((image.naturalWidth || image.width) * scale));
    const height = Math.max(32, Math.round((image.naturalHeight || image.height) * scale));

    const offscreen = document.createElement("canvas");
    offscreen.width = width;
    offscreen.height = height;
    const ctx = offscreen.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    let rgb = extractRgb(ctx.getImageData(0, 0, width, height));
    const sigmaColor = 14 + smoothing * 4;
    for (let s = 0; s < smoothing; s++) {
      rgb = bilateralFilter5x5Rgb(rgb, width, height, sigmaColor);
    }
    rgb = posterizeRgb(rgb, 7);

    let { edges, strength } = detectEdges(rgb, width, height, sensitivity);
    let rawChains = mergeChains(traceContours(edges, width, height), 5);
    if (rawChains.length === 0) {
      return { width, height, dots: [] };
    }

    const globalMinDist = Math.max(4.5, Math.min(9.0, Math.sqrt((width * height) / (targetDots * 16))));

    // If the initial edges don't have enough detail for targetDots, lower threshold to reveal finer features.
    if (sampleChains(rawChains, 1.5, 4, 14, globalMinDist).length < targetDots * 0.7 && sensitivity < 0.9) {
      const boosted = detectEdges(rgb, width, height, Math.min(0.95, sensitivity + 0.25));
      const boostedChains = mergeChains(traceContours(boosted.edges, width, height), 5);
      if (boostedChains.length > rawChains.length) {
        edges = boosted.edges;
        strength = boosted.strength;
        rawChains = boostedChains;
      }
    }

    // Rank contours via spatial grid round-robin so every region gets its strongest features first.
    const chainEnergy = (chain) => {
      let sum = 0;
      for (let i = 0; i < chain.length; i++) {
        sum += strength[chain[i].y * width + chain[i].x];
      }
      return sum;
    };
    const grid = 8;
    const buckets = Array.from({ length: grid * grid }, () => []);
    for (let i = 0; i < rawChains.length; i++) {
      const chain = rawChains[i];
      const mid = chain[Math.floor(chain.length / 2)];
      const tx = Math.min(grid - 1, Math.floor((mid.x / width) * grid));
      const ty = Math.min(grid - 1, Math.floor((mid.y / height) * grid));
      buckets[ty * grid + tx].push({ chain, energy: chainEnergy(chain) });
    }
    for (let b = 0; b < buckets.length; b++) {
      buckets[b].sort((a, b2) => b2.energy - a.energy);
    }
    const sortedByEnergy = [];
    let added = true;
    for (let round = 0; added; round++) {
      added = false;
      for (let b = 0; b < buckets.length; b++) {
        if (round < buckets[b].length) {
          sortedByEnergy.push(buckets[b][round].chain);
          added = true;
        }
      }
    }

    const maxEps = 6.0;
    let activeChains = sortedByEnergy;
    // Test with maxSpacing=0 first so straight lines only cost 2 endpoints and key features stay intact.
    let testDots = sampleChains(activeChains, maxEps, 4, 0, globalMinDist);

    if (testDots.length > targetDots && activeChains.length > 1) {
      let lo = 1;
      let hi = activeChains.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        const count = sampleChains(sortedByEnergy.slice(0, mid), maxEps, 4, 0, globalMinDist).length;
        if (count <= targetDots) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }
      activeChains = sortedByEnergy.slice(0, Math.max(1, lo));
    }

    const chains = orderChains(activeChains);
    const useMaxSpacing = sampleChains(chains, 2.5, 3, 28, globalMinDist).length <= targetDots ? 28 : 0;

    // Binary search a bounded RDP epsilon so curves keep classic connect-the-dots spacing.
    let lowEps = 1.2;
    let highEps = maxEps;
    let bestDots = sampleChains(chains, 2.5, 3, useMaxSpacing, globalMinDist);

    for (let iter = 0; iter < 10; iter++) {
      const midEps = (lowEps + highEps) / 2;
      const minSpacing = Math.max(2.5, midEps * 0.9);
      const candidate = sampleChains(chains, midEps, minSpacing, useMaxSpacing, globalMinDist);

      if (Math.abs(candidate.length - targetDots) < Math.abs(bestDots.length - targetDots)) {
        bestDots = candidate;
      }

      if (candidate.length > targetDots) {
        lowEps = midEps;
      } else {
        highEps = midEps;
      }
    }

    // If still short of targetDots, subdivide along the contours without crowding closer than 8px.
    if (bestDots.length < targetDots * 0.9) {
      let lowStep = 8.0;
      let highStep = 60.0;
      for (let iter = 0; iter < 10; iter++) {
        const midStep = (lowStep + highStep) / 2;
        const candidate = sampleChains(chains, 1.2, Math.max(4.0, midStep * 0.6), midStep, globalMinDist);
        if (Math.abs(candidate.length - targetDots) < Math.abs(bestDots.length - targetDots)) {
          bestDots = candidate;
        }
        if (candidate.length > targetDots) {
          lowStep = midStep;
        } else {
          highStep = midStep;
        }
      }
    }

    const dots = assignLabelOffsets(bestDots, width, height);
    return { width, height, dots };
  }

  global.DotsEngine = { generateDots };
})(window);

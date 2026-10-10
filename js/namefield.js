/* Fig. 1: a small MLP learns to draw the name in the <h1>, live, in the visitor's browser.

   (x, y) → 64 Fourier features γ → 48 ReLU → 48 ReLU → 1 sigmoid      (5,521 parameters)

   Training (Adam on a rasterised copy of the name) runs in a Web Worker so the page
   stays smooth. The main thread draws the worker's predictions as a dot matrix,
   runs single forward passes for the probe diagram (Fig. 1b), and reports progress
   to the sidebar. Change the <h1> text and the network learns the new name. */

(() => {
  const fig = document.querySelector('.namefield');
  if (!fig || !window.Worker || !window.Blob || !window.URL) return;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TAU = Math.PI * 2;

  const CFG = { M: 32, H: 48, SIGMA: 6, LR: 4e-3, BATCH: 256, MAX: 2000 };
  const M = CFG.M, H = CFG.H, F = 2 * M;
  const oW1 = 0, ob1 = H * F, oW2 = ob1 + H, ob2 = oW2 + H * H, ow3 = ob2 + H, ob3 = ow3 + H;

  /* ---------------------------------------------------------------- worker
     Self-contained: it's stringified into a Blob, so it can't see this scope. */

  function worker() {
    let M, H, F, SIGMA, LR, BATCH, MAX, oW1, ob1, oW2, ob2, ow3, ob3, N;
    let P, G, Am, Av, B, rand, t = 0;
    let target, TW, TH, ink = [], cols = 0, rows = 0, instant = false;
    let steps = 0, loss = 0, active = 0, lastTick = 0, lastPost = 0;
    let paused = false, done = false, running = false;
    let f, h1, h2, dh1, dh2;

    function setup(cfg) {
      ({ M, H, SIGMA, LR, BATCH, MAX } = cfg);
      F = 2 * M;
      oW1 = 0; ob1 = H * F; oW2 = ob1 + H; ob2 = oW2 + H * H; ow3 = ob2 + H; ob3 = ow3 + H; N = ob3 + 1;
      f = new Float32Array(F);
      h1 = new Float32Array(H); h2 = new Float32Array(H);
      dh1 = new Float32Array(H); dh2 = new Float32Array(H);
    }

    function reset(seed) {
      let s = seed >>> 0 || 1;
      rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
      const randn = () => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * rand()); };

      B = new Float32Array(2 * M).map(() => randn() * SIGMA);
      P = new Float32Array(N); G = new Float32Array(N); Am = new Float32Array(N); Av = new Float32Array(N);
      for (let i = 0; i < H * F; i++) P[oW1 + i] = randn() * Math.sqrt(2 / F);
      for (let i = 0; i < H * H; i++) P[oW2 + i] = randn() * Math.sqrt(2 / H);
      for (let i = 0; i < H; i++) P[ow3 + i] = randn() * Math.sqrt(1 / H);
      P[ob3] = -2;

      t = 0; steps = 0; loss = 0; active = 0; done = false;
      postMessage({ type: 'meta', B: B.slice(), params: N });
    }

    function features(x, y) {
      for (let k = 0; k < M; k++) {
        const a = 6.2831853 * (B[2 * k] * x + B[2 * k + 1] * y);
        f[k] = Math.sin(a);
        f[M + k] = Math.cos(a);
      }
    }

    function forward() {
      for (let j = 0; j < H; j++) {
        let z = P[ob1 + j];
        const r = oW1 + j * F;
        for (let i = 0; i < F; i++) z += P[r + i] * f[i];
        h1[j] = z > 0 ? z : 0;
      }
      for (let j = 0; j < H; j++) {
        let z = P[ob2 + j];
        const r = oW2 + j * H;
        for (let i = 0; i < H; i++) z += P[r + i] * h1[i];
        h2[j] = z > 0 ? z : 0;
      }
      let z = P[ob3];
      for (let j = 0; j < H; j++) z += P[ow3 + j] * h2[j];
      return 1 / (1 + Math.exp(-z));
    }

    function step() {
      G.fill(0);
      let sum = 0;
      for (let n = 0; n < BATCH; n++) {
        // 40% of samples from inked pixels so the strokes get enough signal
        const idx = rand() < 0.4 ? ink[(rand() * ink.length) | 0] : (rand() * target.length) | 0;
        const px = idx % TW, py = (idx / TW) | 0;
        features((px + rand()) / TW * 2 - 1, (py + rand()) / TW * 2 - TH / TW);

        const o = forward();
        const d = o - target[idx];          // dL/dz for sigmoid + cross-entropy
        sum += d * d;

        G[ob3] += d;
        dh1.fill(0);
        for (let j = 0; j < H; j++) {
          G[ow3 + j] += d * h2[j];
          dh2[j] = h2[j] > 0 ? d * P[ow3 + j] : 0;
        }
        for (let j = 0; j < H; j++) {
          const g = dh2[j];
          if (g === 0) continue;
          G[ob2 + j] += g;
          const r = oW2 + j * H;
          for (let i = 0; i < H; i++) { G[r + i] += g * h1[i]; dh1[i] += g * P[r + i]; }
        }
        for (let j = 0; j < H; j++) {
          if (h1[j] <= 0) continue;
          const g = dh1[j];
          G[ob1 + j] += g;
          const r = oW1 + j * F;
          for (let i = 0; i < F; i++) G[r + i] += g * f[i];
        }
      }

      // Adam
      t++;
      const c1 = 1 - Math.pow(0.9, t), c2 = 1 - Math.pow(0.999, t);
      for (let i = 0; i < N; i++) {
        const g = G[i] / BATCH;
        Am[i] = 0.9 * Am[i] + 0.1 * g;
        Av[i] = 0.999 * Av[i] + 0.001 * g * g;
        P[i] -= LR * (Am[i] / c1) / (Math.sqrt(Av[i] / c2) + 1e-8);
      }

      steps++;
      const l = sum / BATCH;
      loss = steps === 1 ? l : loss * 0.9 + l * 0.1;
    }

    function predict() {
      const out = new Float32Array(cols * rows);
      const a = TH / TW;
      for (let r = 0; r < rows; r++) {
        const y = ((r + 0.5) / rows * 2 - 1) * a;
        for (let c = 0; c < cols; c++) {
          features((c + 0.5) / cols * 2 - 1, y);
          out[r * cols + c] = forward();
        }
      }
      return out;
    }

    function post() {
      const grid = predict();
      const weights = P.slice();
      postMessage({ type: 'frame', step: steps, loss, grid, cols, rows, P: weights, done }, [grid.buffer, weights.buffer]);
      lastPost = performance.now();
    }

    // Steps follow a schedule so the name emerges over ~15s instead of instantly:
    // slow at first (static → blurry shapes → letters), then faster to sharpen.
    function tick() {
      if (paused || done) { running = false; return; }
      const now = performance.now();
      active += Math.min(100, now - lastTick);
      lastTick = now;
      const s = active / 1000;
      const goal = instant ? MAX : Math.min(MAX, Math.floor(12 * s + 9 * s * s));
      const until = now + 12;
      while (steps < goal && performance.now() < until) step();
      if (steps >= MAX) done = true;
      if (done || (!instant && now - lastPost > 80)) post();
      if (done) { running = false; return; }
      setTimeout(tick, 0);
    }

    function kick() {
      if (running) return;
      running = true;
      lastTick = performance.now();
      setTimeout(tick, 0);
    }

    onmessage = ({ data: msg }) => {
      switch (msg.type) {
        case 'init':
          setup(msg.cfg);
          ({ target, TW, TH, cols, rows, instant } = msg);
          ink = [];
          for (let i = 0; i < target.length; i++) if (target[i] > 0.5) ink.push(i);
          if (!ink.length) ink = [0];
          reset(msg.seed);
          if (!instant) post();
          kick();
          break;
        case 'resize':
          cols = msg.cols; rows = msg.rows;
          if (done || paused) post();
          break;
        case 'retrain':
          reset(msg.seed);
          paused = false;
          if (!instant) post();
          kick();
          break;
        case 'pause':
          paused = true;
          break;
        case 'resume':
          paused = false;
          kick();
          break;
      }
    };
  }

  /* -------------------------------------------------------------- the data */

  const title = fig.querySelector('h1');
  const stage = fig.querySelector('.namefield__stage');
  const canvas = fig.querySelector('.namefield__canvas');
  const ctx = canvas.getContext('2d');
  const probeCanvas = document.querySelector('.probe__canvas');
  const pctx = probeCanvas && probeCanvas.getContext('2d');
  const spark = document.querySelector('.telemetry__spark');
  const sctx = spark && spark.getContext('2d');

  // Render the name into a small greyscale image: that's the whole training set.
  function rasterize(text) {
    const TW = 256;
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    const font = (px) => `${px}px "Instrument Serif", Georgia, serif`;
    g.font = font(100);

    // long names wrap onto two lines at the word break nearest the middle
    let lines = [text];
    const words = text.split(/\s+/);
    if (words.length > 1 && g.measureText(text).width > 620) {
      let best = 1, bestDiff = Infinity;
      for (let i = 1; i < words.length; i++) {
        const diff = Math.abs(g.measureText(words.slice(0, i).join(' ')).width - g.measureText(words.slice(i).join(' ')).width);
        if (diff < bestDiff) { bestDiff = diff; best = i; }
      }
      lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
    }

    const widest = Math.max(...lines.map((l) => g.measureText(l).width));
    const px = Math.min((100 * TW * 0.9) / widest, TW * 0.4);
    const TH = Math.round(px * (0.18 + lines.length));
    c.width = TW;
    c.height = TH;
    g.font = font(px);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    lines.forEach((l, i) => g.fillText(l, TW / 2, TH / 2 + (i - (lines.length - 1) / 2) * px + px * 0.04));

    const rgba = g.getImageData(0, 0, TW, TH).data;
    const target = new Float32Array(TW * TH);
    for (let i = 0; i < target.length; i++) target[i] = rgba[i * 4 + 3] / 255;
    return { target, TW, TH, px };
  }

  /* ------------------------------------------------------------ dot matrix */

  const LEVELS = 40;
  let data, aspect = 0.3;
  let cols = 0, rows = 0, cell = 6, W = 0, Hpx = 0, dpr = 1;
  let cur = new Float32Array(0), next = new Float32Array(0);
  let sprites, spriteSize = 0;

  const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);

  // pre-render one dot per brightness level: dim slate → signal cyan → near white, with glow
  function buildSprites() {
    spriteSize = Math.ceil(cell * 2.4);
    const s = spriteSize * dpr;
    sprites = document.createElement('canvas');
    sprites.width = s * LEVELS;
    sprites.height = s;
    const g = sprites.getContext('2d');
    for (let k = 0; k < LEVELS; k++) {
      const v = k / (LEVELS - 1);
      const cx = k * s + s / 2, cy = s / 2;
      if (v > 0.5) {
        const glow = g.createRadialGradient(cx, cy, 0, cx, cy, s / 2);
        glow.addColorStop(0, `rgba(110,231,211,${0.3 * (v - 0.5) * 2})`);
        glow.addColorStop(1, 'rgba(110,231,211,0)');
        g.fillStyle = glow;
        g.fillRect(k * s, 0, s, s);
      }
      let rgb, a;
      if (v < 0.5) { rgb = mix([120, 136, 164], [110, 231, 211], v / 0.5); a = 0.2 + 0.55 * (v / 0.5); }
      else { rgb = mix([110, 231, 211], [236, 255, 250], (v - 0.5) / 0.5); a = 0.75 + 0.25 * ((v - 0.5) / 0.5); }
      g.fillStyle = `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${a})`;
      g.beginPath();
      g.arc(cx, cy, Math.max(0.55 * dpr, cell * 0.5 * (0.12 + 0.82 * Math.sqrt(v)) * dpr), 0, TAU);
      g.fill();
    }
  }

  function resample(src, oc, or) {
    const out = new Float32Array(cols * rows);
    if (!oc || !or || src.length !== oc * or) return out;
    for (let r = 0; r < rows; r++) {
      const sr = Math.min(or - 1, Math.floor((r / rows) * or));
      for (let c = 0; c < cols; c++) out[r * cols + c] = src[sr * oc + Math.min(oc - 1, Math.floor((c / cols) * oc))];
    }
    return out;
  }

  function layout() {
    const width = fig.clientWidth;
    const oc = cols, or = rows;
    cell = width < 520 ? 4 : width < 820 ? 5 : 6;
    cols = Math.max(20, Math.floor(width / cell));
    rows = Math.max(6, Math.round(cols * aspect));
    W = cols * cell;
    Hpx = rows * cell;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${Hpx}px`;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(Hpx * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stage.style.width = `${W}px`;
    title.style.fontSize = `${(data.px * W) / data.TW}px`;   // the text overlay matches the raster
    cur = resample(cur, oc, or);
    next = resample(next, oc, or);
    buildSprites();
  }

  function drawField() {
    const k = reduceMotion ? 1 : 0.2;
    for (let i = 0; i < cur.length; i++) cur[i] += (next[i] - cur[i]) * k;

    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, Hpx);
    ctx.globalCompositeOperation = 'lighter';
    const s = spriteSize, sd = s * dpr, off = (cell - s) / 2;
    for (let r = 0, i = 0; r < rows; r++) {
      const y = r * cell + off;
      for (let c = 0; c < cols; c++, i++) {
        const lvl = Math.max(0, Math.min(LEVELS - 1, (cur[i] * (LEVELS - 1) + 0.5) | 0));
        ctx.drawImage(sprites, lvl * sd, 0, sd, sd, c * cell + off, y, s, s);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ------------------------------------------------------------------ probe */

  let P = null, B = null;
  const pf = new Float32Array(F), ph1 = new Float32Array(H), ph2 = new Float32Array(H);
  const probe = { x: 0, y: 0, user: false, out: 0 };
  let sel = null, selAt = 0;

  function probeForward() {
    if (!P || !B) return;
    for (let k = 0; k < M; k++) {
      const a = TAU * (B[2 * k] * probe.x + B[2 * k + 1] * probe.y);
      pf[k] = Math.sin(a);
      pf[M + k] = Math.cos(a);
    }
    for (let j = 0; j < H; j++) {
      let z = P[ob1 + j];
      for (let i = 0; i < F; i++) z += P[oW1 + j * F + i] * pf[i];
      ph1[j] = z > 0 ? z : 0;
    }
    for (let j = 0; j < H; j++) {
      let z = P[ob2 + j];
      for (let i = 0; i < H; i++) z += P[oW2 + j * H + i] * ph1[i];
      ph2[j] = z > 0 ? z : 0;
    }
    let z = P[ob3];
    for (let j = 0; j < H; j++) z += P[ow3 + j] * ph2[j];
    probe.out = 1 / (1 + Math.exp(-z));
  }

  // show the 8 neurons per layer that matter most to the output, by weight
  function pickNeurons(now) {
    if (!P || (sel && now - selAt < 900)) return;
    selAt = now;
    const top = (n, score) => Array.from({ length: n }, (_, i) => i)
      .sort((a, b) => score(b) - score(a)).slice(0, 8).sort((a, b) => a - b);
    const s2 = top(H, (j) => Math.abs(P[ow3 + j]));
    const s1 = top(H, (i) => s2.reduce((s, j) => s + Math.abs(P[oW2 + j * H + i]), 0));
    const s0 = top(F, (k) => s1.reduce((s, i) => s + Math.abs(P[oW1 + i * F + k]), 0));
    sel = { s0, s1, s2 };
  }

  function moveProbe(now) {
    if (probe.user) return;
    const t = reduceMotion ? 2 : now / 1000;
    probe.x = 0.8 * Math.sin(t * 0.29);
    probe.y = aspect * 0.55 * Math.sin(t * 0.47 + 0.9);
  }

  function drawProbeMarker() {
    if (!P) return;
    const x = ((probe.x + 1) / 2) * W, y = ((probe.y / aspect + 1) / 2) * Hpx;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(110,231,211,0.18)';
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(W, Math.round(y) + 0.5);
    ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, Hpx);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(231,184,119,0.95)';
    ctx.beginPath(); ctx.arc(x, y, cell * 1.7, 0, TAU); ctx.stroke();

    const label = `ŷ ${probe.out.toFixed(2)}`;
    ctx.font = '11px "JetBrains Mono", ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(label).width;
    let lx = x + cell * 2.6, ly = y - cell * 2.6;
    if (lx + tw + 10 > W) lx = x - cell * 2.6 - tw - 10;
    if (ly < 10) ly = y + cell * 2.6;
    ctx.fillStyle = 'rgba(6,8,12,0.86)';
    ctx.fillRect(lx - 5, ly - 9, tw + 10, 18);
    ctx.fillStyle = '#e7b877';
    ctx.fillText(label, lx, ly + 0.5);
  }

  /* --------------------------------------------------------- Fig. 1b diagram */

  let pw = 0, ph = 0;

  function fitProbe() {
    if (!probeCanvas) return;
    const r = probeCanvas.getBoundingClientRect();
    const d = Math.min(window.devicePixelRatio || 1, 2);
    pw = r.width; ph = r.height;
    probeCanvas.width = Math.round(pw * d);
    probeCanvas.height = Math.round(ph * d);
    pctx.setTransform(d, 0, 0, d, 0, 0);
  }

  const rgba = (c, a) => `rgba(${c},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  const CYAN = '110,231,211', AMBER = '231,184,119', SLATE = '150,168,196';

  function drawProbe() {
    if (!pctx || !pw || !P || !sel) return;
    pctx.clearRect(0, 0, pw, ph);

    const maxH1 = Math.max(1e-6, ...ph1), maxH2 = Math.max(1e-6, ...ph2);
    const layers = [
      { label: '(x, y)', dim: '2', vals: [probe.x, probe.y] },
      { label: 'γ', dim: `8/${F}`, idx: sel.s0, vals: sel.s0.map((k) => pf[k]) },
      { label: 'h₁', dim: `8/${H}`, idx: sel.s1, vals: sel.s1.map((i) => ph1[i] / maxH1) },
      { label: 'h₂', dim: `8/${H}`, idx: sel.s2, vals: sel.s2.map((j) => ph2[j] / maxH2) },
      { label: 'ŷ', dim: '1', vals: [probe.out] },
    ];
    const xs = [0.15, 0.36, 0.56, 0.76, 0.9].map((f) => f * pw);
    const top = 34, bottom = ph - 30;
    layers.forEach((L, l) => {
      const n = L.vals.length;
      const gap = n > 1 ? Math.min(24, (bottom - top) / (n - 1)) : 0;
      const mid = (top + bottom) / 2;
      L.pos = L.vals.map((_, i) => [xs[l], mid + (i - (n - 1) / 2) * gap]);
    });

    // weight of the edge from node a (layer l) to node b (layer l+1)
    const weight = (l, a, b) => {
      if (l === 0) { const q = layers[1].idx[b] % M; return B[2 * q + a] / 12; }
      if (l === 1) return P[oW1 + layers[2].idx[b] * F + layers[1].idx[a]];
      if (l === 2) return P[oW2 + layers[3].idx[b] * H + layers[2].idx[a]];
      return P[ow3 + layers[3].idx[a]] / 3;
    };

    pctx.lineWidth = 1;
    for (let l = 0; l < layers.length - 1; l++) {
      const A = layers[l], Bn = layers[l + 1];
      let maxW = 1e-6, maxFlow = 1e-6;
      const ws = A.pos.map((_, a) => Bn.pos.map((__, b) => {
        const w = weight(l, a, b);
        maxW = Math.max(maxW, Math.abs(w));
        maxFlow = Math.max(maxFlow, w * Math.abs(A.vals[a]));
        return w;
      }));
      A.pos.forEach(([ax, ay], a) => Bn.pos.forEach(([bx, by], b) => {
        const w = ws[a][b];
        pctx.strokeStyle = rgba(w >= 0 ? SLATE : AMBER, 0.05 + 0.18 * (Math.abs(w) / maxW));
        pctx.beginPath(); pctx.moveTo(ax, ay); pctx.lineTo(bx, by); pctx.stroke();
        const flow = l === 0 ? 0 : (w * Math.abs(A.vals[a])) / maxFlow;
        if (flow > 0.2) {
          pctx.strokeStyle = rgba(CYAN, 0.65 * flow);
          pctx.beginPath(); pctx.moveTo(ax, ay); pctx.lineTo(bx, by); pctx.stroke();
        }
      }));
    }

    pctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
    pctx.textBaseline = 'middle';
    layers.forEach((L, l) => {
      L.pos.forEach(([x, y], i) => {
        const v = L.vals[i];
        const r = l === 4 ? 7 : 4.5;
        let fill;
        if (l === 0) fill = rgba(AMBER, 0.85);
        else if (l === 1) fill = rgba(v >= 0 ? CYAN : AMBER, Math.abs(v));
        else fill = rgba(CYAN, v);
        if (l > 0 && Math.abs(v) > 0.4) {
          pctx.fillStyle = rgba(l === 1 && v < 0 ? AMBER : CYAN, 0.14 * Math.abs(v));
          pctx.beginPath(); pctx.arc(x, y, r + 7 * Math.abs(v), 0, TAU); pctx.fill();
        }
        pctx.fillStyle = '#06080c';
        pctx.beginPath(); pctx.arc(x, y, r, 0, TAU); pctx.fill();
        pctx.strokeStyle = rgba(SLATE, 0.45);
        pctx.stroke();
        pctx.fillStyle = fill;
        pctx.fill();
      });

      pctx.textAlign = 'center';
      pctx.fillStyle = rgba(SLATE, 0.8);
      pctx.fillText(L.label, xs[l], 12);
      pctx.fillStyle = rgba(SLATE, 0.45);
      pctx.fillText(L.dim, xs[l], ph - 10);
    });

    // values next to the input and output
    pctx.textAlign = 'right';
    pctx.fillStyle = rgba(AMBER, 0.9);
    const [[ix, iy0], [, iy1]] = layers[0].pos;
    pctx.fillText(`x ${probe.x.toFixed(2)}`, ix - 12, iy0);
    pctx.fillText(`y ${(-probe.y).toFixed(2)}`, ix - 12, iy1);
    pctx.textAlign = 'left';
    pctx.fillStyle = rgba(CYAN, 0.95);
    const [[ox, oy]] = layers[4].pos;
    pctx.fillText(probe.out.toFixed(2), ox + 13, oy);
  }

  /* ------------------------------------------------------------ telemetry */

  const history = [];
  const setText = (sel, text) => document.querySelectorAll(sel).forEach((el) => { el.textContent = text; });

  function report(step, loss, done) {
    setText('[data-step]', step.toLocaleString('en-US'));
    setText('[data-loss]', step ? loss.toFixed(4) : '–');
    setText('[data-state]', done ? 'converged' : 'training');
    document.documentElement.classList.toggle('field-done', done);
    if (step && (!history.length || step > history[history.length - 1][0])) history.push([step, loss]);
    drawSpark();
  }

  function drawSpark() {
    if (!sctx) return;
    const r = spark.getBoundingClientRect();
    if (!r.width) return;
    const d = Math.min(window.devicePixelRatio || 1, 2);
    if (spark.width !== Math.round(r.width * d)) {
      spark.width = Math.round(r.width * d);
      spark.height = Math.round(r.height * d);
    }
    sctx.setTransform(d, 0, 0, d, 0, 0);
    const w = r.width, h = r.height;
    sctx.clearRect(0, 0, w, h);
    sctx.strokeStyle = 'rgba(150,168,196,0.18)';
    sctx.setLineDash([2, 3]);
    sctx.beginPath(); sctx.moveTo(0, h - 0.5); sctx.lineTo(w, h - 0.5); sctx.stroke();
    sctx.setLineDash([]);
    if (history.length < 2) return;

    // log-scale loss against step
    const logs = history.map(([, l]) => Math.log10(Math.max(l, 1e-5)));
    const lo = Math.min(...logs), hi = Math.max(...logs);
    const X = (s) => (s / CFG.MAX) * (w - 4) + 2;
    const Y = (lg) => 3 + (1 - (lg - lo) / Math.max(1e-6, hi - lo)) * (h - 7);
    sctx.beginPath();
    history.forEach(([s], i) => (i ? sctx.lineTo(X(s), Y(logs[i])) : sctx.moveTo(X(s), Y(logs[i]))));
    sctx.strokeStyle = 'rgba(110,231,211,0.9)';
    sctx.lineWidth = 1.25;
    sctx.stroke();
    const [ls] = history[history.length - 1];
    sctx.lineTo(X(ls), h); sctx.lineTo(X(history[0][0]), h); sctx.closePath();
    const grad = sctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(110,231,211,0.18)');
    grad.addColorStop(1, 'rgba(110,231,211,0)');
    sctx.fillStyle = grad;
    sctx.fill();
    sctx.fillStyle = '#6ee7d3';
    sctx.beginPath(); sctx.arc(X(ls), Y(logs[logs.length - 1]), 2, 0, TAU); sctx.fill();
  }

  /* ------------------------------------------------------------------ loop */

  let live = false, onScreen = true, raf = 0;

  function frame(now) {
    raf = 0;
    moveProbe(now);
    probeForward();
    pickNeurons(now);
    drawField();
    drawProbeMarker();
    drawProbe();
    if (!reduceMotion && onScreen && !document.hidden) raf = requestAnimationFrame(frame);
  }
  const wake = () => { if (live && !raf) raf = requestAnimationFrame(frame); };

  /* ------------------------------------------------------------------ start */

  let w;

  function fallback() {
    fig.classList.remove('has-field', 'is-live');
    document.documentElement.classList.remove('field-live');
    if (raf) cancelAnimationFrame(raf);
  }

  async function start() {
    try {
      await Promise.race([document.fonts.load('100px "Instrument Serif"'), new Promise((r) => setTimeout(r, 3000))]);
    } catch { /* fall through with whatever font is available */ }

    data = rasterize(title.textContent.trim().replace(/\s+/g, ' '));
    aspect = data.TH / data.TW;
    fig.classList.add('has-field');
    layout();
    fitProbe();

    try {
      const src = `(${worker.toString()})()`;
      w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    } catch { fallback(); return; }

    w.onerror = fallback;
    w.onmessage = ({ data: msg }) => {
      if (msg.type === 'meta') {
        B = msg.B;
        sel = null;
        history.length = 0;
        setText('[data-params]', msg.params.toLocaleString('en-US'));
        return;
      }
      if (msg.cols !== cols || msg.rows !== rows) return;   // stale size after a resize
      next = msg.grid;
      P = msg.P;
      if (!live) {
        live = true;
        fig.classList.add('is-live');
        document.documentElement.classList.add('field-live');
        drawSpark();
      }
      report(msg.step, msg.loss, msg.done);
      wake();
    };

    w.postMessage({
      type: 'init', cfg: CFG, target: data.target, TW: data.TW, TH: data.TH,
      cols, rows, seed: (Math.random() * 2 ** 31) | 0, instant: reduceMotion,
    }, [data.target.buffer]);
    // opened in a background tab: hold training so the name emerges when it's seen
    if (document.hidden) w.postMessage({ type: 'pause' });

    // probing: hover with a mouse, drag with a finger
    const aim = (e) => {
      const r = canvas.getBoundingClientRect();
      probe.x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      probe.y = Math.max(-aspect, Math.min(aspect, (((e.clientY - r.top) / r.height) * 2 - 1) * aspect));
      probe.user = true;
      wake();
    };
    canvas.addEventListener('pointermove', aim);
    canvas.addEventListener('pointerdown', aim);
    canvas.addEventListener('pointerleave', () => { probe.user = false; wake(); });

    fig.querySelector('[data-retrain]').addEventListener('click', () => {
      w.postMessage({ type: 'retrain', seed: (Math.random() * 2 ** 31) | 0 });
    });

    document.addEventListener('visibilitychange', () => {
      w.postMessage({ type: document.hidden ? 'pause' : 'resume' });
      wake();
    });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; wake(); }).observe(fig);
    }

    let lastWidth = fig.clientWidth, timer = 0;
    addEventListener('resize', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        fitProbe();
        drawSpark();
        if (fig.clientWidth !== lastWidth) {
          lastWidth = fig.clientWidth;
          layout();
          w.postMessage({ type: 'resize', cols, rows });
        }
        wake();
      }, 150);
    });
  }

  start();
})();

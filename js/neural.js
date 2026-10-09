/* Two canvases:
   - #field      a slow "latent space" of drifting points behind the whole page,
                 linked by proximity, with sparks hopping between them and links
                 reaching out to the cursor.
   - .hero__net  a small feed-forward network that runs a forward pass on a loop:
                 activations travel layer by layer and a softmax picks an output. */

(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SIGNAL = [110, 231, 211];
  const AMBER = [231, 184, 119];
  const SLATE = [150, 168, 196];
  const TAU = Math.PI * 2;

  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

  function fit(canvas, ctx) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: width, h: height };
  }

  /* ------------------------------------------------------------------ field */

  function createField(canvas) {
    const ctx = canvas.getContext('2d');
    const LINK = 132;
    const REACH = 170;
    const pointer = { x: -1e4, y: -1e4 };
    let w = 0, h = 0, pts = [], sparks = [], lastSpark = 0;

    function spawn() {
      const a = Math.random() * TAU;
      const s = 0.04 + Math.random() * 0.12;
      return {
        x: Math.random() * w, y: Math.random() * h,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        r: 0.6 + Math.random() * 1.1, ph: Math.random() * TAU,
      };
    }

    function resize() {
      ({ w, h } = fit(canvas, ctx));
      const target = Math.round(Math.min(120, Math.max(34, (w * h) / 14500)));
      while (pts.length < target) pts.push(spawn());
      pts.length = target;
      for (const p of pts) { p.x = Math.min(p.x, w); p.y = Math.min(p.y, h); }
      sparks = [];
    }

    function draw(t, dt) {
      ctx.clearRect(0, 0, w, h);
      const k = reduceMotion ? 0 : dt / 16.7;

      for (const p of pts) {
        p.x += p.vx * k;
        p.y += p.vy * k;
        if (p.x < -20) p.x = w + 20; else if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20; else if (p.y > h + 20) p.y = -20;
      }

      const close = [];
      ctx.lineWidth = 1;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > LINK * LINK) continue;
          const s = 1 - Math.sqrt(d2) / LINK;
          ctx.strokeStyle = rgba(SLATE, s * 0.12);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          if (s > 0.3) close.push(a, b);
        }
        const d = Math.hypot(a.x - pointer.x, a.y - pointer.y);
        if (d < REACH) {
          ctx.strokeStyle = rgba(SIGNAL, (1 - d / REACH) * 0.32);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(pointer.x, pointer.y); ctx.stroke();
        }
      }

      // a spark is one signal hopping along one link
      if (!reduceMotion && close.length && t - lastSpark > 520) {
        const i = (Math.random() * (close.length / 2)) | 0;
        sparks.push({ a: close[i * 2], b: close[i * 2 + 1], t0: t, dur: 900 + Math.random() * 700 });
        lastSpark = t;
      }
      sparks = sparks.filter((s) => t - s.t0 < s.dur);
      for (const s of sparks) {
        const f = (t - s.t0) / s.dur;
        const e = easeInOut(f);
        const x = s.a.x + (s.b.x - s.a.x) * e;
        const y = s.a.y + (s.b.y - s.a.y) * e;
        const fade = Math.sin(Math.PI * f);
        ctx.strokeStyle = rgba(SIGNAL, 0.22 * fade);
        ctx.beginPath(); ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y); ctx.stroke();
        ctx.fillStyle = rgba(SIGNAL, 0.16 * fade);
        ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill();
        ctx.fillStyle = rgba(SIGNAL, 0.9 * fade);
        ctx.beginPath(); ctx.arc(x, y, 1.5, 0, TAU); ctx.fill();
      }

      for (const p of pts) {
        const tw = 0.5 + 0.5 * Math.sin(t * 0.0011 + p.ph);
        ctx.fillStyle = `rgba(205,214,232,${(0.18 + tw * 0.32).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      }
    }

    function point(x, y) { pointer.x = x; pointer.y = y; }

    resize();
    return { resize, draw, point };
  }

  /* -------------------------------------------------------------- hero net */

  function createNet(canvas) {
    const ctx = canvas.getContext('2d');
    const SIZES = [4, 6, 7, 6, 3];
    const L = SIZES.length;
    const HOP = 640;      // ms for a signal to cross one layer
    const REST = 1600;    // ms of quiet between passes
    const inLabels = ['x₁', 'x₂', 'x₃', 'x₄'];
    const outLabels = (canvas.dataset.outputs || '').split(',').map((s) => s.trim()).filter(Boolean);
    const pointer = { x: -1e4, y: -1e4 };

    // fixed, seeded weights so the drawing is stable between visits
    let seed = 20261009;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const weights = SIZES.slice(0, -1).map((n, l) =>
      Array.from({ length: n }, () => Array.from({ length: SIZES[l + 1] }, () => rand() * 2 - 1)));

    const excite = SIZES.map((n) => new Float32Array(n));
    let w = 0, h = 0, nodes = [], pass = null;

    function layout() {
      ({ w, h } = fit(canvas, ctx));
      const padL = 46;
      const padR = outLabels.length ? 104 : 36;
      const maxN = Math.max(...SIZES);
      const gap = Math.min((h - 64) / (maxN - 1), 60);
      nodes = SIZES.map((n, l) => {
        const x = padL + (w - padL - padR) * (l / (L - 1));
        return Array.from({ length: n }, (_, i) => ({ x, y: h / 2 + (i - (n - 1) / 2) * gap, ph: (l * 7 + i) * 0.9 }));
      });
    }

    function run(t) {
      const acts = [Array.from({ length: SIZES[0] }, () => 0.2 + Math.random() * 0.8)];
      const flow = [];
      let out = [];

      for (let l = 0; l < L - 1; l++) {
        const z = new Array(SIZES[l + 1]).fill(0.1);
        acts[l].forEach((a, i) => weights[l][i].forEach((wt, j) => { z[j] += a * wt; }));
        for (let j = 0; j < z.length; j++) z[j] += (Math.random() - 0.5) * 0.7;

        if (l === L - 2) {                                           // softmax
          const m = Math.max(...z);
          const e = z.map((v) => Math.exp((v - m) * 2.2));
          const sum = e.reduce((s, v) => s + v, 0);
          out = e.map((v) => v / sum);
        } else {                                                     // ReLU
          out = z.map((v) => Math.max(0, v));
          if (Math.max(...out) <= 0) out[(Math.random() * out.length) | 0] = 1;
        }
        const peak = Math.max(...out);
        acts.push(out.map((v) => v / peak));

        // how much signal each edge carries, normalised per layer
        const f = acts[l].map((a, i) => weights[l][i].map((wt, j) => a * Math.max(0, wt) * (0.25 + 0.75 * acts[l + 1][j])));
        const fmax = Math.max(...f.flat(), 1e-6);
        flow.push(f.map((row) => row.map((v) => v / fmax)));
      }

      pass = { t0: t, acts, flow, probs: out, winner: out.indexOf(Math.max(...out)) };
    }

    function draw(t, still = false) {
      if (!still && (!pass || t - pass.t0 > (L - 1) * HOP + HOP + REST)) run(t);
      ctx.clearRect(0, 0, w, h);

      const wave = still ? L : (t - pass.t0) / HOP;   // how many layers the signal has crossed
      const bob = (n) => (still ? 0 : Math.sin(t * 0.0008 + n.ph) * 2.2);

      // base weights: slate for positive, amber for negative
      ctx.lineWidth = 1;
      for (let l = 0; l < L - 1; l++) {
        for (let i = 0; i < SIZES[l]; i++) {
          const a = nodes[l][i], ay = a.y + bob(a);
          for (let j = 0; j < SIZES[l + 1]; j++) {
            const b = nodes[l + 1][j], wt = weights[l][i][j];
            ctx.strokeStyle = rgba(wt > 0 ? SLATE : AMBER, 0.035 + Math.abs(wt) * 0.075);
            ctx.beginPath(); ctx.moveTo(a.x, ay); ctx.lineTo(b.x, b.y + bob(b)); ctx.stroke();
          }
        }
      }

      // signal in flight
      for (let l = 0; l < L - 1; l++) {
        const f = wave - l;
        if (!still && (f < 0 || f > 1.4)) continue;
        const glow = still ? 0.6 : f <= 1 ? 1 : 1 - (f - 1) / 0.4;
        for (let i = 0; i < SIZES[l]; i++) {
          const a = nodes[l][i], ay = a.y + bob(a);
          for (let j = 0; j < SIZES[l + 1]; j++) {
            const c = pass.flow[l][i][j];
            if (c < 0.2) continue;
            const b = nodes[l + 1][j], by = b.y + bob(b);
            ctx.strokeStyle = rgba(SIGNAL, 0.26 * c * glow);
            ctx.beginPath(); ctx.moveTo(a.x, ay); ctx.lineTo(b.x, by); ctx.stroke();
            if (still || f > 1) continue;
            const e = easeInOut(f);
            const x = a.x + (b.x - a.x) * e, y = ay + (by - ay) * e;
            ctx.fillStyle = rgba(SIGNAL, 0.16 * c);
            ctx.beginPath(); ctx.arc(x, y, 5.5, 0, TAU); ctx.fill();
            ctx.fillStyle = rgba(SIGNAL, 0.95 * c);
            ctx.beginPath(); ctx.arc(x, y, 1.7, 0, TAU); ctx.fill();
          }
        }
      }

      // neurons
      for (let l = 0; l < L; l++) {
        for (let i = 0; i < SIZES[l]; i++) {
          const n = nodes[l][i], y = n.y + bob(n);
          let a = 0;
          const since = wave - l;
          if (since >= 0) {
            const rise = Math.min(1, since / 0.12);
            const keep = l === L - 1 ? 0.25 : 0.6;               // the output holds its answer longer
            a = pass.acts[l][i] * rise * (still ? 0.85 : Math.exp(-Math.max(0, since - 0.12) * keep));
          }
          const d = Math.hypot(n.x - pointer.x, y - pointer.y);
          if (d < 70) excite[l][i] = Math.max(excite[l][i], 1 - d / 70);
          excite[l][i] *= 0.95;
          a = Math.max(a, excite[l][i] * 0.9);

          if (a > 0.02) {
            ctx.fillStyle = rgba(SIGNAL, 0.13 * a);
            ctx.beginPath(); ctx.arc(n.x, y, 4 + 11 * a, 0, TAU); ctx.fill();
          }
          ctx.fillStyle = '#06080c';
          ctx.beginPath(); ctx.arc(n.x, y, 3.6, 0, TAU); ctx.fill();
          ctx.strokeStyle = rgba(a > 0.1 ? SIGNAL : [170, 185, 210], 0.35 + 0.5 * a);
          ctx.stroke();
          ctx.fillStyle = rgba(SIGNAL, a);
          ctx.fill();
        }
      }

      // labels
      ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      nodes[0].forEach((n, i) => {
        ctx.fillStyle = rgba(SLATE, 0.55);
        ctx.fillText(inLabels[i] || '', n.x - 14, n.y + bob(n));
      });
      ctx.textAlign = 'left';
      const last = wave - (L - 1);
      nodes[L - 1].forEach((n, i) => {
        if (!outLabels[i]) return;
        const lit = last >= 0;
        const win = lit && i === pass.winner;
        const fade = still ? 1 : Math.exp(-Math.max(0, last) * 0.25);
        const y = n.y + bob(n);
        ctx.fillStyle = win ? rgba(SIGNAL, 0.35 + 0.65 * fade) : rgba(SLATE, 0.5);
        ctx.fillText(outLabels[i], n.x + 16, y);
        if (lit) {
          const pText = pass.probs[i].toFixed(2).replace(/^0/, '');
          ctx.fillStyle = win ? rgba(SIGNAL, 0.8 * fade) : rgba(SLATE, 0.45 * fade);
          ctx.fillText(pText, n.x + 16 + ctx.measureText(outLabels[i]).width + 10, y);
        }
      });
    }

    function point(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      pointer.x = clientX - r.left;
      pointer.y = clientY - r.top;
    }

    layout();
    return { layout, draw, point, prime: () => run(0) };
  }

  /* ------------------------------------------------------------------ loop */

  const fieldCanvas = document.getElementById('field');
  const netCanvas = document.querySelector('.hero__net');
  const field = fieldCanvas ? createField(fieldCanvas) : null;
  const net = netCanvas ? createNet(netCanvas) : null;

  function still() {
    field && field.draw(0, 0);
    if (net) { net.prime(); net.draw(0, true); }
  }

  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      field && field.resize();
      net && net.layout();
      if (reduceMotion) still();
    }, 120);
  });

  if (reduceMotion) {
    still();
    document.fonts && document.fonts.ready.then(still);
    return;
  }

  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    field && field.point(e.clientX, e.clientY);
    net && net.point(e.clientX, e.clientY);
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => {
    field && field.point(-1e4, -1e4);
    net && net.point(-1e4, -1e4);
  });

  // only animate the hero network while it's on screen
  let netOnScreen = true;
  if (net && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { netOnScreen = e.isIntersecting; }).observe(netCanvas);
  }

  let last = performance.now();
  function frame(t) {
    const dt = Math.min(64, t - last);
    last = t;
    field && field.draw(t, dt);
    net && netOnScreen && net.draw(t);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

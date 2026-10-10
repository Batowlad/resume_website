/* The page background: a slow "latent space" of drifting points, linked by proximity,
   with sparks hopping between them and links reaching out to the cursor. */

(() => {
  const canvas = document.getElementById('field');
  if (!canvas) return;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = canvas.getContext('2d');
  const TAU = Math.PI * 2;
  const LINK = 128;
  const REACH = 170;
  const pointer = { x: -1e4, y: -1e4 };
  let w = 0, h = 0, pts = [], sparks = [], lastSpark = 0;

  const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

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
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    w = r.width; h = r.height;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const target = Math.round(Math.min(110, Math.max(30, (w * h) / 16000)));
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
        ctx.strokeStyle = `rgba(150,168,196,${(s * 0.1).toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        if (s > 0.3) close.push(a, b);
      }
      const d = Math.hypot(a.x - pointer.x, a.y - pointer.y);
      if (d < REACH) {
        ctx.strokeStyle = `rgba(110,231,211,${((1 - d / REACH) * 0.3).toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(pointer.x, pointer.y); ctx.stroke();
      }
    }

    // a spark is one signal hopping along one link
    if (!reduceMotion && close.length && t - lastSpark > 600) {
      const i = (Math.random() * (close.length / 2)) | 0;
      sparks.push({ a: close[i * 2], b: close[i * 2 + 1], t0: t, dur: 900 + Math.random() * 700 });
      lastSpark = t;
    }
    sparks = sparks.filter((s) => t - s.t0 < s.dur);
    for (const s of sparks) {
      const f = (t - s.t0) / s.dur;
      const e = ease(f);
      const x = s.a.x + (s.b.x - s.a.x) * e;
      const y = s.a.y + (s.b.y - s.a.y) * e;
      const fade = Math.sin(Math.PI * f);
      ctx.strokeStyle = `rgba(110,231,211,${(0.2 * fade).toFixed(3)})`;
      ctx.beginPath(); ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y); ctx.stroke();
      ctx.fillStyle = `rgba(110,231,211,${(0.15 * fade).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(110,231,211,${(0.9 * fade).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, y, 1.5, 0, TAU); ctx.fill();
    }

    for (const p of pts) {
      const tw = 0.5 + 0.5 * Math.sin(t * 0.0011 + p.ph);
      ctx.fillStyle = `rgba(205,214,232,${(0.16 + tw * 0.3).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    }
  }

  resize();
  let timer = 0;
  addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { resize(); if (reduceMotion) draw(0, 0); }, 120);
  });

  if (reduceMotion) { draw(0, 0); return; }

  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { pointer.x = pointer.y = -1e4; });

  let last = performance.now();
  function frame(t) {
    const dt = Math.min(64, t - last);
    last = t;
    draw(t, dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

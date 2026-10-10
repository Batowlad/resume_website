/* Fig. 2, the tech stack as a 2-D embedding, and the per-project embedding barcodes. */

(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------- Fig. 2 map
     Each <li> has data-x (0–100) and data-y (0–60). JS lays them out, draws
     nearest-neighbour links, and animates them in from a random start the way
     an embedding settles during training. On portrait screens the map is
     transposed so it stays readable. */

  const map = document.querySelector('.embed__map');
  if (map) {
    const NS = 'http://www.w3.org/2000/svg';
    const SPAN_X = 100, SPAN_Y = 60;
    const pts = [...map.querySelectorAll('li')].map((el) => ({
      el, x: Number(el.dataset.x), y: Number(el.dataset.y), c: el.dataset.c,
    }));
    const names = Object.fromEntries((map.dataset.clusters || '').split(',')
      .map((s) => s.split(':').map((t) => t.trim())).filter((p) => p.length === 2));

    for (const p of pts) {
      p.nn = pts.filter((q) => q !== p)
        .map((q) => ({ q, d: Math.hypot(p.x - q.x, p.y - q.y) }))
        .sort((a, b) => a.d - b.d);
    }

    map.classList.add('is-map');
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'embed__links');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    map.prepend(svg);
    const base = document.createElementNS(NS, 'g');
    const hot = document.createElementNS(NS, 'g');
    hot.setAttribute('class', 'is-hot');
    svg.append(base, hot);

    const deco = document.createElement('div');
    deco.className = 'embed__deco';
    deco.setAttribute('aria-hidden', 'true');
    map.prepend(deco);

    let portrait = false;
    // embedding coords → % of the map box
    const at = (x, y) => (portrait ? [(y / SPAN_Y) * 100, x] : [x, (y / SPAN_Y) * 100]);

    const line = (g, a, b, cls) => {
      const [x1, y1] = at(a.x, a.y), [x2, y2] = at(b.x, b.y);
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', x1); l.setAttribute('y1', y1);
      l.setAttribute('x2', x2); l.setAttribute('y2', y2);
      if (cls) l.setAttribute('class', cls);
      g.append(l);
    };

    function render() {
      portrait = map.clientWidth < map.clientHeight;
      map.classList.toggle('is-portrait', portrait);

      const mw = map.clientWidth;
      for (const p of pts) {
        const [left, top] = at(p.x, p.y);
        p.el.style.setProperty('--px', `${left}%`);
        p.el.style.setProperty('--py', `${top}%`);
        // a label that would run off the right edge goes on the left of its dot
        p.el.classList.remove('is-flip');
        if ((left / 100) * mw + p.el.offsetWidth > mw - 6) p.el.classList.add('is-flip');
      }

      // each point links to its two nearest neighbours
      base.replaceChildren();
      const seen = new Set();
      for (const p of pts) {
        for (const { q } of p.nn.slice(0, 2)) {
          const i = pts.indexOf(p), j = pts.indexOf(q);
          const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          line(base, p, q);
        }
      }

      // a soft glow and a label for each cluster
      deco.replaceChildren();
      const groups = {};
      for (const p of pts) (groups[p.c] = groups[p.c] || []).push(p);
      for (const [c, members] of Object.entries(groups)) {
        if (!names[c]) continue;
        const cx = members.reduce((s, p) => s + p.x, 0) / members.length;
        const cy = members.reduce((s, p) => s + p.y, 0) / members.length;
        const rx = Math.max(...members.map((p) => Math.abs(p.x - cx))) + 9;
        const ry = Math.max(...members.map((p) => Math.abs(p.y - cy))) + 7;
        const [l, t] = at(cx, cy);
        const [w, h] = portrait ? [(2 * ry / SPAN_Y) * 100, 2 * rx] : [2 * rx, (2 * ry / SPAN_Y) * 100];

        const blob = document.createElement('span');
        blob.className = 'embed__blob';
        blob.style.cssText = `left:${l}%;top:${t}%;width:${w}%;height:${h}%`;
        // label sits just above the cluster's top-most member, on screen
        const spots = members.map((p) => at(p.x, p.y));
        const ll = spots.reduce((s, [x]) => s + x, 0) / spots.length;
        const lt = Math.min(...spots.map(([, y]) => y)) - (portrait ? 4.5 : 8);
        const label = document.createElement('span');
        label.className = 'embed__cluster';
        label.textContent = names[c];
        label.style.cssText = `left:${Math.max(9, Math.min(91, ll))}%;top:${Math.max(3, lt)}%`;
        deco.append(blob, label);
      }
    }

    // hover / focus: light up the 4 nearest neighbours with a similarity score
    const sims = [];
    function focus(p) {
      hot.replaceChildren();
      sims.splice(0).forEach((s) => s.remove());
      map.classList.toggle('has-focus', !!p);
      pts.forEach((q) => q.el.classList.remove('is-focus', 'is-near'));
      if (!p) return;
      p.el.classList.add('is-focus');
      for (const { q, d } of p.nn.slice(0, 4)) {
        q.el.classList.add('is-near');
        line(hot, p, q);
        const [x1, y1] = at(p.x, p.y), [x2, y2] = at(q.x, q.y);
        const s = document.createElement('span');
        s.className = 'embed__sim';
        s.textContent = Math.exp(-d / 30).toFixed(2);
        // past the midpoint, so it clears the focused point's own label
        s.style.cssText = `left:${x1 + (x2 - x1) * 0.64}%;top:${y1 + (y2 - y1) * 0.64}%`;
        map.append(s);
        sims.push(s);
      }
    }

    for (const p of pts) {
      p.el.addEventListener('pointerenter', () => focus(p));
      p.el.addEventListener('focus', () => focus(p));
      p.el.addEventListener('click', () => focus(p));
    }
    map.addEventListener('pointerleave', () => { if (!map.contains(document.activeElement)) focus(null); });
    map.addEventListener('focusout', (e) => { if (!map.contains(e.relatedTarget)) focus(null); });

    render();

    // start collapsed near the centre with a little noise, then "train" into place
    if (!reduceMotion && 'IntersectionObserver' in window) {
      map.classList.add('is-init');
      for (const p of pts) {
        p.el.style.setProperty('--sx', `${50 + (Math.random() - 0.5) * 16}%`);
        p.el.style.setProperty('--sy', `${50 + (Math.random() - 0.5) * 16}%`);
        p.el.style.setProperty('--delay', `${Math.round(Math.random() * 350)}ms`);
      }
      const io = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        requestAnimationFrame(() => {
          map.classList.remove('is-init');
          setTimeout(() => map.classList.add('is-settled'), 1500);
        });
      }, { threshold: 0.35 });
      io.observe(map);
    } else {
      map.classList.add('is-settled');
    }

    let timer = 0;
    addEventListener('resize', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { focus(null); render(); }, 150);
    });
  }

  /* ------------------------------------------------- project barcodes
     A 24-d feature-hashed bag of the project's name and tags: projects that
     share tools share bright cells. */

  const D = 24;
  const fnv = (s) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  };

  document.querySelectorAll('[data-emb]').forEach((el) => {
    const card = el.closest('article');
    if (!card) return;
    const tags = [...card.querySelectorAll('.tags li')].map((li) => li.textContent.toLowerCase());
    const name = card.querySelector('h3').textContent.toLowerCase();
    const tokens = [...tags, ...name.split(/\s+/)];

    const v = new Float32Array(D);
    for (const tok of tokens) {
      for (const salt of ['a', 'b']) {
        const h = fnv(salt + tok);
        v[h % D] += h & 0x10000 ? 1 : -1;
      }
      // character trigrams give near-duplicate tags similar codes
      for (let i = 0; i + 3 <= tok.length; i++) {
        const h = fnv(tok.slice(i, i + 3));
        v[h % D] += (h & 0x10000 ? 1 : -1) * 0.25;
      }
    }
    const max = Math.max(1e-6, ...v.map(Math.abs));
    el.replaceChildren(...Array.from(v, (x, i) => {
      const s = document.createElement('i');
      const a = Math.abs(x) / max;
      s.style.setProperty('--a', a.toFixed(2));
      s.style.setProperty('--i', i);
      if (x < 0) s.className = 'neg';
      return s;
    }));
  });
})();

/* Terminal typing for headings and large text.

   Every [data-type] element types itself out the first time it scrolls into view,
   with a block cursor and the last few characters still "decoding" through random
   glyphs. data-type is the average ms per character; data-type-delay waits before
   starting.

   The untyped remainder stays in the DOM, just transparent, so nothing reflows while
   it types and screen readers always get the full text. Inline markup (<em> etc.)
   is kept. */

(() => {
  const els = [...document.querySelectorAll('[data-type]')];
  if (!els.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // only glyphs VT323 draws at the same width, so decoding never shifts the line
  const GLYPHS = '01<>/\\|[]{}#$%&*+=?@ABCDEFGHJKLMNPRSTUVXYZ';
  const DECODING = 3;
  const glyph = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

  let liveCursor = null;   // only the most recently finished line keeps a blinking cursor

  function prepare(el) {
    const nodes = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) nodes.push(walker.currentNode);

    const parts = [];
    nodes.forEach((node, i) => {
      // collapse source indentation the way the browser renders it, so typing doesn't stall on it
      let text = node.nodeValue.replace(/\s+/g, ' ');
      if (i === 0) text = text.trimStart();
      if (i === nodes.length - 1) text = text.trimEnd();
      if (!text) { node.remove(); return; }
      const typed = document.createElement('span');
      const rest = document.createElement('span');
      typed.className = 'tw-typed';
      rest.className = 'tw-rest';
      rest.textContent = text;
      node.replaceWith(typed, rest);
      parts.push({ text, typed, rest });
    });

    const cursor = document.createElement('span');
    cursor.className = 'tw-cursor';
    cursor.setAttribute('aria-hidden', 'true');

    // a human-ish rhythm: jittered keystrokes, a beat after punctuation
    const chars = parts.map((p) => p.text).join('');
    const ms = Number(el.dataset.type) || 34;
    const times = [];
    let at = 0;
    for (let i = 0; i < chars.length; i++) {
      at += ms * (0.55 + Math.random() * 0.9);
      if (/[.,:;!?]/.test(chars[i - 1] || '')) at += ms * 5;
      times.push(at);
    }

    el.classList.add('tw');
    return { el, parts, cursor, times, total: chars.length };
  }

  function render(t, n) {
    let offset = 0, cursorPlaced = false;
    for (const p of t.parts) {
      const k = Math.max(0, Math.min(p.text.length, n - offset));
      let shown = '';
      for (let j = 0; j < k; j++) {
        const ch = p.text[j];
        shown += offset + j >= n - DECODING && n < t.total && ch !== ' ' ? glyph() : ch;
      }
      p.typed.textContent = shown;
      p.rest.textContent = p.text.slice(k);
      if (!cursorPlaced && k < p.text.length) { p.typed.after(t.cursor); cursorPlaced = true; }
      offset += p.text.length;
    }
    if (!cursorPlaced && t.parts.length) t.parts[t.parts.length - 1].typed.after(t.cursor);
  }

  function finish(t, keepCursor) {
    render(t, t.total);
    t.el.classList.remove('is-typing');
    t.el.classList.add('is-typed');
    if (!keepCursor) { t.cursor.remove(); return; }
    if (liveCursor && liveCursor !== t.cursor) liveCursor.remove();
    liveCursor = t.cursor;
  }

  function type(t) {
    if (liveCursor) liveCursor.remove();
    t.el.classList.add('is-typing');
    return new Promise((resolve) => {
      const start = performance.now();
      let n = 0;
      const frame = (now) => {
        const elapsed = now - start;
        while (n < t.total && t.times[n] <= elapsed) n++;
        if (n < t.total) { render(t, n); requestAnimationFrame(frame); return; }
        finish(t, true);
        resolve();
      };
      requestAnimationFrame(frame);
    });
  }

  const lines = new Map(els.map((el) => [el, prepare(el)]));
  lines.forEach((t) => { render(t, 0); t.cursor.remove(); });   // no cursor until it starts typing

  if (!('IntersectionObserver' in window)) { lines.forEach((t) => finish(t, false)); return; }

  // Lines type one at a time, in the order they came into view, like a terminal.
  // A line that has scrolled away by the time its turn comes is filled in instantly,
  // so jumping down the page never leaves a backlog.
  const visible = new Set();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let queue = Promise.resolve();

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const t = lines.get(e.target);
      if (!e.isIntersecting) { visible.delete(e.target); continue; }
      visible.add(e.target);
      if (t.queued) continue;
      t.queued = true;
      queue = queue.then(async () => {
        if (!visible.has(t.el)) { finish(t, false); return; }
        await wait(Number(t.el.dataset.typeDelay || 120));
        await type(t);
      });
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.5 });
  els.forEach((el) => io.observe(el));
})();

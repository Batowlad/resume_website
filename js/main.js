(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Reveal sections as they scroll in */
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-visible');
        io.unobserve(e.target);
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('is-visible'));
  }

  /* Scroll spy: light the nav neuron for the current section, and run the
     signal down the axon to it */
  const links = [...document.querySelectorAll('.layers a')];
  const sections = links.map((a) => document.querySelector(a.hash));
  const signal = document.querySelector('.layers__signal');
  const row = document.querySelector('.layers ol');
  let current = -1;

  function setActive(i) {
    if (i === current) return;
    current = i;
    links.forEach((a, k) => {
      a.classList.toggle('is-active', k === i);
      a.classList.toggle('is-past', k < i);
      if (k === i) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    });
    signal.style.height = `${links[i].offsetTop - links[0].offsetTop}px`;

    // on narrow screens the nav is a scrolling row: keep the active item in view
    if (row.scrollWidth > row.clientWidth) {
      row.scrollTo({ left: links[i].offsetLeft - 20, behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }

  function spy() {
    const line = innerHeight * 0.4;
    let i = 0;
    sections.forEach((s, k) => { if (s.getBoundingClientRect().top <= line) i = k; });
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) i = sections.length - 1;
    setActive(i);
  }

  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { spy(); ticking = false; });
  }, { passive: true });
  addEventListener('resize', () => { current = -1; spy(); });
  spy();

  /* Count up the hero numbers */
  document.querySelectorAll('[data-count]').forEach((el) => {
    const end = Number(el.dataset.count);
    if (reduceMotion || !end) return;
    const start = performance.now() + 500;
    const dur = 1400;
    el.textContent = '0';
    const tick = (now) => {
      const k = Math.min(1, Math.max(0, (now - start) / dur));
      el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3))) + (el.dataset.suffix || '');
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  /* Copy email */
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    const label = btn.textContent;
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        btn.textContent = 'Copied';
      } catch {
        btn.textContent = 'Select & copy';
      }
      setTimeout(() => { btn.textContent = label; }, 1600);
    });
  });

  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
})();

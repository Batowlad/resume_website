/* ═══════════════════════════════════════════════════════
   THE GATHERING — seat interactions & chapter overlay
   ═══════════════════════════════════════════════════════ */

(() => {
  const overlay = document.getElementById("overlay");
  const scroller = overlay.querySelector(".overlay-scroll");
  const closeBtn = overlay.querySelector(".overlay-close");
  const returnBtn = overlay.querySelector(".return-link");
  const hint = document.getElementById("hint");
  const seats = Array.from(document.querySelectorAll(".seat[data-chapter]"));
  const chapters = Array.from(overlay.querySelectorAll(".chapter"));

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let openSeat = null; // the seat that opened the current chapter (focus restore)
  let closing = false;

  function chapterOf(id) {
    return chapters.find((c) => c.dataset.chapter === id) || null;
  }

  /* ── Open a chapter, bursting out from (x, y) in viewport px ── */
  function openChapter(id, x, y, focusOrigin) {
    const chapter = chapterOf(id);
    if (!chapter || closing) return;

    chapters.forEach((c) => (c.hidden = c !== chapter));

    overlay.style.setProperty("--bx", `${x}px`);
    overlay.style.setProperty("--by", `${y}px`);

    const title = chapter.querySelector(".chapter-title");
    overlay.setAttribute("aria-label", focusOrigin?.getAttribute("aria-label") || title.textContent);

    overlay.hidden = false;
    // force reflow so the clip-path transition runs from 0
    void overlay.offsetWidth;
    overlay.classList.add("is-open");

    scroller.scrollTop = 0;
    openSeat = focusOrigin || null;
    FogEngine.pause();

    history.replaceState(null, "", `#${id}`);
    hint?.classList.add("is-dismissed");

    // move focus once the burst has mostly bloomed
    setTimeout(() => title?.focus({ preventScroll: true }), reduceMotion.matches ? 50 : 380);
  }

  function closeChapter() {
    if (overlay.hidden || closing) return;
    closing = true;
    overlay.classList.add("is-closing");
    overlay.classList.remove("is-open");

    const finish = () => {
      overlay.classList.remove("is-closing");
      overlay.hidden = true;
      closing = false;
      FogEngine.resume();
      history.replaceState(null, "", window.location.pathname + window.location.search);
      openSeat?.focus({ preventScroll: true });
      openSeat = null;
    };

    if (reduceMotion.matches) {
      setTimeout(finish, 180);
    } else {
      let done = false;
      overlay.addEventListener("transitionend", () => { if (!done) { done = true; finish(); } }, { once: true });
      setTimeout(() => { if (!done) { done = true; finish(); } }, 450); // safety net
    }
  }

  /* ── Wire the seats ── */
  seats.forEach((seat) => {
    seat.addEventListener("click", () => {
      const star = seat.querySelector(".star .core");
      const rect = (star || seat).getBoundingClientRect();
      openChapter(
        seat.dataset.chapter,
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
        seat
      );
    });
  });

  closeBtn.addEventListener("click", closeChapter);
  returnBtn.addEventListener("click", closeChapter);

  /* ── Keyboard: Esc closes, Tab stays inside the overlay ── */
  document.addEventListener("keydown", (e) => {
    if (overlay.hidden) return;

    if (e.key === "Escape") {
      e.preventDefault();
      closeChapter();
      return;
    }

    if (e.key === "Tab") {
      const focusables = Array.from(
        overlay.querySelectorAll('button, a[href], [tabindex="-1"].chapter-title')
      ).filter((el) => el.offsetParent !== null || el === closeBtn);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  /* ── Deep links: #projects opens The Magician's chapter, etc. ── */
  function openFromHash() {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const seat = seats.find((s) => s.dataset.chapter === id);
    if (!seat) return;
    const star = seat.querySelector(".star .core");
    const rect = (star || seat).getBoundingClientRect();
    openChapter(id, rect.left + rect.width / 2, rect.top + rect.height / 2, seat);
  }

  window.addEventListener("hashchange", () => {
    if (overlay.hidden) openFromHash();
  });

  openFromHash();
})();

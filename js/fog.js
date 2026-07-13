/* ═══════════════════════════════════════════════════════
   CLOUD ENGINE — the rolling sea of gray fog
   Two canvas layers of billowing clouds, shaded by their
   distance from the radiant light at the head of the table:
   pale where the light touches them, dark slate at the edges.
   ═══════════════════════════════════════════════════════ */

const FogEngine = (() => {
  const DPR_CAP = 1.5;

  // cloud tones sampled from the reference: lit / mid / shadow
  const TONES = {
    lit:  { rgb: "212, 216, 224", core: 0.26 },
    mid:  { rgb: "134, 143, 162", core: 0.28 },
    dark: { rgb: "58, 66, 86",    core: 0.3  },
  };

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /** Pre-render an irregular soft cloud puff in the given tone. */
  function makePuff(size, tone) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    const lobes = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < lobes; i++) {
      const cx = size / 2 + (Math.random() - 0.5) * size * 0.34;
      const cy = size / 2 + (Math.random() - 0.5) * size * 0.24;
      const r = size * (0.2 + Math.random() * 0.2);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(${tone.rgb}, ${tone.core})`);
      g.addColorStop(0.65, `rgba(${tone.rgb}, ${tone.core * 0.38})`);
      g.addColorStop(1, `rgba(${tone.rgb}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
    return c;
  }

  class Layer {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {object} opts  density (particles per Mpx), scale range,
     *                       speed (px/s), alpha range, bias (0..1 pull
     *                       toward the bottom), edgeBias (0..1 chance
     *                       of spawning in the side cloud banks)
     */
    constructor(canvas, opts) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.opts = opts;
      this.puffs = {
        lit:  Array.from({ length: 3 }, () => makePuff(256, TONES.lit)),
        mid:  Array.from({ length: 3 }, () => makePuff(256, TONES.mid)),
        dark: Array.from({ length: 3 }, () => makePuff(256, TONES.dark)),
      };
      this.particles = [];
      this.resize();
    }

    resize() {
      if (!this.canvas.clientWidth || !this.canvas.clientHeight) return;
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      this.w = this.canvas.clientWidth;
      this.h = this.canvas.clientHeight;
      // shrink puffs on small viewports so clouds don't white-out the scene
      this.sizeFactor = Math.min(Math.max(Math.min(this.w, this.h) / 900, 0.42), 1);
      this.alphaFactor = this.w < 720 ? 0.75 : 1;
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.populate();
    }

    populate() {
      const count = Math.round(
        Math.min(Math.max((this.w * this.h) / 1e6, 0.35), 2.2) * this.opts.density
      );
      this.particles = Array.from({ length: count }, () => this.spawn(true));
    }

    /** Pick a cloud tone from the puff's closeness to the central light. */
    toneFor(x, size) {
      const cx = x + size / 2;
      const closeness = 1 - Math.min(1, Math.abs(cx - this.w / 2) / (this.w / 2));
      const r = Math.random();
      if (closeness > 0.62) return r < 0.72 ? "lit" : "mid";
      if (closeness > 0.3)  return r < 0.68 ? "mid" : (r < 0.86 ? "lit" : "dark");
      return r < 0.66 ? "dark" : "mid";
    }

    spawn(anywhere) {
      const o = this.opts;
      const scale = o.scaleMin + Math.random() * (o.scaleMax - o.scaleMin);
      const size = 256 * scale * this.sizeFactor;
      const dir = Math.random() < 0.5 ? -1 : 1;

      let x;
      if (anywhere) {
        // pile the clouds into banks at the sides, keep the center airier
        if (Math.random() < o.edgeBias) {
          const band = this.w * 0.3;
          x = Math.random() < 0.5
            ? Math.random() * band - size / 2
            : this.w - band + Math.random() * band - size / 2;
        } else {
          x = Math.random() * this.w - size / 2;
        }
      } else {
        x = dir > 0 ? -size : this.w + size;
      }

      // bias spawn toward the lower half — the cloud sea swallows the table
      const yr = Math.pow(Math.random(), 1 - o.bias * 0.6);
      return {
        puff: null, // resolved from tone below
        tone: this.toneFor(x, size),
        x,
        y: this.h * (0.14 + yr * 0.86) - size / 2,
        scale,
        vx: dir * (o.speedMin + Math.random() * (o.speedMax - o.speedMin)),
        sway: 8 + Math.random() * 18,
        swayFreq: 0.05 + Math.random() * 0.1,
        alpha: o.alphaMin + Math.random() * (o.alphaMax - o.alphaMin),
        alphaFreq: 0.08 + Math.random() * 0.14,
        phase: Math.random() * Math.PI * 2,
        variant: (Math.random() * 3) | 0,
      };
    }

    step(dt, t) {
      const { ctx } = this;
      ctx.clearRect(0, 0, this.w, this.h);
      const margin = 320;
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        p.x += p.vx * dt;
        const s = 256 * p.scale * this.sizeFactor;
        if (p.x < -s - margin || p.x > this.w + margin) {
          this.particles[i] = this.spawn(false);
          continue;
        }
        const y = p.y + Math.sin(t * p.swayFreq + p.phase) * p.sway;
        const a = p.alpha * this.alphaFactor * (0.82 + 0.18 * Math.sin(t * p.alphaFreq + p.phase * 1.7));
        ctx.globalAlpha = a;
        ctx.drawImage(this.puffs[p.tone][p.variant], p.x, y, s, s);
      }
      ctx.globalAlpha = 1;
    }
  }

  let layers = [];
  let rafId = null;
  let last = null;
  let paused = false;

  function frame(now) {
    rafId = null;
    if (paused) return;
    if (last == null) last = now;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const t = now / 1000;
    for (const l of layers) l.step(dt, t);
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (rafId == null && !paused) {
      last = null;
      rafId = requestAnimationFrame(frame);
    }
  }

  function drawStaticFrame() {
    for (const l of layers) l.step(0, 8.4);
  }

  return {
    init() {
      const back = document.getElementById("fog-back");
      const front = document.getElementById("fog-front");
      if (!back || !front) return;

      // when the WebGL cloud shader owns the back canvas, this engine
      // only supplies the thin drifting veils in front of the figures
      const shaderClouds = typeof CloudEngine !== "undefined" && CloudEngine.active;

      layers = [];
      if (!shaderClouds) {
        layers.push(new Layer(back, {
          density: 122,
          scaleMin: 1.6, scaleMax: 4.4,
          speedMin: 3, speedMax: 9,
          alphaMin: 0.75, alphaMax: 1,
          bias: 1,
          edgeBias: 0.56,
        }));
      }
      layers.push(new Layer(front, {
        density: 22,
        scaleMin: 2.4, scaleMax: 5.4,
        speedMin: 7, speedMax: 16,
        alphaMin: 0.26, alphaMax: 0.48,
        bias: 0.62,
        edgeBias: 0.62,
      }));

      // repaint immediately — resizing a canvas wipes it, and the rAF
      // loop may be throttled or paused (hidden tab, reduced motion)
      window.addEventListener("resize", () => this.renderOnce());

      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.pause();
        else this.resume();
      });

      // paint one frame immediately so the scene never starts bare
      // (also covers environments where rAF is throttled or the tab starts hidden)
      drawStaticFrame();
      if (!reduceMotion.matches) start();

      reduceMotion.addEventListener?.("change", (e) => {
        if (e.matches) { this.pause(); drawStaticFrame(); }
        else { this.resume(); }
      });
    },

    /** Draw a single frame regardless of pause state (debug / static veil). */
    renderOnce() {
      for (const l of layers) {
        if (l.w !== l.canvas.clientWidth || l.h !== l.canvas.clientHeight) l.resize();
      }
      drawStaticFrame();
    },

    pause() {
      paused = true;
      if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
    },

    resume() {
      if (reduceMotion.matches || document.hidden) return;
      paused = false;
      start();
    },
  };
})();

FogEngine.init();

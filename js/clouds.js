/* ═══════════════════════════════════════════════════════
   CLOUD SHADER — the sea of gray fog, painted by the GPU
   Domain-warped fractal noise, shaded by the radiant light
   at the head of the table: bright crowns, slate bellies.
   Claims the #fog-back canvas for WebGL; if WebGL is not
   available, fog.js falls back to the 2D puff engine.
   ═══════════════════════════════════════════════════════ */

const CloudEngine = (() => {
  const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

  const FRAG = `
precision highp float;
uniform vec2  u_res;
uniform float u_time;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = rot * p;
    a *= 0.5;
  }
  return v;
}

/* domain-warped cloud density */
float cloudVal(vec2 p, float t, float warp) {
  vec2 q = vec2(fbm(p + t * 0.10), fbm(p + vec2(5.2, 1.3) - t * 0.06));
  vec2 r = vec2(fbm(p + warp * q + vec2(1.7, 9.2) + t * 0.15),
                fbm(p + warp * q + vec2(8.3, 2.8) - t * 0.12));
  return fbm(p + warp * r);
}

void main() {
  vec2 st = gl_FragCoord.xy / u_res;          /* 0..1, y up */
  float aspect = u_res.x / u_res.y;
  vec2 uv = vec2(st.x * aspect, st.y);

  vec2 haloPos = vec2(0.5 * aspect, 0.80);    /* the radiant light */
  float dLight = distance(uv, haloPos);
  float lum = 1.0 - smoothstep(0.0, 1.05, dLight);

  /* where the clouds live: piled at the sides and below,
     parting around the lit centre column */
  float dx = abs(st.x - 0.5) * 2.0;
  float sideMask   = smoothstep(0.04, 0.72, dx);
  float bottomMask = smoothstep(0.8, 0.08, st.y);
  float topFade    = smoothstep(1.02, 0.72, st.y);
  float mask = clamp(sideMask * 1.0 + bottomMask * 1.1, 0.0, 1.0) * topFade;
  mask = max(mask, 0.10 * topFade);           /* faint wisps everywhere */

  vec3 col = vec3(0.0);
  float acc = 0.0;

  /* ── far bank: big slow formations ── */
  {
    float t = u_time * 0.014;
    vec2 p = uv * 2.1 + vec2(u_time * 0.006, 0.0);
    float c = cloudVal(p, t, 1.9);
    float cUp = cloudVal(p + normalize(haloPos - uv + vec2(1e-4)) * 0.14, t, 1.9);
    float shade = clamp((cUp - c) * 3.2, -1.0, 1.0);

    float dens = smoothstep(0.42, 0.62, c * (0.6 + 0.7 * mask));
    vec3 deep = vec3(0.115, 0.130, 0.180);
    vec3 mid  = vec3(0.365, 0.400, 0.490);
    vec3 lit  = vec3(0.840, 0.850, 0.880);
    vec3 warm = vec3(0.945, 0.915, 0.845);

    vec3 c3 = mix(deep, mid, smoothstep(0.15, 0.62, c));
    c3 = mix(c3, lit, min(1.0, clamp(shade, 0.0, 1.0) * dens * 1.25));
    c3 = mix(c3, warm, lum * dens * 0.45);
    c3 *= 1.0 - 0.42 * clamp(-shade, 0.0, 1.0);
    float rim = smoothstep(0.0, 0.12, dens) * (1.0 - smoothstep(0.12, 0.4, dens));
    c3 *= 1.0 - 0.22 * rim;

    float a = dens * 0.96;
    col = c3 * a;
    acc = a;
  }

  /* ── near bank: smaller, faster, hugging the bottom & edges ── */
  {
    float t = u_time * 0.028;
    vec2 p = uv * 3.9 + vec2(u_time * 0.016, -0.05);
    float c = cloudVal(p, t, 1.6);
    float cUp = cloudVal(p + normalize(haloPos - uv + vec2(1e-4)) * 0.10, t, 1.6);
    float shade = clamp((cUp - c) * 3.0, -1.0, 1.0);

    float nearMask = clamp(sideMask * 0.75 + smoothstep(0.55, 0.02, st.y) * 1.25, 0.0, 1.0);
    float dens = smoothstep(0.5, 0.68, c * (0.46 + 0.72 * nearMask));

    vec3 deep = vec3(0.150, 0.168, 0.225);
    vec3 mid  = vec3(0.470, 0.505, 0.590);
    vec3 lit  = vec3(0.890, 0.900, 0.920);

    vec3 c3 = mix(deep, mid, smoothstep(0.2, 0.65, c));
    c3 = mix(c3, lit, min(1.0, clamp(shade, 0.0, 1.0) * dens * 1.2));
    c3 = mix(c3, vec3(0.93, 0.905, 0.85), lum * dens * 0.3);
    c3 *= 1.0 - 0.38 * clamp(-shade, 0.0, 1.0);
    float rim = smoothstep(0.0, 0.1, dens) * (1.0 - smoothstep(0.1, 0.35, dens));
    c3 *= 1.0 - 0.2 * rim;

    float a = dens * 0.9;
    col = col * (1.0 - a) + c3 * a;   /* near over far */
    acc = acc * (1.0 - a) + a;
  }

  gl_FragColor = vec4(col, acc);
}
`;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let gl = null;
  let canvas = null;
  let uTime = null;
  let uRes = null;
  let rafId = null;
  let paused = false;
  let t0 = null;

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error("cloud shader:", gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  }

  /** Match the buffer to the element's layout size. False while size is 0. */
  function syncSize() {
    if (!canvas.clientWidth || !canvas.clientHeight) return false;
    // render soft & cheap: sub-native resolution, CSS upscales
    const scale = Math.min(window.devicePixelRatio || 1, 1.25) * 0.8;
    const w = Math.round(canvas.clientWidth * scale);
    const h = Math.round(canvas.clientHeight * scale);
    if (Math.abs(w - canvas.width) > 2 || Math.abs(h - canvas.height) > 2) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    return true;
  }

  function draw(timeSec) {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uTime, timeSec);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function frame(now) {
    rafId = null;
    if (paused) return;
    if (t0 == null) t0 = now;
    draw((now - t0) / 1000 + 40); // start mid-flow, not at noise origin
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (rafId == null && !paused) rafId = requestAnimationFrame(frame);
  }

  return {
    active: false,

    init() {
      canvas = document.getElementById("fog-back");
      if (!canvas) return;
      try {
        gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false });
      } catch { gl = null; }
      if (!gl) return; // fog.js will take the canvas with its 2D engine

      const vs = compile(gl.VERTEX_SHADER, VERT);
      const fs = compile(gl.FRAGMENT_SHADER, FRAG);
      if (!vs || !fs) return;
      const prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error("cloud link:", gl.getProgramInfoLog(prog));
        return;
      }
      gl.useProgram(prog);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "a_pos");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      uTime = gl.getUniformLocation(prog, "u_time");
      uRes = gl.getUniformLocation(prog, "u_res");

      this.active = true;

      // repaint immediately on resize — a debounce here races screenshot
      // tools and window restores, leaving a blank or stretched frame
      window.addEventListener("resize", () => this.renderOnce());

      // the tab may start with zero layout size (background restore);
      // poll until it has real dimensions, then paint
      if (!syncSize()) {
        const retry = setInterval(() => {
          if (syncSize()) { clearInterval(retry); this.renderOnce(); }
        }, 250);
      }

      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.pause();
        else this.resume();
      });

      // one immediate frame so the sky is never empty
      this.renderOnce();
      if (!reduceMotion.matches) start();

      reduceMotion.addEventListener?.("change", (e) => {
        if (e.matches) { this.pause(); this.renderOnce(); }
        else { this.resume(); }
      });
    },

    /** Draw a single frame regardless of pause state. */
    renderOnce() {
      if (gl && syncSize()) draw(47.3);
    },

    pause() {
      paused = true;
      if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
    },

    resume() {
      if (!gl || reduceMotion.matches || document.hidden) return;
      paused = false;
      t0 = null;
      start();
    },
  };
})();

CloudEngine.init();

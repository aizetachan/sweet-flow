// Abstract, blurred "liquid" background: a WebGL fragment shader with
// domain-warped fractal noise in the brand blues over the page black. The
// cursor pushes the field and leaves a soft glow that eases out.
//
// Cheap by design: quarter-resolution canvas (it is blurry anyway), 30 fps
// cap, paused when the tab is hidden, no cursor term on touch devices, and a
// single static frame when the user prefers reduced motion. Without WebGL the
// plain background stays.

const VERT = `
attribute vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;     // 0..1, origin bottom-left
uniform float u_mouseAmt; // 0 = no cursor, 1 = full
uniform float u_accent;   // accent strength (1 = page background, more for the card texture)

// Sin-free hash: trig of large arguments is unreliable on some GPUs (Metal
// returns garbage past a range), which showed as a hard black cut.
vec2 hash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return -1.0 + 2.0 * fract((p3.xx + p3.yz) * p3.zy);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(hash2(i), f), dot(hash2(i + vec2(1, 0)), f - vec2(1, 0)), u.x),
             mix(dot(hash2(i + vec2(0, 1)), f - vec2(0, 1)), dot(hash2(i + vec2(1, 1)), f - vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = r * p * 2.0 + 0.7; a *= 0.5; }
  return v;
}
void main() {
  float ar = u_res.x / u_res.y;
  vec2 uv = gl_FragCoord.xy / u_res;     // y = 0 bottom, 1 top
  float x = uv.x * ar;
  float y = uv.y;
  vec2 m = vec2(u_mouse.x * ar, u_mouse.y);
  float t = u_time;

  vec3 bg    = vec3(0.055, 0.055, 0.063);  // #0e0e10
  vec3 light = vec3(0.424, 0.714, 1.000);  // #6cb6ff
  vec3 mid   = vec3(0.184, 0.490, 1.000);  // #2f7dff
  vec3 deep  = vec3(0.086, 0.282, 0.847);  // #1648d8

  // Night sky: near-black with a faint relief so the dark has volume.
  vec3 col = bg + vec3(0.010) * (fbm(vec2(x * 0.8, y * 0.8) + t * 0.02) - 0.2);

  // Aurora bands: horizontal curtains that span the whole width and undulate
  // up and down (sines on x with a time offset plus noise), with soft noisy
  // edges, a colour gradient from deep blue (low) to light blue (high) and a
  // fade towards the top and bottom edges. The cursor pushes a band away when
  // it comes near; the bands never stop moving on their own.
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float xi = x * 1.3 + fi * 1.7;
    float curtain = fbm(vec2(xi * 0.9, t * 0.16 + fi * 2.0)) * 0.30;
    float center = 0.22 + 0.17 * fi
      + sin(xi * 1.5 + t * 0.55 + fi * 1.1) * 0.10
      + sin(xi * 3.1 - t * 0.38 + fi * 0.6) * 0.035
      + curtain - 0.15;
    vec2 toM = vec2(x, center) - m;
    float dmm = length(toM);
    // Smooth push direction (no sign(): that flips abruptly and leaves a seam).
    float dir = toM.y / (abs(toM.y) + 0.10);
    center += dir * exp(-dmm * dmm * 4.0) * 0.10 * u_mouseAmt;

    float d = abs(y - center);
    float thick = 0.16 + 0.08 * fbm(vec2(xi * 1.2, t * 0.2 + fi));
    float band = smoothstep(thick, 0.0, d);
    float shimmer = 0.6 + 0.4 * fbm(vec2(xi * 2.0 - t * 0.4, y * 3.0 + fi));
    float a = band * shimmer * (0.75 - fi * 0.12);

    vec3 top = mix(light, mid, 0.3 + 0.3 * sin(fi * 1.3));
    vec3 bandCol = mix(deep, top, smoothstep(0.1, 0.9, y));
    col += bandCol * a * 0.26 * u_accent;
  }
  // Fade at the very bottom and keep it dark at the top so the header blends in.
  col = mix(bg, col, smoothstep(0.0, 0.12, y));
  col = mix(bg, col, smoothstep(0.0, 0.08, 1.0 - y) * 0.9 + 0.1);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function initFluidBackground(): void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canvas = document.createElement("canvas");
  canvas.className = "fluid";
  canvas.setAttribute("aria-hidden", "true");
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power" });
  if (!gl) return;
  document.body.prepend(canvas);

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  let prog: WebGLProgram;
  try {
    prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("link");
  } catch {
    canvas.remove();
    return;
  }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aLoc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(aLoc);
  gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, "u_res");
  const uTime = gl.getUniformLocation(prog, "u_time");
  const uMouse = gl.getUniformLocation(prog, "u_mouse");
  const uMouseAmt = gl.getUniformLocation(prog, "u_mouseAmt");
  const uAccent = gl.getUniformLocation(prog, "u_accent");

  // Two still frames of the same field, as textures for the cards (CSS vars
  // --fluid-tex and --fluid-tex-2; the CSS drifts and cross-fades them so the
  // cards deform slowly on their own). Read back synchronously, right after
  // drawing, so no preserveDrawingBuffer is needed.
  canvas.width = 640;
  canvas.height = 400;
  gl.viewport(0, 0, 640, 400);
  gl.uniform2f(uRes, 640, 400);
  gl.uniform2f(uMouse, 0.5, 0.5);
  gl.uniform1f(uMouseAmt, 0);
  gl.uniform1f(uAccent, 1.8);
  try {
    for (const [name, t] of [["--fluid-tex", 41.0], ["--fluid-tex-2", 47.5]] as const) {
      gl.uniform1f(uTime, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      document.documentElement.style.setProperty(name, `url(${canvas.toDataURL("image/jpeg", 0.75)})`);
    }
  } catch {
    /* tainted or unsupported: cards keep their plain gradient */
  }
  gl.uniform1f(uAccent, 1);

  // Quarter resolution (half of a 1x DPR), it is a blur anyway.
  const SCALE = 0.5;
  const resize = () => {
    canvas.width = Math.max(1, Math.round(window.innerWidth * SCALE));
    canvas.height = Math.max(1, Math.round(window.innerHeight * SCALE));
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();
  window.addEventListener("resize", resize);

  // The cursor is tracked wherever it is (the fields are behind everything,
  // so layer B bends around it over cards too) and only lets go when it
  // leaves the window. Layer A never reacts.
  const hasPointer = window.matchMedia("(pointer: fine)").matches;
  const target = { x: 0.5, y: 0.5 };
  const mouse = { x: 0.5, y: 0.5 };
  let amt = 0;
  let amtTarget = 0;
  if (hasPointer) {
    window.addEventListener("pointermove", (e) => {
      target.x = e.clientX / window.innerWidth;
      target.y = 1 - e.clientY / window.innerHeight;
      amtTarget = 1;
    });
    document.addEventListener("pointerleave", () => { amtTarget = 0; });
  }

  const FPS = hasPointer ? 30 : 24;
  const frameMs = 1000 / FPS;
  let last = 0;
  let running = true;
  const start = performance.now();

  const draw = (now: number) => {
    const t = (now - start) / 1000;
    mouse.x += (target.x - mouse.x) * 0.08;
    mouse.y += (target.y - mouse.y) * 0.08;
    amt += (amtTarget - amt) * 0.05;
    gl.uniform1f(uAccent, 1);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, t);
    gl.uniform2f(uMouse, mouse.x, mouse.y);
    gl.uniform1f(uMouseAmt, amt);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  if (reduce) {
    draw(start + 20000); // one still frame, no loop
    return;
  }

  const loop = (now: number) => {
    if (!running) return;
    if (now - last >= frameMs) {
      last = now;
      draw(now);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  document.addEventListener("visibilitychange", () => {
    const visible = document.visibilityState === "visible";
    if (visible && !running) {
      running = true;
      requestAnimationFrame(loop);
    } else if (!visible) {
      running = false;
    }
  });
}

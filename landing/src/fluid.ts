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
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;     // 0..1, origin bottom-left
uniform float u_mouseAmt; // 0 = no cursor, 1 = full

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
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
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = vec2(uv.x * ar, uv.y) * 1.1;
  vec2 m = vec2(u_mouse.x * ar, u_mouse.y);
  float t = u_time * 0.045;

  // Cursor: a radial push on the sampling point and a soft glow.
  vec2 toM = p - m * 1.1;
  float dm = length(toM);
  vec2 push = toM / (dm + 0.08) * exp(-dm * dm * 2.2) * 0.5 * u_mouseAmt;

  vec2 q = vec2(fbm(p + t), fbm(p - t * 0.8 + vec2(3.1, 1.7)));
  vec2 w = vec2(fbm(p + 2.0 * q + vec2(1.3, 9.2) + t * 0.5), fbm(p + 2.0 * q + vec2(8.3, 2.8) - t * 0.4));
  float n = fbm(p + 1.8 * w + push);
  float n2 = fbm(p * 0.6 - 1.2 * w + vec2(5.0, 2.0));

  vec3 bg = vec3(0.055, 0.055, 0.063);          // #0e0e10
  vec3 blue = vec3(0.184, 0.490, 1.000);         // #2f7dff
  vec3 deep = vec3(0.086, 0.282, 0.847);         // #1648d8
  float h = n * 0.5 + 0.5;
  // A sea of near-black: a faint relief (±1 % luminance) so the dark has volume.
  vec3 col = bg + vec3(0.012) * (h - 0.5) * 2.0;
  // The blue only lives on the crests of the field: a thin, sparse accent.
  float crest = smoothstep(0.60, 0.86, h);
  float veins = smoothstep(0.45, 0.95, n2 * 0.5 + 0.5);
  col += mix(deep, blue, veins) * crest * 0.10;
  col += blue * exp(-dm * dm * 7.0) * 0.06 * u_mouseAmt;
  // Keep it dark at the very top so the sticky nav blends in.
  col = mix(bg, col, smoothstep(0.0, 0.08, 1.0 - uv.y) * 0.9 + 0.1);
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

  // Quarter resolution (half of a 1x DPR), it is a blur anyway.
  const SCALE = 0.5;
  const resize = () => {
    canvas.width = Math.max(1, Math.round(window.innerWidth * SCALE));
    canvas.height = Math.max(1, Math.round(window.innerHeight * SCALE));
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();
  window.addEventListener("resize", resize);

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

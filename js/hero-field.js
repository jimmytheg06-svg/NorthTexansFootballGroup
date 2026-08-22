(() => {
  const canvas = document.getElementById("heroCanvas");
  const hero = document.querySelector(".hero");
  if (!canvas || !hero) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) return;

  const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
  if (!gl) return;

  let mouseX = -1000;
  let mouseY = -1000;
  let lastMouseMove = 0;

  const setPointer = (clientX, clientY) => {
    const rect = hero.getBoundingClientRect();
    mouseX = clientX - rect.left;
    mouseY = rect.height - (clientY - rect.top);
    lastMouseMove = Date.now();
  };

  hero.addEventListener("mousemove", (e) => setPointer(e.clientX, e.clientY), { passive: true });
  hero.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches[0]) setPointer(e.touches[0].clientX, e.touches[0].clientY);
    },
    { passive: true }
  );
  hero.addEventListener("mouseleave", () => {
    lastMouseMove = 0;
  });

  const vsSource = `
    attribute vec4 aVertexPosition;
    void main() {
      gl_Position = aVertexPosition;
    }
  `;

  // Adapted from a WebGL background study (threeui.com/backgrounds/matrix-field):
  // recolored to team red/steel, slowed down, and de-chaosed for a calmer,
  // premium glow instead of the original's jagged "electric" look.
  const fsSource = `
    precision highp float;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec2 u_mouse;
    uniform float u_mouseActive;

    float hash(float n) { return fract(sin(n) * 753.5453123); }
    float noise(float x) {
      float i = floor(x);
      float f = fract(x);
      f = f * f * (3.0 - 2.0 * f);
      return mix(hash(i), hash(i + 1.0), f);
    }

    vec2 sdLine(vec2 p, vec2 a, vec2 b) {
      vec2 pa = p - a, ba = b - a;
      float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
      return vec2(length(pa - ba * h), h);
    }

    float filament(vec2 uv, vec2 a, vec2 b, float t) {
      vec2 ab = b - a;
      float len = length(ab);
      if (len < 0.01) return 0.0;
      vec2 dir = ab / len;

      vec2 pa = uv - a;
      float h = clamp(dot(pa, dir) / len, 0.0, 1.0);
      float dist = length(pa - dir * (h * len));

      float env = sin(h * 3.1415);
      float offset = (noise(h * 18.0 - t * 18.0) - 0.5) * 0.05 * env;
      float d = abs(dist + offset);

      return (0.00015 / (d + 0.00015) + 0.000006 / (d * d + 0.000006)) * env;
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution.xy;
      uv = uv * 2.0 - 1.0;
      uv.x *= u_resolution.x / u_resolution.y;

      vec2 mouseUV = u_mouse / u_resolution.xy;
      mouseUV = mouseUV * 2.0 - 1.0;
      mouseUV.x *= u_resolution.x / u_resolution.y;

      vec2 center = vec2(-0.9, -0.85);
      center.x += sin(u_time * 0.2) * 0.02;
      center.y += cos(u_time * 0.15) * 0.02;

      vec2 dirUp = normalize(vec2(0.2, 1.0));
      vec2 dirRight = normalize(vec2(1.0, -0.15));
      vec2 dirDiag = normalize(vec2(0.6, 0.4));

      vec2 l1 = sdLine(uv, center, center + dirUp * 5.0);
      vec2 l2 = sdLine(uv, center, center + dirRight * 5.0);
      vec2 l3 = sdLine(uv, center, center + dirDiag * 5.0);

      float intensity = 0.0035;
      float glow = intensity / (l1.x + 0.001) +
                   intensity / (l2.x + 0.001) +
                   (intensity * 0.4) / (l3.x + 0.001);

      float pulse1 = smoothstep(0.1, 0.0, abs(l1.y - fract(u_time * 0.16))) * 0.02 / (l1.x + 0.001);
      float pulse2 = smoothstep(0.1, 0.0, abs(l2.y - fract(u_time * 0.2 + 0.3))) * 0.02 / (l2.x + 0.001);
      glow += pulse1 + pulse2;

      vec2 p1 = center + dirUp * clamp(dot(mouseUV - center, dirUp), 0.0, 5.0);
      vec2 p2 = center + dirRight * clamp(dot(mouseUV - center, dirRight), 0.0, 5.0);

      float f1 = filament(uv, p1, mouseUV, u_time);
      float f2 = filament(uv, p2, mouseUV, u_time + 10.0);

      float d1 = length(mouseUV - p1);
      float d2 = length(mouseUV - p2);

      glow += f1 * smoothstep(2.0, 0.0, d1) * u_mouseActive;
      glow += f2 * smoothstep(2.0, 0.0, d2) * u_mouseActive;

      float distToCenter = length(uv - center);
      glow += 0.02 / (distToCenter + 0.02);

      vec3 emberRed = vec3(0.85, 0.16, 0.2);
      vec3 steel = vec3(0.55, 0.66, 0.82);
      vec3 baseColor = mix(steel, emberRed, 0.6 + 0.4 * sin(u_time * 0.5 - distToCenter * 4.0));
      vec3 finalColor = baseColor * glow * 0.55;

      float vignette = 1.0 - smoothstep(0.3, 1.6, length(uv));
      finalColor *= vignette;

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `;

  function createShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vertexShader = createShader(gl.VERTEX_SHADER, vsSource);
  const fragmentShader = createShader(gl.FRAGMENT_SHADER, fsSource);
  if (!vertexShader || !fragmentShader) return;

  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);
  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) return;

  const programInfo = {
    program: shaderProgram,
    attribLocations: { vertexPosition: gl.getAttribLocation(shaderProgram, "aVertexPosition") },
    uniformLocations: {
      resolution: gl.getUniformLocation(shaderProgram, "u_resolution"),
      time: gl.getUniformLocation(shaderProgram, "u_time"),
      mouse: gl.getUniformLocation(shaderProgram, "u_mouse"),
      mouseActive: gl.getUniformLocation(shaderProgram, "u_mouseActive"),
    },
  };

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, 1, -1, 1, 1, -1, -1, -1]), gl.STATIC_DRAW);

  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  let currentMouseActive = 0;
  let rafId = null;
  let isVisible = true;
  const startTime = Date.now();

  function resize() {
    const width = Math.round(hero.clientWidth * dpr);
    const height = Math.round(hero.clientHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function render() {
    if (!isVisible) {
      rafId = null;
      return;
    }
    resize();
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.useProgram(programInfo.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);

    const timeSinceMove = Date.now() - lastMouseMove;
    const targetActive = timeSinceMove < 150 ? 1.0 : Math.max(0, 1 - (timeSinceMove - 150) / 350);
    currentMouseActive += (targetActive - currentMouseActive) * 0.15;

    gl.uniform2f(programInfo.uniformLocations.resolution, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(programInfo.uniformLocations.time, (Date.now() - startTime) * 0.001);
    gl.uniform2f(programInfo.uniformLocations.mouse, mouseX * dpr, mouseY * dpr);
    gl.uniform1f(programInfo.uniformLocations.mouseActive, currentMouseActive);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    rafId = requestAnimationFrame(render);
  }

  function startRender() {
    if (rafId === null) rafId = requestAnimationFrame(render);
  }

  const heroObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        isVisible = entry.isIntersecting && document.visibilityState === "visible";
        if (isVisible) startRender();
      });
    },
    { threshold: 0 }
  );
  heroObserver.observe(hero);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      const rect = hero.getBoundingClientRect();
      isVisible = rect.bottom > 0 && rect.top < window.innerHeight;
      startRender();
    } else {
      isVisible = false;
    }
  });

  window.addEventListener("resize", resize, { passive: true });

  resize();
  startRender();
  requestAnimationFrame(() => canvas.classList.add("is-active"));
})();

"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

let seedState = 1337;
const seededRandom = () =>
  ((seedState = (16807 * seedState) % 0x7fffffff) - 1) / 0x7ffffffe;

export function NtiStackedMark({
  svgRef,
  className,
  style,
}: {
  svgRef?: React.Ref<SVGSVGElement>;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      ref={svgRef}
      className={className}
      style={style}
      viewBox="0 0 220 156"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Chamfered architectural NTI crest */}
      <g fill="currentColor">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M82 10H138L150 22V78L138 90H82L70 78V22L82 10ZM85 18L78 25V75L85 82H135L142 75V25L135 18H85Z"
        />
        {/* Ascending mindshare curve + apex node */}
        <path d="M84 65L101 41L114 54L130 32L136 37L115 65L102 52L90 70L84 65Z" />
        <circle cx="135" cy="29" r="5.5" fill="#CCFF00" />
      </g>

      {/* Pure vector block wordmark: N T I */}
      <g fill="currentColor">
        <path d="M64 142V110H71L85 131V110H91V142H84L70 121V142H64Z" />
        <path d="M102 110H130V116H119V142H113V116H102V110Z" />
        <path d="M140 110H156V116H151V136H156V142H140V136H145V116H140V110Z" />
      </g>
    </svg>
  );
}

async function sampleSvgParticles(
  svgEl: SVGSVGElement,
  targetWidth: number,
  step: number
) {
  const vb = svgEl.viewBox.baseVal;
  const targetHeight = Math.round((targetWidth * vb.height) / vb.width);
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(targetWidth));
  clone.setAttribute("height", String(targetHeight));
  const serialized = new XMLSerializer()
    .serializeToString(clone)
    .replace(/currentColor/g, "#fff");
  const blobUrl = URL.createObjectURL(
    new Blob([serialized], { type: "image/svg+xml" })
  );
  try {
    const img = new Image();
    img.src = blobUrl;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2d context unavailable");
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    const data = ctx.getImageData(0, 0, targetWidth, targetHeight).data;
    const pts: number[] = [];
    for (let y = 0; y < targetHeight; y += step) {
      for (let x = 0; x < targetWidth; x += step) {
        if ((data[(y * targetWidth + x) * 4 + 3] ?? 0) < 110) continue;
        const jx = x + (seededRandom() - 0.5) * step * 0.55;
        const jy = y + (seededRandom() - 0.5) * step * 0.55;
        pts.push(jx / targetWidth - 0.5, 0.5 - jy / targetHeight);
      }
    }
    return { pts, aspect: targetHeight / targetWidth, cols: targetWidth / step };
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

const VERT_PARTICLES = `
  attribute vec3 aStart;
  attribute vec4 aRnd;
  uniform float uTime, uProgress, uDissolve, uScan, uSize, uPR, uDim;
  varying float vAlpha, vGlow, vFly;

  void main() {
    float delay = aRnd.x * 0.42;
    float t = clamp((uProgress - delay) / 0.58, 0.0, 1.0);
    float e = 1.0 - pow(1.0 - t, 3.0);

    float ang = (1.0 - e) * (2.4 + aRnd.y * 2.2);
    float c = cos(ang), s = sin(ang);
    vec3 sr = vec3(aStart.x * c - aStart.z * s, aStart.y, aStart.x * s + aStart.z * c);
    vec3 p = mix(sr, position, e);
    p.z += sin(e * 3.14159) * (aRnd.w - 0.5) * 1.6;
    p.z += sin(uTime * 2.2 + aRnd.z * 6.2831) * 0.012 * e;

    vec3 dir = normalize(vec3(position.xy * 2.0, 0.6) + (aRnd.xyz - 0.5) * 1.4);
    p += dir * uDissolve * uDissolve * (2.5 + aRnd.w * 5.0);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    float d = (position.y - uScan) * 16.0;
    vGlow = exp(-d * d);
    vFly = 1.0 - e;
    gl_PointSize = uSize * uPR * (1.0 + vGlow * 1.4 + vFly * 1.3) * (6.0 / -mv.z);
    vAlpha = smoothstep(0.0, 0.15, t + 0.18) * (1.0 - uDissolve) * mix(1.0, uDim, e);
  }
`;

const FRAG_PARTICLES = `
  uniform vec3 uColor, uAccent;
  varying float vAlpha, vGlow, vFly;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    if (r > 0.5) discard;
    float a = 1.0 - r * 2.0;
    a *= a;
    vec3 col = mix(uColor, uAccent, clamp(vFly * 1.5 + vGlow * 0.8, 0.0, 1.0)) + vGlow * 0.7;
    gl_FragColor = vec4(col, a * min(1.0, vAlpha + vGlow * 0.6));
  }
`;

const VERT_DUST = `
  uniform float uTime, uPR, uAlpha;
  attribute float aRnd;
  varying float vA;
  void main() {
    vec3 p = position;
    p.y += sin(uTime * 0.4 + aRnd * 30.0) * 0.08;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.0 + aRnd * 2.0) * uPR * (6.0 / -mv.z);
    vA = (0.15 + aRnd * 0.35) * uAlpha * (0.6 + 0.4 * sin(uTime * 1.5 + aRnd * 40.0));
  }
`;

const FRAG_DUST = `
  uniform vec3 uAccent;
  varying float vA;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    if (r > 0.5) discard;
    gl_FragColor = vec4(uAccent, (1.0 - r * 2.0) * vA);
  }
`;

const FRAG_SCAN = `
  uniform float uAlpha;
  uniform vec3 uAccent;
  varying vec2 vUv;
  void main() {
    float x = 1.0 - abs(vUv.x - 0.5) * 2.0;
    float y = 1.0 - abs(vUv.y - 0.5) * 2.0;
    float a = pow(x, 1.5) * pow(y, 6.0) * uAlpha;
    gl_FragColor = vec4(mix(uAccent, vec3(1.0), y * y), a);
  }
`;

async function createNtiPreloaderScene(
  canvas: HTMLCanvasElement,
  svgEl: SVGSVGElement,
  isAlive: () => boolean
) {
  const isSmall = window.innerWidth < 720;
  const { pts, aspect, cols } = await sampleSvgParticles(
    svgEl,
    isSmall ? 280 : 360,
    2
  );
  if (!isAlive() || pts.length === 0) return null;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: true,
    powerPreference: "high-performance",
  });
  const pr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    35,
    window.innerWidth / window.innerHeight,
    0.1,
    50
  );
  camera.position.z = 6;

  const worldPerPx =
    (12 * Math.tan(THREE.MathUtils.degToRad(17.5))) / window.innerHeight;
  const rect = svgEl.getBoundingClientRect();
  const widthWorld = Math.max(0.5, rect.width * worldPerPx);
  const heightWorld = widthWorld * aspect;
  const offsetX =
    (rect.left + rect.width / 2 - window.innerWidth / 2) * worldPerPx;
  const offsetY =
    -(rect.top + rect.height / 2 - window.innerHeight / 2) * worldPerPx;
  const ptScale = Math.max(0.4, rect.width / cols);
  const count = pts.length / 2;

  const posArr = new Float32Array(3 * count);
  const startArr = new Float32Array(3 * count);
  const rndArr = new Float32Array(4 * count);

  for (let i = 0; i < count; i++) {
    const px = pts[2 * i]!;
    const py = pts[2 * i + 1]!;
    posArr[3 * i] = px * widthWorld;
    posArr[3 * i + 1] = py * heightWorld;

    const theta = seededRandom() * Math.PI * 2;
    const phi = Math.acos(2 * seededRandom() - 1);
    const rad = 2.6 + 4.5 * seededRandom();
    startArr[3 * i] = rad * Math.sin(phi) * Math.cos(theta) * 1.3;
    startArr[3 * i + 1] = rad * Math.sin(phi) * Math.sin(theta) * 0.8;
    startArr[3 * i + 2] = Math.min(2.5, rad * Math.cos(phi) - 1.5);

    rndArr[4 * i] = Math.min(
      1,
      0.9 * Math.hypot(px, py * aspect) + 0.4 * seededRandom()
    );
    rndArr[4 * i + 1] = seededRandom();
    rndArr[4 * i + 2] = seededRandom();
    rndArr[4 * i + 3] = seededRandom();
  }

  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
  particleGeo.setAttribute("aStart", new THREE.BufferAttribute(startArr, 3));
  particleGeo.setAttribute("aRnd", new THREE.BufferAttribute(rndArr, 4));

  const accentColor = new THREE.Color("#CCFF00");
  const particleUniforms = {
    uTime: { value: 0 },
    uProgress: { value: 0 },
    uDissolve: { value: 0 },
    uScan: { value: 99 },
    uDim: { value: 1 },
    uSize: { value: Math.max(3.0, 2.7 * ptScale) },
    uPR: { value: pr },
    uColor: { value: new THREE.Color("#F4F5F7") },
    uAccent: { value: accentColor },
  };

  const blendOpts = {
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  };

  const particleMat = new THREE.ShaderMaterial({
    vertexShader: VERT_PARTICLES,
    fragmentShader: FRAG_PARTICLES,
    uniforms: particleUniforms,
    ...blendOpts,
  });

  const group = new THREE.Group();
  group.position.set(offsetX, offsetY, 0);
  group.add(new THREE.Points(particleGeo, particleMat));
  scene.add(group);

  const dustCount = isSmall ? 320 : 720;
  const dustPos = new Float32Array(3 * dustCount);
  const dustRnd = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dustPos[3 * i] = (seededRandom() - 0.5) * 14;
    dustPos[3 * i + 1] = (seededRandom() - 0.5) * 8;
    dustPos[3 * i + 2] = -(10 * seededRandom()) + 1;
    dustRnd[i] = seededRandom();
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute("aRnd", new THREE.BufferAttribute(dustRnd, 1));

  const dustUniforms = {
    uTime: particleUniforms.uTime,
    uPR: particleUniforms.uPR,
    uAlpha: { value: 0 },
    uAccent: { value: accentColor },
  };
  const dustMat = new THREE.ShaderMaterial({
    vertexShader: VERT_DUST,
    fragmentShader: FRAG_DUST,
    uniforms: dustUniforms,
    ...blendOpts,
  });
  const dustPoints = new THREE.Points(dustGeo, dustMat);
  scene.add(dustPoints);

  const scanUniforms = {
    uAlpha: { value: 0 },
    uAccent: { value: accentColor },
  };
  const scanGeo = new THREE.PlaneGeometry(
    1.5 * widthWorld,
    0.09 * heightWorld
  );
  const scanMat = new THREE.ShaderMaterial({
    vertexShader:
      "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: FRAG_SCAN,
    uniforms: scanUniforms,
    ...blendOpts,
  });
  const scanMesh = new THREE.Mesh(scanGeo, scanMat);
  group.add(scanMesh);

  const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
  const onPointerMove = (e: PointerEvent) => {
    mouse.x = e.clientX / window.innerWidth - 0.5;
    mouse.y = e.clientY / window.innerHeight - 0.5;
  };
  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  };
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("resize", onResize);

  const t0 = performance.now();
  return {
    update(
      progress: number,
      scanProgress: number,
      dissolve: number,
      dim: number
    ) {
      const elapsed = (performance.now() - t0) / 1000;
      particleUniforms.uTime.value = elapsed;
      particleUniforms.uProgress.value = progress;
      particleUniforms.uDissolve.value = dissolve;
      particleUniforms.uDim.value = dim;

      const scanY =
        heightWorld / 2 +
        0.15 * heightWorld -
        scanProgress * heightWorld * 1.3;
      particleUniforms.uScan.value =
        scanProgress > 0 && scanProgress < 1 ? scanY : 99;
      scanMesh.position.y = scanY;
      scanUniforms.uAlpha.value =
        Math.sin(Math.PI * Math.min(1, scanProgress)) * (1 - dissolve);
      dustUniforms.uAlpha.value =
        Math.min(1, 2 * progress) * (1 - 0.6 * dissolve);

      const easeIn = 1 - Math.pow(1 - Math.min(1, 1.05 * progress), 3);
      mouse.sx += (mouse.x - mouse.sx) * 0.06;
      mouse.sy += (mouse.y - mouse.sy) * 0.06;
      const sway = 1 - 0.9 * easeIn;
      group.rotation.y = (1 - easeIn) * 0.9 + 0.35 * mouse.sx * sway;
      group.rotation.x = -((1 - easeIn) * 0.25) + 0.2 * mouse.sy * sway;
      dustPoints.rotation.y = 0.03 * elapsed + 0.15 * mouse.sx;
      dustPoints.rotation.x = 0.08 * mouse.sy;
      renderer.render(scene, camera);
    },
    dispose() {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", onResize);
      [
        particleGeo,
        particleMat,
        dustGeo,
        dustMat,
        scanGeo,
        scanMat,
      ].forEach((d) => d.dispose());
      renderer.dispose();
    },
  };
}

export function NtiPreloader() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logoRef = useRef<SVGSVGElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const hashRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const [formed, setFormed] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [done, setDone] = useState(false);
  const [unmounted, setUnmounted] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reducedMotion) {
      setDone(true);
      window.dispatchEvent(new Event("nti:intro"));
      const t = window.setTimeout(() => setUnmounted(true), 50);
      return () => clearTimeout(t);
    }

    const svgLogo = logoRef.current;
    const labels: [string, string] = [
      "SYNCING ROBINHOOD 46630 STATE",
      "2-OF-3 EIP-712 ORACLE VERIFIED",
    ];
    if (labelRef.current) labelRef.current.textContent = labels[0];

    let pageLoaded = document.readyState === "complete";
    const onLoad = () => {
      pageLoaded = true;
    };
    window.addEventListener("load", onLoad);

    let glScene: Awaited<ReturnType<typeof createNtiPreloaderScene>> | null =
      null;
    let rafId = 0;
    let alive = true;
    let startTime = 0;
    let finishTime = 0;
    let lastHashTime = 0;
    let disposeTimeout = 0;
    let unmountTimeout = 0;
    let finishTimeout = 0;
    let formedSet = false;

    const triggerExit = () => {
      setDone(true);
      window.dispatchEvent(new Event("nti:intro"));
      unmountTimeout = window.setTimeout(() => setUnmounted(true), 1000);
    };

    const animate = (now: number) => {
      if (!alive) return;
      const elapsed = Math.max(0, (now - startTime) / 1000);

      if (elapsed >= 2.15 && (pageLoaded || elapsed >= 3.8) && !finishTime) {
        finishTime = now;
        finishTimeout = window.setTimeout(triggerExit, 140);
      }

      const dissolve = finishTime
        ? Math.min(1, (now - finishTime) / 1000 / 0.65)
        : 0;
      const pct = Math.round(
        (1 - Math.pow(1 - Math.min(elapsed / 2.15, pageLoaded ? 1 : 0.94), 2)) *
          100
      );

      if (pctRef.current) {
        pctRef.current.textContent = `${String(pct).padStart(2, "0")} %`;
      }
      if (barRef.current) {
        barRef.current.style.transform = `scaleX(${pct / 100})`;
      }

      if (elapsed >= 1.8) {
        if (!formedSet) {
          formedSet = true;
          setFormed(true);
        }
        if (labelRef.current) labelRef.current.textContent = labels[1];
      } else if (hashRef.current && now - lastHashTime > 52) {
        lastHashTime = now;
        let hex = "0x";
        for (let i = 0; i < 24; i++) {
          hex += "0123456789abcdef"[(16 * Math.random()) | 0];
        }
        hashRef.current.textContent = hex;
      }

      glScene?.update(
        Math.min(1, elapsed / 1.65),
        Math.min(1, Math.max(0, (elapsed - 1.3) / 0.8)),
        dissolve,
        1 - 0.6 * Math.min(1, Math.max(0, (elapsed - 1.8) / 0.35))
      );

      if (dissolve < 1) {
        rafId = requestAnimationFrame(animate);
      } else {
        disposeTimeout = window.setTimeout(() => glScene?.dispose(), 550);
      }
    };

    const startLoop = () => {
      if (!alive) return;
      startTime = performance.now();
      animate(startTime);
    };

    if (svgLogo && canvasRef.current) {
      createNtiPreloaderScene(canvasRef.current, svgLogo, () => alive)
        .then((sc) => {
          if (!alive) {
            sc?.dispose();
            return;
          }
          if (!sc) {
            setFallback(true);
            startLoop();
            return;
          }
          glScene = sc;
          startLoop();
        })
        .catch(() => {
          setFallback(true);
          startLoop();
        });
    } else {
      setFallback(true);
      startLoop();
    }

    const failsafe = window.setTimeout(() => {
      if (!finishTime) triggerExit();
    }, 5200);

    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
      clearTimeout(disposeTimeout);
      clearTimeout(finishTimeout);
      clearTimeout(unmountTimeout);
      clearTimeout(failsafe);
      window.removeEventListener("load", onLoad);
      glScene?.dispose();
    };
  }, []);

  if (unmounted) return null;

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="fixed inset-0 z-[90] grid place-items-center overflow-hidden pointer-events-none select-none"
      style={{
        background:
          "radial-gradient(ellipse at 50% 50%, #101614 0%, #090B0E 64%)",
        clipPath: done ? "inset(0 0 100% 0)" : "inset(0 0 0 0)",
        visibility: done ? "hidden" : "visible",
        transition:
          "clip-path 0.95s cubic-bezier(0.76, 0, 0.24, 1), visibility 0s linear 0.95s",
      }}
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />

      <NtiStackedMark
        svgRef={logoRef}
        className="relative w-[clamp(160px,22vw,290px)] text-[#F4F5F7] transition-[opacity,filter] duration-700"
        style={{
          opacity: formed || fallback ? 1 : 0,
          filter: formed
            ? "drop-shadow(0 0 22px rgba(204, 255, 0, 0.42))"
            : "none",
        }}
      />

      {/* Telemetry Status + Scrambling Root Hash */}
      <div className="absolute bottom-[clamp(64px,14vh,132px)] left-1/2 -translate-x-1/2 grid justify-items-center gap-[6px] font-mono text-[11px] uppercase tracking-[0.18em] whitespace-nowrap">
        <span
          ref={labelRef}
          className={`transition-colors duration-300 ${
            formed ? "text-[#CCFF00]" : "text-[#89919F]"
          }`}
        />
        <span
          ref={hashRef}
          className="font-mono text-[11px] tracking-[0.08em] normal-case text-[#89919F] transition-opacity duration-300"
          style={{ opacity: formed ? 0 : 0.6 }}
        />
      </div>

      {/* Bottom-Left Percentage Counter */}
      <span
        ref={pctRef}
        className="absolute bottom-[28px] left-[clamp(1.25em,4vw,3.5em)] font-mono text-[12px] tracking-[0.12em] text-[#E0E2E6] tabular-nums"
      >
        00 %
      </span>

      {/* Glowing Volt Progress Hairline */}
      <span
        ref={barRef}
        className="absolute bottom-0 left-0 right-0 h-[1.5px] origin-left bg-[#CCFF00]"
        style={{
          transform: "scaleX(0)",
          boxShadow: "0 0 14px rgba(204, 255, 0, 0.75)",
        }}
      />
    </div>
  );
}

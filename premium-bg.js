import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js";
import { EffectComposer } from "https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/postprocessing/UnrealBloomPass.js";

const sceneEl = document.getElementById("premiumScene");
const mountEl = document.getElementById("premiumGl");
const frostEl = document.getElementById("frostOverlay");
const fxPanel = document.getElementById("fxPanel");

if (!sceneEl || !mountEl) {
  console.warn("premium-bg.js: mount elements not found.");
} else {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isMobileInitial = window.innerWidth < 860;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function fibonacciSphere(count) {
    const points = [];
    const offset = 2 / count;
    const increment = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i += 1) {
      const y = i * offset - 1 + offset / 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const phi = i * increment;
      const x = Math.cos(phi) * r;
      const z = Math.sin(phi) * r;
      points.push(new THREE.Vector3(x, y, z));
    }
    return points;
  }

  function makeGlowTexture(size = 256) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.35, "rgba(166,226,255,0.9)");
    gradient.addColorStop(0.65, "rgba(112,163,255,0.36)");
    gradient.addColorStop(1, "rgba(88,92,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  const qualityBase = clamp((window.innerWidth * window.innerHeight) / (1920 * 1080), 0.58, 1.35);
  const quality = qualityBase * (isMobileInitial ? 0.72 : 1) * (prefersReducedMotion ? 0.62 : 1);

  const counts = {
    globe: Math.floor(1700 * quality),
    orbit: Math.floor(260 * quality),
    stars: Math.floor(1200 * quality),
    snow: Math.floor(1700 * quality),
    rain: Math.floor(1300 * quality),
  };

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.sortObjects = false;
  mountEl.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x040713, 0.0085);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 420);
  camera.position.set(0, 0.5, 44);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.95, 0.88, 0.2);
  composer.addPass(bloomPass);

  const hemiLight = new THREE.HemisphereLight(0x7ea5ff, 0x04050d, 1.2);
  scene.add(hemiLight);
  const keyLight = new THREE.PointLight(0x5cb8ff, 3.2, 190, 2);
  keyLight.position.set(23, 18, 20);
  scene.add(keyLight);
  const rimLight = new THREE.PointLight(0x965eff, 2.5, 190, 2);
  rimLight.position.set(-26, -14, 18);
  scene.add(rimLight);

  const globeGroup = new THREE.Group();
  scene.add(globeGroup);

  const coreSphere = new THREE.Mesh(
    new THREE.IcosahedronGeometry(8.7, 5),
    new THREE.MeshPhysicalMaterial({
      color: 0x6ea9ff,
      roughness: 0.12,
      metalness: 0.08,
      transmission: 0.9,
      thickness: 1.2,
      transparent: true,
      opacity: 0.15,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      emissive: 0x132347,
      emissiveIntensity: 0.55,
      envMapIntensity: 1.2,
    })
  );
  globeGroup.add(coreSphere);

  const shellSphere = new THREE.Mesh(
    new THREE.SphereGeometry(9.6, 64, 64),
    new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vPosition = worldPos.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          float fres = pow(1.0 - max(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 0.0), 2.2);
          float pulse = 0.55 + 0.45 * sin(uTime * 0.8 + vPosition.y * 0.25);
          vec3 color = mix(vec3(0.22, 0.70, 1.0), vec3(0.62, 0.34, 1.0), 0.45 + 0.3 * sin(uTime * 0.6));
          float alpha = fres * pulse * 0.34;
          gl_FragColor = vec4(color, alpha);
        }
      `,
    })
  );
  globeGroup.add(shellSphere);

  const glowTexture = makeGlowTexture(320);
  if (glowTexture) {
    const glowSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.65,
      })
    );
    glowSprite.scale.set(33, 33, 1);
    globeGroup.add(glowSprite);
  }

  const globePointsBase = fibonacciSphere(counts.globe);
  const globePositions = new Float32Array(counts.globe * 3);
  const globeSizes = new Float32Array(counts.globe);
  const globePhase = new Float32Array(counts.globe);
  const globeOrbit = new Float32Array(counts.globe);
  for (let i = 0; i < counts.globe; i += 1) {
    const p = globePointsBase[i];
    const i3 = i * 3;
    globePositions[i3] = p.x;
    globePositions[i3 + 1] = p.y;
    globePositions[i3 + 2] = p.z;
    globeSizes[i] = rand(1.2, 3.6);
    globePhase[i] = Math.random();
    globeOrbit[i] = Math.random();
  }

  const globeGeometry = new THREE.BufferGeometry();
  globeGeometry.setAttribute("position", new THREE.BufferAttribute(globePositions, 3));
  globeGeometry.setAttribute("aSize", new THREE.BufferAttribute(globeSizes, 1));
  globeGeometry.setAttribute("aPhase", new THREE.BufferAttribute(globePhase, 1));
  globeGeometry.setAttribute("aOrbit", new THREE.BufferAttribute(globeOrbit, 1));

  const pointDisplaceFn = `
    vec3 displacePoint(vec3 dir, float phase, float orbit, float radius, float time) {
      float wave = sin(time * (0.75 + orbit * 0.95) + phase * 17.0);
      float pulse = 0.5 + 0.5 * wave;
      vec3 pos = normalize(dir) * (radius + pulse * 0.42);
      pos.x += sin(time * 0.38 + phase * 23.0) * 0.19;
      pos.y += cos(time * 0.29 + phase * 19.0) * 0.19;
      pos.z += sin(time * 0.44 + phase * 13.0) * 0.16;
      return pos;
    }
  `;

  const globeMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uRadius: { value: 8.55 },
      uBoost: { value: 0 },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uRadius;
      uniform float uBoost;
      attribute float aSize;
      attribute float aPhase;
      attribute float aOrbit;
      varying float vPulse;
      varying float vOrbit;
      ${pointDisplaceFn}
      void main() {
        vec3 p = displacePoint(position, aPhase, aOrbit, uRadius, uTime);
        float wave = sin(uTime * (0.75 + aOrbit * 0.95) + aPhase * 17.0);
        vPulse = 0.5 + 0.5 * wave;
        vOrbit = aOrbit;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aSize * (305.0 / max(9.0, -mvPosition.z)) * (1.0 + uBoost * 0.08);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying float vPulse;
      varying float vOrbit;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float dist = length(uv);
        float falloff = smoothstep(0.5, 0.0, dist);
        float core = smoothstep(0.26, 0.0, dist);
        vec3 c1 = vec3(0.28, 0.95, 1.0);
        vec3 c2 = vec3(0.34, 0.56, 1.0);
        vec3 c3 = vec3(0.73, 0.42, 1.0);
        vec3 color = mix(c1, c2, vOrbit);
        color = mix(color, c3, vPulse * 0.65);
        color += core * 0.2;
        float alpha = falloff * (0.45 + vPulse * 0.48);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
  const globePoints = new THREE.Points(globeGeometry, globeMaterial);
  globeGroup.add(globePoints);

  const edgePairs = [];
  const stepA = 7;
  const stepB = 19;
  const stepC = 53;
  for (let i = 0; i < globePointsBase.length; i += 1) {
    edgePairs.push([i, (i + stepA) % globePointsBase.length]);
    edgePairs.push([i, (i + stepB) % globePointsBase.length]);
    if (i % 3 === 0) {
      edgePairs.push([i, (i + stepC) % globePointsBase.length]);
    }
  }

  const lineVertexCount = edgePairs.length * 2;
  const linePositions = new Float32Array(lineVertexCount * 3);
  const linePhase = new Float32Array(lineVertexCount);
  const lineStrength = new Float32Array(lineVertexCount);
  let lineIndex = 0;
  for (let i = 0; i < edgePairs.length; i += 1) {
    const [a, b] = edgePairs[i];
    const pa = globePointsBase[a];
    const pb = globePointsBase[b];
    const phaseA = globePhase[a];
    const phaseB = globePhase[b];
    const strength = Math.random();

    const ia = lineIndex * 3;
    linePositions[ia] = pa.x;
    linePositions[ia + 1] = pa.y;
    linePositions[ia + 2] = pa.z;
    linePhase[lineIndex] = phaseA;
    lineStrength[lineIndex] = strength;
    lineIndex += 1;

    const ib = lineIndex * 3;
    linePositions[ib] = pb.x;
    linePositions[ib + 1] = pb.y;
    linePositions[ib + 2] = pb.z;
    linePhase[lineIndex] = phaseB;
    lineStrength[lineIndex] = strength;
    lineIndex += 1;
  }

  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
  lineGeometry.setAttribute("aPhase", new THREE.BufferAttribute(linePhase, 1));
  lineGeometry.setAttribute("aStrength", new THREE.BufferAttribute(lineStrength, 1));

  const lineMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uRadius: { value: 8.55 },
      uBoost: { value: 0 },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uRadius;
      attribute float aPhase;
      attribute float aStrength;
      varying float vStrength;
      varying float vPulse;
      ${pointDisplaceFn}
      void main() {
        vec3 p = displacePoint(position, aPhase, aStrength, uRadius, uTime);
        float wave = sin(uTime * (0.75 + aStrength * 0.95) + aPhase * 17.0);
        vPulse = 0.5 + 0.5 * wave;
        vStrength = aStrength;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uBoost;
      varying float vStrength;
      varying float vPulse;
      void main() {
        float blink = sin(uTime * 1.6 + vStrength * 19.0 + vPulse * 4.0) * 0.5 + 0.5;
        float reveal = smoothstep(0.28, 0.95, blink);
        float alpha = reveal * (0.08 + vPulse * 0.22) * (0.72 + uBoost * 0.45);
        vec3 c1 = vec3(0.20, 0.72, 1.0);
        vec3 c2 = vec3(0.76, 0.42, 1.0);
        vec3 color = mix(c1, c2, vStrength);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
  const networkLines = new THREE.LineSegments(lineGeometry, lineMaterial);
  globeGroup.add(networkLines);

  const orbitGeometry = new THREE.BufferGeometry();
  const orbitPositions = new Float32Array(counts.orbit * 3);
  const orbitSizes = new Float32Array(counts.orbit);
  const orbitAngle = new Float32Array(counts.orbit);
  const orbitRadius = new Float32Array(counts.orbit);
  const orbitSpeed = new Float32Array(counts.orbit);
  const orbitPhase = new Float32Array(counts.orbit);
  for (let i = 0; i < counts.orbit; i += 1) {
    orbitAngle[i] = rand(0, Math.PI * 2);
    orbitRadius[i] = rand(11, 17);
    orbitSpeed[i] = rand(0.0025, 0.0088);
    orbitPhase[i] = rand(0, Math.PI * 2);
    orbitSizes[i] = rand(1.2, 2.9);
    const i3 = i * 3;
    orbitPositions[i3] = Math.cos(orbitAngle[i]) * orbitRadius[i];
    orbitPositions[i3 + 1] = Math.sin(orbitPhase[i]) * 2.5;
    orbitPositions[i3 + 2] = Math.sin(orbitAngle[i]) * orbitRadius[i];
  }
  orbitGeometry.setAttribute("position", new THREE.BufferAttribute(orbitPositions, 3));
  orbitGeometry.setAttribute("aSize", new THREE.BufferAttribute(orbitSizes, 1));
  const orbitMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uBoost: { value: 0 } },
    vertexShader: `
      attribute float aSize;
      uniform float uBoost;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (260.0 / max(9.0, -mvPosition.z)) * (1.0 + uBoost * 0.08);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float dist = length(uv);
        float alpha = smoothstep(0.5, 0.0, dist);
        vec3 color = vec3(0.78, 0.92, 1.0);
        gl_FragColor = vec4(color, alpha * 0.72);
      }
    `,
  });
  const orbitPoints = new THREE.Points(orbitGeometry, orbitMaterial);
  globeGroup.add(orbitPoints);

  const starsGeometry = new THREE.BufferGeometry();
  const starPositions = new Float32Array(counts.stars * 3);
  const starSizes = new Float32Array(counts.stars);
  for (let i = 0; i < counts.stars; i += 1) {
    const radius = rand(80, 180);
    const theta = rand(0, Math.PI * 2);
    const phi = Math.acos(rand(-1, 1));
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);
    const i3 = i * 3;
    starPositions[i3] = x;
    starPositions[i3 + 1] = y;
    starPositions[i3 + 2] = z;
    starSizes[i] = rand(0.6, 1.9);
  }
  starsGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  starsGeometry.setAttribute("aSize", new THREE.BufferAttribute(starSizes, 1));
  const starsMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aSize;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (180.0 / max(9.0, -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        float alpha = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(0.72, 0.82, 1.0), alpha * 0.45);
      }
    `,
  });
  const stars = new THREE.Points(starsGeometry, starsMaterial);
  scene.add(stars);

  const auroraMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uBoost: { value: 0 },
    },
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.y += sin((uv.x * 10.0) + uTime * 0.4) * (1.4 + uv.y * 1.1);
        p.z += sin((uv.x * 21.0) + uTime * 0.7) * 0.9;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uBoost;
      varying vec2 vUv;
      void main() {
        float wave = sin((vUv.x * 34.0) + uTime * 1.3 + vUv.y * 11.0) * 0.5 + 0.5;
        float edge = smoothstep(0.02, 0.26, vUv.y) * (1.0 - smoothstep(0.66, 0.98, vUv.y));
        float alpha = edge * (0.18 + wave * 0.46) * (0.85 + uBoost * 0.35);
        vec3 c1 = vec3(0.20, 0.95, 0.58);
        vec3 c2 = vec3(0.24, 0.55, 1.0);
        vec3 c3 = vec3(0.72, 0.38, 1.0);
        vec3 color = mix(c1, c2, smoothstep(0.2, 0.8, vUv.x));
        color = mix(color, c3, smoothstep(0.5, 1.0, vUv.y));
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
  const auroraMesh = new THREE.Mesh(new THREE.PlaneGeometry(145, 40, 180, 44), auroraMaterial);
  auroraMesh.position.set(0, 24, -62);
  auroraMesh.rotation.x = -0.33;
  scene.add(auroraMesh);

  const snowGeometry = new THREE.BufferGeometry();
  const snowPositions = new Float32Array(counts.snow * 3);
  const snowVel = new Float32Array(counts.snow);
  const snowDrift = new Float32Array(counts.snow);
  const snowSize = new Float32Array(counts.snow);
  for (let i = 0; i < counts.snow; i += 1) {
    const i3 = i * 3;
    snowPositions[i3] = rand(-62, 62);
    snowPositions[i3 + 1] = rand(-38, 38);
    snowPositions[i3 + 2] = rand(-74, 24);
    snowVel[i] = rand(0.06, 0.22);
    snowDrift[i] = rand(0.25, 1);
    snowSize[i] = rand(1.6, 4.2);
  }
  snowGeometry.setAttribute("position", new THREE.BufferAttribute(snowPositions, 3));
  snowGeometry.setAttribute("aSize", new THREE.BufferAttribute(snowSize, 1));
  const snowMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aSize;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (250.0 / max(8.0, -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        float alpha = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(0.92, 0.96, 1.0), alpha * 0.85);
      }
    `,
  });
  const snowPoints = new THREE.Points(snowGeometry, snowMaterial);
  snowPoints.visible = false;
  scene.add(snowPoints);

  const rainDropCount = counts.rain;
  const rainGeometry = new THREE.BufferGeometry();
  const rainPositions = new Float32Array(rainDropCount * 2 * 3);
  const rainData = new Array(rainDropCount);
  for (let i = 0; i < rainDropCount; i += 1) {
    rainData[i] = {
      x: rand(-62, 62),
      y: rand(-36, 44),
      z: rand(-64, 24),
      len: rand(0.8, 2.8),
      speed: rand(0.45, 1.2),
      wind: rand(0.15, 0.65),
    };
  }

  function writeRainGeometry() {
    let p = 0;
    for (let i = 0; i < rainDropCount; i += 1) {
      const d = rainData[i];
      rainPositions[p] = d.x;
      rainPositions[p + 1] = d.y;
      rainPositions[p + 2] = d.z;
      p += 3;
      rainPositions[p] = d.x + d.wind * 0.7;
      rainPositions[p + 1] = d.y - d.len;
      rainPositions[p + 2] = d.z;
      p += 3;
    }
  }
  writeRainGeometry();
  rainGeometry.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3));
  const rainMaterial = new THREE.LineBasicMaterial({
    color: 0x8fd2ff,
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
  });
  const rainLines = new THREE.LineSegments(rainGeometry, rainMaterial);
  rainLines.visible = false;
  scene.add(rainLines);

  const splashCount = Math.floor(rainDropCount * 0.18);
  const splashGeometry = new THREE.BufferGeometry();
  const splashPositions = new Float32Array(splashCount * 3);
  const splashSize = new Float32Array(splashCount);
  const splashAlpha = new Float32Array(splashCount);
  const splashVel = new Float32Array(splashCount * 3);
  const splashLife = new Float32Array(splashCount);
  for (let i = 0; i < splashCount; i += 1) {
    splashPositions[i * 3 + 1] = -200;
    splashSize[i] = rand(1.4, 2.8);
    splashAlpha[i] = 0;
    splashLife[i] = 0;
  }
  splashGeometry.setAttribute("position", new THREE.BufferAttribute(splashPositions, 3));
  splashGeometry.setAttribute("aSize", new THREE.BufferAttribute(splashSize, 1));
  splashGeometry.setAttribute("aAlpha", new THREE.BufferAttribute(splashAlpha, 1));
  const splashMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aSize;
      attribute float aAlpha;
      varying float vAlpha;
      void main() {
        vAlpha = aAlpha;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (190.0 / max(8.0, -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        float alpha = smoothstep(0.5, 0.0, d) * vAlpha;
        gl_FragColor = vec4(vec3(0.80, 0.93, 1.0), alpha);
      }
    `,
  });
  const splashPoints = new THREE.Points(splashGeometry, splashMaterial);
  splashPoints.visible = false;
  scene.add(splashPoints);

  function spawnSplash(x, y, z, intensity = 1) {
    for (let i = 0; i < splashCount; i += 1) {
      if (splashLife[i] > 0.001) continue;
      splashPositions[i * 3] = x + rand(-0.35, 0.35);
      splashPositions[i * 3 + 1] = y + rand(-0.16, 0.06);
      splashPositions[i * 3 + 2] = z + rand(-0.3, 0.3);
      splashVel[i * 3] = rand(-0.08, 0.08) * intensity;
      splashVel[i * 3 + 1] = rand(0.08, 0.25) * intensity;
      splashVel[i * 3 + 2] = rand(-0.04, 0.04) * intensity;
      splashAlpha[i] = rand(0.46, 0.82);
      splashLife[i] = rand(0.2, 0.45);
      break;
    }
  }

  const fxState = {
    aurora: true,
    frost: true,
    snow: false,
    rain: false,
  };

  const fxKeys = ["aurora", "frost", "snow", "rain"];
  const urlFx = new URLSearchParams(window.location.search).get("fx");
  if (urlFx) {
    fxKeys.forEach((k) => {
      fxState[k] = false;
    });
    urlFx
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .forEach((k) => {
        if (k in fxState) fxState[k] = true;
      });
  }

  function applyFxState() {
    if (fxState.snow && fxState.rain) {
      fxState.rain = false;
    }
    auroraMesh.visible = fxState.aurora;
    snowPoints.visible = fxState.snow;
    rainLines.visible = fxState.rain;
    splashPoints.visible = fxState.rain;
    document.body.classList.toggle("fx-frost-enabled", fxState.frost);
    document.body.classList.toggle("fx-frost-disabled", !fxState.frost);
    if (fxPanel) {
      fxPanel.querySelectorAll(".fx-chip").forEach((chip) => {
        const fx = chip.getAttribute("data-fx");
        if (!fx) return;
        chip.classList.toggle("active", !!fxState[fx]);
      });
    }
  }

  if (fxPanel) {
    fxPanel.addEventListener("click", (event) => {
      const button = event.target.closest(".fx-chip");
      if (!button) return;
      const fx = button.getAttribute("data-fx");
      if (!fx || !(fx in fxState)) return;
      fxState[fx] = !fxState[fx];
      if (fx === "snow" && fxState.snow) fxState.rain = false;
      if (fx === "rain" && fxState.rain) fxState.snow = false;
      applyFxState();
    });
  }
  applyFxState();

  const pointer = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
  };
  let scrollBoost = 0;
  let autoSpin = 0;
  let lastScrollY = window.scrollY;
  let width = 0;
  let height = 0;

  function onPointerMove(clientX, clientY) {
    pointer.targetX = (clientX / Math.max(1, width)) * 2 - 1;
    pointer.targetY = -((clientY / Math.max(1, height)) * 2 - 1);
  }

  window.addEventListener(
    "mousemove",
    (event) => {
      onPointerMove(event.clientX, event.clientY);
    },
    { passive: true }
  );
  window.addEventListener(
    "touchmove",
    (event) => {
      if (!event.touches.length) return;
      const touch = event.touches[0];
      onPointerMove(touch.clientX, touch.clientY);
    },
    { passive: true }
  );

  window.addEventListener(
    "scroll",
    () => {
      const y = window.scrollY;
      const delta = y - lastScrollY;
      lastScrollY = y;
      scrollBoost = clamp(scrollBoost + Math.abs(delta) * 0.0028, 0, 2.6);
    },
    { passive: true }
  );

  window.addEventListener("keydown", (event) => {
    if (event.key === "1") {
      fxState.snow = !fxState.snow;
      if (fxState.snow) fxState.rain = false;
      applyFxState();
    } else if (event.key === "2") {
      fxState.rain = !fxState.rain;
      if (fxState.rain) fxState.snow = false;
      applyFxState();
    } else if (event.key === "3") {
      fxState.aurora = !fxState.aurora;
      applyFxState();
    } else if (event.key === "4") {
      fxState.frost = !fxState.frost;
      applyFxState();
    } else if (event.key === "0") {
      fxState.aurora = true;
      fxState.frost = true;
      fxState.snow = false;
      fxState.rain = false;
      applyFxState();
    }
  });

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    const isMobile = width < 860;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, isMobile ? 1.35 : 1.85);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height);
    composer.setSize(width, height);
    bloomPass.setSize(width, height);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();
    const delta = Math.min(clock.getDelta(), 0.033);
    const dtScale = delta * 60;

    pointer.x += (pointer.targetX - pointer.x) * 0.08;
    pointer.y += (pointer.targetY - pointer.y) * 0.08;
    scrollBoost *= 0.94;

    const boost = clamp(scrollBoost, 0, 2.8);
    const baseSpin = 0.003 + boost * 0.0038;
    autoSpin += baseSpin;

    const targetRotY = autoSpin + pointer.x * 0.55;
    const targetRotX = pointer.y * 0.35;
    globeGroup.rotation.y += (targetRotY - globeGroup.rotation.y) * 0.06;
    globeGroup.rotation.x += (targetRotX - globeGroup.rotation.x) * 0.06;

    const camTargetX = pointer.x * 2.6;
    const camTargetY = pointer.y * 1.9;
    const camTargetZ = 44 - Math.min(3.4, boost * 1.35);
    camera.position.x += (camTargetX - camera.position.x) * 0.055;
    camera.position.y += (camTargetY - camera.position.y) * 0.055;
    camera.position.z += (camTargetZ - camera.position.z) * 0.055;
    camera.lookAt(0, 0, -2);

    keyLight.position.x = Math.sin(elapsed * 0.42) * 27;
    keyLight.position.y = 18 + Math.cos(elapsed * 0.6) * 6;
    rimLight.position.x = -Math.cos(elapsed * 0.35) * 24;
    rimLight.position.y = -13 + Math.sin(elapsed * 0.55) * 5;

    const orbitPos = orbitGeometry.getAttribute("position");
    for (let i = 0; i < counts.orbit; i += 1) {
      orbitAngle[i] += orbitSpeed[i] * (1 + boost * 0.2) * dtScale;
      const i3 = i * 3;
      const radial = orbitRadius[i] + Math.sin(elapsed * 0.75 + orbitPhase[i]) * 0.5;
      orbitPositions[i3] = Math.cos(orbitAngle[i]) * radial;
      orbitPositions[i3 + 1] = Math.sin(orbitAngle[i] * 1.5 + orbitPhase[i]) * 2.5;
      orbitPositions[i3 + 2] = Math.sin(orbitAngle[i]) * radial;
    }
    orbitPos.needsUpdate = true;

    stars.rotation.y += 0.00035 + boost * 0.00015;
    stars.rotation.x = Math.sin(elapsed * 0.03) * 0.08;

    if (fxState.snow) {
      const snowPosAttr = snowGeometry.getAttribute("position");
      const wind = pointer.x * 0.45 + Math.sin(elapsed * 0.8) * 0.12;
      for (let i = 0; i < counts.snow; i += 1) {
        const i3 = i * 3;
        snowPositions[i3] += wind * snowDrift[i] * 0.08 * dtScale;
        snowPositions[i3 + 1] -= snowVel[i] * (1 + boost * 0.12) * dtScale;
        if (snowPositions[i3 + 1] < -40) {
          snowPositions[i3] = rand(-62, 62);
          snowPositions[i3 + 1] = rand(36, 44);
          snowPositions[i3 + 2] = rand(-74, 24);
        }
        if (snowPositions[i3] > 65) snowPositions[i3] = -65;
        if (snowPositions[i3] < -65) snowPositions[i3] = 65;
      }
      snowPosAttr.needsUpdate = true;
    }

    if (fxState.rain) {
      const rainPosAttr = rainGeometry.getAttribute("position");
      const splashPosAttr = splashGeometry.getAttribute("position");
      const splashAlphaAttr = splashGeometry.getAttribute("aAlpha");
      const wind = pointer.x * 0.85 + Math.sin(elapsed * 2.4) * 0.35;
      let p = 0;
      for (let i = 0; i < rainDropCount; i += 1) {
        const d = rainData[i];
        d.x += wind * d.wind * 0.08 * dtScale;
        d.y -= d.speed * (1 + boost * 0.24) * dtScale;

        if (d.y < -36) {
          spawnSplash(d.x, -35.4, d.z, 1 + boost * 0.15);
          d.x = rand(-62, 62);
          d.y = rand(34, 44);
          d.z = rand(-64, 24);
        }
        if (d.x > 66) d.x = -66;
        if (d.x < -66) d.x = 66;

        rainPositions[p] = d.x;
        rainPositions[p + 1] = d.y;
        rainPositions[p + 2] = d.z;
        p += 3;
        rainPositions[p] = d.x + (wind + d.wind) * 0.55;
        rainPositions[p + 1] = d.y - d.len;
        rainPositions[p + 2] = d.z;
        p += 3;
      }
      rainPosAttr.needsUpdate = true;

      for (let i = 0; i < splashCount; i += 1) {
        if (splashLife[i] <= 0) continue;
        splashLife[i] -= delta;
        const i3 = i * 3;
        splashVel[i3 + 1] -= 0.012 * dtScale;
        splashPositions[i3] += splashVel[i3] * dtScale;
        splashPositions[i3 + 1] += splashVel[i3 + 1] * dtScale;
        splashPositions[i3 + 2] += splashVel[i3 + 2] * dtScale;
        splashAlpha[i] = Math.max(0, splashLife[i] * 2.3);
        if (splashLife[i] <= 0) {
          splashPositions[i3 + 1] = -200;
          splashAlpha[i] = 0;
        }
      }
      splashPosAttr.needsUpdate = true;
      splashAlphaAttr.needsUpdate = true;
    }

    const frostStorm = clamp(
      0.18 +
        (fxState.rain ? 0.34 : 0) +
        (fxState.snow ? 0.14 : 0) +
        (fxState.aurora ? 0.08 : 0) +
        boost * 0.22,
      0,
      1
    );
    sceneEl.style.setProperty("--storm", frostStorm.toFixed(3));
    if (frostEl && !fxState.frost) {
      frostEl.style.opacity = "0";
    } else if (frostEl) {
      frostEl.style.opacity = "";
    }

    const shaderTime = elapsed * (1 + boost * 0.24);
    globeMaterial.uniforms.uTime.value = shaderTime;
    globeMaterial.uniforms.uBoost.value = boost;
    lineMaterial.uniforms.uTime.value = shaderTime;
    lineMaterial.uniforms.uBoost.value = boost;
    orbitMaterial.uniforms.uBoost.value = boost;
    shellSphere.material.uniforms.uTime.value = elapsed;
    auroraMaterial.uniforms.uTime.value = elapsed;
    auroraMaterial.uniforms.uBoost.value = boost * 0.6 + (fxState.aurora ? 0.18 : 0);

    bloomPass.strength = prefersReducedMotion ? 0.42 : 0.86 + boost * 0.26;
    bloomPass.radius = 0.86;
    bloomPass.threshold = 0.2;

    composer.render();
  }

  animate();
}

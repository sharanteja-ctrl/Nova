import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js";
import { EffectComposer } from "https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/postprocessing/UnrealBloomPass.js";

const winterSceneEl = document.getElementById("winterScene");
const mountEl = document.getElementById("winterGl");

if (!winterSceneEl || !mountEl) {
  console.warn("Winter background mount point not found.");
} else {

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  powerPreference: "high-performance",
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
mountEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x03060d, 0.015);

const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 320);
camera.position.set(0, 5.5, 36);
camera.lookAt(0, 0, -20);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.9, 0.18);
composer.addPass(bloomPass);

const raycaster = new THREE.Raycaster();
const pointerPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 12);
const pointerWorld = new THREE.Vector3();
const scratchVec2 = new THREE.Vector2();
const scratchVec2B = new THREE.Vector2();

const pointer = {
  ndc: new THREE.Vector2(0, 0),
  velocity: new THREE.Vector2(0, 0),
  active: false,
  lastTs: performance.now(),
  burstPower: 0,
};

const worldBounds = {
  x: 46,
  yTop: 34,
  yBottom: -30,
};

let currentWidth = 0;
let currentHeight = 0;
let stormStrength = 0;
let stormTarget = 0;
let nextStormToggleTs = performance.now() + 6000 + Math.random() * 6000;
let stormEndTs = 0;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function makeCircleTexture(size, innerColor, outerColor) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, innerColor);
  gradient.addColorStop(0.55, "rgba(255,255,255,0.85)");
  gradient.addColorStop(1, outerColor);

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildAuroraRibbon(seed = 0) {
  const geometry = new THREE.PlaneGeometry(126, 36, 190, 42);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uStorm: { value: 0 },
      uParallax: { value: new THREE.Vector2(0, 0) },
      uSeed: { value: seed },
    },
    vertexShader: `
      uniform float uTime;
      uniform vec2 uParallax;
      uniform float uSeed;
      varying vec2 vUv;
      varying float vWave;

      void main() {
        vUv = uv;
        vec3 p = position;
        float waveA = sin((uv.x * 11.0) + (uTime * 0.42) + uSeed);
        float waveB = sin((uv.x * 23.0) - (uv.y * 7.0) + (uTime * 0.24) + (uSeed * 0.7));
        float waveC = sin((uv.x * 5.0) + (uv.y * 14.0) + (uTime * 0.18) + (uSeed * 1.3));
        float wave = (waveA * 1.8) + (waveB * 0.9) + (waveC * 0.8);

        p.y += wave * (0.25 + uv.y * 0.9);
        p.z += sin((uv.x * 18.0) + (uTime * 0.56) + uSeed) * 0.9;
        p.x += uParallax.x * (2.2 + uv.y * 1.6);
        p.y += uParallax.y * 1.5;

        vWave = waveA * 0.5 + 0.5;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uStorm;
      uniform float uSeed;
      varying vec2 vUv;
      varying float vWave;

      void main() {
        float ripples = sin((vUv.x * 42.0) + (uTime * 1.6) + (vUv.y * 14.0) + uSeed) * 0.5 + 0.5;
        float shimmer = sin((vUv.x * 13.0) - (uTime * 0.4) + uSeed) * 0.5 + 0.5;
        float edgeFade = smoothstep(0.02, 0.26, vUv.y) * (1.0 - smoothstep(0.65, 0.98, vUv.y));
        float alpha = edgeFade * (0.25 + 0.55 * ripples) * (0.5 + 0.5 * shimmer) * (0.78 + 0.48 * uStorm);
        alpha *= (0.7 + vWave * 0.5);

        vec3 green = vec3(0.20, 0.96, 0.58);
        vec3 blue = vec3(0.23, 0.54, 1.0);
        vec3 purple = vec3(0.66, 0.35, 0.95);
        vec3 color = mix(green, blue, smoothstep(0.2, 0.82, vUv.x));
        color = mix(color, purple, smoothstep(0.48, 1.0, vUv.y));

        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 22, -58);
  mesh.rotation.x = -0.30;
  return mesh;
}

const auroraGroup = new THREE.Group();
const auroraPrimary = buildAuroraRibbon(0.0);
const auroraSecondary = buildAuroraRibbon(1.9);
auroraSecondary.scale.set(0.85, 0.88, 1);
auroraSecondary.position.set(-10, 19, -53);
auroraSecondary.rotation.z = 0.12;
auroraGroup.add(auroraPrimary, auroraSecondary);
scene.add(auroraGroup);

const moonTexture = makeCircleTexture(512, "rgba(245, 250, 255, 1)", "rgba(140, 175, 240, 0)");
if (moonTexture) {
  const moonCore = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: moonTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.72,
    })
  );
  moonCore.position.set(-26, 18, -70);
  moonCore.scale.set(19, 19, 1);
  scene.add(moonCore);

  const moonHalo = moonCore.clone();
  moonHalo.material = moonCore.material.clone();
  moonHalo.material.opacity = 0.32;
  moonHalo.scale.set(36, 36, 1);
  scene.add(moonHalo);
}

const snowVertexShader = `
  attribute float aSize;
  attribute float aAlpha;
  varying float vAlpha;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float perspective = 260.0 / max(10.0, -mvPosition.z);
    gl_PointSize = aSize * perspective;
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const snowFragmentShader = `
  varying float vAlpha;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float dist = length(uv);
    float soft = smoothstep(0.5, 0.0, dist);
    float core = smoothstep(0.3, 0.0, dist);
    vec3 color = mix(vec3(0.72, 0.85, 1.0), vec3(0.97, 0.99, 1.0), core);
    gl_FragColor = vec4(color, soft * vAlpha);
  }
`;

function createSnowLayer(config) {
  const geometry = new THREE.BufferGeometry();

  const positions = new Float32Array(config.count * 3);
  const sizes = new Float32Array(config.count);
  const alphas = new Float32Array(config.count);

  const baseFall = new Float32Array(config.count);
  const fallVelocity = new Float32Array(config.count);
  const gravity = new Float32Array(config.count);
  const drift = new Float32Array(config.count);
  const lateralVelocity = new Float32Array(config.count);
  const phase = new Float32Array(config.count);

  function resetParticle(index, fromTop = false) {
    const i3 = index * 3;
    positions[i3] = rand(-config.xSpread, config.xSpread);
    positions[i3 + 1] = fromTop ? rand(worldBounds.yTop, worldBounds.yTop + 16) : rand(worldBounds.yBottom, worldBounds.yTop);
    positions[i3 + 2] = rand(config.zMin, config.zMax);

    sizes[index] = rand(config.sizeMin, config.sizeMax);
    alphas[index] = rand(config.alphaMin, config.alphaMax);
    baseFall[index] = rand(config.fallMin, config.fallMax);
    fallVelocity[index] = baseFall[index];
    gravity[index] = rand(config.gravityMin, config.gravityMax);
    drift[index] = rand(config.driftMin, config.driftMax);
    lateralVelocity[index] = rand(-0.01, 0.01);
    phase[index] = rand(0, Math.PI * 2);
  }

  for (let i = 0; i < config.count; i += 1) {
    resetParticle(i, false);
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: snowVertexShader,
    fragmentShader: snowFragmentShader,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  return {
    points,
    geometry,
    positions,
    baseFall,
    fallVelocity,
    gravity,
    drift,
    lateralVelocity,
    phase,
    config,
    resetParticle,
  };
}

function createFogLayer(count) {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const alphas = new Float32Array(count);
  const speeds = new Float32Array(count);
  const phase = new Float32Array(count);
  const drift = new Float32Array(count);

  const geometry = new THREE.BufferGeometry();
  for (let i = 0; i < count; i += 1) {
    const i3 = i * 3;
    positions[i3] = rand(-58, 58);
    positions[i3 + 1] = rand(-24, 16);
    positions[i3 + 2] = rand(-95, -20);
    sizes[i] = rand(16, 42);
    alphas[i] = rand(0.05, 0.17);
    speeds[i] = rand(0.006, 0.02);
    phase[i] = rand(0, Math.PI * 2);
    drift[i] = rand(0.2, 0.6);
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: snowVertexShader,
    fragmentShader: `
      varying float vAlpha;

      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float dist = length(uv);
        float haze = smoothstep(0.5, 0.0, dist);
        vec3 color = vec3(0.44, 0.56, 0.78);
        gl_FragColor = vec4(color, haze * vAlpha);
      }
    `,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  return { points, geometry, positions, speeds, phase, drift };
}

function getSnowCount() {
  const areaScale = clamp((window.innerWidth * window.innerHeight) / (1920 * 1080), 0.58, 1.3);
  const mobileFactor = window.innerWidth < 860 ? 0.7 : 1;
  const reducedFactor = prefersReducedMotion ? 0.55 : 1;
  return Math.floor(3400 * areaScale * mobileFactor * reducedFactor);
}

const totalSnow = getSnowCount();
const snowLayers = [
  createSnowLayer({
    count: Math.floor(totalSnow * 0.46),
    xSpread: 56,
    zMin: -110,
    zMax: -34,
    sizeMin: 2.0,
    sizeMax: 3.6,
    alphaMin: 0.24,
    alphaMax: 0.55,
    fallMin: 0.06,
    fallMax: 0.14,
    gravityMin: 0.0005,
    gravityMax: 0.0012,
    driftMin: 0.25,
    driftMax: 0.55,
    pushRadius: 7,
    pushStrength: 0.10,
    wrapYExtra: 10,
    burstStep: 3,
  }),
  createSnowLayer({
    count: Math.floor(totalSnow * 0.34),
    xSpread: 52,
    zMin: -78,
    zMax: -8,
    sizeMin: 2.8,
    sizeMax: 5.2,
    alphaMin: 0.3,
    alphaMax: 0.66,
    fallMin: 0.1,
    fallMax: 0.24,
    gravityMin: 0.0007,
    gravityMax: 0.0018,
    driftMin: 0.36,
    driftMax: 0.9,
    pushRadius: 9,
    pushStrength: 0.14,
    wrapYExtra: 12,
    burstStep: 2,
  }),
  createSnowLayer({
    count: Math.floor(totalSnow * 0.2),
    xSpread: 46,
    zMin: -40,
    zMax: 20,
    sizeMin: 4.8,
    sizeMax: 8.2,
    alphaMin: 0.35,
    alphaMax: 0.78,
    fallMin: 0.18,
    fallMax: 0.42,
    gravityMin: 0.001,
    gravityMax: 0.0025,
    driftMin: 0.5,
    driftMax: 1.25,
    pushRadius: 12,
    pushStrength: 0.19,
    wrapYExtra: 14,
    burstStep: 1,
  }),
];

const fogLayer = createFogLayer(Math.floor(totalSnow * 0.08));

function updatePointerWorld() {
  raycaster.setFromCamera(pointer.ndc, camera);
  raycaster.ray.intersectPlane(pointerPlane, pointerWorld);
}

function updateStorm(now, dt) {
  if (now >= nextStormToggleTs) {
    if (stormTarget === 0) {
      stormTarget = 1;
      stormEndTs = now + rand(3500, 7200);
      nextStormToggleTs = stormEndTs + rand(5200, 12000);
    } else {
      stormTarget = 0;
      nextStormToggleTs = now + rand(6000, 12000);
    }
  }

  if (stormTarget === 1 && now > stormEndTs) {
    stormTarget = 0;
  }

  const blend = stormTarget > stormStrength ? 0.78 : 0.26;
  stormStrength += (stormTarget - stormStrength) * dt * blend;
  stormStrength = clamp(stormStrength, 0, 1);

  winterSceneEl.style.setProperty("--storm", stormStrength.toFixed(3));
}

function updateSnowLayer(layer, dtScale, wind, now) {
  const { positions, fallVelocity, gravity, baseFall, drift, lateralVelocity, phase, config } = layer;
  const positionAttr = layer.geometry.getAttribute("position");

  for (let i = 0; i < config.count; i += 1) {
    const i3 = i * 3;

    fallVelocity[i] += gravity[i] * dtScale * (1 + stormStrength * 0.8);
    const maxFall = baseFall[i] * (1.7 + stormStrength * 1.6);
    if (fallVelocity[i] > maxFall) {
      fallVelocity[i] = maxFall;
    }

    const targetWind = wind * drift[i];
    lateralVelocity[i] += (targetWind - lateralVelocity[i]) * (0.016 + stormStrength * 0.01) * dtScale;
    lateralVelocity[i] += Math.sin(now * 0.0014 + phase[i]) * 0.0008 * dtScale;

    if (pointer.active) {
      const dx = positions[i3] - pointerWorld.x;
      const dy = positions[i3 + 1] - pointerWorld.y;
      const distSq = dx * dx + dy * dy;
      const pushRadius = config.pushRadius + stormStrength * 1.8;
      const pushRadiusSq = pushRadius * pushRadius;

      if (distSq < pushRadiusSq) {
        const dist = Math.sqrt(distSq) || 1;
        const force = (pushRadius - dist) / pushRadius;
        const nx = dx / dist;
        const ny = dy / dist;
        const swirl = (-ny * pointer.velocity.x + nx * pointer.velocity.y) * 0.06;

        lateralVelocity[i] += nx * force * config.pushStrength + swirl * force;
        fallVelocity[i] = Math.max(baseFall[i] * 0.45, fallVelocity[i] - force * 0.12);
        positions[i3 + 1] += ny * force * 0.04;
      }
    }

    positions[i3] += lateralVelocity[i] * dtScale;
    positions[i3 + 1] -= fallVelocity[i] * dtScale * (1 + stormStrength * 0.24);

    if (positions[i3 + 1] < worldBounds.yBottom - config.wrapYExtra) {
      layer.resetParticle(i, true);
      continue;
    }

    if (positions[i3] > worldBounds.x + 8) {
      positions[i3] = -worldBounds.x - 8;
    } else if (positions[i3] < -worldBounds.x - 8) {
      positions[i3] = worldBounds.x + 8;
    }
  }

  positionAttr.needsUpdate = true;
  layer.points.rotation.z = pointer.ndc.x * 0.028;
  layer.points.rotation.x = -pointer.ndc.y * 0.012;
}

function updateFog(dtScale, now, wind) {
  const { positions, speeds, phase, drift, geometry } = fogLayer;
  const positionAttr = geometry.getAttribute("position");
  const count = speeds.length;

  for (let i = 0; i < count; i += 1) {
    const i3 = i * 3;
    positions[i3] += (wind * drift[i] * 0.12 + Math.sin(now * 0.0006 + phase[i]) * 0.008) * dtScale;
    positions[i3 + 1] += speeds[i] * dtScale;

    if (positions[i3 + 1] > 20) {
      positions[i3 + 1] = rand(-28, -18);
      positions[i3] = rand(-58, 58);
      positions[i3 + 2] = rand(-95, -20);
    }

    if (positions[i3] > 62) positions[i3] = -62;
    if (positions[i3] < -62) positions[i3] = 62;
  }

  positionAttr.needsUpdate = true;
}

function triggerBurst(ndcX, ndcY, power = 1) {
  pointer.ndc.set(ndcX, ndcY);
  updatePointerWorld();

  for (const layer of snowLayers) {
    const { config, positions, lateralVelocity, fallVelocity, baseFall } = layer;
    const radius = 7 + power * 7 + config.pushRadius * 0.3;
    const radiusSq = radius * radius;

    for (let i = 0; i < config.count; i += config.burstStep) {
      const i3 = i * 3;
      const dx = positions[i3] - pointerWorld.x;
      const dy = positions[i3 + 1] - pointerWorld.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > radiusSq) {
        continue;
      }

      const dist = Math.sqrt(distSq) || 1;
      const force = ((radius - dist) / radius) * power;
      const nx = dx / dist;
      const ny = dy / dist;

      lateralVelocity[i] += nx * force * 0.9 + rand(-0.08, 0.08);
      fallVelocity[i] = Math.max(baseFall[i] * 0.4, fallVelocity[i] - force * 0.2);
      positions[i3 + 1] += ny * force * 0.35;
      positions[i3 + 2] += rand(-0.4, 0.4) * force;
    }
  }

  pointer.burstPower = Math.min(1.4, pointer.burstPower + 0.65 * power);
}

function onPointerMove(clientX, clientY) {
  const now = performance.now();
  const nx = (clientX / currentWidth) * 2 - 1;
  const ny = -(clientY / currentHeight) * 2 + 1;
  const dt = Math.max(8, now - pointer.lastTs);

  pointer.velocity.x = (nx - pointer.ndc.x) * (28 / dt);
  pointer.velocity.y = (ny - pointer.ndc.y) * (28 / dt);
  pointer.ndc.set(nx, ny);
  pointer.lastTs = now;
  pointer.active = true;
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

window.addEventListener("mouseleave", () => {
  pointer.active = false;
});

window.addEventListener("click", (event) => {
  const nx = (event.clientX / currentWidth) * 2 - 1;
  const ny = -(event.clientY / currentHeight) * 2 + 1;
  triggerBurst(nx, ny, 1.05);
});

window.addEventListener(
  "touchstart",
  (event) => {
    if (!event.touches.length) return;
    const touch = event.touches[0];
    const nx = (touch.clientX / currentWidth) * 2 - 1;
    const ny = -(touch.clientY / currentHeight) * 2 + 1;
    triggerBurst(nx, ny, 0.95);
  },
  { passive: true }
);

function resize() {
  currentWidth = window.innerWidth;
  currentHeight = window.innerHeight;

  camera.aspect = currentWidth / currentHeight;
  camera.updateProjectionMatrix();

  const mobile = currentWidth < 860;
  const pxRatio = Math.min(window.devicePixelRatio || 1, mobile ? 1.35 : 1.8);
  renderer.setPixelRatio(pxRatio);
  renderer.setSize(currentWidth, currentHeight);

  composer.setSize(currentWidth, currentHeight);
  bloomPass.setSize(currentWidth, currentHeight);
}

window.addEventListener("resize", resize);
resize();

const clock = new THREE.Clock();

function animate(now) {
  requestAnimationFrame(animate);

  const dt = Math.min(0.034, clock.getDelta());
  const dtScale = dt * 60;

  if (performance.now() - pointer.lastTs > 1200) {
    pointer.active = false;
  }

  pointer.velocity.multiplyScalar(0.92);
  pointer.burstPower *= 0.9;

  updateStorm(now, dt);
  updatePointerWorld();

  const stormWind = (Math.sin(now * 0.0032) * 0.5 + 1.15) * stormStrength * 2.4;
  const calmWind = Math.sin(now * 0.00025) * 0.28;
  const pointerWind = pointer.velocity.x * 4.2 + pointer.burstPower * 0.75;
  const wind = calmWind + stormWind + pointerWind;

  for (const layer of snowLayers) {
    updateSnowLayer(layer, dtScale, wind, now);
  }
  updateFog(dtScale, now, wind);

  const parallaxX = pointer.ndc.x * 0.85;
  const parallaxY = pointer.ndc.y * 0.46;
  scratchVec2.set(parallaxX, parallaxY);

  auroraPrimary.material.uniforms.uTime.value = now * 0.001;
  auroraPrimary.material.uniforms.uStorm.value = stormStrength;
  auroraPrimary.material.uniforms.uParallax.value.lerp(scratchVec2, 0.08);

  auroraSecondary.material.uniforms.uTime.value = now * 0.001 + 1.7;
  auroraSecondary.material.uniforms.uStorm.value = stormStrength * 0.9;
  scratchVec2B.copy(scratchVec2).multiplyScalar(0.75);
  auroraSecondary.material.uniforms.uParallax.value.lerp(scratchVec2B, 0.08);

  auroraGroup.position.x += (pointer.ndc.x * 2.2 - auroraGroup.position.x) * 0.03;
  auroraGroup.position.y += (pointer.ndc.y * 0.8 - auroraGroup.position.y) * 0.03;
  auroraGroup.rotation.z += (pointer.ndc.x * 0.08 - auroraGroup.rotation.z) * 0.03;

  bloomPass.strength = 0.84 + stormStrength * 0.34;
  bloomPass.radius = 0.84;
  bloomPass.threshold = 0.17;

  composer.render();
}

requestAnimationFrame(animate);
}

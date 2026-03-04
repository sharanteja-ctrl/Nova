import * as THREE from "https://unpkg.com/three@0.162.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.162.0/examples/jsm/controls/OrbitControls.js";

const canvas = document.getElementById("bgCanvas");
if (!canvas) {
  throw new Error("Background canvas not found.");
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 120);
camera.position.set(0, 2.4, 12.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableZoom = false;
controls.enablePan = false;
controls.enableRotate = false;
controls.enableDamping = true;
controls.dampingFactor = 0.055;

const waveGroup = new THREE.Group();
scene.add(waveGroup);

let waveData = null;
let mouseTargetX = 0;
let mouseTargetY = 0;
let smoothTargetX = 0;
let smoothTargetY = 0;

function buildWaveSystem() {
  if (waveData) {
    waveGroup.remove(waveData.points);
    waveGroup.remove(waveData.lines);
    waveData.points.geometry.dispose();
    waveData.points.material.dispose();
    waveData.lines.geometry.dispose();
    waveData.lines.material.dispose();
  }

  const mobile = window.innerWidth < 760;
  const segX = mobile ? 105 : 160;
  const segZ = mobile ? 62 : 92;
  const width = mobile ? 16 : 21;
  const depth = mobile ? 9.5 : 12.5;

  const count = segX * segZ;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 2);
  const base = new Float32Array(count * 2);

  const xStep = width / (segX - 1);
  const zStep = depth / (segZ - 1);

  let ptr = 0;
  for (let zi = 0; zi < segZ; zi += 1) {
    for (let xi = 0; xi < segX; xi += 1) {
      const x = -width / 2 + xi * xStep;
      const z = -depth / 2 + zi * zStep;

      positions[ptr * 3] = x;
      positions[ptr * 3 + 1] = 0;
      positions[ptr * 3 + 2] = z;

      base[ptr * 2] = x;
      base[ptr * 2 + 1] = z;
      seeds[ptr * 2] = Math.random() * Math.PI * 2;
      seeds[ptr * 2 + 1] = Math.random() * 0.9 + 0.65;
      ptr += 1;
    }
  }

  const pointsGeo = new THREE.BufferGeometry();
  pointsGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const pointsMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: mobile ? 0.033 : 0.028,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(pointsGeo, pointsMat);

  const lineVerts = [];
  const addIndexLine = (a, b) => {
    const ax = positions[a * 3];
    const ay = positions[a * 3 + 1];
    const az = positions[a * 3 + 2];
    const bx = positions[b * 3];
    const by = positions[b * 3 + 1];
    const bz = positions[b * 3 + 2];
    lineVerts.push(ax, ay, az, bx, by, bz);
  };

  for (let zi = 0; zi < segZ; zi += 1) {
    for (let xi = 0; xi < segX; xi += 1) {
      const index = zi * segX + xi;
      if (xi < segX - 1) {
        addIndexLine(index, index + 1);
      }
      if (zi < segZ - 1 && xi % 2 === 0) {
        addIndexLine(index, index + segX);
      }
    }
  }

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(lineVerts), 3));

  const lineMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.09,
    depthWrite: false,
  });

  const lines = new THREE.LineSegments(lineGeo, lineMat);

  waveGroup.add(lines);
  waveGroup.add(points);

  waveGroup.position.set(0, -1.75, -1.8);
  waveGroup.rotation.x = -0.66;

  waveData = {
    segX,
    segZ,
    positions,
    base,
    seeds,
    points,
    lines,
  };
}

function updateWave(timeSec) {
  if (!waveData) return;

  const { positions, base, seeds, points, lines } = waveData;
  const total = positions.length / 3;

  for (let i = 0; i < total; i += 1) {
    const x = base[i * 2];
    const z = base[i * 2 + 1];
    const phase = seeds[i * 2];
    const speed = seeds[i * 2 + 1];

    const ridgeA = Math.sin(x * 0.95 + timeSec * speed + phase) * 0.21;
    const ridgeB = Math.cos(z * 1.25 + timeSec * speed * 0.82 + phase * 0.6) * 0.18;
    const ridgeC = Math.sin((x + z) * 0.55 + timeSec * 0.9 + phase * 0.9) * 0.14;

    positions[i * 3 + 1] = ridgeA + ridgeB + ridgeC;
  }

  points.geometry.attributes.position.needsUpdate = true;

  // Keep line vertices synced to updated point heights.
  const linePos = lines.geometry.attributes.position.array;
  for (let i = 0; i < linePos.length; i += 3) {
    const x = linePos[i];
    const z = linePos[i + 2];
    const y =
      Math.sin(x * 0.95 + timeSec * 0.95) * 0.21 +
      Math.cos(z * 1.25 + timeSec * 0.82) * 0.18 +
      Math.sin((x + z) * 0.55 + timeSec * 0.9) * 0.14;
    linePos[i + 1] = y;
  }
  lines.geometry.attributes.position.needsUpdate = true;
}

function setPointerTarget(clientX, clientY) {
  const nx = clientX / window.innerWidth - 0.5;
  const ny = clientY / window.innerHeight - 0.5;
  mouseTargetY = nx * 0.42;
  mouseTargetX = ny * 0.28;
}

window.addEventListener("mousemove", (event) => {
  setPointerTarget(event.clientX, event.clientY);
}, { passive: true });

window.addEventListener("touchmove", (event) => {
  if (!event.touches.length) return;
  const touch = event.touches[0];
  setPointerTarget(touch.clientX, touch.clientY);
}, { passive: true });

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  buildWaveSystem();
}
window.addEventListener("resize", onResize);

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  updateWave(t);

  smoothTargetX += (mouseTargetX - smoothTargetX) * 0.045;
  smoothTargetY += (mouseTargetY - smoothTargetY) * 0.045;

  waveGroup.rotation.y = smoothTargetY + Math.sin(t * 0.16) * 0.05;
  waveGroup.rotation.x = -0.66 + smoothTargetX + Math.cos(t * 0.11) * 0.012;

  controls.update();
  renderer.render(scene, camera);
}

buildWaveSystem();
animate();

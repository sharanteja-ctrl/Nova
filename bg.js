import * as THREE from "https://unpkg.com/three@0.162.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.162.0/examples/jsm/controls/OrbitControls.js";

const canvas = document.getElementById("bgCanvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x03030a, 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03030a);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 120);
camera.position.set(0, 0, 9);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableZoom = false;
controls.enablePan = false;
controls.enableRotate = false;
controls.enableDamping = true;
controls.dampingFactor = 0.06;

const radius = 3.2;
const pointCount = window.innerWidth > 1100 ? 1200 : window.innerWidth > 700 ? 880 : 520;

// Generate evenly distributed points on a sphere (Fibonacci sphere)
function generatePoints(count, r) {
  const positions = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i / (count - 1)) * 2;
    const radiusAtY = Math.sqrt(1 - y * y);
    const theta = golden * i;
    const x = Math.cos(theta) * radiusAtY;
    const z = Math.sin(theta) * radiusAtY;
    positions.push(x * r, y * r, z * r);
  }
  return new Float32Array(positions);
}

const pointPositions = generatePoints(pointCount, radius);
const pointsGeo = new THREE.BufferGeometry();
pointsGeo.setAttribute("position", new THREE.BufferAttribute(pointPositions, 3));

const neonBlue = new THREE.Color(0x4de2ff);
const neonCyan = new THREE.Color(0x7ae0ff);
const neonPurple = new THREE.Color(0x7c5bff);

const pointsMat = new THREE.PointsMaterial({
  color: neonCyan,
  size: 0.032,
  sizeAttenuation: true,
  transparent: true,
  opacity: 0.95,
  blending: THREE.AdditiveBlending,
});
const points = new THREE.Points(pointsGeo, pointsMat);

const haloMat = new THREE.PointsMaterial({
  color: neonBlue,
  size: 0.08,
  sizeAttenuation: true,
  transparent: true,
  opacity: 0.18,
  blending: THREE.AdditiveBlending,
});
const halo = new THREE.Points(pointsGeo.clone(), haloMat);

// Build line segments between nearby points
function buildLines(positions, threshold = 0.58, maxPerPoint = 4) {
  const verts = [];
  const len = positions.length / 3;
  for (let i = 0; i < len; i += 1) {
    const ix = positions[i * 3];
    const iy = positions[i * 3 + 1];
    const iz = positions[i * 3 + 2];
    let connections = 0;
    for (let j = i + 1; j < len; j += 1) {
      if (connections >= maxPerPoint) break;
      const jx = positions[j * 3];
      const jy = positions[j * 3 + 1];
      const jz = positions[j * 3 + 2];
      const dx = ix - jx;
      const dy = iy - jy;
      const dz = iz - jz;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < threshold) {
        verts.push(ix, iy, iz, jx, jy, jz);
        connections += 1;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
  return geo;
}

const lineGeo = buildLines(pointPositions, 0.65, 4);
const lineMat = new THREE.LineBasicMaterial({
  color: neonPurple,
  transparent: true,
  opacity: 0.22,
  blending: THREE.AdditiveBlending,
});
const lines = new THREE.LineSegments(lineGeo, lineMat);

// Starfield / floating particles
function buildStars(count = 900, spread = 26) {
  const positions = [];
  for (let i = 0; i < count; i += 1) {
    positions.push(
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  const mat = new THREE.PointsMaterial({
    color: 0x5acbff,
    size: 0.02,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

const stars = buildStars();

const group = new THREE.Group();
group.add(points);
group.add(halo);
group.add(lines);
scene.add(stars);
scene.add(group);

let desiredX = 0;
let desiredY = 0;
let smoothX = 0;
let smoothY = 0;
let autoY = 0;

function handlePointer(x, y) {
  const nx = (x / window.innerWidth) - 0.5;
  const ny = (y / window.innerHeight) - 0.5;
  desiredY = nx * 1.3; // yaw
  desiredX = ny * 0.9; // pitch
}

window.addEventListener("mousemove", (e) => handlePointer(e.clientX, e.clientY), { passive: true });
window.addEventListener("touchmove", (e) => {
  if (!e.touches.length) return;
  const t = e.touches[0];
  handlePointer(t.clientX, t.clientY);
}, { passive: true });

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener("resize", onResize);

function animate() {
  requestAnimationFrame(animate);

  smoothX += (desiredX - smoothX) * 0.06;
  smoothY += (desiredY - smoothY) * 0.06;
  autoY += 0.0032; // idle spin

  group.rotation.x = smoothX;
  group.rotation.y = autoY + smoothY;
  stars.rotation.y += 0.0008;

  controls.update();
  renderer.render(scene, camera);
}

animate();

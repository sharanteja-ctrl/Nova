import * as THREE from "https://unpkg.com/three@0.162.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.162.0/examples/jsm/controls/OrbitControls.js";

const canvas = document.getElementById("bgCanvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableZoom = false;
controls.enablePan = false;
controls.enableRotate = false;
controls.enableDamping = true;
controls.dampingFactor = 0.06;

const radius = 3;
const segments = 44;
const sphereGeo = new THREE.SphereGeometry(radius, segments, segments);

const pointsMat = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 0.035,
  sizeAttenuation: true,
  transparent: true,
  opacity: 0.9,
});
const points = new THREE.Points(sphereGeo, pointsMat);

const haloMat = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 0.08,
  sizeAttenuation: true,
  transparent: true,
  opacity: 0.12,
  blending: THREE.AdditiveBlending,
});
const halo = new THREE.Points(sphereGeo.clone(), haloMat);

const wireGeo = new THREE.WireframeGeometry(sphereGeo);
const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 });
const lines = new THREE.LineSegments(wireGeo, lineMat);

const group = new THREE.Group();
group.add(points);
group.add(halo);
group.add(lines);
scene.add(group);

let desiredX = 0;
let desiredY = 0;
let smoothX = 0;
let smoothY = 0;
let autoY = 0;

function handleMouseMove(event) {
  const nx = (event.clientX / window.innerWidth) - 0.5;
  const ny = (event.clientY / window.innerHeight) - 0.5;
  desiredY = nx * 1.2; // yaw
  desiredX = ny * 0.8; // pitch
}

window.addEventListener("mousemove", handleMouseMove, { passive: true });
window.addEventListener("touchmove", (event) => {
  if (!event.touches.length) return;
  const touch = event.touches[0];
  handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
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
  autoY += 0.003; // idle spin

  group.rotation.x = smoothX;
  group.rotation.y = autoY + smoothY;

  controls.update();
  renderer.render(scene, camera);
}

animate();

(() => {
  const canvas = document.getElementById("rainCanvas");
  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  let width = 0;
  let height = 0;
  let dpr = 1;
  let lastTs = performance.now();

  const pointer = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
  };

  const streaks = [];
  const drops = [];
  const foregroundDrops = [];

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function setSize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const streakCount = width < 760 ? 120 : 210;
    const dropCount = width < 760 ? 120 : 220;
    const foregroundCount = width < 760 ? 26 : 42;

    streaks.length = 0;
    drops.length = 0;
    foregroundDrops.length = 0;

    for (let i = 0; i < streakCount; i += 1) {
      streaks.push({
        x: rand(0, width),
        y: rand(-height, height),
        len: rand(8, 24),
        speed: rand(280, 540),
        alpha: rand(0.08, 0.28),
        drift: rand(-18, 18),
      });
    }

    for (let i = 0; i < dropCount; i += 1) {
      drops.push({
        x: rand(0, width),
        y: rand(0, height),
        r: rand(0.8, 2.4),
        speed: rand(16, 38),
        wobble: rand(0.8, 2.2),
        phase: rand(0, Math.PI * 2),
        alpha: rand(0.08, 0.24),
      });
    }

    for (let i = 0; i < foregroundCount; i += 1) {
      foregroundDrops.push({
        x: rand(0, width),
        y: rand(-height * 0.2, height),
        r: rand(2.2, 5.5),
        speed: rand(30, 66),
        phase: rand(0, Math.PI * 2),
        wobble: rand(0.7, 1.9),
        alpha: rand(0.18, 0.36),
      });
    }

    pointer.x = width * 0.5;
    pointer.y = height * 0.5;
    pointer.targetX = pointer.x;
    pointer.targetY = pointer.y;
  }

  function drawDrop(x, y, radius, alpha) {
    const grad = ctx.createRadialGradient(x - radius * 0.5, y - radius * 0.5, 0, x, y, radius * 2.3);
    grad.addColorStop(0, `rgba(220, 245, 255, ${alpha})`);
    grad.addColorStop(0.45, `rgba(160, 215, 230, ${alpha * 0.45})`);
    grad.addColorStop(1, "rgba(120, 180, 205, 0)");

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius * 2.1, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLargeDrop(x, y, radius, alpha) {
    const core = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.45, 0, x, y, radius * 2.8);
    core.addColorStop(0, `rgba(230, 248, 255, ${alpha})`);
    core.addColorStop(0.35, `rgba(188, 228, 242, ${alpha * 0.62})`);
    core.addColorStop(1, "rgba(120, 175, 200, 0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(x, y, radius * 2.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.32})`;
    ctx.beginPath();
    ctx.arc(x - radius * 0.42, y - radius * 0.34, radius * 0.52, 0, Math.PI * 2);
    ctx.fill();
  }

  function animate(ts) {
    requestAnimationFrame(animate);

    const dt = Math.min(0.034, (ts - lastTs) / 1000);
    lastTs = ts;

    pointer.x += (pointer.targetX - pointer.x) * 0.12;
    pointer.y += (pointer.targetY - pointer.y) * 0.12;

    const parallaxX = (pointer.x - width * 0.5) * 0.028;
    const parallaxY = (pointer.y - height * 0.5) * 0.022;
    const wind = (pointer.x - width * 0.5) * 0.00012;

    ctx.clearRect(0, 0, width, height);

    // Rain streaks
    ctx.lineCap = "round";
    for (const s of streaks) {
      s.y += s.speed * dt;
      s.x += (s.drift + wind * 420) * dt;

      if (s.y > height + s.len) {
        s.y = -rand(20, height * 0.35);
        s.x = rand(0, width);
      }
      if (s.x < -10) s.x = width + 10;
      if (s.x > width + 10) s.x = -10;

      const x = s.x + parallaxX;
      const y = s.y + parallaxY;

      ctx.strokeStyle = `rgba(196, 236, 248, ${s.alpha})`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(x, y - s.len);
      ctx.lineTo(x + 1.2, y);
      ctx.stroke();
    }

    // Beads on glass
    for (const d of drops) {
      d.phase += d.wobble * dt;
      d.y += d.speed * dt * 0.14;
      d.x += Math.sin(d.phase) * 0.12 + wind * 40;

      if (d.y > height + 8) {
        d.y = -rand(4, 120);
        d.x = rand(0, width);
      }

      drawDrop(d.x + parallaxX * 0.5, d.y + parallaxY * 0.5, d.r, d.alpha);
    }

    // Foreground cinematic drops (larger, slower, stronger parallax)
    for (const d of foregroundDrops) {
      d.phase += d.wobble * dt;
      d.y += d.speed * dt * 0.1;
      d.x += Math.sin(d.phase) * 0.18 + wind * 76;

      if (d.y > height + 18) {
        d.y = -rand(10, 140);
        d.x = rand(0, width);
      }
      if (d.x < -18) d.x = width + 18;
      if (d.x > width + 18) d.x = -18;

      drawLargeDrop(
        d.x + parallaxX * 0.78,
        d.y + parallaxY * 0.72,
        d.r,
        d.alpha
      );
    }
  }

  window.addEventListener(
    "mousemove",
    (event) => {
      pointer.targetX = event.clientX;
      pointer.targetY = event.clientY;
    },
    { passive: true }
  );

  window.addEventListener(
    "touchmove",
    (event) => {
      if (!event.touches.length) return;
      pointer.targetX = event.touches[0].clientX;
      pointer.targetY = event.touches[0].clientY;
    },
    { passive: true }
  );

  window.addEventListener("resize", setSize);

  setSize();
  requestAnimationFrame(animate);
})();

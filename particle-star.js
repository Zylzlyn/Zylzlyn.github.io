(() => {
  // ================= 1. Three.js 场景初始化 =================
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.012);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('canvas'), antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // 相机轨道参数
  let radius = 18;
  let theta = 0;
  let phi = Math.PI / 2.5;
  const MIN_RADIUS = 9;
  const MAX_RADIUS = 35;
  let zoomVelocity = 0;

  function updateCamera() {
    camera.position.x = radius * Math.sin(phi) * Math.cos(theta);
    camera.position.y = radius * Math.cos(phi);
    camera.position.z = radius * Math.sin(phi) * Math.sin(theta);
    camera.lookAt(0, 0, 0);
  }

  // ================= 2. 粉蓝色粒子星球 =================
  const PLANET_RADIUS = 5;
  const PARTICLE_COUNT = 22000;
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const colors = new Float32Array(PARTICLE_COUNT * 3);
  const sizes = new Float32Array(PARTICLE_COUNT);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const u = Math.random();
    const v = Math.random();
    const thetaP = 2 * Math.PI * u;
    const phiP = Math.acos(2 * v - 1);
    const rOffset = (Math.random() + Math.random() + Math.random() - 1.5) * 0.7;
    const r = PLANET_RADIUS + rOffset;

    positions[i * 3] = r * Math.sin(phiP) * Math.cos(thetaP);
    positions[i * 3 + 1] = r * Math.sin(phiP) * Math.sin(thetaP);
    positions[i * 3 + 2] = r * Math.cos(phiP);

    // 粉蓝色渐变 (hue 0.55=蓝 ~ 0.92=粉)
    const hue = 0.55 + Math.random() * 0.37;
    const sat = 0.75 + Math.random() * 0.25;
    const light = 0.5 + Math.random() * 0.4;
    const c = new THREE.Color().setHSL(hue, sat, light);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;

    sizes[i] = 0.06 + Math.random() * 0.14;
  }

  const planetGeo = new THREE.BufferGeometry();
  planetGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  planetGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  planetGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const planetMat = new THREE.PointsMaterial({
    size: 0.14,
    vertexColors: true,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const planet = new THREE.Points(planetGeo, planetMat);
  scene.add(planet);

  // ================= 3. 两层白色环绕星环 =================
  function createRing(radius, count, tiltX, tiltZ) {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const r = radius + (Math.random() - 0.5) * 0.35;
      pos[i * 3] = r * Math.cos(angle);
      pos[i * 3 + 1] = (Math.random() - 0.5) * 0.12;
      pos[i * 3 + 2] = r * Math.sin(angle);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.055,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const ring = new THREE.Points(geo, mat);
    ring.rotation.x = tiltX;
    ring.rotation.z = tiltZ;
    return ring;
  }

  scene.add(createRing(7.8, 3200, 0.28, 0.12));
  scene.add(createRing(9.5, 3800, -0.18, 0.38));

  // 背景星空
  const starCount = 4000;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 60 + Math.random() * 120;
    const t = Math.random() * Math.PI * 2;
    const p = Math.acos(2 * Math.random() - 1);
    starPos[i * 3] = r * Math.sin(p) * Math.cos(t);
    starPos[i * 3 + 1] = r * Math.sin(p) * Math.sin(t);
    starPos[i * 3 + 2] = r * Math.cos(p);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.08, sizeAttenuation: true })));

  // ================= 4. MediaPipe 手势控制 =================
  const videoElement = document.getElementById('webcam');
  const statusEl = document.getElementById('status');

  const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.75,
    minTrackingConfidence: 0.75
  });

  let prevHandSize = 0;
  let prevAngle = 0;
  let isTracking = false;

  function getHandSize(lm) {
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    for (const p of lm) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    return Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2);
  }

  function getExtendedFingers(lm) {
    const wrist = lm[0];
    const tips = [4, 8, 12, 16, 20];
    const bases = [2, 5, 9, 13, 17];
    let count = 0;
    for (let i = 0; i < 5; i++) {
      const tip = lm[tips[i]];
      const base = lm[bases[i]];
      const dTip = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
      const dBase = Math.hypot(base.x - wrist.x, base.y - wrist.y);
      if (dTip > dBase * 1.15) count++;
    }
    return count;
  }

  hands.onResults((results) => {
    if (!statusEl.dataset.ready) {
      statusEl.dataset.ready = '1';
    }

    if (results.multiHandLandmarks?.length) {
      isTracking = true;
      const lm = results.multiHandLandmarks[0];
      const currentSize = getHandSize(lm);
      const extended = getExtendedFingers(lm);
      const isOpen = extended >= 4;
      const isFist = extended <= 1;

      // 1. 旋转控制 (手腕 -> 中指MCP 向量角度)
      const dx = lm[9].x - lm[0].x;
      const dy = lm[9].y - lm[0].y;
      const angle = Math.atan2(dx, -dy);
      let delta = angle - prevAngle;
      if (delta > Math.PI) delta -= 2 * Math.PI;
      if (delta < -Math.PI) delta += 2 * Math.PI;
      theta += delta * 3.5;

      // 2. 距离控制 (透视大小变化率)
      const sizeDelta = currentSize - prevHandSize;

      if (isFist && sizeDelta < -0.006) {
        zoomVelocity += 0.045;
        radius += zoomVelocity;
      } else if (isOpen && sizeDelta > 0.006) {
        const distToMin = radius - MIN_RADIUS;
        zoomVelocity = Math.max(0.03, distToMin * 0.14) * (sizeDelta * 9);
        radius -= zoomVelocity;
      } else {
        zoomVelocity *= 0.88;
      }

      radius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, radius));
      prevHandSize = currentSize;
      prevAngle = angle;
    } else {
      isTracking = false;
      zoomVelocity *= 0.92;
    }
  });

  // 启动摄像头
  const cameraUtils = new Camera(videoElement, {
    onFrame: async () => { await hands.send({ image: videoElement }); },
    width: 640,
    height: 480
  });

  cameraUtils.start().catch(err => {
    statusEl.textContent = '❌ 摄像头拒绝: ' + err.message;
    console.error(err);
  });

  // ================= 5. 渲染循环 =================
  function animate() {
    requestAnimationFrame(animate);
    updateCamera();
    planet.rotation.y += 0.0015;
    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
})();
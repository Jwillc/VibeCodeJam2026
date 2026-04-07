import * as THREE from 'three';

// ── Pixel art helpers for HUD ──────────────────────────────────────
function drawPixelHeart() {
    const c = document.getElementById('heart');
    const ctx = c.getContext('2d');
    const s = 2;
    const heart = [
        "  ##  ##  ",
        " ########",
        " ########",
        " ########",
        "  ###### ",
        "  ###### ",
        "   ####  ",
        "   ####  ",
        "    ##   ",
    ];
    ctx.fillStyle = '#e0245e';
    heart.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
            if (row[x] === '#') ctx.fillRect(x * s + 2, y * s + 2, s, s);
        }
    });
}

function drawPixelGun() {
    const c = document.getElementById('gun-icon');
    const ctx = c.getContext('2d');
    const s = 2;
    const gun = [
        "      ####    ",
        "   #########  ",
        "  ###########",
        "  ###########",
        "  ########## ",
        "  #########  ",
        "   ##  ###   ",
        "   ##  ##    ",
        "   ##        ",
        "  ###        ",
        "  ##         ",
    ];
    ctx.fillStyle = '#ffffff';
    gun.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
            if (row[x] === '#') ctx.fillRect(x * s, y * s, s, s);
        }
    });
}

drawPixelHeart();
drawPixelGun();

// ── Scene setup ────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd4d4d8);
scene.fog = new THREE.Fog(0xd4d4d8, 30, 80);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
const CAM_OFFSET = new THREE.Vector3(0, 6, 18); // offset from player
camera.position.set(0, 6, 18);
camera.lookAt(0, 2, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

// ── Vignette (screen-space overlay) ────────────────────────────────
const vignetteScene = new THREE.Scene();
const vignetteCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const vignetteMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
        varying vec2 vUv;
        void main(){
            vec2 center = vUv - 0.5;
            float dist = length(center) * 1.5;
            float vig = smoothstep(0.2, 1.1, dist);
            gl_FragColor = vec4(0.0, 0.0, 0.0, vig * 0.7);
        }
    `
});
const vignetteQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), vignetteMat);
vignetteScene.add(vignetteQuad);

// ── Lighting ───────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 15, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 60;
dirLight.shadow.camera.left = -30;
dirLight.shadow.camera.right = 30;
dirLight.shadow.camera.top = 20;
dirLight.shadow.camera.bottom = -10;
scene.add(dirLight);

// ── Materials ──────────────────────────────────────────────────────
const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
const groundMat = new THREE.MeshStandardMaterial({ color: 0x7a8a5a, roughness: 0.9 });
const groundSideMat = new THREE.MeshStandardMaterial({ color: 0x5a6a4a, roughness: 0.9 });
const groundBorderMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.7 });
const cloudMat = new THREE.MeshBasicMaterial({ color: 0xb0b0b8 });
const cloudDarkMat = new THREE.MeshBasicMaterial({ color: 0x8a8a92 });
const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
const enemyBulletMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
const headFillMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c4, roughness: 0.5 });

// ── Procedural Ground ──────────────────────────────────────────────
const GROUND_Y = -2;
const CHUNK_SIZE_X = 30;
const CHUNK_SIZE_Z = 30;
const groundChunks = new Map(); // key: "cx,cz" -> group
const dirtSpotMat = new THREE.MeshStandardMaterial({ color: 0x5a6a4a, roughness: 1 });

function chunkKey(cx, cz) { return cx + ',' + cz; }

function createGroundChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    if (groundChunks.has(key)) return;

    const group = new THREE.Group();
    const worldX = cx * CHUNK_SIZE_X;
    const worldZ = cz * CHUNK_SIZE_Z;

    // Top surface
    const top = new THREE.Mesh(
        new THREE.BoxGeometry(CHUNK_SIZE_X, 1, CHUNK_SIZE_Z),
        [groundSideMat, groundSideMat, groundMat, groundSideMat, groundSideMat, groundSideMat]
    );
    top.position.set(worldX, GROUND_Y - 0.5, worldZ);
    top.receiveShadow = true;
    group.add(top);

    // Seeded random dirt spots
    const seed = cx * 7919 + cz * 104729;
    for (let i = 0; i < 12; i++) {
        const r = Math.sin(seed + i * 13.37) * 10000;
        const rx = (r - Math.floor(r)) - 0.5;
        const r2 = Math.sin(seed + i * 27.53) * 10000;
        const rz = (r2 - Math.floor(r2)) - 0.5;
        const spot = new THREE.Mesh(
            new THREE.CircleGeometry(0.08 + Math.abs(Math.sin(seed + i)) * 0.12, 6),
            dirtSpotMat
        );
        spot.rotation.x = -Math.PI / 2;
        spot.position.set(
            worldX + rx * CHUNK_SIZE_X * 0.9,
            GROUND_Y + 0.01,
            worldZ + rz * CHUNK_SIZE_Z * 0.9
        );
        group.add(spot);
    }

    scene.add(group);
    groundChunks.set(key, group);
}

function updateGroundChunks(px, pz) {
    const pcx = Math.round(px / CHUNK_SIZE_X);
    const pcz = Math.round(pz / CHUNK_SIZE_Z);
    const radius = 3;

    // Create nearby chunks
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
            createGroundChunk(pcx + dx, pcz + dz);
        }
    }

    // Remove far chunks
    for (const [key, group] of groundChunks) {
        const [cx, cz] = key.split(',').map(Number);
        if (Math.abs(cx - pcx) > radius + 1 || Math.abs(cz - pcz) > radius + 1) {
            scene.remove(group);
            groundChunks.delete(key);
        }
    }
}

// Initial chunks
updateGroundChunks(0, 5);

// ── Cloud creation ─────────────────────────────────────────────────
function createCloud(x, y, z, scale) {
    const group = new THREE.Group();

    const addPuff = (px, py, r, mat) => {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mat);
        puff.position.set(px, py, 0);
        group.add(puff);
    };

    addPuff(-0.6 * scale, 0, 0.75 * scale, cloudDarkMat);
    addPuff(0, 0.15 * scale, 0.85 * scale, cloudDarkMat);
    addPuff(0.65 * scale, -0.05 * scale, 0.7 * scale, cloudDarkMat);
    addPuff(-0.55 * scale, 0.05, 0.62 * scale, cloudMat);
    addPuff(0.05, 0.2 * scale, 0.72 * scale, cloudMat);
    addPuff(0.6 * scale, 0, 0.58 * scale, cloudMat);

    group.position.set(x, y, z);
    scene.add(group);
    return group;
}

const clouds = [];
clouds.push(createCloud(-8, 8, -15, 1.5));
clouds.push(createCloud(6, 10, -20, 1.2));
clouds.push(createCloud(18, 7, -12, 1.0));
clouds.push(createCloud(-15, 9, -25, 1.8));
clouds.push(createCloud(25, 11, -18, 1.3));

// ── Helper: rounded rectangle shape ────────────────────────────────
function createRoundedRect(w, h, r) {
    const shape = new THREE.Shape();
    const x = -w / 2, y = -h / 2;
    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y);
    shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r);
    shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h);
    shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
    return new THREE.ShapeGeometry(shape);
}

function createLimb(length, thickness) {
    return createRoundedRect(thickness, length, thickness * 0.4);
}

// ── Stick figure creation ──────────────────────────────────────────
function createStickFigure(isPlayer) {
    const group = new THREE.Group();
    const mat = darkMat;
    const T = 0.14;

    // Head
    const headRadius = 0.52;
    const headBorder = new THREE.Mesh(new THREE.CircleGeometry(headRadius + 0.1, 32), mat);
    headBorder.position.y = 2.55;
    group.add(headBorder);

    const headFill = new THREE.Mesh(new THREE.CircleGeometry(headRadius - 0.02, 32), headFillMat);
    headFill.position.set(0, 2.55, 0.01);
    group.add(headFill);

    // Side face (single eye — default profile view)
    const sideface = new THREE.Group();
    const eyeOuter = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.2, 16), mat);
    eyeOuter.position.set(0.1, 2.6, 0.02);
    sideface.add(eyeOuter);
    const eyeInner = new THREE.Mesh(new THREE.CircleGeometry(0.07, 10), mat);
    eyeInner.position.set(0.13, 2.62, 0.03);
    sideface.add(eyeInner);
    group.add(sideface);

    // Front face (two eyes — shown when walking toward camera)
    const frontface = new THREE.Group();
    // Left eye
    const fEyeOuterL = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.17, 16), mat);
    fEyeOuterL.position.set(-0.15, 2.6, 0.02);
    frontface.add(fEyeOuterL);
    const fEyeInnerL = new THREE.Mesh(new THREE.CircleGeometry(0.06, 10), mat);
    fEyeInnerL.position.set(-0.15, 2.62, 0.03);
    frontface.add(fEyeInnerL);
    // Right eye
    const fEyeOuterR = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.17, 16), mat);
    fEyeOuterR.position.set(0.15, 2.6, 0.02);
    frontface.add(fEyeOuterR);
    const fEyeInnerR = new THREE.Mesh(new THREE.CircleGeometry(0.06, 10), mat);
    fEyeInnerR.position.set(0.15, 2.62, 0.03);
    frontface.add(fEyeInnerR);
    frontface.visible = false;
    group.add(frontface);

    // Neck
    const neck = new THREE.Mesh(createLimb(0.25, T), mat);
    neck.position.set(0, 2.15, 0);
    group.add(neck);

    // Torso
    const torso = new THREE.Mesh(createLimb(1.1, T + 0.02), mat);
    torso.position.y = 1.45;
    group.add(torso);

    // Back arm
    const shoulderY = 1.85;
    const upperArmBack = new THREE.Group();
    const uabMesh = new THREE.Mesh(createLimb(0.55, T), mat);
    uabMesh.position.y = -0.25;
    upperArmBack.add(uabMesh);
    upperArmBack.position.set(-0.05, shoulderY, -0.02);
    upperArmBack.rotation.z = -0.8;
    group.add(upperArmBack);

    const forearmBack = new THREE.Group();
    const fabMesh = new THREE.Mesh(createLimb(0.5, T - 0.02), mat);
    fabMesh.position.y = -0.22;
    forearmBack.add(fabMesh);
    forearmBack.position.set(0, -0.5, 0);
    forearmBack.rotation.z = 0.6;
    upperArmBack.add(forearmBack);

    // Front arm (gun arm)
    const upperArmFront = new THREE.Group();
    const uafMesh = new THREE.Mesh(createLimb(0.55, T), mat);
    uafMesh.position.y = -0.25;
    upperArmFront.add(uafMesh);
    upperArmFront.position.set(0.05, shoulderY, 0.04);
    upperArmFront.rotation.z = Math.PI / 2 - 0.15;
    group.add(upperArmFront);

    const forearmFront = new THREE.Group();
    const fafMesh = new THREE.Mesh(createLimb(0.45, T - 0.02), mat);
    fafMesh.position.y = -0.2;
    forearmFront.add(fafMesh);
    forearmFront.position.set(0, -0.5, 0);
    forearmFront.rotation.z = -0.05;
    upperArmFront.add(forearmFront);

    // Gun
    const gunGroup = new THREE.Group();
    const receiver = new THREE.Mesh(createRoundedRect(0.55, 0.22, 0.04), mat);
    gunGroup.add(receiver);
    const barrel = new THREE.Mesh(createRoundedRect(0.5, 0.1, 0.02), mat);
    barrel.position.set(0.45, 0.05, 0);
    gunGroup.add(barrel);
    const muzzle = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.16), mat);
    muzzle.position.set(0.72, 0.05, 0);
    gunGroup.add(muzzle);
    const grip = new THREE.Mesh(createRoundedRect(0.12, 0.32, 0.03), mat);
    grip.position.set(-0.08, -0.22, 0);
    grip.rotation.z = 0.2;
    gunGroup.add(grip);
    const guardShape = new THREE.Shape();
    guardShape.moveTo(0.05, -0.05);
    guardShape.lineTo(0.18, -0.05);
    guardShape.lineTo(0.18, -0.18);
    guardShape.quadraticCurveTo(0.18, -0.22, 0.14, -0.22);
    guardShape.lineTo(0.09, -0.22);
    guardShape.quadraticCurveTo(0.05, -0.22, 0.05, -0.18);
    guardShape.lineTo(0.05, -0.05);
    const guard = new THREE.Mesh(new THREE.ShapeGeometry(guardShape), mat);
    gunGroup.add(guard);
    const mag = new THREE.Mesh(createRoundedRect(0.1, 0.2, 0.02), mat);
    mag.position.set(0.12, -0.25, 0);
    gunGroup.add(mag);
    const sight = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.1), mat);
    sight.position.set(-0.2, 0.15, 0);
    gunGroup.add(sight);
    gunGroup.position.set(0, -0.45, 0.01);
    gunGroup.rotation.z = -Math.PI / 2 + 0.1;
    forearmFront.add(gunGroup);

    // Legs
    const hipY = 0.9;
    const hipSpread = 0.12;

    const upperLegL = new THREE.Group();
    const ullMesh = new THREE.Mesh(createLimb(0.65, T), mat);
    ullMesh.position.y = -0.3;
    upperLegL.add(ullMesh);
    upperLegL.position.set(-hipSpread, hipY, 0);
    upperLegL.rotation.z = 0.12;
    group.add(upperLegL);

    const lowerLegL = new THREE.Group();
    const lllMesh = new THREE.Mesh(createLimb(0.6, T - 0.02), mat);
    lllMesh.position.y = -0.28;
    lowerLegL.add(lllMesh);
    lowerLegL.position.set(0, -0.6, 0);
    lowerLegL.rotation.z = -0.12;
    upperLegL.add(lowerLegL);

    const leftFoot = new THREE.Mesh(createRoundedRect(0.32, 0.1, 0.04), mat);
    leftFoot.position.set(0.06, -0.56, 0);
    lowerLegL.add(leftFoot);

    const upperLegR = new THREE.Group();
    const ulrMesh = new THREE.Mesh(createLimb(0.65, T), mat);
    ulrMesh.position.y = -0.3;
    upperLegR.add(ulrMesh);
    upperLegR.position.set(hipSpread, hipY, 0.01);
    upperLegR.rotation.z = -0.12;
    group.add(upperLegR);

    const lowerLegR = new THREE.Group();
    const llrMesh = new THREE.Mesh(createLimb(0.6, T - 0.02), mat);
    llrMesh.position.y = -0.28;
    lowerLegR.add(llrMesh);
    lowerLegR.position.set(0, -0.6, 0);
    lowerLegR.rotation.z = 0.12;
    upperLegR.add(lowerLegR);

    const rightFoot = new THREE.Mesh(createRoundedRect(0.32, 0.1, 0.04), mat);
    rightFoot.position.set(0.06, -0.56, 0);
    lowerLegR.add(rightFoot);

    group.userData = {
        type: isPlayer ? 'player' : 'enemy',
        vx: 0,
        vy: 0,
        vz: 0,
        onGround: false,
        hp: isPlayer ? 100 : 30,
        maxHp: isPlayer ? 100 : 30,
        facing: 1,
        shootCooldown: 0,
        upperArmBack,
        forearmBack,
        upperArmFront,
        forearmFront,
        upperLegL,
        lowerLegL,
        upperLegR,
        lowerLegR,
        gunGroup,
        sideface,
        frontface,
    };

    scene.add(group);
    return group;
}

// ── Player ─────────────────────────────────────────────────────────
const player = createStickFigure(true);
player.position.set(0, GROUND_Y, 5);

// ── Enemies ────────────────────────────────────────────────────────
const enemies = [];
const bullets = [];
const enemyBullets = [];

function spawnEnemy() {
    const enemy = createStickFigure(false);
    const side = Math.random() < 0.5 ? -1 : 1;
    const spawnX = player.position.x + side * 18;
    const spawnZ = player.position.z + (Math.random() - 0.5) * 10;

    enemy.position.set(spawnX, GROUND_Y, spawnZ);
    enemy.userData.facing = -side;
    enemy.userData.shootCooldown = 1 + Math.random() * 2;
    enemies.push(enemy);
}

for (let i = 0; i < 3; i++) spawnEnemy();

// ── Input ──────────────────────────────────────────────────────────
const keys = {};
let mouseDown = false;
window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
window.addEventListener('mousedown', e => { if (e.button === 0) mouseDown = true; });
window.addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });
// Prevent right-click context menu on canvas
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

// ── Game state ─────────────────────────────────────────────────────
let score = 0;
let ammo = 45;
let playerShootCooldown = 0;
let spawnTimer = 3;
const PLAYER_SPEED = 6;
const PLAYER_SPEED_Z = 4;
const BULLET_SPEED = 18;

// ── HUD update ─────────────────────────────────────────────────────
function updateHUD() {
    const hpPct = Math.max(0, player.userData.hp / player.userData.maxHp * 100);
    document.getElementById('health-bar').style.width = hpPct + '%';
    document.getElementById('score-value').textContent = String(score).padStart(4, '0');
    document.getElementById('ammo-value').textContent = ammo;
}

// ── Bullet creation ────────────────────────────────────────────────
function shootBullet(x, y, z, dir, isEnemy) {
    const bullet = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 6, 4),
        isEnemy ? enemyBulletMat : bulletMat
    );
    bullet.position.set(x, y, z);
    bullet.userData = { vx: dir * BULLET_SPEED, isEnemy, life: 3 };
    scene.add(bullet);
    if (isEnemy) enemyBullets.push(bullet);
    else bullets.push(bullet);
}

// ── Animate stick figure ───────────────────────────────────────────
function animateStickFigure(fig, time) {
    const d = fig.userData;
    const movingX = Math.abs(d.vx) > 0.5;
    const movingZ = Math.abs(d.vz || 0) > 0.5;
    const moving = movingX || movingZ;
    const t = time * 8;

    fig.scale.x = d.facing;

    // Toggle face based on movement direction
    const movingToward = (d.vz || 0) > 0.5;
    const movingAway = (d.vz || 0) < -0.5;
    const movingSide = Math.abs(d.vx) > 0.5;

    if ((movingToward || movingAway) && movingSide) {
        // Diagonal — show single eye on the side they're moving
        d.sideface.visible = true;
        d.frontface.visible = false;
    } else if (movingToward) {
        // Straight toward camera — two eyes
        d.sideface.visible = false;
        d.frontface.visible = true;
    } else if (movingAway) {
        // Straight away from camera — no eyes (back of head)
        d.sideface.visible = false;
        d.frontface.visible = false;
    } else {
        // Side movement or idle — profile with one eye
        d.sideface.visible = true;
        d.frontface.visible = false;
    }

    const gunArmBase = Math.PI / 2 - 0.15;

    if (moving) {
        const cycle = Math.sin(t);
        const cycleB = Math.sin(t + Math.PI);

        d.upperLegL.rotation.z = 0.12 + cycle * 0.35;
        d.lowerLegL.rotation.z = -0.12 + Math.max(0, -cycle) * 0.4;
        d.upperLegR.rotation.z = -0.12 + cycleB * 0.35;
        d.lowerLegR.rotation.z = 0.12 + Math.max(0, -cycleB) * 0.4;

        d.upperArmBack.rotation.z = -0.8 + cycleB * 0.2;
        d.forearmBack.rotation.z = 0.6 + Math.sin(t + 0.5) * 0.15;

        d.upperArmFront.rotation.z = gunArmBase + Math.sin(t) * 0.04;
        d.forearmFront.rotation.z = -0.05 + Math.sin(t) * 0.03;
    } else {
        const breath = Math.sin(time * 2) * 0.02;

        d.upperLegL.rotation.z = 0.12 + breath;
        d.lowerLegL.rotation.z = -0.12;
        d.upperLegR.rotation.z = -0.12 - breath;
        d.lowerLegR.rotation.z = 0.12;

        d.upperArmBack.rotation.z = -0.8 + breath;
        d.forearmBack.rotation.z = 0.6;

        d.upperArmFront.rotation.z = gunArmBase + breath;
        d.forearmFront.rotation.z = -0.05;
    }
}

// ── Main loop ──────────────────────────────────────────────────────
const clock = new THREE.Clock();

function update() {
    requestAnimationFrame(update);
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.getElapsedTime();

    const pd = player.userData;

    // ── Player movement ──
    pd.vx = 0;
    pd.vz = 0;
    if (keys['a'] || keys['arrowleft']) { pd.vx = -PLAYER_SPEED; pd.facing = -1; }
    if (keys['d'] || keys['arrowright']) { pd.vx = PLAYER_SPEED; pd.facing = 1; }
    // W = away from camera (negative Z), S = toward camera (positive Z)
    if (keys['w'] || keys['arrowup']) { pd.vz = -PLAYER_SPEED_Z; }
    if (keys['s'] || keys['arrowdown']) { pd.vz = PLAYER_SPEED_Z; }

    // Shooting with LMB
    playerShootCooldown -= dt;
    if (mouseDown && playerShootCooldown <= 0 && ammo > 0) {
        const gunTipX = player.position.x + pd.facing * 1.5;
        const gunTipY = player.position.y + 1.75;
        shootBullet(gunTipX, gunTipY, player.position.z, pd.facing, false);
        ammo--;
        playerShootCooldown = 0.18;
    }

    // Player stays on ground (no gravity/jump)
    player.position.x += pd.vx * dt;
    player.position.z += pd.vz * dt;
    player.position.y = GROUND_Y;

    animateStickFigure(player, time);

    // ── Update procedural ground ──
    updateGroundChunks(player.position.x, player.position.z);

    // ── Camera follow ──
    const targetCamPos = new THREE.Vector3(
        player.position.x + CAM_OFFSET.x,
        CAM_OFFSET.y,
        player.position.z + CAM_OFFSET.z
    );
    camera.position.lerp(targetCamPos, 3 * dt);
    camera.lookAt(player.position.x, 2, player.position.z);

    // Update directional light to follow player
    dirLight.position.set(player.position.x + 5, 15, player.position.z + 10);
    dirLight.target.position.set(player.position.x, 0, player.position.z);
    dirLight.target.updateMatrixWorld();

    // Move clouds slowly
    clouds.forEach((c, i) => {
        c.position.x += (0.15 + i * 0.05) * dt;
        if (c.position.x > player.position.x + 40) {
            c.position.x = player.position.x - 40;
        }
    });

    // ── Enemy AI ──
    spawnTimer -= dt;
    if (spawnTimer <= 0 && enemies.length < 6) {
        spawnEnemy();
        spawnTimer = 2.5 + Math.random() * 2;
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        const ed = enemy.userData;

        const dx = player.position.x - enemy.position.x;
        const dz = player.position.z - enemy.position.z;
        const dirToPlayer = Math.sign(dx);
        ed.facing = dirToPlayer;

        if (Math.abs(dx) > 3) {
            ed.vx = dirToPlayer * 2.5;
        } else {
            ed.vx = 0;
        }

        // Move toward player in Z too
        if (Math.abs(dz) > 1) {
            ed.vz = Math.sign(dz) * 1.5;
        } else {
            ed.vz = 0;
        }

        // Shoot at player
        ed.shootCooldown -= dt;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (ed.shootCooldown <= 0 && dist < 14 && Math.abs(dz) < 3) {
            const gunTipX = enemy.position.x + ed.facing * 1.5;
            const gunTipY = enemy.position.y + 1.75;
            shootBullet(gunTipX, gunTipY, enemy.position.z, ed.facing, true);
            ed.shootCooldown = 1.5 + Math.random() * 1.5;
        }

        // Movement (no gravity, stay on ground)
        enemy.position.x += (ed.vx || 0) * dt;
        enemy.position.z += (ed.vz || 0) * dt;
        enemy.position.y = GROUND_Y;

        // Remove if too far
        if (Math.abs(enemy.position.x - player.position.x) > 40) {
            scene.remove(enemy);
            enemies.splice(i, 1);
            continue;
        }

        animateStickFigure(enemy, time + i);

        if (ed.hp <= 0) {
            scene.remove(enemy);
            enemies.splice(i, 1);
            score += 50;
            ammo = Math.min(ammo + 10, 99);
        }
    }

    // ── Player bullets ──
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.position.x += b.userData.vx * dt;
        b.userData.life -= dt;

        let hit = false;
        for (let j = enemies.length - 1; j >= 0; j--) {
            const enemy = enemies[j];
            const ex = enemy.position.x;
            const ey = enemy.position.y + 1.2;
            const ez = enemy.position.z;
            if (Math.abs(b.position.x - ex) < 0.8 &&
                Math.abs(b.position.y - ey) < 1.5 &&
                Math.abs(b.position.z - ez) < 1.5) {
                enemy.userData.hp -= 15;
                hit = true;
                score += 10;
                break;
            }
        }

        if (hit || b.userData.life <= 0) {
            scene.remove(b);
            bullets.splice(i, 1);
        }
    }

    // ── Enemy bullets ──
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        b.position.x += b.userData.vx * dt;
        b.userData.life -= dt;

        const px = player.position.x;
        const py = player.position.y + 1.2;
        const pz = player.position.z;
        let hit = false;
        if (Math.abs(b.position.x - px) < 0.6 &&
            Math.abs(b.position.y - py) < 1.5 &&
            Math.abs(b.position.z - pz) < 1.5) {
            pd.hp -= 10;
            hit = true;
        }

        if (hit || b.userData.life <= 0) {
            scene.remove(b);
            enemyBullets.splice(i, 1);
        }
    }

    // ── Death / respawn ──
    if (pd.hp <= 0) {
        pd.hp = pd.maxHp;
        player.position.set(player.position.x, GROUND_Y, player.position.z);
        score = Math.max(0, score - 100);
        ammo = 45;
    }

    updateHUD();

    // Render scene then vignette on top
    renderer.autoClear = true;
    renderer.render(scene, camera);
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(vignetteScene, vignetteCam);
}

// ── Resize ─────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

update();

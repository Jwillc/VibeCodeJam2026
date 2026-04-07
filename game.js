import * as THREE from 'three';
import { applyFaceState, resolveFaceState } from './characterState.js';

// ── Scene setup ────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 60, 150);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
const CAM_OFFSET = new THREE.Vector3(0, 6, 18);
camera.position.set(0, 6, 18);
camera.lookAt(0, 2, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

// ── Vignette ───────────────────────────────────────────────────────
const vignetteScene = new THREE.Scene();
const vignetteCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const vignetteQuad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, depthTest: false,
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
    })
);
vignetteScene.add(vignetteQuad);

// ── Lighting ───────────────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
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
const cloudMat = new THREE.MeshBasicMaterial({ color: 0xb0b0b8 });
const cloudDarkMat = new THREE.MeshBasicMaterial({ color: 0x8a8a92 });
const dirtSpotMat = new THREE.MeshStandardMaterial({ color: 0x5a6a4a, roughness: 1 });
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 });
const leavesMat = new THREE.MeshStandardMaterial({ color: 0x4a6a2a, roughness: 0.8 });
const leavesDarkMat = new THREE.MeshStandardMaterial({ color: 0x3a5a1a, roughness: 0.8 });

// Character materials (wooden samurai palette)
const bodyBrownMat = new THREE.MeshBasicMaterial({ color: 0x8B6844 });       // dark brown body
const bodyBrownDarkMat = new THREE.MeshBasicMaterial({ color: 0x6B4C30 });   // darker brown edges
const limbTanMat = new THREE.MeshBasicMaterial({ color: 0xC4A872 });         // tan limbs
const limbTanDarkMat = new THREE.MeshBasicMaterial({ color: 0xA08850 });     // darker tan joints
const faceMaskMat = new THREE.MeshBasicMaterial({ color: 0xC4A872 });        // tan face (matches skin)
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x2A1A0A });         // dark outline
const bootMat = new THREE.MeshBasicMaterial({ color: 0x6B4830 });            // boot color

// ── Tree creation ──────────────────────────────────────────────────
function createTree(x, z, seed) {
    const group = new THREE.Group();
    const s = 0.8 + Math.abs(Math.sin(seed)) * 0.6; // size variation

    // Trunk
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15 * s, 0.25 * s, 2.5 * s, 8),
        trunkMat
    );
    trunk.position.y = 1.25 * s;
    trunk.castShadow = true;
    group.add(trunk);

    // Foliage layers (stacked spheres/cones for a stylized look)
    const foliageBottom = new THREE.Mesh(
        new THREE.ConeGeometry(1.4 * s, 2.0 * s, 8),
        leavesDarkMat
    );
    foliageBottom.position.y = 2.8 * s;
    foliageBottom.castShadow = true;
    group.add(foliageBottom);

    const foliageMid = new THREE.Mesh(
        new THREE.ConeGeometry(1.1 * s, 1.6 * s, 8),
        leavesMat
    );
    foliageMid.position.y = 3.6 * s;
    foliageMid.castShadow = true;
    group.add(foliageMid);

    const foliageTop = new THREE.Mesh(
        new THREE.ConeGeometry(0.7 * s, 1.2 * s, 7),
        leavesDarkMat
    );
    foliageTop.position.y = 4.3 * s;
    foliageTop.castShadow = true;
    group.add(foliageTop);

    group.position.set(x, GROUND_Y, z);
    // Slight random rotation for variety
    group.rotation.y = seed * 1.7;
    scene.add(group);
    return group;
}

// ── Procedural Ground with Trees ───────────────────────────────────
const GROUND_Y = -2;
const CHUNK_SIZE_X = 30;
const CHUNK_SIZE_Z = 30;
const groundChunks = new Map();

function chunkKey(cx, cz) { return cx + ',' + cz; }

// Seeded pseudo-random
function seededRand(seed) {
    const r = Math.sin(seed) * 43758.5453;
    return r - Math.floor(r);
}

function createGroundChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    if (groundChunks.has(key)) return;

    const group = new THREE.Group();
    const worldX = cx * CHUNK_SIZE_X;
    const worldZ = cz * CHUNK_SIZE_Z;

    // Ground surface
    const top = new THREE.Mesh(
        new THREE.BoxGeometry(CHUNK_SIZE_X, 1, CHUNK_SIZE_Z),
        [groundSideMat, groundSideMat, groundMat, groundSideMat, groundSideMat, groundSideMat]
    );
    top.position.set(worldX, GROUND_Y - 0.5, worldZ);
    top.receiveShadow = true;
    group.add(top);

    // Dirt spots
    const seed = cx * 7919 + cz * 104729;
    for (let i = 0; i < 12; i++) {
        const rx = seededRand(seed + i * 13.37) - 0.5;
        const rz = seededRand(seed + i * 27.53) - 0.5;
        const spot = new THREE.Mesh(
            new THREE.CircleGeometry(0.08 + seededRand(seed + i * 7.1) * 0.12, 6),
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

    // Trees for this chunk
    const treeSeed = cx * 3571 + cz * 8923;
    const treeCount = 2 + Math.floor(seededRand(treeSeed) * 4); // 2-5 trees per chunk
    const trees = [];
    for (let i = 0; i < treeCount; i++) {
        const tx = worldX + (seededRand(treeSeed + i * 17.3) - 0.5) * (CHUNK_SIZE_X - 4);
        const tz = worldZ + (seededRand(treeSeed + i * 31.7) - 0.5) * (CHUNK_SIZE_Z - 4);
        const tree = createTree(tx, tz, treeSeed + i);
        trees.push(tree);
    }

    groundChunks.set(key, { ground: group, trees });
}

function updateGroundChunks(px, pz) {
    const pcx = Math.round(px / CHUNK_SIZE_X);
    const pcz = Math.round(pz / CHUNK_SIZE_Z);
    const radius = 6;

    for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
            createGroundChunk(pcx + dx, pcz + dz);
        }
    }

    for (const [key, chunk] of groundChunks) {
        const [cx, cz] = key.split(',').map(Number);
        if (Math.abs(cx - pcx) > radius + 1 || Math.abs(cz - pcz) > radius + 1) {
            scene.remove(chunk.ground);
            chunk.trees.forEach(t => scene.remove(t));
            groundChunks.delete(key);
        }
    }
}

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
clouds.push(createCloud(-8, 18, -15, 1.5));
clouds.push(createCloud(6, 22, -20, 1.2));
clouds.push(createCloud(18, 17, -12, 1.0));
clouds.push(createCloud(-15, 20, -25, 1.8));
clouds.push(createCloud(25, 21, -18, 1.3));

// ── Helper: shape builders ─────────────────────────────────────────
function makeRect(w, h, mat) {
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

// ── Rounded rect shape helper ──────────────────────────────────────
function makeRoundedRect(w, h, r, mat) {
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
    return new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
}

// ── Polished Character creation (flat 2D) ──────────────────────────
function createSamurai() {
    const group = new THREE.Group();
    const S = 0.75;

    // ── Body (slim torso) ──
    // Outline
    const bodyOut = makeRoundedRect(0.9 * S, 1.55 * S, 0.12 * S, outlineMat);
    bodyOut.position.set(0, 1.4 * S, 0);
    group.add(bodyOut);
    // Fill
    const bodyFill = makeRoundedRect(0.8 * S, 1.45 * S, 0.1 * S, bodyBrownMat);
    bodyFill.position.set(0, 1.4 * S, 0.01);
    group.add(bodyFill);
    // Chest highlight
    const chestHL = makeRoundedRect(0.35 * S, 0.6 * S, 0.06 * S, bodyBrownDarkMat);
    chestHL.position.set(0, 1.55 * S, 0.02);
    group.add(chestHL);
    // Belt line
    const belt = makeRoundedRect(0.78 * S, 0.1 * S, 0.04 * S, limbTanDarkMat);
    belt.position.set(0, 0.72 * S, 0.02);
    group.add(belt);

    // ── Shoulder caps (blend arms into body) ──
    const shoulderCapL = new THREE.Mesh(new THREE.CircleGeometry(0.16 * S, 12), bodyBrownMat);
    shoulderCapL.position.set(-0.42 * S, 2.0 * S, 0.015);
    group.add(shoulderCapL);
    const shoulderCapR = new THREE.Mesh(new THREE.CircleGeometry(0.16 * S, 12), bodyBrownMat);
    shoulderCapR.position.set(0.42 * S, 2.0 * S, 0.015);
    group.add(shoulderCapR);

    // ── Neck ──
    const neck = makeRoundedRect(0.35 * S, 0.2 * S, 0.06 * S, limbTanMat);
    neck.position.set(0, 2.22 * S, 0.01);
    group.add(neck);

    // ── Head (rounded) ──
    const headOut = makeRoundedRect(0.72 * S, 0.7 * S, 0.2 * S, outlineMat);
    headOut.position.set(0, 2.7 * S, 0);
    group.add(headOut);
    const headFill = makeRoundedRect(0.62 * S, 0.6 * S, 0.18 * S, limbTanMat);
    headFill.position.set(0, 2.7 * S, 0.01);
    group.add(headFill);

    // ── Side face (profile — single eye) ──
    const sideface = new THREE.Group();
    // Eye
    const eyeSide = new THREE.Mesh(new THREE.CircleGeometry(0.06 * S, 10), outlineMat);
    eyeSide.position.set(0.14 * S, 2.68 * S, 0.03);
    sideface.add(eyeSide);
    group.add(sideface);

    // ── Front face (two eyes) ──
    const frontface = new THREE.Group();
    // Left eye
    const eyeFL = new THREE.Mesh(new THREE.CircleGeometry(0.055 * S, 10), outlineMat);
    eyeFL.position.set(-0.1 * S, 2.68 * S, 0.03);
    frontface.add(eyeFL);
    // Right eye
    const eyeFR = new THREE.Mesh(new THREE.CircleGeometry(0.055 * S, 10), outlineMat);
    eyeFR.position.set(0.1 * S, 2.68 * S, 0.03);
    frontface.add(eyeFR);
    frontface.visible = false;
    group.add(frontface);

    // ── Arms ──
    const shoulderY = 2.0 * S;

    // Back arm
    const upperArmBack = new THREE.Group();
    const uabOut = makeRoundedRect(0.22 * S, 0.52 * S, 0.07 * S, outlineMat);
    uabOut.position.y = -0.24 * S;
    upperArmBack.add(uabOut);
    const uabFill = makeRoundedRect(0.16 * S, 0.46 * S, 0.05 * S, limbTanMat);
    uabFill.position.set(0, -0.24 * S, 0.01);
    upperArmBack.add(uabFill);
    upperArmBack.position.set(-0.48 * S, shoulderY, -0.02);
    upperArmBack.rotation.z = -0.1;
    group.add(upperArmBack);

    const forearmBack = new THREE.Group();
    const fabOut = makeRoundedRect(0.2 * S, 0.48 * S, 0.06 * S, outlineMat);
    fabOut.position.y = -0.22 * S;
    forearmBack.add(fabOut);
    const fabFill = makeRoundedRect(0.14 * S, 0.42 * S, 0.04 * S, limbTanDarkMat);
    fabFill.position.set(0, -0.22 * S, 0.01);
    forearmBack.add(fabFill);
    // Hand
    const handB = new THREE.Mesh(new THREE.CircleGeometry(0.07 * S, 8), limbTanMat);
    handB.position.set(0, -0.46 * S, 0.01);
    forearmBack.add(handB);
    forearmBack.position.set(0, -0.48 * S, 0);
    forearmBack.rotation.z = 0.1;
    upperArmBack.add(forearmBack);

    // Front arm
    const upperArmFront = new THREE.Group();
    const uafOut = makeRoundedRect(0.22 * S, 0.52 * S, 0.07 * S, outlineMat);
    uafOut.position.y = -0.24 * S;
    upperArmFront.add(uafOut);
    const uafFill = makeRoundedRect(0.16 * S, 0.46 * S, 0.05 * S, limbTanMat);
    uafFill.position.set(0, -0.24 * S, 0.01);
    upperArmFront.add(uafFill);
    upperArmFront.position.set(0.48 * S, shoulderY, 0.04);
    upperArmFront.rotation.z = 0.1;
    group.add(upperArmFront);

    const forearmFront = new THREE.Group();
    const fafOut = makeRoundedRect(0.2 * S, 0.48 * S, 0.06 * S, outlineMat);
    fafOut.position.y = -0.22 * S;
    forearmFront.add(fafOut);
    const fafFill = makeRoundedRect(0.14 * S, 0.42 * S, 0.04 * S, limbTanDarkMat);
    fafFill.position.set(0, -0.22 * S, 0.01);
    forearmFront.add(fafFill);
    const handF = new THREE.Mesh(new THREE.CircleGeometry(0.07 * S, 8), limbTanMat);
    handF.position.set(0, -0.46 * S, 0.01);
    forearmFront.add(handF);
    forearmFront.position.set(0, -0.48 * S, 0);
    forearmFront.rotation.z = -0.1;
    upperArmFront.add(forearmFront);

    // ── Legs ──
    const hipY = 0.68 * S;
    const hipSpread = 0.2 * S;

    // Left leg
    const upperLegL = new THREE.Group();
    const ullOut = makeRoundedRect(0.22 * S, 0.55 * S, 0.07 * S, outlineMat);
    ullOut.position.y = -0.26 * S;
    upperLegL.add(ullOut);
    const ullFill = makeRoundedRect(0.16 * S, 0.49 * S, 0.05 * S, limbTanMat);
    ullFill.position.set(0, -0.26 * S, 0.01);
    upperLegL.add(ullFill);
    upperLegL.position.set(-hipSpread, hipY, 0);
    group.add(upperLegL);

    const lowerLegL = new THREE.Group();
    const lllOut = makeRoundedRect(0.2 * S, 0.5 * S, 0.06 * S, outlineMat);
    lllOut.position.y = -0.23 * S;
    lowerLegL.add(lllOut);
    const lllFill = makeRoundedRect(0.14 * S, 0.44 * S, 0.04 * S, limbTanDarkMat);
    lllFill.position.set(0, -0.23 * S, 0.01);
    lowerLegL.add(lllFill);
    // Boot
    const bootLOut = makeRoundedRect(0.28 * S, 0.14 * S, 0.05 * S, outlineMat);
    bootLOut.position.set(0.03 * S, -0.5 * S, 0);
    lowerLegL.add(bootLOut);
    const bootLFill = makeRoundedRect(0.22 * S, 0.1 * S, 0.04 * S, bootMat);
    bootLFill.position.set(0.03 * S, -0.5 * S, 0.01);
    lowerLegL.add(bootLFill);
    lowerLegL.position.set(0, -0.52 * S, 0);
    upperLegL.add(lowerLegL);

    // Right leg
    const upperLegR = new THREE.Group();
    const ulrOut = makeRoundedRect(0.22 * S, 0.55 * S, 0.07 * S, outlineMat);
    ulrOut.position.y = -0.26 * S;
    upperLegR.add(ulrOut);
    const ulrFill = makeRoundedRect(0.16 * S, 0.49 * S, 0.05 * S, limbTanMat);
    ulrFill.position.set(0, -0.26 * S, 0.01);
    upperLegR.add(ulrFill);
    upperLegR.position.set(hipSpread, hipY, 0.01);
    group.add(upperLegR);

    const lowerLegR = new THREE.Group();
    const llrOut = makeRoundedRect(0.2 * S, 0.5 * S, 0.06 * S, outlineMat);
    llrOut.position.y = -0.23 * S;
    lowerLegR.add(llrOut);
    const llrFill = makeRoundedRect(0.14 * S, 0.44 * S, 0.04 * S, limbTanDarkMat);
    llrFill.position.set(0, -0.23 * S, 0.01);
    lowerLegR.add(llrFill);
    const bootROut = makeRoundedRect(0.28 * S, 0.14 * S, 0.05 * S, outlineMat);
    bootROut.position.set(0.03 * S, -0.5 * S, 0);
    lowerLegR.add(bootROut);
    const bootRFill = makeRoundedRect(0.22 * S, 0.1 * S, 0.04 * S, bootMat);
    bootRFill.position.set(0.03 * S, -0.5 * S, 0.01);
    lowerLegR.add(bootRFill);
    lowerLegR.position.set(0, -0.52 * S, 0);
    upperLegR.add(lowerLegR);

    group.userData = {
        vx: 0, vz: 0,
        facing: 1,
        upperArmBack, forearmBack,
        upperArmFront, forearmFront,
        upperLegL, lowerLegL,
        upperLegR, lowerLegR,
        sideface, frontface,
    };

    scene.add(group);
    return group;
}

// ── Player ─────────────────────────────────────────────────────────
const player = createSamurai();
player.position.set(0, GROUND_Y, 5);

// Blob shadow under the player (flat planes don't cast real shadows well)
const shadowTex = (() => {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    gradient.addColorStop(0, 'rgba(0,0,0,0.45)');
    gradient.addColorStop(0.6, 'rgba(0,0,0,0.2)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
})();
const playerShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 1.4),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
);
playerShadow.rotation.x = -Math.PI / 2;
playerShadow.position.set(0, GROUND_Y + 0.02, 0);
scene.add(playerShadow);

// ── Input ──────────────────────────────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

const PLAYER_SPEED = 6;
const PLAYER_SPEED_Z = 4;

// ── Animate samurai ────────────────────────────────────────────────
function animateSamurai(fig, time) {
    const d = fig.userData;
    const moving = Math.abs(d.vx) > 0.5 || Math.abs(d.vz || 0) > 0.5;
    const t = time * 7;

    fig.scale.x = d.facing;

    applyFaceState(d, resolveFaceState(d.vx, d.vz || 0));

    if (moving) {
        const cycle = Math.sin(t);
        const cycleB = Math.sin(t + Math.PI);

        // Legs swing
        d.upperLegL.rotation.z = cycle * 0.3;
        d.lowerLegL.rotation.z = Math.max(0, -cycle) * 0.35;
        d.upperLegR.rotation.z = cycleB * 0.3;
        d.lowerLegR.rotation.z = Math.max(0, -cycleB) * 0.35;

        // Arms swing opposite, staff arm less
        d.upperArmBack.rotation.z = -0.15 + cycle * 0.15;
        d.forearmBack.rotation.z = 0.15;
        d.upperArmFront.rotation.z = 0.15 + cycleB * 0.25;
        d.forearmFront.rotation.z = -0.15 + Math.max(0, -cycleB) * 0.2;
    } else {
        const breath = Math.sin(time * 2) * 0.015;

        d.upperLegL.rotation.z = breath;
        d.lowerLegL.rotation.z = 0;
        d.upperLegR.rotation.z = -breath;
        d.lowerLegR.rotation.z = 0;

        d.upperArmBack.rotation.z = -0.15 + breath;
        d.forearmBack.rotation.z = 0.15;
        d.upperArmFront.rotation.z = 0.15 - breath;
        d.forearmFront.rotation.z = -0.15;
    }
}

// ── Day/Night cycle ───────────────────────────────────────────────
const DAY_DURATION = 60 * 60;   // 60 minutes in seconds
const NIGHT_DURATION = 10 * 60; // 10 minutes in seconds
const CYCLE_DURATION = DAY_DURATION + NIGHT_DURATION; // 70 minutes total
const TRANSITION = 0.05; // fraction of cycle for dawn/dusk transitions

const dayColor = new THREE.Color(0x87ceeb);
const sunsetColor = new THREE.Color(0xd4956a);
const nightColor = new THREE.Color(0x0a0e1a);

const dayDirColor = new THREE.Color(0xfff8e7);
const sunsetDirColor = new THREE.Color(0xff8844);
const nightDirColor = new THREE.Color(0x223366);

function updateDayNight(elapsed) {
    const t = (elapsed % CYCLE_DURATION) / CYCLE_DURATION;
    const dayEnd = DAY_DURATION / CYCLE_DURATION;       // ~0.857
    const nightStart = dayEnd;
    const nightEnd = 1.0;

    let sunAmount; // 1 = full day, 0 = full night
    if (t < dayEnd - TRANSITION) {
        // Full day
        sunAmount = 1;
    } else if (t < dayEnd) {
        // Dusk transition
        sunAmount = 1 - (t - (dayEnd - TRANSITION)) / TRANSITION;
    } else if (t < nightEnd - TRANSITION) {
        // Full night
        sunAmount = 0;
    } else {
        // Dawn transition
        sunAmount = (t - (nightEnd - TRANSITION)) / TRANSITION;
    }

    // Smooth the transition
    sunAmount = sunAmount * sunAmount * (3 - 2 * sunAmount);

    // Sky & fog color
    const skyColor = new THREE.Color();
    if (sunAmount > 0.5) {
        skyColor.lerpColors(sunsetColor, dayColor, (sunAmount - 0.5) * 2);
    } else {
        skyColor.lerpColors(nightColor, sunsetColor, sunAmount * 2);
    }
    scene.background.copy(skyColor);
    scene.fog.color.copy(skyColor);

    // Lighting
    ambientLight.intensity = THREE.MathUtils.lerp(0.08, 0.6, sunAmount);
    dirLight.intensity = THREE.MathUtils.lerp(0.05, 0.8, sunAmount);

    if (sunAmount > 0.5) {
        dirLight.color.lerpColors(sunsetDirColor, dayDirColor, (sunAmount - 0.5) * 2);
    } else {
        dirLight.color.lerpColors(nightDirColor, sunsetDirColor, sunAmount * 2);
    }

    // Fog distance - closer at night for atmosphere
    scene.fog.near = THREE.MathUtils.lerp(10, 60, sunAmount);
    scene.fog.far = THREE.MathUtils.lerp(35, 150, sunAmount);
}

// ── Main loop ──────────────────────────────────────────────────────
const clock = new THREE.Clock();

function update() {
    requestAnimationFrame(update);
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.getElapsedTime();

    const pd = player.userData;

    // Movement
    pd.vx = 0;
    pd.vz = 0;
    if (keys['a'] || keys['arrowleft']) { pd.vx = -PLAYER_SPEED; pd.facing = -1; }
    if (keys['d'] || keys['arrowright']) { pd.vx = PLAYER_SPEED; pd.facing = 1; }
    if (keys['w'] || keys['arrowup']) { pd.vz = -PLAYER_SPEED_Z; }
    if (keys['s'] || keys['arrowdown']) { pd.vz = PLAYER_SPEED_Z; }

    player.position.x += pd.vx * dt;
    player.position.z += pd.vz * dt;
    player.position.y = GROUND_Y;

    animateSamurai(player, time);

    // Update blob shadow
    playerShadow.position.set(player.position.x, GROUND_Y + 0.02, player.position.z);

    // Procedural ground
    updateGroundChunks(player.position.x, player.position.z);

    // Camera follow
    const targetCamPos = new THREE.Vector3(
        player.position.x + CAM_OFFSET.x,
        CAM_OFFSET.y,
        player.position.z + CAM_OFFSET.z
    );
    camera.position.lerp(targetCamPos, 3 * dt);
    camera.lookAt(player.position.x, 2, player.position.z);

    // Light follows player
    dirLight.position.set(player.position.x + 5, 15, player.position.z + 10);
    dirLight.target.position.set(player.position.x, 0, player.position.z);
    dirLight.target.updateMatrixWorld();

    // Day/night cycle
    updateDayNight(time);

    // Clouds drift
    clouds.forEach((c, i) => {
        c.position.x += (0.15 + i * 0.05) * dt;
        if (c.position.x > player.position.x + 40) {
            c.position.x = player.position.x - 40;
        }
    });

    // Render
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

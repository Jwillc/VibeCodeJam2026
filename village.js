import * as THREE from 'three';
import { addCollider } from './collision.js';

export const PLACEABLE_ITEMS = [
    { id: 'tipi', label: 'Tipi' },
    { id: 'campfire', label: 'Campfire' },
];

function createTipiCanvasTexture() {
    if (typeof document === 'undefined') return null;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#ead9b7');
    gradient.addColorStop(0.45, '#d8be94');
    gradient.addColorStop(1, '#b68d63');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalAlpha = 0.12;
    for (let x = 0; x < canvas.width; x += 18) {
        ctx.fillStyle = x % 36 === 0 ? '#fff6df' : '#8d6948';
        ctx.fillRect(x, 0, 2, canvas.height);
    }
    for (let y = 0; y < canvas.height; y += 20) {
        ctx.fillStyle = y % 40 === 0 ? '#fef2d4' : '#9b7550';
        ctx.fillRect(0, y, canvas.width, 2);
    }

    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 1400; i++) {
        const x = (i * 73) % canvas.width;
        const y = (i * 157 + (i % 11) * 23) % canvas.height;
        const size = 1 + (i % 3);
        ctx.fillStyle = i % 2 === 0 ? '#6d4d31' : '#fff4dc';
        ctx.fillRect(x, y, size, size);
    }

    ctx.globalAlpha = 0.14;
    ctx.fillStyle = '#8b6643';
    ctx.fillRect(canvas.width * 0.17, 0, canvas.width * 0.05, canvas.height);
    ctx.fillRect(canvas.width * 0.78, 0, canvas.width * 0.045, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1.1);
    texture.needsUpdate = true;
    return texture;
}

const canvasTexture = createTipiCanvasTexture();
const canvasMat = new THREE.MeshStandardMaterial({
    color: 0xfff7ea,
    map: canvasTexture,
    roughness: 0.92,
    metalness: 0.02,
    side: THREE.DoubleSide,
});
const canvasShadeMat = new THREE.MeshStandardMaterial({
    color: 0xd7b48d,
    map: canvasTexture,
    roughness: 0.95,
    metalness: 0.01,
    side: THREE.DoubleSide,
});
const poleMat = new THREE.MeshStandardMaterial({
    color: 0x6a4a2b,
    roughness: 0.98,
});
const ropeMat = new THREE.MeshStandardMaterial({
    color: 0x8f6f4b,
    roughness: 1,
});
const hideMat = new THREE.MeshStandardMaterial({
    color: 0xb79266,
    map: canvasTexture,
    roughness: 1,
    side: THREE.DoubleSide,
});
const groundShadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
});
const firewoodMat = new THREE.MeshStandardMaterial({
    color: 0x6b4528,
    roughness: 0.98,
});
const firewoodDarkMat = new THREE.MeshStandardMaterial({
    color: 0x3f2817,
    roughness: 1,
});
const emberMat = new THREE.MeshStandardMaterial({
    color: 0xff9b3d,
    emissive: 0xff6a00,
    emissiveIntensity: 0.9,
    roughness: 0.55,
});
const flameCoreMat = new THREE.MeshBasicMaterial({
    color: 0xfff2a3,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
});
const flameOuterMat = new THREE.MeshBasicMaterial({
    color: 0xff7a1f,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
});
const smokeMat = new THREE.MeshBasicMaterial({
    color: 0x6c655f,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
});
const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x71685f,
    roughness: 1,
});
const ashMat = new THREE.MeshStandardMaterial({
    color: 0x29231f,
    roughness: 1,
});

const TIPI_SCALE = 1.5;
const TIPI_COLLIDER_RADIUS = 1.5 * TIPI_SCALE;
const CAMPFIRE_SCALE = 1.5;
const CAMPFIRE_COLLIDER_RADIUS = 0.8 * CAMPFIRE_SCALE;

const ASSET_BUILDERS = {
    tipi: {
        create: createTipi,
        colliderRadius: TIPI_COLLIDER_RADIUS,
    },
    campfire: {
        create: createCampfire,
        colliderRadius: CAMPFIRE_COLLIDER_RADIUS,
    },
};

function createPole(length, tiltX, tiltZ, y, rotationY = 0) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, length, 6), poleMat);
    pole.position.set(0, y, 0);
    pole.rotation.x = tiltX;
    pole.rotation.z = tiltZ;
    pole.rotation.y = rotationY;
    pole.castShadow = true;
    return pole;
}

function createCylinderBetween(start, end, radius, material, radialSegments = 6) {
    const dir = end.clone().sub(start);
    const length = dir.length();
    const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.82, radius, length, radialSegments),
        material
    );
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    mesh.castShadow = true;
    return mesh;
}

function createPoleBetween(start, end, radius = 0.045) {
    return createCylinderBetween(start, end, radius, poleMat, 6);
}

function createSmokeFlapGeometry(width, height) {
    const half = width * 0.5;
    const shape = new THREE.Shape();
    shape.moveTo(-half, -height * 0.5);
    shape.lineTo(-half * 0.1, height * 0.5);
    shape.lineTo(half, height * 0.18);
    shape.lineTo(half * 0.7, -height * 0.5);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
}

function createTipi() {
    const group = new THREE.Group();
    const baseRadius = 1.58;
    const bodyHeight = 4.15;
    const apexY = 4.32;
    const frontAngle = Math.PI * 0.2;
    const openingWidth = 1.16;
    const openingHalf = openingWidth * 0.5;
    const shellStart = frontAngle + openingHalf;
    const shellLength = Math.PI * 2 - openingWidth;

    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.72, 24), groundShadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.03;
    shadow.scale.set(1.06, 1, 0.95);
    group.add(shadow);

    const body = new THREE.Mesh(
        new THREE.ConeGeometry(baseRadius, bodyHeight, 16, 1, true, shellStart, shellLength),
        canvasMat
    );
    body.position.y = bodyHeight * 0.5;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const bodyInner = new THREE.Mesh(
        new THREE.ConeGeometry(baseRadius * 0.94, bodyHeight * 0.92, 16, 1, true, shellStart, shellLength),
        canvasShadeMat
    );
    bodyInner.position.set(0, bodyHeight * 0.48, -0.06);
    bodyInner.castShadow = true;
    group.add(bodyInner);

    const supportPoleCount = 12;
    for (let i = 0; i < supportPoleCount; i++) {
        const angle = (i / supportPoleCount) * Math.PI * 2 + 0.18;
        const doorDelta = Math.atan2(Math.sin(angle - frontAngle), Math.cos(angle - frontAngle));
        if (Math.abs(doorDelta) < openingHalf + 0.12) continue;
        const start = new THREE.Vector3(
            Math.cos(angle) * (baseRadius * 0.96),
            0.06,
            Math.sin(angle) * (baseRadius * 0.96)
        );
        const end = new THREE.Vector3(
            Math.cos(angle) * 0.16,
            apexY + 0.86 + Math.sin(i * 1.3) * 0.08,
            Math.sin(angle) * 0.16
        );
        group.add(createPoleBetween(start, end, 0.043));
    }

    group.add(createPole(2.1, 0.04, -0.12, 4.22, 0.7));
    group.add(createPole(2.2, -0.08, 0.1, 4.26, -0.62));

    const apexStart = new THREE.Vector3(0, apexY + 0.2, 0.03);
    const apexTips = [
        new THREE.Vector3(-0.28, apexY + 1.55, 0.2),
        new THREE.Vector3(-0.14, apexY + 1.72, -0.08),
        new THREE.Vector3(0.02, apexY + 1.78, 0.06),
        new THREE.Vector3(0.18, apexY + 1.62, -0.12),
        new THREE.Vector3(0.32, apexY + 1.46, 0.18),
    ];
    apexTips.forEach((tip) => {
        group.add(createPoleBetween(apexStart, tip, 0.032));
    });

    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.016, 6, 18), ropeMat);
    tie.position.set(0, 3.34, 0.02);
    tie.rotation.x = Math.PI / 2;
    group.add(tie);

    const lashWrap = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 10), ropeMat);
    lashWrap.position.set(0, apexY + 0.28, 0.02);
    lashWrap.rotation.z = Math.PI / 2;
    group.add(lashWrap);

    const entryHide = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.66, 10), hideMat);
    entryHide.rotation.z = Math.PI * 0.5;
    entryHide.position.set(-0.86, 0.24, 0.68);
    entryHide.castShadow = true;
    group.add(entryHide);

    group.scale.setScalar(TIPI_SCALE);

    group.traverse((obj) => {
        if (!obj.isMesh) return;
        obj.receiveShadow = true;
    });

    return group;
}

function createCampfireParticle(spec, material) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(spec.size, 6, 6), material);
    mesh.position.copy(spec.position);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return {
        mesh,
        angle: spec.angle,
        radius: spec.radius,
        speed: spec.speed,
        height: spec.height,
        drift: spec.drift,
        phase: spec.phase,
        scale: spec.scale ?? 1,
    };
}

function updateCampfire(asset, dt, time, camera) {
    const data = asset.userData.campfire;
    if (!data) return;

    const flicker = 0.92 + Math.sin(time * 11 + data.flickerOffset) * 0.08 + Math.sin(time * 7.2) * 0.05;
    data.flameCore.scale.set(
        1 + Math.sin(time * 10.5 + 0.8) * 0.08,
        flicker,
        1 + Math.cos(time * 8.7) * 0.06
    );
    data.flameOuter.scale.set(
        1 + Math.cos(time * 8.1 + 0.4) * 0.14,
        0.94 + Math.sin(time * 9.4) * 0.1,
        1 + Math.sin(time * 7.7 + 1.3) * 0.12
    );
    data.light.intensity = 0.75 + Math.sin(time * 12 + data.flickerOffset) * 0.12;
    data.light.distance = 4 + Math.cos(time * 6.5) * 0.2;

    data.embers.forEach((particle, index) => {
        particle.angle += dt * particle.speed;
        let nextY = particle.mesh.position.y + dt * particle.speed * 0.42;
        if (nextY > particle.height) {
            nextY = 0.14 + index * 0.01;
            particle.angle = particle.phase + time * 0.3;
        }

        const swirl = Math.sin(time * 2.8 + particle.phase) * particle.drift;
        particle.mesh.position.set(
            Math.cos(particle.angle) * (particle.radius + swirl),
            nextY,
            Math.sin(particle.angle * 1.2) * (particle.radius * 0.75 + swirl * 0.5)
        );
        const alpha = Math.max(0, 1 - nextY / particle.height);
        particle.mesh.material.opacity = 0.48 * alpha;
        particle.mesh.scale.setScalar((0.55 + alpha * 0.75) * particle.scale);
        if (camera) {
            particle.mesh.quaternion.copy(camera.quaternion);
        }
    });

    data.smoke.forEach((particle, index) => {
        particle.angle += dt * particle.speed;
        let nextY = particle.mesh.position.y + dt * particle.speed * 0.24;
        if (nextY > particle.height) {
            nextY = 0.42 + index * 0.05;
            particle.angle = particle.phase;
        }

        const drift = Math.sin(time * 1.4 + particle.phase) * particle.drift;
        particle.mesh.position.set(
            Math.cos(particle.angle) * (particle.radius + drift),
            nextY,
            Math.sin(particle.angle) * (particle.radius + drift * 0.7)
        );
        const alpha = Math.max(0, 1 - nextY / particle.height);
        particle.mesh.material.opacity = 0.2 * alpha;
        particle.mesh.scale.setScalar((0.85 + nextY * 0.28) * particle.scale);
        if (camera) {
            particle.mesh.quaternion.copy(camera.quaternion);
        }
    });
}

function createCampfire() {
    const group = new THREE.Group();

    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.86, 18), groundShadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    shadow.scale.set(1.15, 1, 0.9);
    group.add(shadow);

    const ash = new THREE.Mesh(new THREE.CircleGeometry(0.4, 14), ashMat);
    ash.rotation.x = -Math.PI / 2;
    ash.position.y = 0.03;
    group.add(ash);

    for (let i = 0; i < 7; i++) {
        const angle = (i / 7) * Math.PI * 2 + 0.18;
        const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), stoneMat);
        stone.position.set(Math.cos(angle) * 0.42, 0.08, Math.sin(angle) * 0.34);
        stone.rotation.set(angle * 0.4, angle * 1.2, 0);
        stone.scale.set(1.1, 0.72, 0.92);
        stone.castShadow = true;
        stone.receiveShadow = true;
        group.add(stone);
    }

    const logPairs = [
        { angle: 0.12, y: 0.12, zTilt: 0.24 },
        { angle: Math.PI * 0.5 + 0.18, y: 0.16, zTilt: -0.22 },
    ];
    logPairs.forEach((pair) => {
        for (let side = -1; side <= 1; side += 2) {
            const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.18, 8), firewoodMat);
            log.rotation.z = Math.PI * 0.5 + pair.zTilt * side;
            log.rotation.y = pair.angle;
            log.position.set(
                Math.cos(pair.angle + Math.PI * 0.5) * 0.09 * side,
                pair.y,
                Math.sin(pair.angle + Math.PI * 0.5) * 0.09 * side
            );
            log.castShadow = true;
            group.add(log);

            const charMark = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.52, 6), firewoodDarkMat);
            charMark.rotation.copy(log.rotation);
            charMark.position.copy(log.position).add(new THREE.Vector3(0, 0.03, 0));
            charMark.castShadow = true;
            group.add(charMark);
        }
    });

    const coal = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), emberMat);
    coal.position.set(0, 0.16, 0);
    coal.scale.set(1.2, 0.7, 1);
    coal.castShadow = true;
    group.add(coal);

    const flameOuter = new THREE.Mesh(new THREE.OctahedronGeometry(0.25, 0), flameOuterMat);
    flameOuter.position.set(0, 0.34, 0.02);
    flameOuter.scale.set(1, 1.55, 1);
    group.add(flameOuter);

    const flameCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), flameCoreMat);
    flameCore.position.set(0, 0.4, 0.02);
    flameCore.scale.set(0.8, 1.35, 0.8);
    group.add(flameCore);

    const light = new THREE.PointLight(0xff9b47, 0.8, 4.2, 2);
    light.position.set(0, 0.55, 0.04);
    light.castShadow = false;
    group.add(light);

    const embers = [];
    const emberSpecs = [
        { size: 0.028, position: new THREE.Vector3(0.02, 0.18, 0), angle: 0.2, radius: 0.03, speed: 0.9, height: 1.15, drift: 0.025, phase: 0.4, scale: 1.1 },
        { size: 0.024, position: new THREE.Vector3(-0.03, 0.22, 0.01), angle: 1.6, radius: 0.04, speed: 0.75, height: 1.05, drift: 0.022, phase: 1.3 },
        { size: 0.02, position: new THREE.Vector3(0.01, 0.28, -0.02), angle: 2.4, radius: 0.035, speed: 0.68, height: 1, drift: 0.018, phase: 2.6 },
        { size: 0.022, position: new THREE.Vector3(-0.02, 0.14, 0.02), angle: 3.5, radius: 0.03, speed: 0.82, height: 1.2, drift: 0.026, phase: 3.1 },
    ];
    emberSpecs.forEach((spec) => {
        const particle = createCampfireParticle(spec, flameOuterMat.clone());
        particle.mesh.material.opacity = 0.4;
        group.add(particle.mesh);
        embers.push(particle);
    });

    const smoke = [];
    const smokeSpecs = [
        { size: 0.06, position: new THREE.Vector3(0, 0.48, 0), angle: 0.8, radius: 0.02, speed: 0.34, height: 1.9, drift: 0.04, phase: 0.1, scale: 0.9 },
        { size: 0.05, position: new THREE.Vector3(0.02, 0.62, 0.01), angle: 2.1, radius: 0.03, speed: 0.28, height: 2.05, drift: 0.05, phase: 1.4, scale: 0.85 },
        { size: 0.045, position: new THREE.Vector3(-0.01, 0.74, -0.01), angle: 3.2, radius: 0.025, speed: 0.24, height: 2.2, drift: 0.055, phase: 2.2, scale: 0.8 },
    ];
    smokeSpecs.forEach((spec) => {
        const particle = createCampfireParticle(spec, smokeMat.clone());
        group.add(particle.mesh);
        smoke.push(particle);
    });

    group.userData.campfire = {
        embers,
        smoke,
        flameCore,
        flameOuter,
        light,
        flickerOffset: Math.random() * Math.PI * 2,
    };
    group.userData.update = updateCampfire;
    group.scale.setScalar(CAMPFIRE_SCALE);

    group.traverse((obj) => {
        if (!obj.isMesh) return;
        obj.receiveShadow = true;
    });

    return group;
}

export function createVillageAsset(type) {
    const builder = ASSET_BUILDERS[type];
    if (!builder) return null;
    const asset = builder.create();
    asset.userData.placeableType = type;
    asset.userData.colliderRadius = builder.colliderRadius;
    return asset;
}

export function spawnVillagePlacement(scene, placement, resolveGroundY) {
    const asset = createVillageAsset(placement.type);
    if (!asset) return null;

    const scale = typeof placement.scale === 'number' ? placement.scale : 1;
    const modelScale = asset.scale.x || 1;
    const y = typeof placement.y === 'number'
        ? placement.y
        : resolveGroundY(placement.x, placement.z);

    asset.position.set(placement.x, y + (placement.yOffset ?? 0), placement.z);
    asset.rotation.y = placement.rotation ?? 0;
    asset.scale.setScalar(modelScale * scale);
    asset.userData.placementRef = placement;
    asset.userData.isVillageAssetRoot = true;

    scene.add(asset);
    asset.userData.colliderRef = addCollider(placement.x, placement.z, asset.userData.colliderRadius * scale);
    asset.traverse((obj) => {
        obj.userData.villageAssetRoot = asset;
    });
    return asset;
}

export function spawnVillageLayout(scene, placements, resolveGroundY) {
    const spawned = [];

    placements.forEach((placement) => {
        const asset = spawnVillagePlacement(scene, placement, resolveGroundY);
        if (asset) spawned.push(asset);
    });

    return spawned;
}

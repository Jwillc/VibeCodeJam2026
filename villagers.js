import * as THREE from 'three';
import { applyFaceState, resolveFaceState } from './characterState.js';

const outlineMat = new THREE.MeshBasicMaterial({ color: 0x24170d });
const shadowTexture = createShadowTexture();
const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    depthWrite: false,
    opacity: 0.78,
});
const logMat = new THREE.MeshBasicMaterial({ color: 0x6c4528 });
const barkMat = new THREE.MeshBasicMaterial({ color: 0x4a2f1a });
const rodMat = new THREE.MeshBasicMaterial({ color: 0x5b4129 });
const lineMat = new THREE.LineBasicMaterial({
    color: 0xdce8ef,
    transparent: true,
    opacity: 0.72,
});
const bobberMat = new THREE.MeshBasicMaterial({ color: 0xd4472c });
const TIPI_OBSTACLE_RADIUS = 2.3;
const VILLAGER_RADIUS = 0.42;
const TIPI_PATROL_DISTANCE = 4.35;
const OBSTACLE_MARGIN = 0.45;
const PATH_NODE_PADDING = 0.9;
const PATH_NODE_SAMPLES = 10;
const STUCK_MOVE_EPSILON = 0.02;
const STUCK_TIME_THRESHOLD = 0.42;

function createShadowTexture() {
    if (typeof document === 'undefined') return null;

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.46)');
    gradient.addColorStop(0.58, 'rgba(0, 0, 0, 0.18)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

function makeRoundedRect(width, height, radius, material) {
    const shape = new THREE.Shape();
    const x = -width / 2;
    const y = -height / 2;
    shape.moveTo(x + radius, y);
    shape.lineTo(x + width - radius, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + radius);
    shape.lineTo(x + width, y + height - radius);
    shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    shape.lineTo(x + radius, y + height);
    shape.quadraticCurveTo(x, y + height, x, y + height - radius);
    shape.lineTo(x, y + radius);
    shape.quadraticCurveTo(x, y, x + radius, y);
    return new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
}

function darken(hex, amount) {
    const color = new THREE.Color(hex);
    color.multiplyScalar(amount);
    return color.getHex();
}

function createVillagerMaterials(palette) {
    return {
        skin: new THREE.MeshBasicMaterial({ color: palette.skin ?? 0xc4a06e }),
        skinDark: new THREE.MeshBasicMaterial({ color: darken(palette.skin ?? 0xc4a06e, 0.82) }),
        body: new THREE.MeshBasicMaterial({ color: palette.body }),
        bodyDark: new THREE.MeshBasicMaterial({ color: darken(palette.body, 0.74) }),
        accent: new THREE.MeshBasicMaterial({ color: palette.accent }),
        hair: new THREE.MeshBasicMaterial({ color: palette.hair ?? 0x4f311e }),
        boot: new THREE.MeshBasicMaterial({ color: palette.boot ?? 0x5e432d }),
    };
}

function createVillagerFigure(palette) {
    const materials = createVillagerMaterials(palette);
    const figure = new THREE.Group();
    const S = 0.75;

    const torsoOut = makeRoundedRect(0.8 * S, 1.2 * S, 0.12 * S, outlineMat);
    torsoOut.position.set(0, 1.3 * S, 0);
    figure.add(torsoOut);

    const torsoFill = makeRoundedRect(0.7 * S, 1.08 * S, 0.1 * S, materials.body);
    torsoFill.position.set(0, 1.3 * S, 0.01);
    figure.add(torsoFill);

    const chestBand = makeRoundedRect(0.6 * S, 0.18 * S, 0.05 * S, materials.accent);
    chestBand.position.set(0, 1.48 * S, 0.02);
    figure.add(chestBand);

    const belt = makeRoundedRect(0.68 * S, 0.12 * S, 0.04 * S, materials.bodyDark);
    belt.position.set(0, 0.82 * S, 0.02);
    figure.add(belt);

    const shoulderLeft = new THREE.Mesh(new THREE.CircleGeometry(0.14 * S, 14), materials.body);
    shoulderLeft.position.set(-0.39 * S, 1.76 * S, 0.01);
    figure.add(shoulderLeft);

    const shoulderRight = new THREE.Mesh(new THREE.CircleGeometry(0.14 * S, 14), materials.body);
    shoulderRight.position.set(0.39 * S, 1.76 * S, 0.01);
    figure.add(shoulderRight);

    const neck = makeRoundedRect(0.26 * S, 0.18 * S, 0.04 * S, materials.skin);
    neck.position.set(0, 1.98 * S, 0.01);
    figure.add(neck);

    const head = new THREE.Group();
    head.position.set(0, 2.38 * S, 0);
    figure.add(head);

    const hair = makeRoundedRect(0.54 * S, 0.22 * S, 0.1 * S, materials.hair);
    hair.position.set(0, 0.22 * S, 0.02);
    head.add(hair);

    const headOut = makeRoundedRect(0.62 * S, 0.62 * S, 0.18 * S, outlineMat);
    headOut.position.set(0, 0, 0);
    head.add(headOut);

    const headFill = makeRoundedRect(0.54 * S, 0.54 * S, 0.16 * S, materials.skin);
    headFill.position.set(0, 0, 0.01);
    head.add(headFill);

    const sideface = new THREE.Group();
    const sideEye = new THREE.Mesh(new THREE.CircleGeometry(0.045 * S, 10), outlineMat);
    sideEye.position.set(0.12 * S, 0.02 * S, 0.03);
    sideface.add(sideEye);
    head.add(sideface);

    const frontface = new THREE.Group();
    const eyeL = new THREE.Mesh(new THREE.CircleGeometry(0.04 * S, 10), outlineMat);
    eyeL.position.set(-0.08 * S, 0.02 * S, 0.03);
    frontface.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.CircleGeometry(0.04 * S, 10), outlineMat);
    eyeR.position.set(0.08 * S, 0.02 * S, 0.03);
    frontface.add(eyeR);
    frontface.visible = false;
    head.add(frontface);

    const shoulderY = 1.78 * S;

    const upperArmBack = new THREE.Group();
    const upperArmBackOut = makeRoundedRect(0.18 * S, 0.48 * S, 0.06 * S, outlineMat);
    upperArmBackOut.position.y = -0.22 * S;
    upperArmBack.add(upperArmBackOut);
    const upperArmBackFill = makeRoundedRect(0.13 * S, 0.42 * S, 0.05 * S, materials.skin);
    upperArmBackFill.position.set(0, -0.22 * S, 0.01);
    upperArmBack.add(upperArmBackFill);
    upperArmBack.position.set(-0.44 * S, shoulderY, -0.02);
    figure.add(upperArmBack);

    const forearmBack = new THREE.Group();
    const forearmBackOut = makeRoundedRect(0.17 * S, 0.42 * S, 0.05 * S, outlineMat);
    forearmBackOut.position.y = -0.2 * S;
    forearmBack.add(forearmBackOut);
    const forearmBackFill = makeRoundedRect(0.12 * S, 0.36 * S, 0.04 * S, materials.skinDark);
    forearmBackFill.position.set(0, -0.2 * S, 0.01);
    forearmBack.add(forearmBackFill);
    const handBack = new THREE.Mesh(new THREE.CircleGeometry(0.055 * S, 8), materials.skin);
    handBack.position.set(0, -0.4 * S, 0.01);
    forearmBack.add(handBack);
    forearmBack.position.set(0, -0.42 * S, 0);
    upperArmBack.add(forearmBack);

    const upperArmFront = new THREE.Group();
    const upperArmFrontOut = makeRoundedRect(0.18 * S, 0.48 * S, 0.06 * S, outlineMat);
    upperArmFrontOut.position.y = -0.22 * S;
    upperArmFront.add(upperArmFrontOut);
    const upperArmFrontFill = makeRoundedRect(0.13 * S, 0.42 * S, 0.05 * S, materials.skin);
    upperArmFrontFill.position.set(0, -0.22 * S, 0.01);
    upperArmFront.add(upperArmFrontFill);
    upperArmFront.position.set(0.44 * S, shoulderY, 0.03);
    figure.add(upperArmFront);

    const forearmFront = new THREE.Group();
    const forearmFrontOut = makeRoundedRect(0.17 * S, 0.42 * S, 0.05 * S, outlineMat);
    forearmFrontOut.position.y = -0.2 * S;
    forearmFront.add(forearmFrontOut);
    const forearmFrontFill = makeRoundedRect(0.12 * S, 0.36 * S, 0.04 * S, materials.skinDark);
    forearmFrontFill.position.set(0, -0.2 * S, 0.01);
    forearmFront.add(forearmFrontFill);
    const handFront = new THREE.Mesh(new THREE.CircleGeometry(0.055 * S, 8), materials.skin);
    handFront.position.set(0, -0.4 * S, 0.01);
    forearmFront.add(handFront);
    forearmFront.position.set(0, -0.42 * S, 0);
    upperArmFront.add(forearmFront);

    const hipY = 0.75 * S;

    const upperLegL = new THREE.Group();
    const upperLegLOut = makeRoundedRect(0.18 * S, 0.54 * S, 0.06 * S, outlineMat);
    upperLegLOut.position.y = -0.26 * S;
    upperLegL.add(upperLegLOut);
    const upperLegLFill = makeRoundedRect(0.13 * S, 0.48 * S, 0.05 * S, materials.bodyDark);
    upperLegLFill.position.set(0, -0.26 * S, 0.01);
    upperLegL.add(upperLegLFill);
    upperLegL.position.set(-0.16 * S, hipY, 0);
    figure.add(upperLegL);

    const lowerLegL = new THREE.Group();
    const lowerLegLOut = makeRoundedRect(0.16 * S, 0.48 * S, 0.05 * S, outlineMat);
    lowerLegLOut.position.y = -0.22 * S;
    lowerLegL.add(lowerLegLOut);
    const lowerLegLFill = makeRoundedRect(0.11 * S, 0.42 * S, 0.04 * S, materials.bodyDark);
    lowerLegLFill.position.set(0, -0.22 * S, 0.01);
    lowerLegL.add(lowerLegLFill);
    const bootL = makeRoundedRect(0.2 * S, 0.1 * S, 0.04 * S, materials.boot);
    bootL.position.set(0.02 * S, -0.46 * S, 0.01);
    lowerLegL.add(bootL);
    lowerLegL.position.set(0, -0.5 * S, 0);
    upperLegL.add(lowerLegL);

    const upperLegR = new THREE.Group();
    const upperLegROut = makeRoundedRect(0.18 * S, 0.54 * S, 0.06 * S, outlineMat);
    upperLegROut.position.y = -0.26 * S;
    upperLegR.add(upperLegROut);
    const upperLegRFill = makeRoundedRect(0.13 * S, 0.48 * S, 0.05 * S, materials.bodyDark);
    upperLegRFill.position.set(0, -0.26 * S, 0.01);
    upperLegR.add(upperLegRFill);
    upperLegR.position.set(0.16 * S, hipY, 0);
    figure.add(upperLegR);

    const lowerLegR = new THREE.Group();
    const lowerLegROut = makeRoundedRect(0.16 * S, 0.48 * S, 0.05 * S, outlineMat);
    lowerLegROut.position.y = -0.22 * S;
    lowerLegR.add(lowerLegROut);
    const lowerLegRFill = makeRoundedRect(0.11 * S, 0.42 * S, 0.04 * S, materials.bodyDark);
    lowerLegRFill.position.set(0, -0.22 * S, 0.01);
    lowerLegR.add(lowerLegRFill);
    const bootR = makeRoundedRect(0.2 * S, 0.1 * S, 0.04 * S, materials.boot);
    bootR.position.set(0.02 * S, -0.46 * S, 0.01);
    lowerLegR.add(bootR);
    lowerLegR.position.set(0, -0.5 * S, 0);
    upperLegR.add(lowerLegR);

    figure.userData = {
        facing: 1,
        head,
        upperArmBack,
        forearmBack,
        upperArmFront,
        forearmFront,
        upperLegL,
        lowerLegL,
        upperLegR,
        lowerLegR,
        sideface,
        frontface,
        motionOffset: Math.random() * Math.PI * 2,
    };

    figure.traverse((obj) => {
        if (!obj.isMesh) return;
        obj.castShadow = false;
        obj.receiveShadow = false;
    });

    return figure;
}

function createLogProp() {
    const group = new THREE.Group();

    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 1.15, 8), logMat);
    log.rotation.z = Math.PI / 2;
    group.add(log);

    for (let i = -1; i <= 1; i += 2) {
        const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.22, 6), barkMat);
        strap.rotation.z = Math.PI / 2;
        strap.position.x = i * 0.22;
        group.add(strap);
    }

    group.position.set(0.04, 0.96, 0.06);
    return group;
}

function createFishingRodProp() {
    const group = new THREE.Group();

    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.024, 1.52, 6), rodMat);
    rod.position.set(0.38, 1.08, 0.02);
    rod.rotation.z = -0.72;
    group.add(rod);

    const tipMarker = new THREE.Object3D();
    tipMarker.position.set(0, 0.72, 0);
    rod.add(tipMarker);

    return { group, tipMarker };
}

function createFishingCastProp() {
    const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(),
    ]);
    const line = new THREE.Line(geometry, lineMat.clone());
    const bobber = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), bobberMat);
    bobber.renderOrder = 2;
    return { line, bobber };
}

function createVillagerRoot(figure) {
    const root = new THREE.Group();

    const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 0.95),
        shadowMat.clone()
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    root.add(shadow);

    root.add(figure);
    return { root, shadow };
}

function createTipiObstacles(tipis) {
    return tipis.map((tipi) => ({
        x: tipi.x,
        z: tipi.z,
        radius: TIPI_OBSTACLE_RADIUS * (typeof tipi.scale === 'number' ? tipi.scale : 1),
    }));
}

function averagePoint(points) {
    if (!points.length) return { x: 0, z: 0 };
    const total = points.reduce((acc, point) => {
        acc.x += point.x;
        acc.z += point.z;
        return acc;
    }, { x: 0, z: 0 });
    return {
        x: total.x / points.length,
        z: total.z / points.length,
    };
}

function findDryPointNear(target, resolveGroundY, isLake, maxRadius = 10) {
    if (!isLake || !isLake(target.x, target.z)) {
        return {
            x: target.x,
            y: resolveGroundY(target.x, target.z),
            z: target.z,
        };
    }

    for (let radius = 0.8; radius <= maxRadius; radius += 0.7) {
        const steps = Math.max(10, Math.round(radius * 8));
        for (let i = 0; i < steps; i++) {
            const angle = (i / steps) * Math.PI * 2;
            const x = target.x + Math.cos(angle) * radius;
            const z = target.z + Math.sin(angle) * radius;
            if (isLake(x, z)) continue;
            return { x, y: resolveGroundY(x, z), z };
        }
    }

    return {
        x: target.x,
        y: resolveGroundY(target.x, target.z),
        z: target.z,
    };
}

function findFishingSpot(center, resolveGroundY, isLake) {
    if (!isLake) {
        const fallback = {
            x: center.x - 7,
            y: resolveGroundY(center.x - 7, center.z),
            z: center.z + 1.5,
        };
        return {
            shore: fallback,
            water: { x: fallback.x - 1.8, z: fallback.z },
        };
    }

    let best = null;
    for (let radius = 8; radius <= 36; radius += 1.2) {
        const steps = Math.max(18, Math.round(radius * 3.2));
        for (let i = 0; i < steps; i++) {
            const angle = (i / steps) * Math.PI * 2;
            const x = center.x + Math.cos(angle) * radius;
            const z = center.z + Math.sin(angle) * radius;
            if (isLake(x, z)) continue;

            let water = null;
            for (const offset of [1.4, 2.6, 3.8, 5.2]) {
                const wx = center.x + Math.cos(angle) * (radius + offset);
                const wz = center.z + Math.sin(angle) * (radius + offset);
                if (isLake(wx, wz)) {
                    water = { x: wx, z: wz };
                }
            }
            if (!water) continue;

            best = {
                shore: { x, y: resolveGroundY(x, z), z },
                water,
            };
            break;
        }
        if (best) break;
    }

    if (best) return best;

    const fallback = {
        x: center.x - 7,
        y: resolveGroundY(center.x - 7, center.z),
        z: center.z + 1.5,
    };
    return {
        shore: fallback,
        water: { x: fallback.x - 1.8, z: fallback.z },
    };
}

function createTipiPatrolPoints(tipis, center, resolveGroundY, isLake) {
    if (!tipis.length) {
        return [
            findDryPointNear({ x: center.x - 3, z: center.z - 3 }, resolveGroundY, isLake),
            findDryPointNear({ x: center.x + 2, z: center.z - 5 }, resolveGroundY, isLake),
            findDryPointNear({ x: center.x - 4, z: center.z + 4 }, resolveGroundY, isLake),
        ];
    }

    return tipis.map((tipi, index) => {
        const angle = 0.6 + index * 1.43;
        const distance = TIPI_PATROL_DISTANCE + (index % 2 === 0 ? 0.35 : -0.15);
        return findDryPointNear({
            x: tipi.x + Math.cos(angle) * distance,
            z: tipi.z + Math.sin(angle) * distance,
        }, resolveGroundY, isLake, 4);
    });
}

function createWoodSourcePoints(campfirePoint, awayX, awayZ, sideX, sideZ, resolveGroundY, isLake) {
    const sourceSpecs = [
        { distance: 16.5, side: 6.8 },
        { distance: 21.5, side: 2.2 },
        { distance: 19.5, side: -5.4 },
    ];

    return sourceSpecs.map((spec) => findDryPointNear({
        x: campfirePoint.x + awayX * spec.distance + sideX * spec.side,
        z: campfirePoint.z + awayZ * spec.distance + sideZ * spec.side,
    }, resolveGroundY, isLake, 16));
}

function setLookDirection(villager, dx, dz) {
    const length = Math.hypot(dx, dz);
    if (length < 0.001) return;
    villager.lookX = dx / length;
    villager.lookZ = dz / length;
}

function getObstacleClearance(villager, obstacle) {
    return obstacle.radius + villager.radius + OBSTACLE_MARGIN;
}

function getPointDistanceToSegment(px, pz, ax, az, bx, bz) {
    const abX = bx - ax;
    const abZ = bz - az;
    const abLenSq = abX * abX + abZ * abZ;
    if (abLenSq < 0.0001) {
        return {
            distance: Math.hypot(px - ax, pz - az),
            t: 0,
        };
    }

    const apX = px - ax;
    const apZ = pz - az;
    const t = THREE.MathUtils.clamp((apX * abX + apZ * abZ) / abLenSq, 0, 1);
    const closestX = ax + abX * t;
    const closestZ = az + abZ * t;
    return {
        distance: Math.hypot(px - closestX, pz - closestZ),
        t,
    };
}

function findBlockingObstacle(villager, target) {
    const obstacles = villager.obstacles;
    if (!obstacles?.length) return null;

    const ax = villager.root.position.x;
    const az = villager.root.position.z;
    let best = null;

    obstacles.forEach((obstacle) => {
        const clearance = getObstacleClearance(villager, obstacle);
        const hit = getPointDistanceToSegment(obstacle.x, obstacle.z, ax, az, target.x, target.z);
        if (hit.t <= 0.05 || hit.t >= 0.98 || hit.distance > clearance) return;
        if (!best || hit.t < best.t) {
            best = { obstacle, t: hit.t };
        }
    });

    return best?.obstacle ?? null;
}

function findNearestObstacle(villager) {
    const obstacles = villager.obstacles;
    if (!obstacles?.length) return null;

    let best = null;
    obstacles.forEach((obstacle) => {
        const distance = Math.hypot(
            villager.root.position.x - obstacle.x,
            villager.root.position.z - obstacle.z
        );
        if (!best || distance < best.distance) {
            best = { obstacle, distance };
        }
    });
    return best?.obstacle ?? null;
}

function pushPointOutsideObstacles(villager, point, preferredX = 1, preferredZ = 0) {
    let x = point.x;
    let z = point.z;
    const obstacles = villager.obstacles;
    if (!obstacles?.length) return { x, z };

    obstacles.forEach((obstacle) => {
        const clearance = getObstacleClearance(villager, obstacle);
        let dx = x - obstacle.x;
        let dz = z - obstacle.z;
        let distance = Math.hypot(dx, dz);
        if (distance >= clearance) return;

        if (distance < 0.001) {
            dx = preferredX;
            dz = preferredZ;
            distance = Math.hypot(dx, dz) || 1;
        }

        x = obstacle.x + (dx / distance) * clearance;
        z = obstacle.z + (dz / distance) * clearance;
    });

    return { x, z };
}

function getTargetSignature(target) {
    return `${target.x.toFixed(2)},${target.z.toFixed(2)}`;
}

function isPointClearOfObstacles(villager, point, epsilon = 0.04) {
    const obstacles = villager.obstacles;
    if (!obstacles?.length) return true;

    return obstacles.every((obstacle) => {
        const clearance = getObstacleClearance(villager, obstacle) - epsilon;
        const distance = Math.hypot(point.x - obstacle.x, point.z - obstacle.z);
        return distance >= clearance;
    });
}

function isSegmentClearOfObstacles(villager, from, to, epsilon = 0.04) {
    const obstacles = villager.obstacles;
    if (!obstacles?.length) return true;

    return obstacles.every((obstacle) => {
        const clearance = getObstacleClearance(villager, obstacle) - epsilon;
        const hit = getPointDistanceToSegment(obstacle.x, obstacle.z, from.x, from.z, to.x, to.z);
        return hit.distance >= clearance || hit.t <= 0.001 || hit.t >= 0.999;
    });
}

function createPathNodes(villager, start, target) {
    const nodes = [
        { x: start.x, z: start.z },
        { x: target.x, z: target.z },
    ];
    const obstacles = villager.obstacles;
    if (!obstacles?.length) return nodes;

    obstacles.forEach((obstacle, obstacleIndex) => {
        const radius = getObstacleClearance(villager, obstacle) + PATH_NODE_PADDING;
        for (let i = 0; i < PATH_NODE_SAMPLES; i++) {
            const angle = (i / PATH_NODE_SAMPLES) * Math.PI * 2 + obstacleIndex * 0.23;
            const candidate = pushPointOutsideObstacles(villager, {
                x: obstacle.x + Math.cos(angle) * radius,
                z: obstacle.z + Math.sin(angle) * radius,
            }, Math.cos(angle), Math.sin(angle));

            if (isPointClearOfObstacles(villager, candidate)) {
                nodes.push(candidate);
            }
        }
    });

    return nodes;
}

function planVillagerPath(villager, target) {
    const start = {
        x: villager.root.position.x,
        z: villager.root.position.z,
    };

    if (isSegmentClearOfObstacles(villager, start, target)) {
        return [target];
    }

    const nodes = createPathNodes(villager, start, target);
    const nodeCount = nodes.length;
    const dist = new Array(nodeCount).fill(Infinity);
    const prev = new Array(nodeCount).fill(-1);
    const visited = new Array(nodeCount).fill(false);

    dist[0] = 0;

    for (let step = 0; step < nodeCount; step++) {
        let current = -1;
        let best = Infinity;
        for (let i = 0; i < nodeCount; i++) {
            if (!visited[i] && dist[i] < best) {
                best = dist[i];
                current = i;
            }
        }

        if (current === -1 || current === 1) break;
        visited[current] = true;

        for (let next = 0; next < nodeCount; next++) {
            if (next === current || visited[next]) continue;
            if (!isSegmentClearOfObstacles(villager, nodes[current], nodes[next])) continue;

            const edge = Math.hypot(
                nodes[next].x - nodes[current].x,
                nodes[next].z - nodes[current].z
            );
            const nextDist = dist[current] + edge;
            if (nextDist < dist[next]) {
                dist[next] = nextDist;
                prev[next] = current;
            }
        }
    }

    if (!Number.isFinite(dist[1])) {
        return [target];
    }

    const path = [];
    let current = 1;
    while (current !== -1) {
        path.push(nodes[current]);
        current = prev[current];
    }
    path.reverse();
    path.shift();
    return path.length ? path : [target];
}

function steerVillagerDirection(villager, desiredX, desiredZ) {
    let steerX = desiredX;
    let steerZ = desiredZ;
    const obstacles = villager.obstacles;
    if (!obstacles?.length) return { x: desiredX, z: desiredZ };

    const posX = villager.root.position.x;
    const posZ = villager.root.position.z;

    obstacles.forEach((obstacle) => {
        const toObstacleX = obstacle.x - posX;
        const toObstacleZ = obstacle.z - posZ;
        const distance = Math.hypot(toObstacleX, toObstacleZ) || 0.0001;
        const minDistance = obstacle.radius + villager.radius;
        const influenceDistance = minDistance + 2.2;
        if (distance > influenceDistance) return;

        const forward = desiredX * toObstacleX + desiredZ * toObstacleZ;
        if (forward < -minDistance) return;

        const awayX = -toObstacleX / distance;
        const awayZ = -toObstacleZ / distance;
        const closeness = THREE.MathUtils.clamp(
            1 - (distance - minDistance) / Math.max(0.001, influenceDistance - minDistance),
            0,
            1
        );
        const side = desiredX * toObstacleZ - desiredZ * toObstacleX;
        const tangentSign = side >= 0 ? -1 : 1;
        const tangentX = -awayZ * tangentSign;
        const tangentZ = awayX * tangentSign;

        steerX += awayX * closeness * 1.45 + tangentX * closeness * 1.1;
        steerZ += awayZ * closeness * 1.45 + tangentZ * closeness * 1.1;
    });

    const length = Math.hypot(steerX, steerZ) || 1;
    return {
        x: steerX / length,
        z: steerZ / length,
    };
}

function resolveVillagerObstacles(villager, x, z, preferredX, preferredZ) {
    let resolvedX = x;
    let resolvedZ = z;
    const obstacles = villager.obstacles;
    if (!obstacles?.length) return { x: resolvedX, z: resolvedZ };

    obstacles.forEach((obstacle) => {
        const minDistance = obstacle.radius + villager.radius;
        let dx = resolvedX - obstacle.x;
        let dz = resolvedZ - obstacle.z;
        let distance = Math.hypot(dx, dz);
        if (distance >= minDistance) return;

        if (distance < 0.001) {
            dx = preferredX;
            dz = preferredZ;
            distance = Math.hypot(dx, dz) || 1;
        }

        resolvedX = obstacle.x + (dx / distance) * minDistance;
        resolvedZ = obstacle.z + (dz / distance) * minDistance;
    });

    return { x: resolvedX, z: resolvedZ };
}

function moveVillagerTo(villager, target, dt, arriveRadius = 0.2) {
    const preferredTargetX = target.x - villager.root.position.x;
    const preferredTargetZ = target.z - villager.root.position.z;
    const goalTarget = pushPointOutsideObstacles(
        villager,
        target,
        preferredTargetX,
        preferredTargetZ
    );
    const targetSignature = getTargetSignature(goalTarget);
    if (villager.activeTargetSignature !== targetSignature) {
        villager.activeTargetSignature = targetSignature;
        villager.pathWaypoints = planVillagerPath(villager, goalTarget);
        villager.lastGoalDistance = Infinity;
        villager.stuckTime = 0;
    }

    if (!villager.pathWaypoints?.length) {
        villager.pathWaypoints = [goalTarget];
    }

    while (villager.pathWaypoints.length > 1) {
        const waypoint = villager.pathWaypoints[0];
        const waypointDistance = Math.hypot(
            waypoint.x - villager.root.position.x,
            waypoint.z - villager.root.position.z
        );
        if (waypointDistance > 0.35) break;
        villager.pathWaypoints.shift();
    }

    const dx = goalTarget.x - villager.root.position.x;
    const dz = goalTarget.z - villager.root.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= arriveRadius) {
        villager.root.position.x = goalTarget.x;
        villager.root.position.z = goalTarget.z;
        villager.vx = 0;
        villager.vz = 0;
        setLookDirection(villager, dx, dz);
        villager.pathWaypoints = null;
        return true;
    }

    const activeTarget = villager.pathWaypoints[0] ?? goalTarget;
    const navDx = activeTarget.x - villager.root.position.x;
    const navDz = activeTarget.z - villager.root.position.z;
    const navDist = Math.hypot(navDx, navDz) || 1;
    const desiredX = navDx / navDist;
    const desiredZ = navDz / navDist;
    const step = Math.min(villager.speed * dt, navDist);
    const nextX = villager.root.position.x + desiredX * step;
    const nextZ = villager.root.position.z + desiredZ * step;
    const resolved = resolveVillagerObstacles(villager, nextX, nextZ, desiredX, desiredZ);
    const movedX = resolved.x - villager.root.position.x;
    const movedZ = resolved.z - villager.root.position.z;
    villager.root.position.x = resolved.x;
    villager.root.position.z = resolved.z;

    const movedDistance = Math.hypot(movedX, movedZ);
    if (movedDistance > 0.001 && dt > 0) {
        villager.vx = movedX / dt;
        villager.vz = movedZ / dt;
        setLookDirection(villager, movedX, movedZ);
    } else {
        villager.vx = 0;
        villager.vz = 0;
        setLookDirection(villager, desiredX, desiredZ);
    }

    const remaining = Math.hypot(goalTarget.x - villager.root.position.x, goalTarget.z - villager.root.position.z);
    const progress = villager.lastGoalDistance - remaining;
    if (movedDistance < STUCK_MOVE_EPSILON || progress < 0.002) {
        villager.stuckTime = (villager.stuckTime ?? 0) + dt;
    } else {
        villager.stuckTime = 0;
    }
    villager.lastGoalDistance = remaining;

    if (villager.stuckTime > STUCK_TIME_THRESHOLD) {
        villager.pathWaypoints = planVillagerPath(villager, goalTarget);
        villager.stuckTime = 0;
    }

    if (villager.pathWaypoints?.length > 1) {
        const waypoint = villager.pathWaypoints[0];
        const waypointDistance = Math.hypot(
            waypoint.x - villager.root.position.x,
            waypoint.z - villager.root.position.z
        );
        if (waypointDistance <= 0.35) {
            villager.pathWaypoints.shift();
        }
    }

    if (remaining <= arriveRadius || dist <= step + arriveRadius) {
        villager.pathWaypoints = null;
        return true;
    }

    return false;
}

function clampScaleSign(value) {
    return value < 0 ? -1 : 1;
}

function applyLowerBodyPose(data, moving, cycle, cycleB, breath, depthWalk) {
    if (moving) {
        if (depthWalk) {
            data.upperLegL.rotation.z = cycle * 0.08;
            data.lowerLegL.rotation.z = Math.max(0, -cycle) * 0.11;
            data.upperLegR.rotation.z = cycleB * 0.08;
            data.lowerLegR.rotation.z = Math.max(0, -cycleB) * 0.11;
            data.upperLegL.position.z = cycle * 0.09;
            data.upperLegR.position.z = cycleB * 0.09;
        } else {
            data.upperLegL.rotation.z = cycle * 0.28;
            data.lowerLegL.rotation.z = Math.max(0, -cycle) * 0.28;
            data.upperLegR.rotation.z = cycleB * 0.28;
            data.lowerLegR.rotation.z = Math.max(0, -cycleB) * 0.28;
            data.upperLegL.position.z = 0;
            data.upperLegR.position.z = 0;
        }
        return;
    }

    data.upperLegL.rotation.z = breath;
    data.lowerLegL.rotation.z = 0;
    data.upperLegR.rotation.z = -breath;
    data.lowerLegR.rotation.z = 0;
    data.upperLegL.position.z = 0;
    data.upperLegR.position.z = 0;
}

function applyDefaultArmPose(data, moving, cycle, cycleB, breath) {
    if (moving) {
        data.upperArmBack.rotation.z = -0.16 + cycle * 0.13;
        data.forearmBack.rotation.z = 0.15;
        data.upperArmFront.rotation.z = 0.16 + cycleB * 0.2;
        data.forearmFront.rotation.z = -0.14 + Math.max(0, -cycleB) * 0.14;
        return;
    }

    data.upperArmBack.rotation.z = -0.14 + breath;
    data.forearmBack.rotation.z = 0.14;
    data.upperArmFront.rotation.z = 0.14 - breath;
    data.forearmFront.rotation.z = -0.14;
}

function applyCarryPose(data, moving, cycle, cycleB, breath) {
    if (moving) {
        data.upperArmBack.rotation.z = -0.58 + cycle * 0.03;
        data.forearmBack.rotation.z = 0.72 + Math.max(0, cycle) * 0.05;
        data.upperArmFront.rotation.z = 0.6 + cycleB * 0.03;
        data.forearmFront.rotation.z = -0.72 - Math.max(0, cycleB) * 0.05;
        return;
    }

    data.upperArmBack.rotation.z = -0.56 + breath * 0.6;
    data.forearmBack.rotation.z = 0.7;
    data.upperArmFront.rotation.z = 0.56 - breath * 0.6;
    data.forearmFront.rotation.z = -0.7;
}

function applyWarmPose(data, breath) {
    data.upperArmBack.rotation.z = -0.7 + breath * 0.7;
    data.forearmBack.rotation.z = 0.95 + breath * 0.6;
    data.upperArmFront.rotation.z = 0.7 - breath * 0.7;
    data.forearmFront.rotation.z = -0.95 - breath * 0.6;
}

function applyFishPose(data, breath, time, villager) {
    const wobble = Math.sin(time * 2.8 + villager.phaseOffset) * 0.08;
    data.upperArmBack.rotation.z = -0.42 + wobble * 0.4;
    data.forearmBack.rotation.z = 0.68 + wobble * 0.35;
    data.upperArmFront.rotation.z = 0.96 + wobble * 0.2;
    data.forearmFront.rotation.z = -0.4 + wobble * 0.18;
    data.upperLegL.rotation.z = breath * 0.7;
    data.upperLegR.rotation.z = -breath * 0.7;
}

function updateFishingCast(villager, time) {
    if (!villager.rodProp?.tipMarker || !villager.castProp || !villager.castTarget) return;

    const tipWorld = villager.rodProp.tipMarker.getWorldPosition(new THREE.Vector3());
    const bobberWorld = new THREE.Vector3(
        villager.castTarget.x + Math.cos(time * 0.9 + villager.phaseOffset) * 0.09,
        villager.castWaterY + Math.sin(time * 2.5 + villager.phaseOffset) * 0.035,
        villager.castTarget.z + Math.sin(time * 0.8 + villager.phaseOffset * 0.7) * 0.07
    );

    villager.castProp.bobber.position.copy(bobberWorld);

    const positions = villager.castProp.line.geometry.attributes.position;
    positions.setXYZ(0, tipWorld.x, tipWorld.y, tipWorld.z);
    positions.setXYZ(1, bobberWorld.x, bobberWorld.y, bobberWorld.z);
    positions.needsUpdate = true;
    villager.castProp.line.geometry.computeBoundingSphere();
}

function animateVillager(villager, time, cameraAngle) {
    const { figure } = villager;
    const data = figure.userData;

    const camFwdX = -Math.sin(cameraAngle);
    const camFwdZ = -Math.cos(cameraAngle);
    const camRightX = Math.cos(cameraAngle);
    const camRightZ = -Math.sin(cameraAngle);

    const worldX = Math.abs(villager.vx) > 0.02 || Math.abs(villager.vz) > 0.02 ? villager.vx : villager.lookX;
    const worldZ = Math.abs(villager.vx) > 0.02 || Math.abs(villager.vz) > 0.02 ? villager.vz : villager.lookZ;
    const localX = worldX * camRightX + worldZ * camRightZ;
    const localZ = worldX * camFwdX + worldZ * camFwdZ;
    const moving = Math.abs(villager.vx) > 0.05 || Math.abs(villager.vz) > 0.05;
    const cycle = Math.sin(time * 6.5 + data.motionOffset + villager.phaseOffset);
    const cycleB = Math.sin(time * 6.5 + Math.PI + data.motionOffset + villager.phaseOffset);
    const breath = Math.sin(time * 1.9 + villager.phaseOffset) * 0.016;
    const faceState = resolveFaceState(localX, localZ);
    const depthWalk = faceState === 'front' || faceState === 'back';

    if (Math.abs(localX) > 0.05) {
        data.facing = clampScaleSign(localX);
    }

    figure.rotation.y = cameraAngle;
    figure.scale.x = data.facing;
    figure.position.y = moving ? Math.max(0, Math.sin(time * 13 + villager.phaseOffset)) * 0.03 : 0;
    data.head.rotation.z = breath * 2.2;
    applyFaceState(data, faceState);

    applyLowerBodyPose(data, moving, cycle, cycleB, breath, depthWalk);

    if (villager.logProp) {
        villager.logProp.visible = villager.showLog;
    }

    switch (villager.pose) {
        case 'carry':
            applyCarryPose(data, moving, cycle, cycleB, breath);
            break;
        case 'warm':
            applyWarmPose(data, breath);
            break;
        case 'fish':
            applyFishPose(data, breath, time, villager);
            break;
        default:
            applyDefaultArmPose(data, moving, cycle, cycleB, breath);
            break;
    }
}

function updateCarrierVillager(villager, dt) {
    if (villager.phase === 'to-fire') {
        villager.pose = 'carry';
        const arrived = moveVillagerTo(villager, villager.fireTarget, dt, 0.3);
        if (arrived) {
            villager.phase = 'drop';
            villager.phaseTimer = 1.15;
            villager.showLog = false;
        }
        return;
    }

    if (villager.phase === 'drop') {
        villager.pose = 'warm';
        villager.vx = 0;
        villager.vz = 0;
        setLookDirection(
            villager,
            villager.campfire.x - villager.root.position.x,
            villager.campfire.z - villager.root.position.z
        );
        villager.phaseTimer -= dt;
        if (villager.phaseTimer <= 0) {
            if (villager.sources?.length) {
                villager.sourceIndex = (villager.sourceIndex + 1) % villager.sources.length;
                villager.source = villager.sources[villager.sourceIndex];
            }
            villager.phase = 'return';
        }
        return;
    }

    if (villager.phase === 'return') {
        villager.pose = 'walk';
        const arrived = moveVillagerTo(villager, villager.source, dt, 0.28);
        if (arrived) {
            villager.phase = 'pickup';
            villager.phaseTimer = 1.4;
        }
        return;
    }

    villager.pose = 'walk';
    villager.vx = 0;
    villager.vz = 0;
    setLookDirection(
        villager,
        villager.campfire.x - villager.root.position.x,
        villager.campfire.z - villager.root.position.z
    );
    villager.phaseTimer -= dt;
    if (villager.phaseTimer <= 0) {
        villager.showLog = true;
        villager.phase = 'to-fire';
    }
}

function updatePatrolVillager(villager, dt) {
    if (villager.pauseTimer > 0) {
        villager.pauseTimer -= dt;
        villager.pose = 'walk';
        villager.vx = 0;
        villager.vz = 0;
        const next = villager.points[villager.targetIndex];
        setLookDirection(
            villager,
            next.x - villager.root.position.x,
            next.z - villager.root.position.z
        );
        return;
    }

    villager.pose = 'walk';
    const target = villager.points[villager.targetIndex];
    const arrived = moveVillagerTo(villager, target, dt, 0.24);
    if (arrived) {
        villager.targetIndex = (villager.targetIndex + 1) % villager.points.length;
        villager.pauseTimer = 1.2 + (villager.targetIndex % 3) * 0.35;
    }
}

function updateStaticVillager(villager) {
    villager.vx = 0;
    villager.vz = 0;
    setLookDirection(
        villager,
        villager.lookTarget.x - villager.root.position.x,
        villager.lookTarget.z - villager.root.position.z
    );
}

export function spawnVillageVillagers(scene, villageLayout, { resolveGroundY, resolveWaterY, isLake } = {}) {
    if (!scene || !villageLayout || typeof resolveGroundY !== 'function') return null;

    const placements = villageLayout.placements ?? [];
    const campfire = placements.find((placement) => placement.type === 'campfire');
    const tipis = placements.filter((placement) => placement.type === 'tipi');
    const derivedCenter = villageLayout.center ?? campfire ?? averagePoint(tipis);
    const center = {
        x: derivedCenter?.x ?? 0,
        z: derivedCenter?.z ?? 0,
    };

    const shoreline = findFishingSpot(center, resolveGroundY, isLake);
    const waterDirX = center.x - shoreline.shore.x;
    const waterDirZ = center.z - shoreline.shore.z;
    const awayLength = Math.hypot(waterDirX, waterDirZ) || 1;
    const awayX = waterDirX / awayLength;
    const awayZ = waterDirZ / awayLength;
    const sideX = -awayZ;
    const sideZ = awayX;

    const campfirePoint = campfire
        ? { x: campfire.x, y: campfire.y ?? resolveGroundY(campfire.x, campfire.z), z: campfire.z }
        : findDryPointNear(center, resolveGroundY, isLake);

    const woodSources = createWoodSourcePoints(
        campfirePoint,
        awayX,
        awayZ,
        sideX,
        sideZ,
        resolveGroundY,
        isLake
    );

    const fireTarget = findDryPointNear({
        x: campfirePoint.x + awayX * 1.6,
        z: campfirePoint.z + awayZ * 1.6,
    }, resolveGroundY, isLake, 4);

    const fireWatcherSpot = findDryPointNear({
        x: campfirePoint.x - sideX * 1.9,
        z: campfirePoint.z - sideZ * 1.9,
    }, resolveGroundY, isLake, 4);

    const patrolPoints = createTipiPatrolPoints(tipis, center, resolveGroundY, isLake);
    const tipiObstacles = createTipiObstacles(tipis);

    const systemRoot = new THREE.Group();
    systemRoot.name = 'VillageVillagers';
    scene.add(systemRoot);

    const palettes = {
        fire: { body: 0x7b5135, accent: 0xb88b56, hair: 0x372318 },
        carrier: { body: 0x5f6942, accent: 0x93a76a, hair: 0x3f2c1c },
        patrol: { body: 0x4c5f82, accent: 0xcab77b, hair: 0x4a3221 },
        fisher: { body: 0x6b4b7e, accent: 0x8eb6d1, hair: 0x2f2119 },
    };

    function createBaseVillager(palette, position, scale = 1) {
        const figure = createVillagerFigure(palette);
        const { root, shadow } = createVillagerRoot(figure);
        figure.scale.setScalar(scale);
        shadow.scale.set(scale, scale, 1);
        root.position.set(position.x, position.y, position.z);
        systemRoot.add(root);
        return {
            root,
            figure,
            lookX: 0,
            lookZ: -1,
            vx: 0,
            vz: 0,
            radius: VILLAGER_RADIUS * scale,
            obstacles: tipiObstacles,
            speed: 1.3,
            pose: 'walk',
            phaseOffset: Math.random() * Math.PI * 2,
            update(dt, time, cameraAngle) {
                const resolved = resolveVillagerObstacles(this, this.root.position.x, this.root.position.z, this.lookX, this.lookZ);
                this.root.position.x = resolved.x;
                this.root.position.z = resolved.z;
                this.root.position.y = resolveGroundY(this.root.position.x, this.root.position.z);
                animateVillager(this, time, cameraAngle);
                updateFishingCast(this, time);
            },
        };
    }

    const fireVillager = createBaseVillager(palettes.fire, fireWatcherSpot, 0.99);
    fireVillager.pose = 'warm';
    fireVillager.lookTarget = campfirePoint;
    fireVillager.speed = 0;
    fireVillager.behavior = () => updateStaticVillager(fireVillager);

    const carrierVillager = createBaseVillager(palettes.carrier, woodSources[0], 1.03);
    carrierVillager.speed = 1.55;
    carrierVillager.showLog = true;
    carrierVillager.phase = 'to-fire';
    carrierVillager.sources = woodSources;
    carrierVillager.sourceIndex = 0;
    carrierVillager.source = woodSources[0];
    carrierVillager.campfire = campfirePoint;
    carrierVillager.fireTarget = fireTarget;
    carrierVillager.logProp = createLogProp();
    carrierVillager.figure.add(carrierVillager.logProp);
    carrierVillager.behavior = (dt) => updateCarrierVillager(carrierVillager, dt);

    const patrolVillager = createBaseVillager(palettes.patrol, patrolPoints[0], 0.97);
    patrolVillager.speed = 1.05;
    patrolVillager.points = patrolPoints;
    patrolVillager.targetIndex = patrolPoints.length > 1 ? 1 : 0;
    patrolVillager.pauseTimer = 1.4;
    patrolVillager.behavior = (dt) => updatePatrolVillager(patrolVillager, dt);

    const fisherSpot = findDryPointNear({
        x: shoreline.shore.x + awayX * 0.45,
        z: shoreline.shore.z + awayZ * 0.45,
    }, resolveGroundY, isLake, 3);
    const fisherVillager = createBaseVillager(palettes.fisher, fisherSpot, 1.01);
    fisherVillager.pose = 'fish';
    fisherVillager.lookTarget = shoreline.water;
    fisherVillager.speed = 0;
    fisherVillager.rodProp = createFishingRodProp();
    fisherVillager.figure.add(fisherVillager.rodProp.group);
    fisherVillager.castProp = createFishingCastProp();
    systemRoot.add(fisherVillager.castProp.line);
    systemRoot.add(fisherVillager.castProp.bobber);
    fisherVillager.castTarget = shoreline.water;
    fisherVillager.castWaterY = typeof resolveWaterY === 'function'
        ? resolveWaterY(shoreline.water.x, shoreline.water.z)
        : fisherSpot.y - 0.65;
    fisherVillager.behavior = () => updateStaticVillager(fisherVillager);

    const villagers = [
        fireVillager,
        carrierVillager,
        patrolVillager,
        fisherVillager,
    ];

    return {
        root: systemRoot,
        villagers,
        update(dt, time, cameraAngle) {
            villagers.forEach((villager) => {
                villager.behavior(dt);
                villager.update(dt, time, cameraAngle);
            });
        },
    };
}

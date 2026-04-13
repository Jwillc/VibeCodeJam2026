import * as THREE from 'three';
import { getHeight, getSlope, isMountainZone } from './terrain.js';
import { addCollider, removeCollidersInChunk } from './collision.js';
import { getBiome, getBiomeBorderBlend, BIOME } from './biome.js';
import { isLakeZone } from './terrain.js';

// ── Pine materials (dark conifer greens) ──
const pineTrunkColor = new THREE.Color(0x3a2a1a);
const pineTrunkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, vertexColors: true });
const pineLeafMat = new THREE.MeshStandardMaterial({ color: 0x4a6a2a, roughness: 0.8 });
const pineLeafDarkMat = new THREE.MeshStandardMaterial({ color: 0x3a5a1a, roughness: 0.8 });

// ── Oak materials (warmer greens, browner trunk) ──
const oakTrunkColor = new THREE.Color(0x4a3520);
const oakTrunkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, vertexColors: true });
const oakLeafMat = new THREE.MeshStandardMaterial({ color: 0x5a7a30, roughness: 0.75 });
const oakLeafDarkMat = new THREE.MeshStandardMaterial({ color: 0x4a6820, roughness: 0.75 });

// ── Birch materials (pale trunk, lighter greens) ──
const birchTrunkColor = new THREE.Color(0xc8b89a);
const birchTrunkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, vertexColors: true });
const birchLeafMat = new THREE.MeshStandardMaterial({ color: 0x6a8a3a, roughness: 0.7 });
const birchLeafDarkMat = new THREE.MeshStandardMaterial({ color: 0x5a7a2a, roughness: 0.7 });

function seededRand(seed) {
    // Integer hash that works well with negative seeds
    let s = (seed | 0) ^ 0x5bd1e995;
    s = Math.imul(s ^ (s >>> 15), 0x27d4eb2d);
    s = s ^ (s >>> 13);
    s = Math.imul(s ^ (s >>> 16), 0x85ebca6b);
    return ((s >>> 0) % 10000) / 10000;
}

function wrapAngle(angle) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function createBarkTrunk({
    height,
    radiusTop,
    radiusBottom,
    material,
    baseColor,
    seed,
    radialSegments = 10,
    heightSegments = 8,
    stripeStrength = 0,
}) {
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments, heightSegments);
    const pos = geometry.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const color = new THREE.Color();
    const ridgeFreq = 4 + Math.floor(seededRand(seed + 11) * 4);
    const ridgeAmp = 0.025 + seededRand(seed + 21) * 0.045;
    const warpAmp = 0.01 + seededRand(seed + 31) * 0.02;
    const baseFlare = 0.04 + seededRand(seed + 41) * 0.08;
    const knotAngle = seededRand(seed + 51) * Math.PI * 2;
    const knotHeight = 0.22 + seededRand(seed + 61) * 0.52;
    const knotWidth = 0.2 + seededRand(seed + 71) * 0.15;
    const knotStrength = 0.03 + seededRand(seed + 81) * 0.05;
    const twist = seededRand(seed + 91) * Math.PI * 2;
    const stripeFreq = 7 + Math.floor(seededRand(seed + 101) * 4);

    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const radial = Math.sqrt(x * x + z * z);
        const yNorm = (y + height * 0.5) / height;

        let shade = 0.94;

        if (radial > 0.0001) {
            const theta = Math.atan2(z, x);
            const barkWave =
                Math.sin(theta * ridgeFreq + yNorm * 11 + twist) * ridgeAmp +
                Math.sin(theta * (ridgeFreq * 2 + 1) - yNorm * 19 + twist * 0.6) * ridgeAmp * 0.45;
            const verticalWarp = Math.sin(yNorm * Math.PI * (2.5 + seededRand(seed + 111)) + twist) * warpAmp;
            const flare = Math.pow(1 - yNorm, 2) * baseFlare;
            const knotTheta = wrapAngle(theta - knotAngle);
            const knotDy = (yNorm - knotHeight) / knotWidth;
            const knot = Math.exp(-(knotTheta * knotTheta) / 0.08 - knotDy * knotDy);
            const radiusScale = 1 + barkWave + verticalWarp + flare + knot * knotStrength;

            pos.setXYZ(i, x * radiusScale, y, z * radiusScale);

            shade += barkWave * 1.9;
            shade -= flare * 1.4;
            shade += knot * 0.2;

            if (stripeStrength > 0) {
                const stripe = Math.sin(yNorm * stripeFreq * Math.PI + theta * 0.35 + twist) * 0.5 + 0.5;
                shade -= smoothstep(0.56, 0.9, stripe) * stripeStrength;
            }
        } else if (stripeStrength > 0) {
            const stripe = Math.sin(yNorm * stripeFreq * Math.PI + twist) * 0.5 + 0.5;
            shade -= smoothstep(0.56, 0.9, stripe) * stripeStrength * 0.8;
        }

        const heightLight = 0.92 + yNorm * 0.12;
        color.copy(baseColor).multiplyScalar(THREE.MathUtils.clamp(shade * heightLight, 0.45, 1.18));
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const trunk = new THREE.Mesh(geometry, material);
    trunk.castShadow = true;
    return trunk;
}

function smoothstep(edge0, edge1, value) {
    const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

// ── Pine: tall, narrow conifer silhouette (stacked cones) ──
function createPine(group, s, seed) {
    const trunk = createBarkTrunk({
        height: 3.2 * s,
        radiusTop: 0.12 * s,
        radiusBottom: 0.22 * s,
        material: pineTrunkMat,
        baseColor: pineTrunkColor,
        seed: seed + 101,
        radialSegments: 10,
        heightSegments: 9,
    });
    trunk.position.y = 1.6 * s;
    group.add(trunk);

    const f0 = new THREE.Mesh(new THREE.ConeGeometry(1.3 * s, 2.2 * s, 8), pineLeafDarkMat);
    f0.position.y = 3.6 * s; f0.castShadow = true; group.add(f0);

    const f1 = new THREE.Mesh(new THREE.ConeGeometry(1.0 * s, 1.8 * s, 8), pineLeafMat);
    f1.position.y = 4.5 * s; f1.castShadow = true; group.add(f1);

    const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.6 * s, 1.4 * s, 7), pineLeafDarkMat);
    f2.position.y = 5.3 * s; f2.castShadow = true; group.add(f2);
}

// ── Oak: shorter, wider, rounder canopy (stacked spheres) ──
function createOak(group, s, seed) {
    const trunk = createBarkTrunk({
        height: 2.6 * s,
        radiusTop: 0.18 * s,
        radiusBottom: 0.3 * s,
        material: oakTrunkMat,
        baseColor: oakTrunkColor,
        seed: seed + 211,
        radialSegments: 10,
        heightSegments: 8,
    });
    trunk.position.y = 1.3 * s;
    group.add(trunk);

    const canopy0 = new THREE.Mesh(new THREE.SphereGeometry(1.4 * s, 8, 6), oakLeafDarkMat);
    canopy0.position.y = 3.4 * s; canopy0.castShadow = true; group.add(canopy0);

    const canopy1 = new THREE.Mesh(new THREE.SphereGeometry(1.1 * s, 8, 6), oakLeafMat);
    canopy1.position.y = 4.1 * s; canopy1.castShadow = true; group.add(canopy1);

    const canopy2 = new THREE.Mesh(new THREE.SphereGeometry(0.7 * s, 7, 5), oakLeafDarkMat);
    canopy2.position.y = 4.6 * s; canopy2.castShadow = true; group.add(canopy2);
}

// ── Birch: slender, tall trunk with lighter, sparser foliage ──
function createBirch(group, s, seed) {
    const trunk = createBarkTrunk({
        height: 3.6 * s,
        radiusTop: 0.08 * s,
        radiusBottom: 0.14 * s,
        material: birchTrunkMat,
        baseColor: birchTrunkColor,
        seed: seed + 307,
        radialSegments: 10,
        heightSegments: 10,
        stripeStrength: 0.22,
    });
    trunk.position.y = 1.8 * s;
    group.add(trunk);

    const f0 = new THREE.Mesh(new THREE.ConeGeometry(0.9 * s, 2.4 * s, 7), birchLeafDarkMat);
    f0.position.y = 4.0 * s; f0.castShadow = true; group.add(f0);

    const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.65 * s, 1.8 * s, 7), birchLeafMat);
    f1.position.y = 4.9 * s; f1.castShadow = true; group.add(f1);

    const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.4 * s, 1.2 * s, 6), birchLeafDarkMat);
    f2.position.y = 5.6 * s; f2.castShadow = true; group.add(f2);
}

function pickSpecies(x, z, seed) {
    const biome = getBiome(x, z);
    const blend = getBiomeBorderBlend(x, z);
    // At biome borders, sometimes pick a neighbor species for natural mixing
    if (blend > 0.3 && seededRand(seed + 7777) < blend * 0.5) {
        // Pick a random different species
        const others = [BIOME.PINE_FOREST, BIOME.OAK_FOREST, BIOME.BIRCH_FOREST].filter(b => b !== biome);
        return others[Math.floor(seededRand(seed + 8888) * others.length)];
    }
    return biome;
}

function createTree(scene, x, z, seed, groundY) {
    const group = new THREE.Group();
    const s = (0.8 + Math.abs(Math.sin(seed)) * 0.8) * 5.5;
    const species = pickSpecies(x, z, seed);

    if (species === BIOME.OAK_FOREST) createOak(group, s, seed);
    else if (species === BIOME.BIRCH_FOREST) createBirch(group, s, seed);
    else createPine(group, s, seed);

    group.position.set(x, groundY + getHeight(x, z) - 0.4 * s, z);
    group.rotation.y = seed * 1.7;
    scene.add(group);
    return group;
}

function getTreeScale(seed) {
    return (0.8 + Math.abs(Math.sin(seed)) * 0.8) * 5.5;
}

function foliageRadius(scale) {
    return 1.4 * scale; // covers widest species (oak spheres)
}

function tooCloseToExisting(tx, tz, treeScale, placed) {
    const r1 = foliageRadius(treeScale);
    for (const p of placed) {
        const dx = tx - p.x;
        const dz = tz - p.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const minDist = (r1 + p.r) * 0.7; // allow slight overlap but not heavy clipping
        if (dist < minDist) return true;
    }
    return false;
}

export function spawnChunkTrees(scene, cx, cz, chunkSizeX, chunkSizeZ, groundY) {
    const worldX = cx * chunkSizeX;
    const worldZ = cz * chunkSizeZ;
    const treeSeed = cx * 3571 + cz * 8923 + 7;
    const trees = [];
    const placed = []; // { x, z, r } for spacing checks

    // Sparse baseline: 2-3 scattered trees guaranteed (only skip very steep)
    const sparseCount = 2 + Math.floor(seededRand(treeSeed + 999) * 2);
    for (let i = 0; i < sparseCount; i++) {
        const tx = worldX + (seededRand(treeSeed + i * 53.9 + 77) - 0.5) * (chunkSizeX - 2);
        const tz = worldZ + (seededRand(treeSeed + i * 41.3 + 91) - 0.5) * (chunkSizeZ - 2);
        if (isLakeZone(tx, tz)) continue;
        if (getSlope(tx, tz) > 1.8) continue;
        const treeScale = getTreeScale(treeSeed + i + 500);
        if (tooCloseToExisting(tx, tz, treeScale, placed)) continue;
        const tree = createTree(scene, tx, tz, treeSeed + i + 500, groundY);
        addCollider(tx, tz, 0.22 * treeScale + 0.3);
        placed.push({ x: tx, z: tz, r: foliageRadius(treeScale) });
        trees.push(tree);
    }

    // Main cluster: 3-9 additional trees (skip mountains & steep slopes)
    const clusterCount = 3 + Math.floor(seededRand(treeSeed) * 7);
    for (let i = 0; i < clusterCount; i++) {
        const tx = worldX + (seededRand(treeSeed + i * 17.3 + 3.1) - 0.5) * (chunkSizeX - 4);
        const tz = worldZ + (seededRand(treeSeed + i * 31.7 + 5.3) - 0.5) * (chunkSizeZ - 4);
        if (isLakeZone(tx, tz)) continue;
        if (isMountainZone(tx, tz)) continue;
        if (getSlope(tx, tz) > 1.2) continue;
        const treeScale = getTreeScale(treeSeed + i);
        if (tooCloseToExisting(tx, tz, treeScale, placed)) continue;
        const tree = createTree(scene, tx, tz, treeSeed + i, groundY);
        addCollider(tx, tz, 0.22 * treeScale + 0.3);
        placed.push({ x: tx, z: tz, r: foliageRadius(treeScale) });
        trees.push(tree);
    }

    return trees;
}

export function removeChunkTrees(scene, trees) {
    removeCollidersInChunk(trees);
    trees.forEach((tree) => {
        tree.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
        });
        scene.remove(tree);
    });
}

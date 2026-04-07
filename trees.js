import * as THREE from 'three';
import { getHeight, getSlope, isMountainZone } from './terrain.js';
import { addCollider, removeCollidersInChunk } from './collision.js';
import { getBiome, getBiomeBorderBlend, BIOME } from './biome.js';

// ── Pine materials (dark conifer greens) ──
const pineTrunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 });
const pineLeafMat = new THREE.MeshStandardMaterial({ color: 0x4a6a2a, roughness: 0.8 });
const pineLeafDarkMat = new THREE.MeshStandardMaterial({ color: 0x3a5a1a, roughness: 0.8 });

// ── Oak materials (warmer greens, browner trunk) ──
const oakTrunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.85 });
const oakLeafMat = new THREE.MeshStandardMaterial({ color: 0x5a7a30, roughness: 0.75 });
const oakLeafDarkMat = new THREE.MeshStandardMaterial({ color: 0x4a6820, roughness: 0.75 });

// ── Birch materials (pale trunk, lighter greens) ──
const birchTrunkMat = new THREE.MeshStandardMaterial({ color: 0xc8b89a, roughness: 0.7 });
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

// ── Pine: tall, narrow conifer silhouette (stacked cones) ──
function createPine(group, s) {
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12 * s, 0.22 * s, 3.2 * s, 8),
        pineTrunkMat
    );
    trunk.position.y = 1.6 * s;
    trunk.castShadow = true;
    group.add(trunk);

    const f0 = new THREE.Mesh(new THREE.ConeGeometry(1.3 * s, 2.2 * s, 8), pineLeafDarkMat);
    f0.position.y = 3.6 * s; f0.castShadow = true; group.add(f0);

    const f1 = new THREE.Mesh(new THREE.ConeGeometry(1.0 * s, 1.8 * s, 8), pineLeafMat);
    f1.position.y = 4.5 * s; f1.castShadow = true; group.add(f1);

    const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.6 * s, 1.4 * s, 7), pineLeafDarkMat);
    f2.position.y = 5.3 * s; f2.castShadow = true; group.add(f2);
}

// ── Oak: shorter, wider, rounder canopy (stacked spheres) ──
function createOak(group, s) {
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18 * s, 0.3 * s, 2.6 * s, 8),
        oakTrunkMat
    );
    trunk.position.y = 1.3 * s;
    trunk.castShadow = true;
    group.add(trunk);

    const canopy0 = new THREE.Mesh(new THREE.SphereGeometry(1.4 * s, 8, 6), oakLeafDarkMat);
    canopy0.position.y = 3.4 * s; canopy0.castShadow = true; group.add(canopy0);

    const canopy1 = new THREE.Mesh(new THREE.SphereGeometry(1.1 * s, 8, 6), oakLeafMat);
    canopy1.position.y = 4.1 * s; canopy1.castShadow = true; group.add(canopy1);

    const canopy2 = new THREE.Mesh(new THREE.SphereGeometry(0.7 * s, 7, 5), oakLeafDarkMat);
    canopy2.position.y = 4.6 * s; canopy2.castShadow = true; group.add(canopy2);
}

// ── Birch: slender, tall trunk with lighter, sparser foliage ──
function createBirch(group, s) {
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08 * s, 0.14 * s, 3.6 * s, 8),
        birchTrunkMat
    );
    trunk.position.y = 1.8 * s;
    trunk.castShadow = true;
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

    if (species === BIOME.OAK_FOREST) createOak(group, s);
    else if (species === BIOME.BIRCH_FOREST) createBirch(group, s);
    else createPine(group, s);

    group.position.set(x, groundY + getHeight(x, z), z);
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
    trees.forEach(t => scene.remove(t));
}

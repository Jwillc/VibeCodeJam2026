import * as THREE from 'three';
import { getHeight, getSlope, isMountainZone } from './terrain.js';
import { addCollider, removeCollidersInChunk } from './collision.js';

const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 });
const leavesMat = new THREE.MeshStandardMaterial({ color: 0x4a6a2a, roughness: 0.8 });
const leavesDarkMat = new THREE.MeshStandardMaterial({ color: 0x3a5a1a, roughness: 0.8 });

function seededRand(seed) {
    // Integer hash that works well with negative seeds
    let s = (seed | 0) ^ 0x5bd1e995;
    s = Math.imul(s ^ (s >>> 15), 0x27d4eb2d);
    s = s ^ (s >>> 13);
    s = Math.imul(s ^ (s >>> 16), 0x85ebca6b);
    return ((s >>> 0) % 10000) / 10000;
}

function createTree(scene, x, z, seed, groundY) {
    const group = new THREE.Group();
    const s = (0.8 + Math.abs(Math.sin(seed)) * 0.8) * 5.5;

    // Tall trunk — bare wood before foliage starts high up
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12 * s, 0.22 * s, 3.2 * s, 8),
        trunkMat
    );
    trunk.position.y = 1.6 * s;
    trunk.castShadow = true;
    group.add(trunk);

    const foliageBottom = new THREE.Mesh(
        new THREE.ConeGeometry(1.3 * s, 2.2 * s, 8),
        leavesDarkMat
    );
    foliageBottom.position.y = 3.6 * s;
    foliageBottom.castShadow = true;
    group.add(foliageBottom);

    const foliageMid = new THREE.Mesh(
        new THREE.ConeGeometry(1.0 * s, 1.8 * s, 8),
        leavesMat
    );
    foliageMid.position.y = 4.5 * s;
    foliageMid.castShadow = true;
    group.add(foliageMid);

    const foliageTop = new THREE.Mesh(
        new THREE.ConeGeometry(0.6 * s, 1.4 * s, 7),
        leavesDarkMat
    );
    foliageTop.position.y = 5.3 * s;
    foliageTop.castShadow = true;
    group.add(foliageTop);

    group.position.set(x, groundY + getHeight(x, z), z);
    group.rotation.y = seed * 1.7;
    scene.add(group);
    return group;
}

function getTreeScale(seed) {
    return (0.8 + Math.abs(Math.sin(seed)) * 0.8) * 5.5;
}

function foliageRadius(scale) {
    return 1.3 * scale; // matches widest cone (foliageBottom)
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

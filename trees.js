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
    const s = (0.8 + Math.abs(Math.sin(seed)) * 0.6) * 2.2;

    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15 * s, 0.25 * s, 2.5 * s, 8),
        trunkMat
    );
    trunk.position.y = 1.25 * s;
    trunk.castShadow = true;
    group.add(trunk);

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

    group.position.set(x, groundY + getHeight(x, z), z);
    group.rotation.y = seed * 1.7;
    scene.add(group);
    return group;
}

export function spawnChunkTrees(scene, cx, cz, chunkSizeX, chunkSizeZ, groundY) {
    const worldX = cx * chunkSizeX;
    const worldZ = cz * chunkSizeZ;
    const treeSeed = cx * 3571 + cz * 8923 + 7;
    const trees = [];

    // Sparse baseline: 2-3 scattered trees guaranteed (only skip very steep)
    const sparseCount = 2 + Math.floor(seededRand(treeSeed + 999) * 2);
    for (let i = 0; i < sparseCount; i++) {
        const tx = worldX + (seededRand(treeSeed + i * 53.9 + 77) - 0.5) * (chunkSizeX - 2);
        const tz = worldZ + (seededRand(treeSeed + i * 41.3 + 91) - 0.5) * (chunkSizeZ - 2);
        if (getSlope(tx, tz) > 1.8) continue; // only skip very steep
        const tree = createTree(scene, tx, tz, treeSeed + i + 500, groundY);
        const treeScale = (0.8 + Math.abs(Math.sin(treeSeed + i + 500)) * 0.6) * 2.2;
        addCollider(tx, tz, 0.25 * treeScale + 0.3);
        trees.push(tree);
    }

    // Main cluster: 3-9 additional trees (skip mountains & steep slopes)
    const clusterCount = 3 + Math.floor(seededRand(treeSeed) * 7);
    for (let i = 0; i < clusterCount; i++) {
        const tx = worldX + (seededRand(treeSeed + i * 17.3 + 3.1) - 0.5) * (chunkSizeX - 4);
        const tz = worldZ + (seededRand(treeSeed + i * 31.7 + 5.3) - 0.5) * (chunkSizeZ - 4);
        if (isMountainZone(tx, tz)) continue;
        if (getSlope(tx, tz) > 1.2) continue;
        const tree = createTree(scene, tx, tz, treeSeed + i, groundY);
        const treeScale = (0.8 + Math.abs(Math.sin(treeSeed + i)) * 0.6) * 2.2;
        addCollider(tx, tz, 0.25 * treeScale + 0.3);
        trees.push(tree);
    }

    return trees;
}

export function removeChunkTrees(scene, trees) {
    removeCollidersInChunk(trees);
    trees.forEach(t => scene.remove(t));
}

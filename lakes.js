import * as THREE from 'three';
import { getHeight, isMountainZone, isLakeZone, WATER_LEVEL } from './terrain.js';

// Public: is this world position underwater?
export function isLake(x, z) {
    return isLakeZone(x, z) && getHeight(x, z) < WATER_LEVEL;
}

// ── Water shader ──
const waterShader = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    uniforms: {
        uTime: { value: 0 },
        uSkyColor: { value: new THREE.Color(0x87ceeb) },
        uHorizonColor: { value: new THREE.Color(0xd9caa5) },
        uSunAmount: { value: 1 },
    },
    vertexShader: `
        varying vec3 vWorldPos;
        void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
        }
    `,
    fragmentShader: `
        uniform float uTime;
        uniform vec3 uSkyColor;
        uniform vec3 uHorizonColor;
        uniform float uSunAmount;
        varying vec3 vWorldPos;

        void main() {
            vec2 p = vWorldPos.xz;

            // Gentle ripples
            float w1 = sin(p.x * 0.5 + uTime * 0.7) * sin(p.y * 0.4 + uTime * 0.5);
            float w2 = sin(p.x * 0.9 - uTime * 0.4 + 2.0) * sin(p.y * 0.7 + uTime * 0.6 + 1.0);
            float ripple = (w1 + w2 * 0.5) * 0.2;

            // Base water color
            vec3 shallow = vec3(0.22, 0.50, 0.58);
            vec3 deep    = vec3(0.10, 0.30, 0.42);
            vec3 col = mix(shallow, deep, 0.5 + ripple);
            vec3 reflection = mix(uHorizonColor, uSkyColor, 0.35 + ripple * 0.4);
            col = mix(col, reflection, 0.45);

            // Subtle highlight
            col += max(0.0, ripple) * mix(vec3(0.18, 0.25, 0.3), uHorizonColor * 0.4, uSunAmount);
            col += min(0.0, ripple) * 0.15;

            gl_FragColor = vec4(col, 0.55);
        }
    `,
});

// Track all water materials for time updates
const waterMats = [];

// ── Per-chunk water plane ──
export function spawnChunkLakes(scene, cx, cz, chunkSizeX, chunkSizeZ, groundY) {
    const worldX = cx * chunkSizeX;
    const worldZ = cz * chunkSizeZ;
    const halfX = chunkSizeX / 2;
    const halfZ = chunkSizeZ / 2;

    // Check if any part of this chunk is in a lake zone
    let hasLake = false;
    const step = chunkSizeX / 6;
    for (let lx = -halfX; lx <= halfX && !hasLake; lx += step) {
        for (let lz = -halfZ; lz <= halfZ && !hasLake; lz += step) {
            if (isLakeZone(worldX + lx, worldZ + lz)) {
                hasLake = true;
            }
        }
    }
    if (!hasLake) return [];

    // Place a flat water plane at water level
    const geo = new THREE.PlaneGeometry(chunkSizeX, chunkSizeZ, 1, 1);
    geo.rotateX(-Math.PI / 2);

    const mat = waterShader.clone();
    waterMats.push(mat);

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(worldX, groundY + WATER_LEVEL, worldZ);
    mesh.renderOrder = 1;
    scene.add(mesh);

    return [mesh];
}

export function removeChunkLakes(scene, lakeMeshes) {
    for (const m of lakeMeshes) {
        scene.remove(m);
        m.geometry.dispose();
        const idx = waterMats.indexOf(m.material);
        if (idx !== -1) waterMats.splice(idx, 1);
        m.material.dispose();
    }
}

export function setLakeAtmosphere(skyColor, horizonColor, sunAmount) {
    for (const mat of waterMats) {
        mat.uniforms.uSkyColor.value.copy(skyColor);
        mat.uniforms.uHorizonColor.value.copy(horizonColor);
        mat.uniforms.uSunAmount.value = sunAmount;
    }
}

// Call each frame
export function updateLakes(time) {
    for (const mat of waterMats) {
        mat.uniforms.uTime.value = time;
    }
}

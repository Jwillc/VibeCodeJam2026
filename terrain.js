// Simple 2D value noise for terrain height
function hash(x, z) {
    let n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return n - Math.floor(n);
}

function smoothNoise(x, z) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;

    // smoothstep
    const ux = fx * fx * (3 - 2 * fx);
    const uz = fz * fz * (3 - 2 * fz);

    const a = hash(ix, iz);
    const b = hash(ix + 1, iz);
    const c = hash(ix, iz + 1);
    const d = hash(ix + 1, iz + 1);

    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

const SCALE_1 = 0.02;   // large rolling hills
const SCALE_2 = 0.06;   // medium bumps
const AMP_1 = 3.0;
const AMP_2 = 1.0;

export function getHeight(x, z) {
    return smoothNoise(x * SCALE_1, z * SCALE_1) * AMP_1
         + smoothNoise(x * SCALE_2 + 100, z * SCALE_2 + 100) * AMP_2;
}

export function getSlope(x, z) {
    const d = 0.5;
    const hL = getHeight(x - d, z);
    const hR = getHeight(x + d, z);
    const hF = getHeight(x, z - d);
    const hB = getHeight(x, z + d);
    const dx = (hR - hL) / (2 * d);
    const dz = (hB - hF) / (2 * d);
    return Math.sqrt(dx * dx + dz * dz);
}

// Returns uphill factor: how much the player is moving uphill (0 to 1+)
export function getUphillFactor(x, z, vx, vz) {
    if (Math.abs(vx) < 0.01 && Math.abs(vz) < 0.01) return 0;
    const d = 0.5;
    const hHere = getHeight(x, z);
    const speed = Math.sqrt(vx * vx + vz * vz);
    const nx = vx / speed;
    const nz = vz / speed;
    const hAhead = getHeight(x + nx * d, z + nz * d);
    const rise = (hAhead - hHere) / d;
    return Math.max(0, rise); // only positive = uphill
}

const TERRAIN_SEGS = 20; // segments per chunk side

export function applyTerrainToChunk(geometry, worldX, worldZ, chunkSizeX, chunkSizeZ) {
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const lx = pos.getX(i);
        const lz = pos.getZ(i);
        const wx = worldX + lx;
        const wz = worldZ + lz;
        pos.setY(i, getHeight(wx, wz));
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
}

export { TERRAIN_SEGS };

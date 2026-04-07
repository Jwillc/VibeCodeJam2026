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

// Layered noise (octaves)
function fbm(x, z, octaves, lacunarity, gain) {
    let value = 0;
    let amp = 1;
    let freq = 1;
    for (let i = 0; i < octaves; i++) {
        value += smoothNoise(x * freq, z * freq) * amp;
        amp *= gain;
        freq *= lacunarity;
    }
    return value;
}

// ── Base terrain (gentle rolling hills) ──
const SCALE_1 = 0.02;
const SCALE_2 = 0.06;
const AMP_1 = 3.0;
const AMP_2 = 1.0;

function baseHeight(x, z) {
    return smoothNoise(x * SCALE_1, z * SCALE_1) * AMP_1
         + smoothNoise(x * SCALE_2 + 100, z * SCALE_2 + 100) * AMP_2;
}

// ── Mountain regions ──
// A low-frequency mask determines where mountains appear
const MTN_MASK_SCALE = 0.006;  // very large blobs
const MTN_MASK_THRESH = 0.55;  // above this = mountain zone
const MTN_HEIGHT = 18;         // max mountain elevation
const MTN_DETAIL_SCALE = 0.025;
const MTN_RIDGE_SCALE = 0.04;

function mountainMask(x, z) {
    const v = smoothNoise(x * MTN_MASK_SCALE + 500, z * MTN_MASK_SCALE + 500);
    // Smooth transition from flat to mountain
    const t = (v - MTN_MASK_THRESH) / (1 - MTN_MASK_THRESH);
    return Math.max(0, Math.min(1, t * 2));
}

function mountainHeight(x, z) {
    const mask = mountainMask(x, z);
    if (mask <= 0) return 0;

    // Ridged noise for craggy peaks
    let ridged = Math.abs(smoothNoise(x * MTN_RIDGE_SCALE + 200, z * MTN_RIDGE_SCALE + 200) - 0.5) * 2;
    ridged = 1 - ridged; // invert so peaks are high
    ridged = ridged * ridged; // sharpen peaks

    const detail = fbm(x * MTN_DETAIL_SCALE, z * MTN_DETAIL_SCALE, 3, 2.0, 0.5);

    return mask * (ridged * MTN_HEIGHT + detail * 4);
}

// ── Combined height ──
export function getHeight(x, z) {
    return baseHeight(x, z) + mountainHeight(x, z);
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
    return Math.max(0, rise);
}

// Max slope the player can climb
export const MAX_CLIMBABLE_SLOPE = 1.8;

// Check if the slope ahead is too steep to traverse
export function isTooSteep(x, z, vx, vz) {
    if (Math.abs(vx) < 0.01 && Math.abs(vz) < 0.01) return false;
    const d = 0.8;
    const speed = Math.sqrt(vx * vx + vz * vz);
    const nx = vx / speed;
    const nz = vz / speed;
    const hHere = getHeight(x, z);
    const hAhead = getHeight(x + nx * d, z + nz * d);
    const rise = (hAhead - hHere) / d;
    return rise > MAX_CLIMBABLE_SLOPE;
}

// Check if a position is in a mountain zone (for tree placement)
export function isMountainZone(x, z) {
    return mountainMask(x, z) > 0.3;
}

const TERRAIN_SEGS = 32;

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

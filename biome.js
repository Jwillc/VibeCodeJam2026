// Simple biome system — uses low-frequency noise to create regional variety
// Biomes affect tree species selection and can later influence ground color, etc.

function hash(x, z) {
    let n = Math.sin(x * 174.2 + z * 263.5) * 52437.1847;
    return n - Math.floor(n);
}

function smoothNoise(x, z) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx);
    const uz = fz * fz * (3 - 2 * fz);
    const a = hash(ix, iz);
    const b = hash(ix + 1, iz);
    const c = hash(ix, iz + 1);
    const d = hash(ix + 1, iz + 1);
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export const BIOME = {
    PINE_FOREST: 0,
    OAK_FOREST: 1,
    BIRCH_FOREST: 2,
};

const BIOME_SCALE = 0.008; // large, gradual regions

export function getBiome(x, z) {
    const v = smoothNoise(x * BIOME_SCALE + 300, z * BIOME_SCALE + 700);
    if (v < 0.38) return BIOME.PINE_FOREST;
    if (v < 0.68) return BIOME.OAK_FOREST;
    return BIOME.BIRCH_FOREST;
}

// Returns a blend weight (0-1) for mixing species at biome borders
// 0 = pure current biome, approaching 1 = near border (may pick neighbor species)
export function getBiomeBorderBlend(x, z) {
    const v = smoothNoise(x * BIOME_SCALE + 300, z * BIOME_SCALE + 700);
    const thresholds = [0.38, 0.68];
    let minDist = 1;
    for (const t of thresholds) {
        minDist = Math.min(minDist, Math.abs(v - t));
    }
    // Within 0.08 of a border = blend zone
    return Math.max(0, 1 - minDist / 0.08);
}

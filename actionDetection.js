import { isLake } from './lakes.js';

const NEAR_WATER_RADIUS = 3;
const NEAR_WATER_SAMPLES = 8;

function isNearWater(x, z) {
    if (isLake(x, z)) return true;
    for (let i = 0; i < NEAR_WATER_SAMPLES; i++) {
        const angle = (i / NEAR_WATER_SAMPLES) * Math.PI * 2;
        const sx = x + Math.cos(angle) * NEAR_WATER_RADIUS;
        const sz = z + Math.sin(angle) * NEAR_WATER_RADIUS;
        if (isLake(sx, sz)) return true;
    }
    return false;
}

/**
 * Returns an array of available actions given the player's world position.
 * Each action: { id: string, label: string }
 */
export function detectActions(x, z) {
    const actions = [];
    if (isNearWater(x, z)) {
        actions.push({ id: 'drink', label: 'Drink Water' });
    }
    return actions;
}

const PLAYER_RADIUS = 0.5;
const colliders = []; // { x, z, radius }

export function addCollider(x, z, radius) {
    const collider = { x, z, radius };
    colliders.push(collider);
    return collider;
}

export function removeCollider(target) {
    if (!target) return;
    const index = colliders.indexOf(target);
    if (index >= 0) {
        colliders.splice(index, 1);
    }
}

export function canPlaceCollider(x, z, radius, padding = 0) {
    for (const c of colliders) {
        const dx = x - c.x;
        const dz = z - c.z;
        const minDist = c.radius + radius + padding;
        if (dx * dx + dz * dz < minDist * minDist) {
            return false;
        }
    }

    return true;
}

export function removeCollidersInChunk(trees) {
    for (const tree of trees) {
        const tx = tree.position.x;
        const tz = tree.position.z;
        for (let i = colliders.length - 1; i >= 0; i--) {
            if (colliders[i].x === tx && colliders[i].z === tz) {
                colliders.splice(i, 1);
            }
        }
    }
}

export function resolveCollision(px, pz, newX, newZ) {
    let rx = newX;
    let rz = newZ;

    for (const c of colliders) {
        const dx = rx - c.x;
        const dz = rz - c.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const minDist = PLAYER_RADIUS + c.radius;

        if (dist < minDist && dist > 0.001) {
            const nx = dx / dist;
            const nz = dz / dist;
            rx = c.x + nx * minDist;
            rz = c.z + nz * minDist;
        }
    }

    return { x: rx, z: rz };
}

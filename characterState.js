export const FaceState = { FRONT: 'front', SIDE: 'side', BACK: 'back' };

export function resolveFaceState(vx, vz) {
    const side = Math.abs(vx) > 0.5;
    const toward = vz > 0.5;
    const away = vz < -0.5;

    if (side)   return FaceState.SIDE;
    if (toward) return FaceState.FRONT;
    if (away)   return FaceState.BACK;
    return FaceState.BACK; // idle
}

export function applyFaceState(d, state) {
    d.sideface.visible = state === FaceState.SIDE;
    d.frontface.visible = state === FaceState.FRONT;
}

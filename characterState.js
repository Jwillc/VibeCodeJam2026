export const FaceState = { FRONT: 'front', SIDE: 'side', BACK: 'back' };

export function resolveFaceState(vx, vz) {
    const side = Math.abs(vx) > 0.1;
    const forward = vz > 0.1;   // W = walking away from camera
    const backward = vz < -0.1; // S = walking toward camera

    if (side)     return FaceState.SIDE;
    if (forward)  return FaceState.BACK;
    if (backward) return FaceState.FRONT;
    return FaceState.BACK; // idle — back faces camera
}

export function applyFaceState(d, state) {
    d.sideface.visible = state === FaceState.SIDE;
    d.frontface.visible = state === FaceState.FRONT;
}

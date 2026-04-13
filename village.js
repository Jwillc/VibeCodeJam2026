import * as THREE from 'three';
import { addCollider } from './collision.js';

export const PLACEABLE_ITEMS = [
    { id: 'tipi', label: 'Tipi' },
];

const canvasMat = new THREE.MeshStandardMaterial({
    color: 0xd6c29a,
    roughness: 0.92,
    metalness: 0.02,
    side: THREE.DoubleSide,
});
const canvasShadeMat = new THREE.MeshStandardMaterial({
    color: 0xb99669,
    roughness: 0.95,
    metalness: 0.01,
    side: THREE.DoubleSide,
});
const poleMat = new THREE.MeshStandardMaterial({
    color: 0x6a4a2b,
    roughness: 0.98,
});
const ropeMat = new THREE.MeshStandardMaterial({
    color: 0x8f6f4b,
    roughness: 1,
});
const hideMat = new THREE.MeshStandardMaterial({
    color: 0x8c6239,
    roughness: 1,
    side: THREE.DoubleSide,
});
const groundShadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
});

const ASSET_BUILDERS = {
    tipi: {
        create: createTipi,
        colliderRadius: 1.5,
    },
};

function createPole(length, tiltX, tiltZ, y, rotationY = 0) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, length, 6), poleMat);
    pole.position.set(0, y, 0);
    pole.rotation.x = tiltX;
    pole.rotation.z = tiltZ;
    pole.rotation.y = rotationY;
    pole.castShadow = true;
    return pole;
}

function createTipi() {
    const group = new THREE.Group();

    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.5, 18), groundShadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.03;
    group.add(shadow);

    const body = new THREE.Mesh(new THREE.ConeGeometry(1.55, 3.8, 9, 1, true), canvasMat);
    body.position.y = 1.9;
    body.rotation.y = Math.PI / 9;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const backPanel = new THREE.Mesh(new THREE.ConeGeometry(1.35, 3.25, 9, 1, true), canvasShadeMat);
    backPanel.position.set(0, 1.78, -0.08);
    backPanel.rotation.y = Math.PI / 9;
    backPanel.scale.set(0.94, 0.92, 0.94);
    backPanel.castShadow = true;
    group.add(backPanel);

    const doorway = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 1.7), hideMat);
    doorway.position.set(0, 0.98, 1.15);
    doorway.rotation.x = -0.06;
    group.add(doorway);

    const flapLeft = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 1.4), canvasShadeMat);
    flapLeft.position.set(-0.23, 1.24, 1.22);
    flapLeft.rotation.set(-0.08, 0.35, 0.05);
    group.add(flapLeft);

    const flapRight = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 1.4), canvasShadeMat);
    flapRight.position.set(0.23, 1.24, 1.22);
    flapRight.rotation.set(-0.08, -0.35, -0.05);
    group.add(flapRight);

    const smokeFlapLeft = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.92), canvasShadeMat);
    smokeFlapLeft.position.set(-0.34, 2.9, 0.18);
    smokeFlapLeft.rotation.set(0.28, 0.22, 0.1);
    group.add(smokeFlapLeft);

    const smokeFlapRight = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.92), canvasShadeMat);
    smokeFlapRight.position.set(0.34, 2.9, 0.18);
    smokeFlapRight.rotation.set(0.28, -0.22, -0.1);
    group.add(smokeFlapRight);

    const poleHeight = 4.8;
    group.add(createPole(poleHeight, 0.12, 0.16, 2.32, 0.1));
    group.add(createPole(poleHeight, 0.08, -0.14, 2.38, 0.85));
    group.add(createPole(poleHeight, -0.11, 0.13, 2.35, 1.65));
    group.add(createPole(poleHeight, -0.08, -0.15, 2.3, 2.3));

    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.015, 5, 14), ropeMat);
    tie.position.set(0, 3.1, 0.02);
    tie.rotation.x = Math.PI / 2;
    group.add(tie);

    const bedroll = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.7, 10), hideMat);
    bedroll.rotation.z = Math.PI / 2;
    bedroll.position.set(-0.9, 0.18, 0.4);
    bedroll.castShadow = true;
    group.add(bedroll);

    group.traverse((obj) => {
        if (!obj.isMesh) return;
        obj.receiveShadow = true;
    });

    return group;
}

export function createVillageAsset(type) {
    const builder = ASSET_BUILDERS[type];
    if (!builder) return null;
    const asset = builder.create();
    asset.userData.placeableType = type;
    asset.userData.colliderRadius = builder.colliderRadius;
    return asset;
}

export function spawnVillagePlacement(scene, placement, resolveGroundY) {
    const asset = createVillageAsset(placement.type);
    if (!asset) return null;

    const scale = typeof placement.scale === 'number' ? placement.scale : 1;
    const y = typeof placement.y === 'number'
        ? placement.y
        : resolveGroundY(placement.x, placement.z);

    asset.position.set(placement.x, y + (placement.yOffset ?? 0), placement.z);
    asset.rotation.y = placement.rotation ?? 0;
    asset.scale.setScalar(scale);

    scene.add(asset);
    addCollider(placement.x, placement.z, asset.userData.colliderRadius * scale);
    return asset;
}

export function spawnVillageLayout(scene, placements, resolveGroundY) {
    const spawned = [];

    placements.forEach((placement) => {
        const asset = spawnVillagePlacement(scene, placement, resolveGroundY);
        if (asset) spawned.push(asset);
    });

    return spawned;
}

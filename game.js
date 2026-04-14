import * as THREE from 'three';
import { applyFaceState, resolveFaceState } from './characterState.js';
import { updateSprint, updateHUD, getStamina, isSprinting } from './playerStats.js';
import { updateSurvival, updateSurvivalHUD, hydratePlayer } from './survival.js';
import { detectActions } from './actionDetection.js';
import { updateActionMenu, setActionCallback } from './actionMenu.js';
import { setBuildMenuItems } from './buildMenu.js';
import { canPlaceCollider, removeCollider, resolveCollision } from './collision.js';
import { getHeight, getUphillFactor, isTooSteep, applyTerrainToChunk, TERRAIN_SEGS, WATER_LEVEL } from './terrain.js';
import { spawnChunkTrees, removeChunkTrees } from './trees.js';
import { spawnChunkLakes, removeChunkLakes, isLake, setLakeAtmosphere, updateLakes } from './lakes.js';
import { createVillageAsset, PLACEABLE_ITEMS, spawnVillageLayout, spawnVillagePlacement } from './village.js';
import { spawnVillageVillagers } from './villagers.js';
import { clearDevConsole, isDevConsoleOpen, logDevConsole, setDevConsoleCommandHandler } from './devConsole.js';
import { DEV_MODE } from './devMode.js';
import { clearSavedVillageLayout, loadVillageLayout, saveVillageLayout } from './villagePersistence.js';

const {
    layout: villageLayout,
    source: villageLayoutSource,
    fileName: villageFileName,
} = await loadVillageLayout();

// ── Scene setup ────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 60, 150);

const BASE_FOV = 50;
const MOVE_FOV = 53;
const SPRINT_FOV = 58;
const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 200);
const CAM_DISTANCE = 19;       // distance from player (before zoom)
const CAM_HEIGHT = 6;          // height above player
const CAM_ZOOM_STEPS = 8;
const CAM_ZOOM_MIN = 0.45;
const CAM_ZOOM_MAX = 1.0;
const CAM_ZOOM_STEP = (CAM_ZOOM_MAX - CAM_ZOOM_MIN) / CAM_ZOOM_STEPS;
let camZoom = CAM_ZOOM_MAX;
let camOrbitAngle = 0;         // radians, 0 = behind (+Z), orbits around Y axis
const CAM_ORBIT_SPEED = 0.003; // mouse sensitivity
camera.position.set(0, 6, 18);
camera.lookAt(0, 2, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.tabIndex = 0;
renderer.domElement.style.outline = 'none';
document.body.prepend(renderer.domElement);
renderer.domElement.focus();
renderer.domElement.addEventListener('pointerdown', () => {
    renderer.domElement.focus();
});

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2(0, 0);
const placementState = {
    active: false,
    item: null,
    preview: null,
    previewMaterials: [],
    rotation: 0,
    hit: null,
    valid: false,
};
const villageEditState = {
    assets: [],
    selectedAsset: null,
};

const saveStatus = document.getElementById('save-status');
const debugReadout = document.getElementById('debug-readout');
const controlsHint = document.getElementById('controls-hint');
let showDebugCoords = false;

function setSaveStatus(text, isError = false) {
    if (!saveStatus) return;
    saveStatus.textContent = text;
    saveStatus.classList.toggle('error', isError);
}

function applyVillageSaveStatus(saveResult, successMessage) {
    if (saveResult.ok) {
        if (saveResult.storage === 'file') {
            setSaveStatus(`${successMessage}: ${saveResult.fileName}`);
        } else {
            setSaveStatus(`${successMessage} locally for dev resets`);
        }
    } else if (saveResult.reason === 'local-storage-failed') {
        setSaveStatus(`${successMessage}, but local save failed`, true);
    } else {
        setSaveStatus(`${successMessage}, but save failed`, true);
    }
}

function clearVillageAssetSelection() {
    villageEditState.selectedAsset = null;
}

function getVillageAssetLabel(asset) {
    const type = asset?.userData?.placeableType;
    if (type === 'tipi') return 'Tipi';
    if (type === 'campfire') return 'Campfire';
    return 'Structure';
}

function getVillageActions() {
    const selectedAsset = villageEditState.selectedAsset;
    if (!DEV_MODE || !selectedAsset) return null;

    const label = getVillageAssetLabel(selectedAsset);
    return [
        { id: 'rotate-selected-village-asset', label: `Rotate ${label}` },
        { id: 'delete-selected-village-asset', label: `Delete ${label}` },
    ];
}

function getVillageAssetFromHit(object) {
    let current = object;
    while (current) {
        if (current.userData?.isVillageAssetRoot) return current;
        current = current.parent;
    }
    return object.userData?.villageAssetRoot ?? null;
}

function pickVillageAsset() {
    if (!DEV_MODE || villageEditState.assets.length === 0) return null;
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(villageEditState.assets, true);
    for (const hit of hits) {
        const asset = getVillageAssetFromHit(hit.object);
        if (asset) return asset;
    }
    return null;
}

async function rotateSelectedVillageAsset() {
    const asset = villageEditState.selectedAsset;
    const placement = asset?.userData?.placementRef;
    if (!asset || !placement) return;

    const nextRotation = (asset.rotation.y + Math.PI / 4) % (Math.PI * 2);
    asset.rotation.y = nextRotation;
    placement.rotation = nextRotation;

    const saveResult = await saveVillageLayout(villageLayout);
    applyVillageSaveStatus(saveResult, `${getVillageAssetLabel(asset)} updated`);
}

async function deleteSelectedVillageAsset() {
    const asset = villageEditState.selectedAsset;
    const placement = asset?.userData?.placementRef;
    if (!asset || !placement) return;

    scene.remove(asset);
    removeCollider(asset.userData?.colliderRef);
    villageEditState.assets = villageEditState.assets.filter((entry) => entry !== asset);

    const placementIndex = villageLayout.placements.indexOf(placement);
    if (placementIndex >= 0) {
        villageLayout.placements.splice(placementIndex, 1);
    }

    clearVillageAssetSelection();

    const saveResult = await saveVillageLayout(villageLayout);
    applyVillageSaveStatus(saveResult, `${getVillageAssetLabel(asset)} deleted`);
}

if (controlsHint) {
    controlsHint.innerHTML = DEV_MODE
        ? 'A/D Move &bull; W/S Forward/Back &bull; Shift Sprint &bull; M Build &bull; Click Place &bull; Esc Cancel'
        : 'A/D Move &bull; W/S Forward/Back &bull; Shift Sprint';
}

if (!DEV_MODE && saveStatus) {
    saveStatus.hidden = true;
} else if (villageLayoutSource === 'file') {
    setSaveStatus(`Village source: ${villageFileName}`);
} else if (villageLayoutSource === 'local') {
    setSaveStatus('Village source: dev local autosave');
} else if (villageLayoutSource === 'bundle') {
    setSaveStatus(`Village source: ${villageFileName}`);
} else {
    setSaveStatus('Village source: default layout', true);
}

function updateDebugReadout() {
    if (!showDebugCoords || !debugReadout) return;
    debugReadout.textContent = [
        `X: ${player.position.x.toFixed(2)}`,
        `Y: ${player.position.y.toFixed(2)}`,
        `Z: ${player.position.z.toFixed(2)}`
    ].join('\n');
}

function setDebugCoordsVisible(visible) {
    showDebugCoords = visible;
    if (debugReadout) {
        debugReadout.hidden = !visible;
    }
    updateDebugReadout();
}

function exportVillageLayoutText() {
    return `${JSON.stringify(villageLayout, null, 2)}\n`;
}

async function bakeVillageLayout() {
    const bakedText = exportVillageLayoutText();

    let copied = false;
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(bakedText);
            copied = true;
        } catch {
            copied = false;
        }
    }

    const blob = new Blob([bakedText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'villageLayout.baked.json';
    anchor.click();
    URL.revokeObjectURL(url);

    logDevConsole('Baked village layout ready.');
    logDevConsole(copied ? 'Copied JSON to clipboard.' : 'Clipboard copy unavailable.');
    logDevConsole('Downloaded `villageLayout.baked.json`.');
}

setDevConsoleCommandHandler(async (raw) => {
    const command = raw.trim().toLowerCase();

    if (command === 'help') {
        return [
            'help',
            'coords on',
            'coords off',
            'coords',
            'bake village',
            'print village',
            'reset village',
            'clear',
        ];
    }

    if (command === 'clear') {
        clearDevConsole();
        return '';
    }

    if (command === 'coords' || command === 'coords on') {
        setDebugCoordsVisible(true);
        return 'World coordinates readout enabled.';
    }

    if (command === 'coords off') {
        setDebugCoordsVisible(false);
        return 'World coordinates readout disabled.';
    }

    if (command === 'print village') {
        logDevConsole(exportVillageLayoutText());
        return 'Current village layout printed above.';
    }

    if (command === 'bake village') {
        await bakeVillageLayout();
        return 'Bake complete.';
    }

    if (command === 'reset village') {
        const result = clearSavedVillageLayout();
        if (!result.ok) {
            return 'Failed to clear dev local village autosave.';
        }
        setSaveStatus('Village source reset to baked layout');
        logDevConsole('Cleared dev local village autosave. Reloading...');
        window.location.reload();
        return 'Reloading with baked village layout.';
    }

    return `Unknown command: ${raw}`;
});

function updatePointerFromEvent(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}

function disposePlacementPreview() {
    if (!placementState.preview) return;
    scene.remove(placementState.preview);
    placementState.preview.traverse((obj) => {
        if (obj.isMesh && obj.material?.dispose) {
            obj.material.dispose();
        }
    });
    placementState.preview = null;
    placementState.previewMaterials = [];
}

function setPlacementTint(valid) {
    const tint = valid ? 0x63ffb8 : 0xff6b7a;
    placementState.previewMaterials.forEach((material) => material.color.setHex(tint));
}

function createBlueprintAsset(type) {
    const asset = createVillageAsset(type);
    if (!asset) return null;

    const previewMaterials = [];
    asset.traverse((obj) => {
        if (!obj.isMesh) return;
        const sourceMat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
        const previewMat = new THREE.MeshBasicMaterial({
            color: 0x63ffb8,
            transparent: true,
            opacity: obj.geometry.type === 'CircleGeometry' ? 0.16 : 0.38,
            depthWrite: false,
            side: sourceMat?.side ?? THREE.DoubleSide,
        });
        obj.material = previewMat;
        obj.castShadow = false;
        obj.receiveShadow = false;
        previewMaterials.push(previewMat);
    });

    asset.userData.previewMaterials = previewMaterials;
    return asset;
}

function cancelPlacementMode() {
    placementState.active = false;
    placementState.item = null;
    placementState.hit = null;
    placementState.valid = false;
    disposePlacementPreview();
}

function startPlacementMode(item) {
    cancelPlacementMode();
    clearVillageAssetSelection();
    const preview = createBlueprintAsset(item.id);
    if (!preview) return;
    placementState.active = true;
    placementState.item = item;
    placementState.preview = preview;
    placementState.previewMaterials = preview.userData.previewMaterials ?? [];
    placementState.rotation = camOrbitAngle;
    scene.add(preview);
}

function getGroundMeshes() {
    return Array.from(groundChunks.values(), (chunk) => chunk.top);
}

function updatePlacementPreview() {
    if (!placementState.active || !placementState.preview) return;

    const groundMeshes = getGroundMeshes();
    if (groundMeshes.length === 0) {
        placementState.preview.visible = false;
        placementState.valid = false;
        placementState.hit = null;
        return;
    }

    raycaster.setFromCamera(pointerNdc, camera);
    const hit = raycaster.intersectObjects(groundMeshes, false)[0];
    if (!hit) {
        placementState.preview.visible = false;
        placementState.valid = false;
        placementState.hit = null;
        return;
    }

    const x = hit.point.x;
    const z = hit.point.z;
    const y = GROUND_Y + getHeight(x, z);
    const radius = placementState.preview.userData.colliderRadius ?? 0;
    const dx = x - player.position.x;
    const dz = z - player.position.z;
    const playerClearance = radius + 1.1;
    const valid = canPlaceCollider(x, z, radius, 0.2) && (dx * dx + dz * dz) > playerClearance * playerClearance;

    placementState.preview.visible = true;
    placementState.preview.position.set(x, y, z);
    placementState.preview.rotation.y = placementState.rotation;
    placementState.hit = { x, y, z };
    placementState.valid = valid;
    setPlacementTint(valid);
}

async function placeSelectedAsset() {
    if (!placementState.active || !placementState.item || !placementState.valid || !placementState.hit) return;

    const placement = {
        type: placementState.item.id,
        x: placementState.hit.x,
        y: placementState.hit.y,
        z: placementState.hit.z,
        rotation: placementState.rotation,
    };

    villageLayout.placements.push(placement);
    const asset = spawnVillagePlacement(scene, placement, (x, z) => GROUND_Y + getHeight(x, z));
    if (asset) {
        villageEditState.assets.push(asset);
    }

    const saveResult = await saveVillageLayout(villageLayout);
    applyVillageSaveStatus(saveResult, 'Village saved');
}

// ── Mouse orbit controls ──
let isOrbiting = false;
renderer.domElement.addEventListener('mousedown', async (e) => {
    if (isDevConsoleOpen()) return;
    updatePointerFromEvent(e);

    if (placementState.active) {
        if (e.button === 0) {
            await placeSelectedAsset();
            e.preventDefault();
            return;
        }
        if (e.button === 2) {
            cancelPlacementMode();
            e.preventDefault();
            return;
        }
    }

    if (DEV_MODE && e.button === 0) {
        const selectedAsset = pickVillageAsset();
        if (selectedAsset) {
            villageEditState.selectedAsset = selectedAsset;
            e.preventDefault();
            return;
        }
        clearVillageAssetSelection();
    }

    if (e.button === 2 || e.button === 0) {
        isOrbiting = true;
    }
});
window.addEventListener('mouseup', () => { isOrbiting = false; });
window.addEventListener('mousemove', (e) => {
    if (isDevConsoleOpen()) return;
    updatePointerFromEvent(e);
    if (!isOrbiting) return;
    camOrbitAngle -= e.movementX * CAM_ORBIT_SPEED;
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('builditemselected', (e) => {
    if (!DEV_MODE) return;
    if (e.detail?.item) {
        startPlacementMode(e.detail.item);
    }
});
window.addEventListener('buildmenuchange', (e) => {
    if (!DEV_MODE) return;
    if (e.detail?.open) {
        cancelPlacementMode();
        clearVillageAssetSelection();
    }
});

// ── Vignette ───────────────────────────────────────────────────────
const vignetteScene = new THREE.Scene();
const vignetteCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const vignetteQuad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, depthTest: false,
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: `
            varying vec2 vUv;
            void main(){
                vec2 center = vUv - 0.5;
                float dist = length(center) * 1.5;
                float vig = smoothstep(0.2, 1.1, dist);
                gl_FragColor = vec4(0.0, 0.0, 0.0, vig * 0.7);
            }
        `
    })
);
vignetteScene.add(vignetteQuad);

// ── Lighting ───────────────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 15, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 60;
dirLight.shadow.camera.left = -30;
dirLight.shadow.camera.right = 30;
dirLight.shadow.camera.top = 20;
dirLight.shadow.camera.bottom = -10;
scene.add(dirLight);
scene.add(dirLight.target);

// Atmosphere state
const atmosphereState = {
    sunAmount: 1,
    skyTop: new THREE.Color(0x87ceeb),
    skyHorizon: new THREE.Color(0xf2d8a8),
    hazeColor: new THREE.Color(0xb8c4cf),
    sunDirection: new THREE.Vector3(0.25, 0.95, 0.2),
    lightDirection: new THREE.Vector3(0.25, 0.95, 0.2),
};

const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(180, 32, 20),
    new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
            uTopColor: { value: atmosphereState.skyTop.clone() },
            uHorizonColor: { value: atmosphereState.skyHorizon.clone() },
            uLowerColor: { value: atmosphereState.hazeColor.clone() },
            uSunColor: { value: new THREE.Color(0xfff1c2) },
            uMoonColor: { value: new THREE.Color(0x9ab8ff) },
            uSunDir: { value: atmosphereState.sunDirection.clone() },
            uSunAmount: { value: 1 },
        },
        vertexShader: `
            varying vec3 vWorldPos;
            void main() {
                vec4 worldPos = modelMatrix * vec4(position, 1.0);
                vWorldPos = worldPos.xyz;
                gl_Position = projectionMatrix * viewMatrix * worldPos;
            }
        `,
        fragmentShader: `
            uniform vec3 uTopColor;
            uniform vec3 uHorizonColor;
            uniform vec3 uLowerColor;
            uniform vec3 uSunColor;
            uniform vec3 uMoonColor;
            uniform vec3 uSunDir;
            uniform float uSunAmount;
            varying vec3 vWorldPos;

            void main() {
                vec3 dir = normalize(vWorldPos - cameraPosition);
                float height = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
                float horizonBand = smoothstep(0.0, 0.28, height);
                vec3 col = mix(uLowerColor, uHorizonColor, horizonBand);
                col = mix(col, uTopColor, smoothstep(0.24, 0.95, height));

                float horizonGlow = pow(1.0 - min(abs(dir.y) * 1.4, 1.0), 3.0);
                col += uHorizonColor * horizonGlow * (0.12 + uSunAmount * 0.08);

                vec3 sunDir = normalize(uSunDir);
                float sunDot = max(dot(dir, sunDir), 0.0);
                float sunHalo = pow(sunDot, 18.0);
                float sunCore = pow(sunDot, 260.0);
                col += uSunColor * (sunHalo * 0.25 + sunCore * 1.15);

                float moonDot = max(dot(dir, -sunDir), 0.0);
                float moonHalo = pow(moonDot, 28.0);
                float moonCore = pow(moonDot, 320.0);
                col += uMoonColor * (moonHalo * 0.08 + moonCore * 0.3) * (1.0 - uSunAmount);

                gl_FragColor = vec4(col, 1.0);
            }
        `
    })
);
scene.add(skyDome);

// ── Materials ──────────────────────────────────────────────────────
const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
const groundMat = new THREE.MeshStandardMaterial({ color: 0x7a8a5a, roughness: 0.9 });
const groundSideMat = new THREE.MeshStandardMaterial({ color: 0x5a6a4a, roughness: 0.9 });
const cloudMat = new THREE.MeshBasicMaterial({ color: 0xb0b0b8 });
const cloudDarkMat = new THREE.MeshBasicMaterial({ color: 0x8a8a92 });
const dirtSpotMat = new THREE.MeshStandardMaterial({ color: 0x5a6a4a, roughness: 1 });

// Character materials (wooden samurai palette)
const bodyBrownMat = new THREE.MeshBasicMaterial({ color: 0x8B6844 });       // dark brown body
const bodyBrownDarkMat = new THREE.MeshBasicMaterial({ color: 0x6B4C30 });   // darker brown edges
const limbTanMat = new THREE.MeshBasicMaterial({ color: 0xC4A872 });         // tan limbs
const limbTanDarkMat = new THREE.MeshBasicMaterial({ color: 0xA08850 });     // darker tan joints
const faceMaskMat = new THREE.MeshBasicMaterial({ color: 0xC4A872 });        // tan face (matches skin)
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x2A1A0A });         // dark outline
const bootMat = new THREE.MeshBasicMaterial({ color: 0x6B4830 });            // boot color

// ── Procedural Ground with Trees ───────────────────────────────────
const GROUND_Y = -2;
const CHUNK_SIZE_X = 30;
const CHUNK_SIZE_Z = 30;
const groundChunks = new Map();

function chunkKey(cx, cz) { return cx + ',' + cz; }

// Seeded pseudo-random
function seededRand(seed) {
    const r = Math.sin(seed) * 43758.5453;
    return r - Math.floor(r);
}

function createGroundChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    if (groundChunks.has(key)) return;

    const group = new THREE.Group();
    const worldX = cx * CHUNK_SIZE_X;
    const worldZ = cz * CHUNK_SIZE_Z;

    // Ground surface with terrain
    const planeGeo = new THREE.PlaneGeometry(CHUNK_SIZE_X, CHUNK_SIZE_Z, TERRAIN_SEGS, TERRAIN_SEGS);
    planeGeo.rotateX(-Math.PI / 2);
    applyTerrainToChunk(planeGeo, worldX, worldZ, CHUNK_SIZE_X, CHUNK_SIZE_Z);
    const top = new THREE.Mesh(planeGeo, groundMat);
    top.position.set(worldX, GROUND_Y, worldZ);
    top.receiveShadow = true;
    group.add(top);

    // Dirt spots
    const seed = cx * 7919 + cz * 104729;
    for (let i = 0; i < 12; i++) {
        const rx = seededRand(seed + i * 13.37) - 0.5;
        const rz = seededRand(seed + i * 27.53) - 0.5;
        const spot = new THREE.Mesh(
            new THREE.CircleGeometry(0.08 + seededRand(seed + i * 7.1) * 0.12, 6),
            dirtSpotMat
        );
        spot.rotation.x = -Math.PI / 2;
        const spotX = worldX + rx * CHUNK_SIZE_X * 0.9;
        const spotZ = worldZ + rz * CHUNK_SIZE_Z * 0.9;
        spot.position.set(spotX, GROUND_Y + getHeight(spotX, spotZ) + 0.01, spotZ);
        group.add(spot);
    }

    scene.add(group);

    // Trees for this chunk
    const trees = spawnChunkTrees(scene, cx, cz, CHUNK_SIZE_X, CHUNK_SIZE_Z, GROUND_Y);

    // Lakes for this chunk
    const lakes = spawnChunkLakes(scene, cx, cz, CHUNK_SIZE_X, CHUNK_SIZE_Z, GROUND_Y);

    groundChunks.set(key, { ground: group, top, trees, lakes });
}

function updateGroundChunks(px, pz) {
    const pcx = Math.round(px / CHUNK_SIZE_X);
    const pcz = Math.round(pz / CHUNK_SIZE_Z);
    const radius = 6;

    for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
            createGroundChunk(pcx + dx, pcz + dz);
        }
    }

    for (const [key, chunk] of groundChunks) {
        const [cx, cz] = key.split(',').map(Number);
        if (Math.abs(cx - pcx) > radius + 1 || Math.abs(cz - pcz) > radius + 1) {
            scene.remove(chunk.ground);
            removeChunkTrees(scene, chunk.trees);
            removeChunkLakes(scene, chunk.lakes);
            groundChunks.delete(key);
        }
    }
}

updateGroundChunks(0, 5);

// ── Cloud creation ─────────────────────────────────────────────────
function createCloud(x, y, z, scale) {
    const group = new THREE.Group();
    const addPuff = (px, py, r, mat) => {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mat);
        puff.position.set(px, py, 0);
        group.add(puff);
    };
    addPuff(-0.6 * scale, 0, 0.75 * scale, cloudDarkMat);
    addPuff(0, 0.15 * scale, 0.85 * scale, cloudDarkMat);
    addPuff(0.65 * scale, -0.05 * scale, 0.7 * scale, cloudDarkMat);
    addPuff(-0.55 * scale, 0.05, 0.62 * scale, cloudMat);
    addPuff(0.05, 0.2 * scale, 0.72 * scale, cloudMat);
    addPuff(0.6 * scale, 0, 0.58 * scale, cloudMat);
    group.position.set(x, y, z);
    scene.add(group);
    return group;
}

const clouds = [];
const CLOUD_WORLD_Y = [45, 49, 44, 47, 48]; // fixed world heights
clouds.push(createCloud(-8, CLOUD_WORLD_Y[0], -15, 1.5));
clouds.push(createCloud(6, CLOUD_WORLD_Y[1], -20, 1.2));
clouds.push(createCloud(18, CLOUD_WORLD_Y[2], -12, 1.0));
clouds.push(createCloud(-15, CLOUD_WORLD_Y[3], -25, 1.8));
clouds.push(createCloud(25, CLOUD_WORLD_Y[4], -18, 1.3));

// ── Helper: shape builders ─────────────────────────────────────────
function makeRect(w, h, mat) {
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

// ── Rounded rect shape helper ──────────────────────────────────────
function makeRoundedRect(w, h, r, mat) {
    const shape = new THREE.Shape();
    const x = -w / 2, y = -h / 2;
    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y);
    shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r);
    shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h);
    shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
    return new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
}

// ── Polished Character creation (flat 2D) ──────────────────────────
function createSamurai() {
    const group = new THREE.Group();
    const S = 0.75;

    // ── Body (slim torso) ──
    // Outline
    const bodyOut = makeRoundedRect(0.9 * S, 1.55 * S, 0.12 * S, outlineMat);
    bodyOut.position.set(0, 1.4 * S, 0);
    group.add(bodyOut);
    // Fill
    const bodyFill = makeRoundedRect(0.8 * S, 1.45 * S, 0.1 * S, bodyBrownMat);
    bodyFill.position.set(0, 1.4 * S, 0.01);
    group.add(bodyFill);
    // Chest highlight
    const chestHL = makeRoundedRect(0.35 * S, 0.6 * S, 0.06 * S, bodyBrownDarkMat);
    chestHL.position.set(0, 1.55 * S, 0.02);
    group.add(chestHL);
    // Belt line
    const belt = makeRoundedRect(0.78 * S, 0.1 * S, 0.04 * S, limbTanDarkMat);
    belt.position.set(0, 0.72 * S, 0.02);
    group.add(belt);

    // ── Shoulder caps (blend arms into body) ──
    const shoulderCapL = new THREE.Mesh(new THREE.CircleGeometry(0.16 * S, 12), bodyBrownMat);
    shoulderCapL.position.set(-0.42 * S, 2.0 * S, 0.015);
    group.add(shoulderCapL);
    const shoulderCapR = new THREE.Mesh(new THREE.CircleGeometry(0.16 * S, 12), bodyBrownMat);
    shoulderCapR.position.set(0.42 * S, 2.0 * S, 0.015);
    group.add(shoulderCapR);

    // ── Neck ──
    const neck = makeRoundedRect(0.35 * S, 0.2 * S, 0.06 * S, limbTanMat);
    neck.position.set(0, 2.22 * S, 0.01);
    group.add(neck);

    // ── Head (rounded) ──
    const headOut = makeRoundedRect(0.72 * S, 0.7 * S, 0.2 * S, outlineMat);
    headOut.position.set(0, 2.7 * S, 0);
    group.add(headOut);
    const headFill = makeRoundedRect(0.62 * S, 0.6 * S, 0.18 * S, limbTanMat);
    headFill.position.set(0, 2.7 * S, 0.01);
    group.add(headFill);

    // ── Side face (profile — single eye) ──
    const sideface = new THREE.Group();
    // Eye
    const eyeSide = new THREE.Mesh(new THREE.CircleGeometry(0.06 * S, 10), outlineMat);
    eyeSide.position.set(0.14 * S, 2.68 * S, 0.03);
    sideface.add(eyeSide);
    group.add(sideface);

    // ── Front face (two eyes) ──
    const frontface = new THREE.Group();
    // Left eye
    const eyeFL = new THREE.Mesh(new THREE.CircleGeometry(0.055 * S, 10), outlineMat);
    eyeFL.position.set(-0.1 * S, 2.68 * S, 0.03);
    frontface.add(eyeFL);
    // Right eye
    const eyeFR = new THREE.Mesh(new THREE.CircleGeometry(0.055 * S, 10), outlineMat);
    eyeFR.position.set(0.1 * S, 2.68 * S, 0.03);
    frontface.add(eyeFR);
    frontface.visible = false;
    group.add(frontface);

    // ── Arms ──
    const shoulderY = 2.0 * S;

    // Back arm
    const upperArmBack = new THREE.Group();
    const uabOut = makeRoundedRect(0.22 * S, 0.52 * S, 0.07 * S, outlineMat);
    uabOut.position.y = -0.24 * S;
    upperArmBack.add(uabOut);
    const uabFill = makeRoundedRect(0.16 * S, 0.46 * S, 0.05 * S, limbTanMat);
    uabFill.position.set(0, -0.24 * S, 0.01);
    upperArmBack.add(uabFill);
    upperArmBack.position.set(-0.48 * S, shoulderY, -0.02);
    upperArmBack.rotation.z = -0.1;
    group.add(upperArmBack);

    const forearmBack = new THREE.Group();
    const fabOut = makeRoundedRect(0.2 * S, 0.48 * S, 0.06 * S, outlineMat);
    fabOut.position.y = -0.22 * S;
    forearmBack.add(fabOut);
    const fabFill = makeRoundedRect(0.14 * S, 0.42 * S, 0.04 * S, limbTanDarkMat);
    fabFill.position.set(0, -0.22 * S, 0.01);
    forearmBack.add(fabFill);
    // Hand
    const handB = new THREE.Mesh(new THREE.CircleGeometry(0.07 * S, 8), limbTanMat);
    handB.position.set(0, -0.46 * S, 0.01);
    forearmBack.add(handB);
    forearmBack.position.set(0, -0.48 * S, 0);
    forearmBack.rotation.z = 0.1;
    upperArmBack.add(forearmBack);

    // Front arm
    const upperArmFront = new THREE.Group();
    const uafOut = makeRoundedRect(0.22 * S, 0.52 * S, 0.07 * S, outlineMat);
    uafOut.position.y = -0.24 * S;
    upperArmFront.add(uafOut);
    const uafFill = makeRoundedRect(0.16 * S, 0.46 * S, 0.05 * S, limbTanMat);
    uafFill.position.set(0, -0.24 * S, 0.01);
    upperArmFront.add(uafFill);
    upperArmFront.position.set(0.48 * S, shoulderY, 0.04);
    upperArmFront.rotation.z = 0.1;
    group.add(upperArmFront);

    const forearmFront = new THREE.Group();
    const fafOut = makeRoundedRect(0.2 * S, 0.48 * S, 0.06 * S, outlineMat);
    fafOut.position.y = -0.22 * S;
    forearmFront.add(fafOut);
    const fafFill = makeRoundedRect(0.14 * S, 0.42 * S, 0.04 * S, limbTanDarkMat);
    fafFill.position.set(0, -0.22 * S, 0.01);
    forearmFront.add(fafFill);
    const handF = new THREE.Mesh(new THREE.CircleGeometry(0.07 * S, 8), limbTanMat);
    handF.position.set(0, -0.46 * S, 0.01);
    forearmFront.add(handF);
    forearmFront.position.set(0, -0.48 * S, 0);
    forearmFront.rotation.z = -0.1;
    upperArmFront.add(forearmFront);

    // ── Legs ──
    const hipY = 0.68 * S;
    const hipSpread = 0.2 * S;

    // Left leg
    const upperLegL = new THREE.Group();
    const ullOut = makeRoundedRect(0.22 * S, 0.55 * S, 0.07 * S, outlineMat);
    ullOut.position.y = -0.26 * S;
    upperLegL.add(ullOut);
    const ullFill = makeRoundedRect(0.16 * S, 0.49 * S, 0.05 * S, limbTanMat);
    ullFill.position.set(0, -0.26 * S, 0.01);
    upperLegL.add(ullFill);
    upperLegL.position.set(-hipSpread, hipY, 0);
    group.add(upperLegL);

    const lowerLegL = new THREE.Group();
    const lllOut = makeRoundedRect(0.2 * S, 0.5 * S, 0.06 * S, outlineMat);
    lllOut.position.y = -0.23 * S;
    lowerLegL.add(lllOut);
    const lllFill = makeRoundedRect(0.14 * S, 0.44 * S, 0.04 * S, limbTanDarkMat);
    lllFill.position.set(0, -0.23 * S, 0.01);
    lowerLegL.add(lllFill);
    // Boot
    const bootLOut = makeRoundedRect(0.28 * S, 0.14 * S, 0.05 * S, outlineMat);
    bootLOut.position.set(0.03 * S, -0.5 * S, 0);
    lowerLegL.add(bootLOut);
    const bootLFill = makeRoundedRect(0.22 * S, 0.1 * S, 0.04 * S, bootMat);
    bootLFill.position.set(0.03 * S, -0.5 * S, 0.01);
    lowerLegL.add(bootLFill);
    lowerLegL.position.set(0, -0.52 * S, 0);
    upperLegL.add(lowerLegL);

    // Right leg
    const upperLegR = new THREE.Group();
    const ulrOut = makeRoundedRect(0.22 * S, 0.55 * S, 0.07 * S, outlineMat);
    ulrOut.position.y = -0.26 * S;
    upperLegR.add(ulrOut);
    const ulrFill = makeRoundedRect(0.16 * S, 0.49 * S, 0.05 * S, limbTanMat);
    ulrFill.position.set(0, -0.26 * S, 0.01);
    upperLegR.add(ulrFill);
    upperLegR.position.set(hipSpread, hipY, 0.01);
    group.add(upperLegR);

    const lowerLegR = new THREE.Group();
    const llrOut = makeRoundedRect(0.2 * S, 0.5 * S, 0.06 * S, outlineMat);
    llrOut.position.y = -0.23 * S;
    lowerLegR.add(llrOut);
    const llrFill = makeRoundedRect(0.14 * S, 0.44 * S, 0.04 * S, limbTanDarkMat);
    llrFill.position.set(0, -0.23 * S, 0.01);
    lowerLegR.add(llrFill);
    const bootROut = makeRoundedRect(0.28 * S, 0.14 * S, 0.05 * S, outlineMat);
    bootROut.position.set(0.03 * S, -0.5 * S, 0);
    lowerLegR.add(bootROut);
    const bootRFill = makeRoundedRect(0.22 * S, 0.1 * S, 0.04 * S, bootMat);
    bootRFill.position.set(0.03 * S, -0.5 * S, 0.01);
    lowerLegR.add(bootRFill);
    lowerLegR.position.set(0, -0.52 * S, 0);
    upperLegR.add(lowerLegR);

    group.userData = {
        vx: 0, vz: 0,
        facing: 1,
        upperArmBack, forearmBack,
        upperArmFront, forearmFront,
        upperLegL, lowerLegL,
        upperLegR, lowerLegR,
        sideface, frontface,
    };

    scene.add(group);
    return group;
}

// ── Player ─────────────────────────────────────────────────────────
const player = createSamurai();
player.position.set(
    villageLayout.center?.x ?? 90,
    villageLayout.center?.y ?? 0.67,
    villageLayout.center?.z ?? 65.65
);
setBuildMenuItems(PLACEABLE_ITEMS);
villageEditState.assets = spawnVillageLayout(
    scene,
    villageLayout.placements,
    (x, z) => GROUND_Y + getHeight(x, z)
);
const villageVillagers = spawnVillageVillagers(scene, villageLayout, {
    resolveGroundY: (x, z) => GROUND_Y + getHeight(x, z),
    resolveWaterY: () => GROUND_Y + WATER_LEVEL,
    isLake,
});

// Blob shadow under the player (flat planes don't cast real shadows well)
const shadowTex = (() => {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    gradient.addColorStop(0, 'rgba(0,0,0,0.45)');
    gradient.addColorStop(0.6, 'rgba(0,0,0,0.2)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
})();
const playerShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 1.4),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
);
playerShadow.rotation.x = -Math.PI / 2;
playerShadow.position.set(0, GROUND_Y + 0.02, 0);
scene.add(playerShadow);

// ── Soundtrack ────────────────────────────────────────────────────
const bgm = new Audio('dusty_strings.wav');
bgm.loop = true;
bgm.volume = 0.4;
let bgmStarted = false;
function startBGM() {
    if (bgmStarted) return;
    bgmStarted = true;
    bgm.play().catch(() => {});
}
window.addEventListener('keydown', startBGM, { once: false });
window.addEventListener('mousedown', startBGM, { once: false });

// ── Input ──────────────────────────────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => {
    if (!DEV_MODE && !e.repeat && (e.code === 'Backquote' || e.key === '~' || e.key === '`')) {
        setDebugCoordsVisible(!showDebugCoords);
    } else if (DEV_MODE && placementState.active && e.key === 'Escape') {
        cancelPlacementMode();
    }
    if (DEV_MODE && isDevConsoleOpen()) return;
    keys[e.key.toLowerCase()] = true;
});
window.addEventListener('keyup', e => {
    if (DEV_MODE && isDevConsoleOpen()) return;
    keys[e.key.toLowerCase()] = false;
});

const PLAYER_SPEED = 6;
const PLAYER_SPEED_Z = 4;

// ── Animate samurai ────────────────────────────────────────────────
function animateSamurai(fig, time) {
    const d = fig.userData;
    const lx = d.localInputX || 0;
    const lz = d.localInputZ || 0;
    const moving = Math.abs(lx) > 0.1 || Math.abs(lz) > 0.1;
    const t = time * 7;

    fig.scale.x = d.facing;

    // Use local (screen-space) input for face state
    applyFaceState(d, resolveFaceState(lx, lz));

    if (moving) {
        const cycle = Math.sin(t);
        const cycleB = Math.sin(t + Math.PI);
        const faceState = resolveFaceState(lx, lz);
        const depthWalk = faceState === 'front' || faceState === 'back';

        // Legs swing
        if (depthWalk) {
            // Tight profile: minimal side swing, offset in depth
            d.upperLegL.rotation.z = cycle * 0.08;
            d.lowerLegL.rotation.z = Math.max(0, -cycle) * 0.1;
            d.upperLegR.rotation.z = cycleB * 0.08;
            d.lowerLegR.rotation.z = Math.max(0, -cycleB) * 0.1;
            d.upperLegL.position.z = cycle * 0.12;
            d.upperLegR.position.z = cycleB * 0.12;
        } else {
            d.upperLegL.rotation.z = cycle * 0.3;
            d.lowerLegL.rotation.z = Math.max(0, -cycle) * 0.35;
            d.upperLegR.rotation.z = cycleB * 0.3;
            d.lowerLegR.rotation.z = Math.max(0, -cycleB) * 0.35;
            d.upperLegL.position.z = 0;
            d.upperLegR.position.z = 0;
        }

        // Arms swing opposite, staff arm less
        d.upperArmBack.rotation.z = -0.15 + cycle * 0.15;
        d.forearmBack.rotation.z = 0.15;
        d.upperArmFront.rotation.z = 0.15 + cycleB * 0.25;
        d.forearmFront.rotation.z = -0.15 + Math.max(0, -cycleB) * 0.2;
    } else {
        const breath = Math.sin(time * 2) * 0.015;

        d.upperLegL.rotation.z = breath;
        d.lowerLegL.rotation.z = 0;
        d.upperLegR.rotation.z = -breath;
        d.lowerLegR.rotation.z = 0;
        d.upperLegL.position.z = 0;
        d.upperLegR.position.z = 0;

        d.upperArmBack.rotation.z = -0.15 + breath;
        d.forearmBack.rotation.z = 0.15;
        d.upperArmFront.rotation.z = 0.15 - breath;
        d.forearmFront.rotation.z = -0.15;
    }
}

// ── Day/Night cycle ───────────────────────────────────────────────
const DAY_DURATION = 60 * 60;   // 60 minutes in seconds
const NIGHT_DURATION = 10 * 60; // 10 minutes in seconds
const CYCLE_DURATION = DAY_DURATION + NIGHT_DURATION; // 70 minutes total
const TRANSITION = 0.05; // fraction of cycle for dawn/dusk transitions

const dayTopColor = new THREE.Color(0x6ebbf6);
const dayHorizonColor = new THREE.Color(0xf4d8a2);
const dayHazeColor = new THREE.Color(0xc0d1d5);
const sunsetTopColor = new THREE.Color(0x5f75c6);
const sunsetHorizonColor = new THREE.Color(0xf09b65);
const sunsetHazeColor = new THREE.Color(0xc79b7c);
const nightTopColor = new THREE.Color(0x07101d);
const nightHorizonColor = new THREE.Color(0x18253d);
const nightHazeColor = new THREE.Color(0x243249);

const dayDirColor = new THREE.Color(0xfff4dd);
const sunsetDirColor = new THREE.Color(0xffae73);
const nightDirColor = new THREE.Color(0x6f8bcf);
const sunGlowColor = new THREE.Color(0xffe0a6);
const moonGlowColor = new THREE.Color(0xa6c8ff);
const cloudDayColor = new THREE.Color(0xf3eee5);
const cloudDayShadow = new THREE.Color(0xb1b8c8);
const cloudSunsetColor = new THREE.Color(0xffcfb2);
const cloudSunsetShadow = new THREE.Color(0x8d6f7d);
const cloudNightColor = new THREE.Color(0x42506d);
const cloudNightShadow = new THREE.Color(0x263044);

const scratchSkyColor = new THREE.Color();
const scratchHorizonColor = new THREE.Color();
const scratchHazeColor = new THREE.Color();
const scratchCloudLight = new THREE.Color();
const scratchCloudDark = new THREE.Color();

function updateDayNight(elapsed) {
    const t = (elapsed % CYCLE_DURATION) / CYCLE_DURATION;
    const dayEnd = DAY_DURATION / CYCLE_DURATION;       // ~0.857
    const nightEnd = 1.0;

    let sunAmount; // 1 = full day, 0 = full night
    if (t < dayEnd - TRANSITION) {
        // Full day
        sunAmount = 1;
    } else if (t < dayEnd) {
        // Dusk transition
        sunAmount = 1 - (t - (dayEnd - TRANSITION)) / TRANSITION;
    } else if (t < nightEnd - TRANSITION) {
        // Full night
        sunAmount = 0;
    } else {
        // Dawn transition
        sunAmount = (t - (nightEnd - TRANSITION)) / TRANSITION;
    }

    // Smooth the transition
    sunAmount = sunAmount * sunAmount * (3 - 2 * sunAmount);

    const duskAmount = 1 - Math.abs(sunAmount - 0.5) / 0.5;

    // Sky palette
    if (sunAmount > 0.5) {
        const blend = (sunAmount - 0.5) * 2;
        scratchSkyColor.lerpColors(sunsetTopColor, dayTopColor, blend);
        scratchHorizonColor.lerpColors(sunsetHorizonColor, dayHorizonColor, blend);
        scratchHazeColor.lerpColors(sunsetHazeColor, dayHazeColor, blend);
    } else {
        const blend = sunAmount * 2;
        scratchSkyColor.lerpColors(nightTopColor, sunsetTopColor, blend);
        scratchHorizonColor.lerpColors(nightHorizonColor, sunsetHorizonColor, blend);
        scratchHazeColor.lerpColors(nightHazeColor, sunsetHazeColor, blend);
    }

    atmosphereState.sunAmount = sunAmount;
    atmosphereState.skyTop.copy(scratchSkyColor);
    atmosphereState.skyHorizon.copy(scratchHorizonColor);
    atmosphereState.hazeColor.copy(scratchHazeColor);

    const azimuth = elapsed * 0.03;
    const sunHeight = THREE.MathUtils.lerp(-0.3, 0.95, sunAmount);
    const horizonRadius = Math.sqrt(Math.max(0, 1 - sunHeight * sunHeight));
    atmosphereState.sunDirection.set(
        Math.cos(azimuth) * horizonRadius,
        sunHeight,
        Math.sin(azimuth) * horizonRadius * 0.7
    ).normalize();
    atmosphereState.lightDirection.copy(sunAmount > 0.22 ? atmosphereState.sunDirection : atmosphereState.sunDirection.clone().multiplyScalar(-1));

    scene.background.copy(atmosphereState.skyTop);
    scene.fog.color.copy(atmosphereState.hazeColor);

    skyDome.material.uniforms.uTopColor.value.copy(atmosphereState.skyTop);
    skyDome.material.uniforms.uHorizonColor.value.copy(atmosphereState.skyHorizon);
    skyDome.material.uniforms.uLowerColor.value.copy(atmosphereState.hazeColor);
    skyDome.material.uniforms.uSunColor.value.lerpColors(moonGlowColor, sunGlowColor, sunAmount);
    skyDome.material.uniforms.uMoonColor.value.copy(moonGlowColor);
    skyDome.material.uniforms.uSunDir.value.copy(atmosphereState.sunDirection);
    skyDome.material.uniforms.uSunAmount.value = sunAmount;

    // Lighting
    ambientLight.intensity = THREE.MathUtils.lerp(0.12, 0.68, sunAmount);
    dirLight.intensity = THREE.MathUtils.lerp(0.08, 0.92, sunAmount);

    if (sunAmount > 0.5) {
        dirLight.color.lerpColors(sunsetDirColor, dayDirColor, (sunAmount - 0.5) * 2);
    } else {
        dirLight.color.lerpColors(nightDirColor, sunsetDirColor, sunAmount * 2);
    }

    // Fog distance - closer at night, warmer near dusk
    scene.fog.near = THREE.MathUtils.lerp(12, 54, sunAmount);
    scene.fog.far = THREE.MathUtils.lerp(70, 165, sunAmount) - duskAmount * 12;

    if (sunAmount > 0.5) {
        const blend = (sunAmount - 0.5) * 2;
        scratchCloudLight.lerpColors(cloudSunsetColor, cloudDayColor, blend);
        scratchCloudDark.lerpColors(cloudSunsetShadow, cloudDayShadow, blend);
    } else {
        const blend = sunAmount * 2;
        scratchCloudLight.lerpColors(cloudNightColor, cloudSunsetColor, blend);
        scratchCloudDark.lerpColors(cloudNightShadow, cloudSunsetShadow, blend);
    }
    cloudMat.color.copy(scratchCloudLight);
    cloudDarkMat.color.copy(scratchCloudDark);

    setLakeAtmosphere(atmosphereState.skyTop, atmosphereState.skyHorizon, sunAmount);
}

// ── Action callbacks ──────────────────────────────────────────────
setActionCallback((id) => {
    if (id === 'drink') {
        hydratePlayer(25);
        return;
    }

    if (id === 'rotate-selected-village-asset') {
        rotateSelectedVillageAsset();
        return;
    }

    if (id === 'delete-selected-village-asset') {
        deleteSelectedVillageAsset();
    }
});

// ── Main loop ──────────────────────────────────────────────────────
const clock = new THREE.Clock();

function update() {
    requestAnimationFrame(update);
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.getElapsedTime();

    const pd = player.userData;

    // Movement — relative to camera direction
    let inputX = 0; // left/right (A/D)
    let inputZ = 0; // forward/back (W/S)
    const gameInputEnabled = !(DEV_MODE && isDevConsoleOpen());
    if (gameInputEnabled && (keys['a'] || keys['arrowleft']))  inputX = -1;
    if (gameInputEnabled && (keys['d'] || keys['arrowright'])) inputX = 1;
    if (gameInputEnabled && (keys['w'] || keys['arrowup']))    inputZ = 1;
    if (gameInputEnabled && (keys['s'] || keys['arrowdown']))  inputZ = -1;

    // Camera forward is from camera toward player (along the ground)
    const camFwdX = -Math.sin(camOrbitAngle);
    const camFwdZ = -Math.cos(camOrbitAngle);
    // Camera right is perpendicular
    const camRightX = Math.cos(camOrbitAngle);
    const camRightZ = -Math.sin(camOrbitAngle);

    pd.vx = (inputX * camRightX + inputZ * camFwdX) * PLAYER_SPEED;
    pd.vz = (inputX * camRightZ + inputZ * camFwdZ) * PLAYER_SPEED_Z;

    // Store local input for facing/animation (screen-space)
    pd.localInputX = inputX;
    pd.localInputZ = inputZ;

    // Flip sprite based on screen-space left/right
    if (inputX < 0) pd.facing = -1;
    else if (inputX > 0) pd.facing = 1;

    updateSprint(pd, keys, dt);
    updateSurvival(dt, isSprinting());
    updateHUD();
    updateSurvivalHUD();

    // Uphill slowdown based on stamina (low stamina = more slowdown)
    const uphill = getUphillFactor(player.position.x, player.position.z, pd.vx, pd.vz);
    const staminaPct = getStamina() / 100;
    const uphillPenalty = 1 - uphill * (1.2 - staminaPct * 0.7); // more penalty at low stamina
    const moveMult = Math.max(0.3, Math.min(1, uphillPenalty));
    pd.vx *= moveMult;
    pd.vz *= moveMult;

    // Slow down in water
    if (isLake(player.position.x, player.position.z)) {
        pd.vx *= 0.55;
        pd.vz *= 0.55;
    }

    // Block movement if slope ahead is too steep
    if (isTooSteep(player.position.x, player.position.z, pd.vx, pd.vz)) {
        pd.vx = 0;
        pd.vz = 0;
    }

    const newX = player.position.x + pd.vx * dt;
    const newZ = player.position.z + pd.vz * dt;
    const resolved = resolveCollision(player.position.x, player.position.z, newX, newZ);
    player.position.x = resolved.x;
    player.position.z = resolved.z;
    player.position.y = GROUND_Y + getHeight(resolved.x, resolved.z);

    // Action detection
    updateActionMenu(getVillageActions() ?? detectActions(player.position.x, player.position.z));

    // Rotate player model to always face away from camera
    player.rotation.y = camOrbitAngle;

    animateSamurai(player, time);

    // Update blob shadow
    playerShadow.position.set(player.position.x, player.position.y + 0.02, player.position.z);
    updateDebugReadout();

    // Procedural ground
    updateGroundChunks(player.position.x, player.position.z);
    updatePlacementPreview();
    villageEditState.assets.forEach((asset) => {
        asset.userData?.update?.(asset, dt, time, camera);
    });
    villageVillagers?.update(dt, time, camOrbitAngle);

    // Camera follow with orbit and zoom
    const orbitDist = CAM_DISTANCE * camZoom;
    const orbitHeight = CAM_HEIGHT * camZoom;
    const targetCamPos = new THREE.Vector3(
        player.position.x + Math.sin(camOrbitAngle) * orbitDist,
        player.position.y + orbitHeight,
        player.position.z + Math.cos(camOrbitAngle) * orbitDist
    );
    // Prevent camera from clipping into terrain
    const terrainAtCam = GROUND_Y + getHeight(targetCamPos.x, targetCamPos.z);
    const minCamY = terrainAtCam + 3;
    if (targetCamPos.y < minCamY) targetCamPos.y = minCamY;
    // Snap orbit rotation instantly; only lerp the follow offset for smooth walking
    const followLerp = Math.min(1, 8 * dt);
    const previousCamY = camera.position.y;
    camera.position.copy(targetCamPos);
    // Smooth only the vertical (terrain bumps) by blending Y
    camera.position.y = THREE.MathUtils.lerp(previousCamY, targetCamPos.y, followLerp);
    camera.lookAt(player.position.x, player.position.y + 4, player.position.z);

    const speed = Math.sqrt(pd.vx * pd.vx + pd.vz * pd.vz);
    const speedPct = THREE.MathUtils.clamp(speed / (PLAYER_SPEED * 1.8), 0, 1);
    const sprintPct = isSprinting() ? 1 : 0;
    const targetFov = THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(BASE_FOV, MOVE_FOV, speedPct),
        SPRINT_FOV,
        sprintPct
    );
    const newFov = THREE.MathUtils.lerp(camera.fov, targetFov, Math.min(1, dt * 4));
    if (Math.abs(newFov - camera.fov) > 0.01) {
        camera.fov = newFov;
        camera.updateProjectionMatrix();
    }

    skyDome.position.copy(camera.position);

    // Day/night cycle
    updateDayNight(time);

    // Light follows the atmosphere direction
    dirLight.position.set(
        player.position.x + atmosphereState.lightDirection.x * 24,
        player.position.y + Math.max(8, atmosphereState.lightDirection.y * 24),
        player.position.z + atmosphereState.lightDirection.z * 24
    );
    dirLight.target.position.set(player.position.x, player.position.y, player.position.z);
    dirLight.target.updateMatrixWorld();

    // Animate water surfaces
    updateLakes(time);

    // Clouds drift at fixed world height, follow player horizontally
    clouds.forEach((c, i) => {
        c.position.x += (0.15 + i * 0.05) * dt;
        if (c.position.x > player.position.x + 40) {
            c.position.x = player.position.x - 40;
        }
        c.position.y = CLOUD_WORLD_Y[i];
    });

    // Render
    renderer.autoClear = true;
    renderer.render(scene, camera);
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(vignetteScene, vignetteCam);
}

// ── Resize ─────────────────────────────────────────────────────────
window.addEventListener('wheel', (e) => {
    const dir = Math.sign(e.deltaY);
    camZoom += dir * CAM_ZOOM_STEP;
    camZoom = Math.max(CAM_ZOOM_MIN, Math.min(CAM_ZOOM_MAX, camZoom));
}, { passive: true });

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

update();

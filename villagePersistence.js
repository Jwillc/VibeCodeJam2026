const DEFAULT_VILLAGE_LAYOUT = {
    center: { x: 90, y: 0.67, z: 65.65 },
    placements: [],
};

const DB_NAME = 'stick-shooter-db';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'village-layout';
const LOCAL_STORAGE_KEY = 'stick-shooter-village-layout';

let cachedHandle = null;

function cloneDefaultLayout() {
    return {
        center: { ...DEFAULT_VILLAGE_LAYOUT.center },
        placements: [],
    };
}

function normalizeVillageLayout(raw) {
    const layout = cloneDefaultLayout();

    if (raw?.center) {
        layout.center = {
            x: Number.isFinite(raw.center.x) ? raw.center.x : DEFAULT_VILLAGE_LAYOUT.center.x,
            y: Number.isFinite(raw.center.y) ? raw.center.y : DEFAULT_VILLAGE_LAYOUT.center.y,
            z: Number.isFinite(raw.center.z) ? raw.center.z : DEFAULT_VILLAGE_LAYOUT.center.z,
        };
    }

    if (Array.isArray(raw?.placements)) {
        layout.placements = raw.placements
            .filter((placement) => placement && typeof placement.type === 'string')
            .map((placement) => ({
                type: placement.type,
                x: Number(placement.x ?? 0),
                y: Number.isFinite(placement.y) ? placement.y : undefined,
                z: Number(placement.z ?? 0),
                rotation: Number.isFinite(placement.rotation) ? placement.rotation : 0,
                scale: Number.isFinite(placement.scale) ? placement.scale : undefined,
                yOffset: Number.isFinite(placement.yOffset) ? placement.yOffset : undefined,
            }));
    }

    return layout;
}

function openHandleDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE_NAME)) {
                request.result.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getStoredHandle() {
    if (!('indexedDB' in window)) return null;
    if (cachedHandle) return cachedHandle;

    try {
        const db = await openHandleDb();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(HANDLE_KEY);
            request.onsuccess = () => {
                cachedHandle = request.result ?? null;
                resolve(cachedHandle);
            };
            request.onerror = () => reject(request.error);
        });
    } catch {
        return null;
    }
}

async function storeHandle(handle) {
    if (!('indexedDB' in window)) return;
    cachedHandle = handle;

    const db = await openHandleDb();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(handle, HANDLE_KEY);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function readLayoutFromHandle(handle) {
    const file = await handle.getFile();
    const text = await file.text();
    return normalizeVillageLayout(JSON.parse(text));
}

export async function loadVillageLayout() {
    try {
        const storedLayout = window.localStorage.getItem(LOCAL_STORAGE_KEY);
        if (storedLayout) {
            return {
                layout: normalizeVillageLayout(JSON.parse(storedLayout)),
                source: 'local',
                fileName: 'browser local storage',
            };
        }
    } catch {
        // Fall through to other sources.
    }

    const storedHandle = await getStoredHandle();
    if (storedHandle) {
        try {
            const permission = await storedHandle.queryPermission({ mode: 'read' });
            if (permission === 'granted') {
                return {
                    layout: await readLayoutFromHandle(storedHandle),
                    source: 'file',
                    fileName: storedHandle.name,
                };
            }
        } catch {
            // Fall through to bundled layout below.
        }
    }

    try {
        const response = await fetch('./villageLayout.json', { cache: 'no-store' });
        if (response.ok) {
            return {
                layout: normalizeVillageLayout(await response.json()),
                source: 'bundle',
                fileName: 'villageLayout.json',
            };
        }
    } catch {
        // Fall through to default layout.
    }

    return {
        layout: cloneDefaultLayout(),
        source: 'default',
        fileName: 'villageLayout.json',
    };
}

async function ensureWritableHandle() {
    if (!('showSaveFilePicker' in window)) {
        return { ok: false, reason: 'unsupported' };
    }

    let handle = await getStoredHandle();

    try {
        if (!handle) {
            handle = await window.showSaveFilePicker({
                suggestedName: 'villageLayout.json',
                types: [{
                    description: 'Village Layout JSON',
                    accept: { 'application/json': ['.json'] },
                }],
            });
            await storeHandle(handle);
        }

        const permission = await handle.queryPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            const request = await handle.requestPermission({ mode: 'readwrite' });
            if (request !== 'granted') {
                return { ok: false, reason: 'permission' };
            }
        }

        return { ok: true, handle };
    } catch (error) {
        if (error?.name === 'AbortError') {
            return { ok: false, reason: 'cancelled' };
        }
        return { ok: false, reason: 'error', error };
    }
}

export async function saveVillageLayout(layout) {
    try {
        const normalized = normalizeVillageLayout(layout);
        window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalized));
    } catch (error) {
        return { ok: false, reason: 'local-storage-failed', error };
    }

    const handleResult = await ensureWritableHandle();
    if (!handleResult.ok) {
        return {
            ok: true,
            storage: 'local',
            fileName: 'browser local storage',
            fallbackReason: handleResult.reason,
        };
    }

    try {
        const writable = await handleResult.handle.createWritable();
        await writable.write(`${JSON.stringify(normalizeVillageLayout(layout), null, 2)}\n`);
        await writable.close();
        return { ok: true, storage: 'file', fileName: handleResult.handle.name };
    } catch (error) {
        return {
            ok: true,
            storage: 'local',
            fileName: 'browser local storage',
            fallbackReason: 'write-failed',
            error,
        };
    }
}

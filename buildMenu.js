import { DEV_MODE } from './devMode.js';
import { isDevConsoleOpen } from './devConsole.js';

const container = document.getElementById('build-menu');

let items = [];
let selectedIndex = 0;
let isOpen = false;

function notifyMenuState() {
    window.dispatchEvent(new CustomEvent('buildmenuchange', { detail: { open: isOpen } }));
}

function notifyItemSelected(item) {
    window.dispatchEvent(new CustomEvent('builditemselected', { detail: { item } }));
}

function clampSelectedIndex() {
    if (items.length === 0) {
        selectedIndex = 0;
        return;
    }
    if (selectedIndex >= items.length) selectedIndex = items.length - 1;
    if (selectedIndex < 0) selectedIndex = 0;
}

function render() {
    if (!container) return;

    if (!isOpen) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    if (items.length === 0) {
        container.innerHTML = `
            <div class="build-menu-title">Build Menu</div>
            <div class="build-menu-empty">No placeable items yet.</div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="build-menu-title">Build Menu</div>
        <div class="build-menu-subtitle">Select an item to place</div>
        <div class="build-menu-list">
            ${items.map((item, index) => `
                <div class="build-item${index === selectedIndex ? ' selected' : ''}">
                    <span class="build-item-index">${index + 1}</span>${item.label}
                </div>
            `).join('')}
        </div>
    `;
}

export function setBuildMenuItems(nextItems) {
    items = nextItems.slice();
    clampSelectedIndex();
    render();
}

export function isBuildMenuOpen() {
    return isOpen;
}

export function toggleBuildMenu() {
    isOpen = !isOpen;
    render();
    notifyMenuState();
    return isOpen;
}

export function closeBuildMenu() {
    isOpen = false;
    render();
    notifyMenuState();
}

export function getSelectedBuildItem() {
    return items[selectedIndex] ?? null;
}

function selectCurrentItem() {
    const item = getSelectedBuildItem();
    if (!item) return;
    closeBuildMenu();
    notifyItemSelected(item);
}

window.addEventListener('keydown', (e) => {
    if (!DEV_MODE) return;
    if (isDevConsoleOpen()) return;
    if ((e.key === 'm' || e.key === 'M') && !e.repeat) {
        toggleBuildMenu();
        e.preventDefault();
        return;
    }

    if (!isOpen) return;

    if (e.key === 'Escape') {
        closeBuildMenu();
        e.preventDefault();
        return;
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        selectedIndex -= 1;
        if (selectedIndex < 0) selectedIndex = items.length - 1;
        clampSelectedIndex();
        render();
        e.preventDefault();
        return;
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        selectedIndex += 1;
        if (selectedIndex >= items.length) selectedIndex = 0;
        clampSelectedIndex();
        render();
        e.preventDefault();
        return;
    }

    const num = Number.parseInt(e.key, 10);
    if (!Number.isNaN(num) && num >= 1 && num <= items.length) {
        selectedIndex = num - 1;
        render();
        selectCurrentItem();
        e.preventDefault();
        return;
    }

    if (e.key === 'Enter') {
        selectCurrentItem();
        e.preventDefault();
    }
});

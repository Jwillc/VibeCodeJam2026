const container = document.getElementById('action-menu');
let currentActions = [];
let selectedIndex = 0;
let onActionCallback = null;

export function setActionCallback(cb) {
    onActionCallback = cb;
}

export function updateActionMenu(actions) {
    // If actions changed, reset selection
    const changed = actions.length !== currentActions.length ||
        actions.some((a, i) => a.id !== currentActions[i]?.id);

    if (changed) {
        currentActions = actions;
        selectedIndex = 0;
        render();
    }
}

function render() {
    if (currentActions.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    container.innerHTML = currentActions.map((a, i) => {
        const sel = i === selectedIndex ? ' selected' : '';
        const key = i + 1;
        return `<div class="action-item${sel}"><span class="action-key">${key}</span>${a.label}</div>`;
    }).join('');
}

function executeSelected() {
    if (currentActions.length === 0) return;
    const action = currentActions[selectedIndex];
    if (action && onActionCallback) {
        onActionCallback(action.id);
    }
}

// Keyboard handling
window.addEventListener('keydown', (e) => {
    if (currentActions.length === 0) return;

    // Number keys 1-9 to pick action directly
    const num = parseInt(e.key);
    if (num >= 1 && num <= currentActions.length) {
        selectedIndex = num - 1;
        render();
        executeSelected();
        return;
    }

    if (e.key === 'e' || e.key === 'E') {
        executeSelected();
    }
});

export function getVisibleActionCount() {
    return currentActions.length;
}

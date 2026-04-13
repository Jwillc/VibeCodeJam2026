import { DEV_MODE } from './devMode.js';

const container = document.getElementById('dev-console');
const output = document.getElementById('dev-console-output');
const input = document.getElementById('dev-console-input');
const closeButton = document.getElementById('dev-console-close');
const openButton = document.getElementById('dev-console-open');

let isOpen = false;
let commandHandler = null;

function isConsoleToggleEvent(e) {
    return e.code === 'Backquote' || e.key === '~' || e.key === '`';
}

function syncUi() {
    if (!container) return;
    container.hidden = !isOpen;
    if (openButton) openButton.hidden = isOpen || !DEV_MODE;
    document.body.dataset.devConsoleOpen = isOpen ? 'true' : 'false';

    if (isOpen) {
        input?.focus();
    } else {
        input?.blur();
    }
}

function appendLine(text, className = '') {
    if (!output) return;
    const line = document.createElement('div');
    line.className = className ? `dev-console-line ${className}` : 'dev-console-line';
    line.textContent = text;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
}

export function isDevConsoleOpen() {
    return isOpen;
}

export function logDevConsole(text, className = '') {
    appendLine(text, className);
}

export function clearDevConsole() {
    if (output) output.innerHTML = '';
}

export function setDevConsoleOpen(nextOpen) {
    if (!DEV_MODE) return false;
    isOpen = nextOpen;
    syncUi();
    return isOpen;
}

export function toggleDevConsole() {
    if (!DEV_MODE) return false;
    isOpen = !isOpen;
    syncUi();
    return isOpen;
}

export function setDevConsoleCommandHandler(handler) {
    commandHandler = handler;
}

closeButton?.addEventListener('click', () => {
    setDevConsoleOpen(false);
});

openButton?.addEventListener('click', () => {
    setDevConsoleOpen(true);
});

function handleGlobalKeydown(e) {
    if (!DEV_MODE) return;

    if (!e.repeat && isConsoleToggleEvent(e)) {
        toggleDevConsole();
        e.preventDefault();
        return;
    }

    if (!isOpen) return;

    if (e.key === 'Escape' && e.target !== input) {
        setDevConsoleOpen(false);
        e.preventDefault();
        return;
    }

    if (e.target !== input && e.key.length === 1) {
        input?.focus();
    }
}

document.addEventListener('keydown', handleGlobalKeydown, true);
window.addEventListener('keydown', handleGlobalKeydown, true);

input?.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') {
        setDevConsoleOpen(false);
        e.preventDefault();
        return;
    }

    if (e.key !== 'Enter') return;

    const raw = input.value.trim();
    if (!raw) {
        e.preventDefault();
        return;
    }

    appendLine(`> ${raw}`, 'prompt');
    input.value = '';

    if (!commandHandler) {
        appendLine('No dev commands registered.', 'error');
        e.preventDefault();
        return;
    }

    try {
        const result = await commandHandler(raw);
        if (Array.isArray(result)) {
            result.forEach((entry) => appendLine(String(entry)));
        } else if (typeof result === 'string' && result.length > 0) {
            appendLine(result);
        }
    } catch (error) {
        appendLine(error?.message ?? 'Command failed.', 'error');
    }

    e.preventDefault();
});

if (DEV_MODE) {
    appendLine('Dev console ready. Type `help` for commands.');
}

syncUi();

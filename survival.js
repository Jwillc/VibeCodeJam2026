const HUNGER_MAX = 100;
const THIRST_MAX = 100;
const HUNGER_DRAIN = 100 / (45 * 60);  // depletes over 45 minutes
const THIRST_DRAIN = 100 / (30 * 60);  // depletes over 30 minutes
const SPRINT_THIRST_DRAIN = 0.15;      // extra thirst per second while sprinting

let hunger = HUNGER_MAX;
let thirst = THIRST_MAX;

const hungerFill = document.getElementById('hunger-fill');
const thirstFill = document.getElementById('thirst-fill');

export function updateSurvival(dt, isSprinting) {
    hunger = Math.max(0, hunger - HUNGER_DRAIN * dt);
    let thirstDrain = THIRST_DRAIN;
    if (isSprinting) thirstDrain += SPRINT_THIRST_DRAIN;
    thirst = Math.max(0, thirst - thirstDrain * dt);
}

export function feedPlayer(amount) {
    hunger = Math.min(HUNGER_MAX, hunger + amount);
}

export function hydratePlayer(amount) {
    thirst = Math.min(THIRST_MAX, thirst + amount);
}

export function getHunger() { return hunger; }
export function getThirst() { return thirst; }

export function updateSurvivalHUD() {
    hungerFill.style.width = (hunger / HUNGER_MAX * 100) + '%';
    thirstFill.style.width = (thirst / THIRST_MAX * 100) + '%';
}

const SPRINT_MULT = 1.8;
const STAMINA_MAX = 100;
const STAMINA_DRAIN = 30;
const STAMINA_REGEN = 20;
const HEALTH_MAX = 100;

let stamina = STAMINA_MAX;
let health = HEALTH_MAX;
let sprinting = false;

const healthFill = document.getElementById('health-fill');
const staminaFill = document.getElementById('stamina-fill');

export function updateSprint(pd, keys, dt) {
    const moving = Math.abs(pd.vx) > 0.5 || Math.abs(pd.vz) > 0.5;
    sprinting = keys['shift'] && moving && stamina > 0;

    if (sprinting) {
        stamina = Math.max(0, stamina - STAMINA_DRAIN * dt);
        pd.vx *= SPRINT_MULT;
        pd.vz *= SPRINT_MULT;
    } else {
        stamina = Math.min(STAMINA_MAX, stamina + STAMINA_REGEN * dt);
    }
}

export function damagePlayer(amount) {
    health = Math.max(0, health - amount);
}

export function healPlayer(amount) {
    health = Math.min(HEALTH_MAX, health + amount);
}

export function getHealth() { return health; }
export function getStamina() { return stamina; }
export function isSprinting() { return sprinting; }

export function updateHUD() {
    healthFill.style.width = (health / HEALTH_MAX * 100) + '%';
    staminaFill.style.width = (stamina / STAMINA_MAX * 100) + '%';
}

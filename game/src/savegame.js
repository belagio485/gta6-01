// Save / load through localStorage: money, story progress, collectibles,
// weapons and the player's last position. Nothing leaves the browser.
const SAVE_KEY = 'marisol-bay-save-v1';

export function defaultSave() {
  return {
    money: 250,
    debt: 50000,
    missionIndex: 0,
    missionsCompleted: [],
    packagesFound: [],
    taxiFares: 0,
    weapons: { pistol: true, smg: false },
    ammo: { pistol: 999, smg: 0 },
    playerPosition: null,
    playMinutes: 0,
    savedAt: 0,
  };
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return Object.assign(defaultSave(), parsed);
  } catch (error) {
    return null;
  }
}

export function hasSave() {
  return loadSave() !== null;
}

export function writeSave(save) {
  try {
    save.savedAt = Date.now();
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch (error) {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch (error) {
    // Storage may be unavailable; the game still plays.
  }
}

// The heads-up display: objective panel, money, wanted stars, health and
// armor bars, speedometer, weapon readout, the circular minimap, toasts,
// banners, dialogue boxes and the objective direction arrow.
import { clamp, formatMoney, formatClock } from './utils.js';
import { STREET_COORDS, CITY_LIMIT } from './city.js';

const MINIMAP_WORLD = 440; // static canvas covers -220..220 on both axes
const MINIMAP_VIEW = 132; // world units visible across the minimap

export class Hud {
  constructor() {
    this.el = {};
    for (const id of [
      'hud', 'objective-title', 'objective-text', 'objective-timer', 'money', 'wanted', 'clock',
      'minimap', 'health-fill', 'armor-fill', 'speed', 'speed-unit', 'vehicle-name',
      'weapon-name', 'ammo', 'crosshair', 'hitmarker', 'interact-prompt', 'edge-arrow',
      'toast-stack', 'banner', 'dialogue', 'dialogue-speaker', 'dialogue-text',
      'damage-vignette', 'fade-black', 'busted-screen', 'wasted-screen',
    ]) {
      this.el[id] = document.getElementById(id);
    }
    this.minimapCtx = this.el['minimap'].getContext('2d');
    this.staticMap = this.buildStaticMap();
    this.dialogueOpen = false;
    this.dialogueLines = [];
    this.dialogueIndex = 0;
    this.dialogueCallback = null;
    this.hitmarkerTimer = 0;
    this.damageTimer = 0;
    this.bannerTimer = 0;
    this.toasts = [];
  }

  buildStaticMap() {
    const canvas = document.createElement('canvas');
    canvas.width = MINIMAP_WORLD;
    canvas.height = MINIMAP_WORLD;
    const ctx = canvas.getContext('2d');
    const toMap = (value) => value + MINIMAP_WORLD / 2;
    // Grass base.
    ctx.fillStyle = '#4a6b35';
    ctx.fillRect(0, 0, MINIMAP_WORLD, MINIMAP_WORLD);
    // City slab.
    ctx.fillStyle = '#8a8478';
    ctx.fillRect(toMap(-176), toMap(-176), 352, 352);
    // Ocean and beach (south, +z).
    ctx.fillStyle = '#2e7fa8';
    ctx.fillRect(0, toMap(190), MINIMAP_WORLD, MINIMAP_WORLD - toMap(190));
    ctx.fillStyle = '#e6d3a3';
    ctx.fillRect(0, toMap(176), MINIMAP_WORLD, 16);
    // Blocks.
    ctx.fillStyle = '#a89f8d';
    for (let bx = -140; bx <= 140; bx += 40) {
      for (let bz = -140; bz <= 140; bz += 40) {
        ctx.fillRect(toMap(bx - 14), toMap(bz - 14), 28, 28);
      }
    }
    // Roads.
    ctx.fillStyle = '#3a3e43';
    for (const coord of STREET_COORDS) {
      ctx.fillRect(toMap(-176), toMap(coord - 6), 352, 12);
      ctx.fillRect(toMap(coord - 6), toMap(-176), 12, 352);
    }
    // Docks water on the west edge.
    ctx.fillStyle = '#2e7fa8';
    ctx.fillRect(0, toMap(-120), 22, 90);
    return canvas;
  }

  show() {
    this.el['hud'].classList.remove('hidden');
  }

  hide() {
    this.el['hud'].classList.add('hidden');
  }

  setObjective(title, text, timerText) {
    this.el['objective-title'].textContent = title;
    this.el['objective-text'].textContent = text;
    if (timerText) {
      this.el['objective-timer'].textContent = timerText;
      this.el['objective-timer'].classList.remove('hidden');
    } else {
      this.el['objective-timer'].classList.add('hidden');
    }
  }

  setWanted(stars, evading) {
    let text = '';
    for (let i = 0; i < 5; i++) text += i < stars ? '★' : '☆';
    this.el['wanted'].textContent = stars > 0 ? text : '';
    this.el['wanted'].classList.toggle('evading', evading && stars > 0);
  }

  toast(text, kind) {
    const toast = document.createElement('div');
    toast.className = 'toast' + (kind ? ' ' + kind : '');
    toast.textContent = text;
    this.el['toast-stack'].appendChild(toast);
    this.toasts.push({ element: toast, life: 3.6 });
    while (this.toasts.length > 3) {
      const old = this.toasts.shift();
      old.element.remove();
    }
  }

  clearToasts() {
    for (const toast of this.toasts) toast.element.remove();
    this.toasts = [];
  }

  banner(title, subtitle, duration) {
    this.el['banner'].innerHTML = '';
    this.el['banner'].appendChild(document.createTextNode(title));
    if (subtitle) {
      const small = document.createElement('small');
      small.textContent = subtitle;
      this.el['banner'].appendChild(small);
    }
    this.el['banner'].classList.remove('hidden');
    this.bannerTimer = duration || 3.2;
  }

  showHitmarker() {
    this.el['hitmarker'].classList.remove('hidden');
    this.hitmarkerTimer = 0.14;
  }

  flashDamage() {
    this.el['damage-vignette'].classList.remove('hidden');
    this.damageTimer = 0.45;
  }

  setInteractPrompt(html) {
    if (html) {
      this.el['interact-prompt'].innerHTML = html;
      this.el['interact-prompt'].classList.remove('hidden');
    } else {
      this.el['interact-prompt'].classList.add('hidden');
    }
  }

  showDialogue(lines, onDone) {
    this.dialogueLines = lines;
    this.dialogueIndex = 0;
    this.dialogueCallback = onDone || null;
    this.dialogueOpen = true;
    this.renderDialogueLine();
    this.el['dialogue'].classList.remove('hidden');
  }

  renderDialogueLine() {
    const line = this.dialogueLines[this.dialogueIndex];
    this.el['dialogue-speaker'].textContent = line.speaker;
    this.el['dialogue-text'].textContent = line.text;
  }

  advanceDialogue() {
    if (!this.dialogueOpen) return false;
    this.dialogueIndex++;
    if (this.dialogueIndex >= this.dialogueLines.length) {
      this.dialogueOpen = false;
      this.el['dialogue'].classList.add('hidden');
      const callback = this.dialogueCallback;
      this.dialogueCallback = null;
      if (callback) callback();
    } else {
      this.renderDialogueLine();
    }
    return true;
  }

  showEndScreen(kind) {
    this.el[kind + '-screen'].classList.remove('hidden');
  }

  hideEndScreens() {
    this.el['busted-screen'].classList.add('hidden');
    this.el['wasted-screen'].classList.add('hidden');
  }

  fadeToBlack(on) {
    this.el['fade-black'].classList.remove('hidden');
    this.el['fade-black'].style.opacity = on ? '1' : '0';
    if (!on) {
      window.setTimeout(() => this.el['fade-black'].classList.add('hidden'), 650);
    }
  }

  drawMinimap(game, time) {
    const ctx = this.minimapCtx;
    const player = game.player;
    const zoom = 220 / MINIMAP_VIEW;
    const px = player.position.x + MINIMAP_WORLD / 2;
    const pz = player.position.z + MINIMAP_WORLD / 2;
    const half = MINIMAP_VIEW / 2;
    ctx.clearRect(0, 0, 220, 220);
    ctx.drawImage(this.staticMap, px - half, pz - half, MINIMAP_VIEW, MINIMAP_VIEW, 0, 0, 220, 220);
    const toMinimap = (x, z) => [(x - player.position.x) * zoom + 110, (z - player.position.z) * zoom + 110];
    const blip = (x, z, color, radius, pulse) => {
      const [mx, my] = toMinimap(x, z);
      if (mx < -10 || mx > 230 || my < -10 || my > 230) return;
      const r = pulse ? radius * (1 + 0.25 * Math.sin(time * 5)) : radius;
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.stroke();
    };
    // Mission objective.
    const objective = game.missions.currentObjectivePosition();
    if (objective) blip(objective.x, objective.z, '#ffd23f', 7, true);
    // Police units flash blue/red.
    const policeColor = Math.floor(time * 3) % 2 === 0 ? '#3a7bff' : '#ff3a3a';
    for (const car of game.police.cars) {
      if (!car.dead) blip(car.position.x, car.position.z, policeColor, 4, false);
    }
    // Enemies.
    for (const enemy of game.combat.enemies) {
      if (!enemy.dead) blip(enemy.position.x, enemy.position.z, '#ff2222', 4, false);
    }
    // Taxi customer and packages.
    const taxiTarget = game.sideActivities.taxiTargetPosition();
    if (taxiTarget) blip(taxiTarget.x, taxiTarget.z, '#37d67a', 6, true);
    for (const pkg of game.sideActivities.packages) {
      if (!pkg.found) blip(pkg.x, pkg.z, '#c86bff', 3.5, false);
    }
    // Landmark dots when nothing else competes.
    if (!objective) {
      blip(game.cityLandmarks.garage.x, game.cityLandmarks.garage.z, '#ff8a3c', 4, false);
      blip(game.cityLandmarks.gunshop.x, game.cityLandmarks.gunshop.z, '#c8ccd0', 4, false);
      blip(game.cityLandmarks.safehouse.x, game.cityLandmarks.safehouse.z, '#37d67a', 4, false);
    }
    // Player arrow.
    ctx.save();
    ctx.translate(110, 110);
    // Canvas y grows downward like world +z, so rotate by PI - heading.
    ctx.rotate(Math.PI - player.heading);
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#1a1a1a';
    ctx.stroke();
    ctx.restore();
  }

  updateEdgeArrow(game, camera) {
    const objective = game.missions.currentObjectivePosition();
    const arrow = this.el['edge-arrow'];
    if (!objective) {
      arrow.classList.add('hidden');
      return;
    }
    const vector = game.missions.objectiveScreenPosition(camera);
    if (!vector) {
      arrow.classList.add('hidden');
      return;
    }
    const margin = 60;
    const topMargin = 110;
    const x = clamp(vector.x, margin, window.innerWidth - margin);
    const y = clamp(vector.y, topMargin, window.innerHeight - margin);
    const onScreen = vector.x > margin && vector.x < window.innerWidth - margin && vector.y > topMargin && vector.y < window.innerHeight - margin && vector.behind === false;
    if (onScreen) {
      arrow.classList.add('hidden');
      return;
    }
    arrow.classList.remove('hidden');
    arrow.style.left = x + 'px';
    arrow.style.top = y + 'px';
    const angle = Math.atan2(vector.y - window.innerHeight / 2, vector.x - window.innerWidth / 2);
    arrow.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
  }

  update(dt, game, camera, time) {
    const player = game.player;
    this.el['money'].textContent = formatMoney(game.save.money);
    this.el['money'].classList.toggle('negative', game.save.money < 0);
    this.el['clock'].textContent = formatClock(game.clockMinutes);
    this.el['health-fill'].style.width = clamp(player.health, 0, 100) + '%';
    this.el['armor-fill'].style.width = clamp(player.armor, 0, 100) + '%';
    if (player.isDriving()) {
      this.el['speed'].textContent = player.car.speedMph();
      this.el['vehicle-name'].textContent = player.car.spec.name;
      this.el['speed-unit'].textContent = 'MPH';
      this.el['crosshair'].classList.add('hidden');
    } else {
      this.el['speed'].textContent = '';
      this.el['vehicle-name'].textContent = '';
      this.el['speed-unit'].textContent = '';
      this.el['crosshair'].classList.toggle('hidden', !player.aiming);
    }
    const spec = game.playerWeaponSpec();
    const weapon = player.weapons[player.currentWeapon];
    this.el['weapon-name'].textContent = spec.name;
    this.el['ammo'].textContent = weapon.mag + ' / ' + (weapon.reserve === Infinity ? '∞' : weapon.reserve);
    if (this.hitmarkerTimer > 0) {
      this.hitmarkerTimer -= dt;
      if (this.hitmarkerTimer <= 0) this.el['hitmarker'].classList.add('hidden');
    }
    if (this.damageTimer > 0) {
      this.damageTimer -= dt;
      if (this.damageTimer <= 0) this.el['damage-vignette'].classList.add('hidden');
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el['banner'].classList.add('hidden');
    }
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const toast = this.toasts[i];
      toast.life -= dt;
      if (toast.life <= 0) {
        toast.element.remove();
        this.toasts.splice(i, 1);
      }
    }
    this.drawMinimap(game, time);
    this.updateEdgeArrow(game, camera);
  }
}

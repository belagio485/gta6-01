// The wanted system and the Marisol Bay Police Department: pursuit cars that
// chase, ram and box the player in, an evade-and-decay model, and busted logic.
import * as THREE from 'three';
import { clamp, distance2D } from './utils.js';
import { STREET_COORDS } from './city.js';
import { Car } from './vehicles.js';

export class PoliceSystem {
  constructor(game) {
    this.game = game;
    this.cars = [];
    this.wanted = 0;
    this.evading = false;
    this.decayTimer = 0;
    this.bustedTimer = 0;
    this.spawnTimer = 0;
    this.lastCrimeToast = 0;
  }

  addWanted(stars, reason) {
    const before = this.wanted;
    this.wanted = clamp(this.wanted + stars, 0, 5);
    this.evading = false;
    this.decayTimer = 0;
    if (this.wanted > before) {
      this.game.hud.setWanted(this.wanted, false);
      if (reason) this.game.hud.toast(reason, 'bad');
      this.game.audio.setSirenAudible(true);
    }
  }

  setWanted(stars) {
    this.wanted = clamp(stars, 0, 5);
    this.evading = false;
    this.decayTimer = 0;
    this.game.hud.setWanted(this.wanted, false);
  }

  clearWanted(silent) {
    this.wanted = 0;
    this.evading = false;
    this.bustedTimer = 0;
    this.game.hud.setWanted(0, false);
    this.game.audio.setSirenAudible(false);
    if (!silent) this.game.hud.toast('You lost the cops.', 'good');
  }

  desiredCarCount() {
    if (this.wanted === 0) return 0;
    return Math.min(2 + this.wanted, 6);
  }

  spawnPoliceCar() {
    const player = this.game.player.position;
    const rng = this.game.rng;
    let best = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      const horizontal = rng() < 0.5;
      const coord = STREET_COORDS[Math.floor(rng() * STREET_COORDS.length)];
      const along = player[horizontal ? 'x' : 'z'] + (rng() < 0.5 ? -1 : 1) * (60 + rng() * 40);
      const x = horizontal ? clamp(along, -158, 158) : coord;
      const z = horizontal ? coord : clamp(along, -158, 158);
      const dist = distance2D(x, z, player.x, player.z);
      if (dist > 55 && dist < 120) {
        best = { x, z };
        break;
      }
    }
    if (!best) best = { x: player.x + 70, z: player.z };
    const car = new Car(this.game, 'police', 0x1c2733, best.x, best.z, Math.atan2(player.x - best.x, player.z - best.z));
    // White doors: repaint the cabin roof panel via a second body-tone box.
    const doorPanel = new THREE.Mesh(
      new THREE.BoxGeometry(1.96, 0.5, 2.4),
      new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }),
    );
    doorPanel.position.set(0, 0.85, 0);
    car.mesh.add(doorPanel);
    this.cars.push(car);
    return car;
  }

  removeCar(car) {
    const index = this.cars.indexOf(car);
    if (index !== -1) this.cars.splice(index, 1);
  }

  nearestDistance() {
    const player = this.game.player.position;
    let best = Infinity;
    for (const car of this.cars) {
      if (car.dead) continue;
      best = Math.min(best, distance2D(car.position.x, car.position.z, player.x, player.z));
    }
    return best;
  }

  update(dt) {
    const player = this.game.player;
    // Spawn / despawn pursuit units.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.2;
      for (let i = this.cars.length - 1; i >= 0; i--) {
        const car = this.cars[i];
        const far = distance2D(car.position.x, car.position.z, player.position.x, player.position.z) > 170;
        if (car.dead || (this.wanted === 0 && far)) {
          if (car.dead) {
            // Wrecked units stay as wrecks briefly, then vanish.
            car.dispose();
          } else {
            car.dispose();
          }
          this.cars.splice(i, 1);
        }
      }
      while (this.cars.length < this.desiredCarCount()) this.spawnPoliceCar();
    }
    // Chase behaviour.
    const playerSpeed = player.isDriving() ? player.car.speed() : (player.moving ? 5 : 0);
    for (const car of this.cars) {
      if (car.dead) {
        car.update(dt);
        continue;
      }
      // Aim slightly ahead of a moving player to cut them off.
      const lead = player.isDriving() ? 0.9 : 0.3;
      const target = player.position.clone();
      if (player.isDriving()) target.addScaledVector(player.car.velocity, lead);
      const desiredSpeed = 26 + this.wanted * 3.5;
      car.autopilot(target.x, target.z, desiredSpeed, dt);
      // If very close and roughly stopped, nudge into a ram.
      const dist = distance2D(car.position.x, car.position.z, player.position.x, player.position.z);
      if (dist < 6 && car.speed() < 4) {
        car.applyInput(1, 0, false, dt);
      }
      car.update(dt);
    }
    // Evade / decay: no unit nearby means the heat cools off.
    const nearest = this.nearestDistance();
    if (this.wanted > 0) {
      if (nearest > 60) {
        if (!this.evading) {
          this.evading = true;
          this.decayTimer = 0;
          this.game.hud.setWanted(this.wanted, true);
          this.game.hud.toast('You broke line of sight — stay hidden.', 'gold');
        }
        this.decayTimer += dt;
        if (this.decayTimer > 18) {
          this.decayTimer = 0;
          this.wanted -= 1;
          if (this.wanted <= 0) this.clearWanted();
          else this.game.hud.setWanted(this.wanted, true);
        }
      } else {
        if (this.evading) {
          this.evading = false;
          this.game.hud.setWanted(this.wanted, false);
        }
        this.decayTimer = 0;
      }
    }
    this.game.audio.setSirenAudible(this.wanted > 0 && nearest < 90);
    // Busted: a unit sits on top of a slow player.
    if (this.wanted > 0 && nearest < 7 && playerSpeed < 3.5) {
      this.bustedTimer += dt;
      const limit = player.isDriving() ? 3.6 : 2.6;
      if (this.bustedTimer > limit) {
        this.bustedTimer = 0;
        this.game.onPlayerBusted();
      }
    } else {
      this.bustedTimer = Math.max(0, this.bustedTimer - dt * 2);
    }
  }
}

// Nadia Cole: the player character. On-foot movement with a walk/run cycle and
// jumping, entering and exiting cars (including stealing them), health, armor
// and the weapon loadout.
import * as THREE from 'three';
import { clamp, dampAngle } from './utils.js';
import { buildPersonMesh, animatePersonWalk } from './pedestrians.js';
import { CITY_LIMIT } from './city.js';

export const WEAPONS = {
  pistol: { name: 'PISTOL', damage: 26, magSize: 12, fireInterval: 0.28, reloadTime: 1.1, range: 70, spread: 0.012, auto: false, price: 0 },
  smg: { name: 'SMG', damage: 15, magSize: 30, fireInterval: 0.09, reloadTime: 1.5, range: 55, spread: 0.045, auto: true, price: 800 },
};

export class Player {
  constructor(game, x, z) {
    this.game = game;
    this.position = new THREE.Vector3(x, 0, z);
    this.velocityY = 0;
    this.heading = Math.PI;
    this.walkPhase = 0;
    this.health = 100;
    this.maxHealth = 100;
    this.armor = 0;
    this.maxArmor = 100;
    this.car = null;
    this.onGround = true;
    this.timeSinceDamage = 99;
    this.weapons = {
      pistol: { owned: true, mag: 12, reserve: Infinity },
      smg: { owned: false, mag: 0, reserve: 0 },
    };
    this.currentWeapon = 'pistol';
    this.reloadTimer = 0;
    this.fireCooldown = 0;
    this.aiming = false;
    this.moving = false;

    const rig = buildPersonMesh(0x2e8a8a, 0x2b3a4a, 0xd9a066, 0x1a1a1a, 1.0);
    this.rig = rig;
    this.mesh = rig.group;
    this.mesh.position.copy(this.position);
    // Nadia's signature touches: a teal jacket and a gold hoop earring glint.
    const jacket = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.34, 0.34),
      new THREE.MeshLambertMaterial({ color: 0x1f6a6a }),
    );
    jacket.position.y = 1.32;
    this.mesh.add(jacket);
    game.scene.add(this.mesh);
  }

  isDriving() {
    return this.car !== null;
  }

  eyePosition() {
    if (this.car) {
      const eye = this.car.position.clone();
      eye.y = 1.6;
      return eye;
    }
    const eye = this.position.clone();
    eye.y = 1.62;
    return eye;
  }

  enterCar(car) {
    if (this.car || !car || car.dead) return false;
    const wasTraffic = this.game.traffic.cars.includes(car);
    const wasParked = this.game.traffic.parked.includes(car);
    const wasPolice = this.game.police.cars.includes(car);
    this.game.traffic.removeCar(car);
    if (wasPolice) this.game.police.removeCar(car);
    car.isParked = false;
    car.isPlayerControlled = true;
    car.stolen = wasTraffic || wasParked || wasPolice;
    this.car = car;
    this.mesh.visible = false;
    this.position.copy(car.position);
    this.heading = car.heading;
    if (car.stolen) {
      this.game.audio.pickup();
      if (wasPolice) {
        this.game.police.addWanted(2, 'You stole a police car!');
        this.game.hud.toast('You stole a police car — the MBPD is furious!', 'bad');
      } else {
        this.game.police.addWanted(1, 'Car stolen');
        this.game.hud.toast('Car stolen — keep a low profile.', 'gold');
      }
    }
    return true;
  }

  exitCar() {
    if (!this.car) return;
    const car = this.car;
    car.isPlayerControlled = false;
    // Step out on the driver's side.
    const side = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
    this.position.copy(car.position).addScaledVector(side, 2.4);
    this.position.y = 0;
    this.game.city.resolveCircle(this.position, 0.6);
    this.heading = car.heading;
    this.car = null;
    this.mesh.visible = true;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.heading;
    // The abandoned car stays where it is, drifting to a stop.
    car.velocity.multiplyScalar(0.2);
  }

  damage(amount, sourcePosition) {
    if (this.health <= 0) return;
    let remaining = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, remaining * 0.6);
      this.armor -= absorbed;
      remaining -= absorbed;
    }
    this.health = Math.max(0, this.health - remaining);
    this.timeSinceDamage = 0;
    this.game.hud.flashDamage();
    if (this.health <= 0) this.game.onPlayerWasted();
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  giveWeapon(weaponId, ammo) {
    const weapon = this.weapons[weaponId];
    if (!weapon) return;
    weapon.owned = true;
    if (weaponId === 'smg') weapon.reserve += ammo;
    if (weapon.mag === 0) {
      const take = Math.min(WEAPONS[weaponId].magSize, weapon.reserve);
      weapon.mag = take;
      if (weapon.reserve !== Infinity) weapon.reserve -= take;
    }
  }

  switchWeapon(weaponId) {
    if (this.weapons[weaponId] && this.weapons[weaponId].owned && this.currentWeapon !== weaponId) {
      this.currentWeapon = weaponId;
      this.reloadTimer = 0;
      this.game.audio.uiClick();
      return true;
    }
    return false;
  }

  startReload() {
    const spec = WEAPONS[this.currentWeapon];
    const weapon = this.weapons[this.currentWeapon];
    if (this.reloadTimer > 0 || weapon.mag >= spec.magSize) return;
    if (weapon.reserve <= 0 && weapon.reserve !== Infinity) return;
    this.reloadTimer = spec.reloadTime;
    this.game.audio.reload();
  }

  updateOnFoot(dt, input, cameraYaw) {
    const forward = new THREE.Vector3(Math.sin(cameraYaw), 0, Math.cos(cameraYaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    let moveX = 0;
    let moveZ = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) { moveX += forward.x; moveZ += forward.z; }
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) { moveX -= forward.x; moveZ -= forward.z; }
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) { moveX += right.x; moveZ += right.z; }
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) { moveX -= right.x; moveZ -= right.z; }
    const moving = moveX !== 0 || moveZ !== 0;
    this.moving = moving;
    const sprinting = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = sprinting ? 8.2 : 4.6;
    if (moving) {
      const length = Math.sqrt(moveX * moveX + moveZ * moveZ);
      moveX /= length;
      moveZ /= length;
      this.position.x += moveX * speed * dt;
      this.position.z += moveZ * speed * dt;
      const targetHeading = Math.atan2(moveX, moveZ);
      this.heading = dampAngle(this.heading, targetHeading, 12, dt);
      this.walkPhase += speed * dt * 1.9;
    }
    // Jump and gravity.
    if (this.onGround && input.wasPressed('Space')) {
      this.velocityY = 8.2;
      this.onGround = false;
    }
    if (!this.onGround) {
      this.velocityY -= 24 * dt;
      this.position.y += this.velocityY * dt;
      if (this.position.y <= 0) {
        this.position.y = 0;
        this.velocityY = 0;
        this.onGround = true;
      }
    }
    this.position.x = clamp(this.position.x, -CITY_LIMIT - 2, CITY_LIMIT + 2);
    this.position.z = clamp(this.position.z, -CITY_LIMIT - 2, 206);
    this.game.city.resolveCircle(this.position, 0.6);
    // Aiming turns Nadia toward the camera direction.
    if (this.aiming) this.heading = dampAngle(this.heading, cameraYaw, 14, dt);
    const intensity = moving ? (sprinting ? 1.25 : 0.9) : 0;
    animatePersonWalk(this.rig, this.walkPhase, intensity);
    if (!moving) {
      this.rig.legL.rotation.x *= 0.8;
      this.rig.legR.rotation.x *= 0.8;
      this.rig.armL.rotation.x *= 0.8;
      this.rig.armR.rotation.x *= 0.8;
    }
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.heading;
  }

  updateDriving(dt, input) {
    const car = this.car;
    if (!car) return;
    const throttle = input.axis('KeyS', 'KeyW') + input.axis('ArrowDown', 'ArrowUp');
    const steer = input.axis('KeyA', 'KeyD') + input.axis('ArrowLeft', 'ArrowRight');
    const handbrake = input.isDown('Space');
    car.applyInput(clamp(throttle, -1, 1), clamp(steer, -1, 1), handbrake, dt);
    car.update(dt);
    this.position.copy(car.position);
    this.heading = car.heading;
    if (input.wasPressed('KeyH')) this.game.audio.horn();
  }

  update(dt, input, cameraYaw) {
    this.timeSinceDamage += dt;
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const spec = WEAPONS[this.currentWeapon];
        const weapon = this.weapons[this.currentWeapon];
        const needed = spec.magSize - weapon.mag;
        if (weapon.reserve === Infinity) {
          weapon.mag = spec.magSize;
        } else {
          const take = Math.min(needed, weapon.reserve);
          weapon.mag += take;
          weapon.reserve -= take;
        }
      }
    }
    // Slow health regeneration out of combat.
    if (this.timeSinceDamage > 6 && this.health > 0 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + 3 * dt);
    }
    if (this.car) {
      this.updateDriving(dt, input);
    } else {
      this.updateOnFoot(dt, input, cameraYaw);
    }
  }
}

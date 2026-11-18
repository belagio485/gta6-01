// Combat: hitscan shooting with tracers and muzzle flashes, rival gang
// enemies with simple combat AI, and cash/health pickups dropped in the world.
import * as THREE from 'three';
import { clamp, distance2D, makeRng, pickRandom } from './utils.js';
import { buildPersonMesh, animatePersonWalk } from './pedestrians.js';
import { WEAPONS } from './player.js';

export class Enemy {
  constructor(game, x, z, health) {
    this.game = game;
    this.position = new THREE.Vector3(x, 0, z);
    this.heading = Math.atan2(game.player.position.x - x, game.player.position.z - z);
    this.health = health || 60;
    this.dead = false;
    this.deathTimer = 0;
    this.shootTimer = 0.6 + Math.random() * 1.2;
    this.strafeDirection = Math.random() < 0.5 ? -1 : 1;
    this.strafeTimer = 0;
    this.walkPhase = Math.random() * 10;
    const rig = buildPersonMesh(0x8a2f2f, 0x2b2b2b, pickRandom(game.rng, [0xf2c89b, 0xd9a066, 0x8a5a34]), 0x1a1a1a, 1.02);
    this.rig = rig;
    this.mesh = rig.group;
    // Red bandana mark: a crimson band across the head.
    const bandana = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.12, 0.36),
      new THREE.MeshLambertMaterial({ color: 0xd92323 }),
    );
    bandana.position.y = 1.82;
    this.mesh.add(bandana);
    this.mesh.position.copy(this.position);
    game.scene.add(this.mesh);
  }

  damage(amount) {
    if (this.dead) return true;
    this.health -= amount;
    if (this.health <= 0) {
      this.dead = true;
      this.deathTimer = 3;
      this.mesh.rotation.x = Math.PI / 2 - 0.12;
      this.mesh.position.y = 0.3;
      return true;
    }
    return false;
  }

  update(dt) {
    if (this.dead) {
      this.deathTimer -= dt;
      return;
    }
    const player = this.game.player;
    const target = player.position;
    const dist = distance2D(this.position.x, this.position.z, target.x, target.z);
    const desiredHeading = Math.atan2(target.x - this.position.x, target.z - this.position.z);
    let turn = desiredHeading - this.heading;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    this.heading += clamp(turn, -3 * dt, 3 * dt);
    // Close the distance until in range, then strafe.
    let moveSpeed = 0;
    if (dist > 20) moveSpeed = 4.6;
    else if (dist < 9) moveSpeed = -2;
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = 1.2 + Math.random();
      this.strafeDirection *= -1;
    }
    const strafe = dist <= 24 ? this.strafeDirection * 1.6 : 0;
    const forwardX = Math.sin(this.heading);
    const forwardZ = Math.cos(this.heading);
    this.position.x += (forwardX * moveSpeed + forwardZ * strafe) * dt;
    this.position.z += (forwardZ * moveSpeed - forwardX * strafe) * dt;
    this.game.city.resolveCircle(this.position, 0.6);
    this.walkPhase += Math.abs(moveSpeed + strafe) * dt * 2.2;
    animatePersonWalk(this.rig, this.walkPhase, moveSpeed !== 0 || strafe !== 0 ? 0.9 : 0);
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.heading;
    // Shoot at the player when in range and roughly facing them.
    this.shootTimer -= dt;
    if (this.shootTimer <= 0 && dist < 42 && Math.abs(turn) < 0.6) {
      this.shootTimer = 1.0 + Math.random() * 0.9;
      this.game.combat.enemyShoot(this, dist);
    }
  }

  dispose() {
    this.game.scene.remove(this.mesh);
  }
}

export class Pickup {
  constructor(game, x, z, kind, amount) {
    this.game = game;
    this.position = new THREE.Vector3(x, 0.7, z);
    this.kind = kind;
    this.amount = amount;
    this.life = 30;
    this.spin = 0;
    const color = kind === 'cash' ? 0x3fae5a : kind === 'health' ? 0xffffff : 0xffd23f;
    const geometry = kind === 'health' ? new THREE.BoxGeometry(0.55, 0.55, 0.2) : new THREE.BoxGeometry(0.6, 0.34, 0.08);
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35 }));
    if (kind === 'health') {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.22), new THREE.MeshLambertMaterial({ color: 0xd92323 }));
      this.mesh.add(cross);
      const crossBar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.22), new THREE.MeshLambertMaterial({ color: 0xd92323 }));
      this.mesh.add(crossBar);
    }
    this.mesh.position.copy(this.position);
    game.scene.add(this.mesh);
  }

  update(dt) {
    this.life -= dt;
    this.spin += dt * 2.4;
    this.mesh.rotation.y = this.spin;
    this.mesh.position.y = 0.7 + Math.sin(this.spin * 1.4) * 0.12;
  }

  dispose() {
    this.game.scene.remove(this.mesh);
  }
}

export class CombatSystem {
  constructor(game) {
    this.game = game;
    this.enemies = [];
    this.pickups = [];
    this.shotWantedCooldown = 0;
  }

  spawnEnemy(x, z, health) {
    const enemy = new Enemy(this.game, x, z, health);
    this.enemies.push(enemy);
    return enemy;
  }

  spawnEnemiesAround(x, z, count, radius) {
    const spawned = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.6;
      const dist = radius * (0.5 + Math.random() * 0.5);
      spawned.push(this.spawnEnemy(x + Math.sin(angle) * dist, z + Math.cos(angle) * dist));
    }
    return spawned;
  }

  aliveEnemies() {
    return this.enemies.filter((enemy) => !enemy.dead);
  }

  clearEnemies() {
    for (const enemy of this.enemies) enemy.dispose();
    this.enemies = [];
  }

  spawnPickup(x, z, kind, amount) {
    const pickup = new Pickup(this.game, x, z, kind, amount);
    this.pickups.push(pickup);
    return pickup;
  }

  enemyShoot(enemy, distance) {
    const player = this.game.player;
    const from = enemy.position.clone();
    from.y = 1.45;
    const to = player.eyePosition();
    // Inaccuracy grows with distance; point-blank shots rarely miss.
    const missChance = clamp(0.25 + distance / 70, 0.25, 0.8);
    const missed = Math.random() < missChance;
    const end = missed
      ? to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3))
      : to.clone();
    this.game.effects.spawnTracer(from, end, 0xffb0a0);
    this.game.effects.spawnMuzzleFlash(from.clone().add(new THREE.Vector3(0, 0, 0)));
    this.game.audio.gunshot(false);
    if (!missed) {
      player.damage(6 + Math.random() * 5, enemy.position);
      this.game.effects.spawnBurst(to, 0xcc2222, 6, 3, 0.4, 8);
    } else {
      this.game.effects.spawnSparks(end);
    }
  }

  raycastShot(origin, direction, maxDistance) {
    // March the ray; test people, cars and building colliders at each step.
    const step = 1.4;
    const point = origin.clone();
    for (let travelled = 0; travelled < maxDistance; travelled += step) {
      point.addScaledVector(direction, step);
      if (point.y < 0 || point.y > 60) break;
      // Enemies.
      for (const enemy of this.enemies) {
        if (enemy.dead) continue;
        const dx = point.x - enemy.position.x;
        const dz = point.z - enemy.position.z;
        if (dx * dx + dz * dz < 0.85 && point.y > 0 && point.y < 2.1) {
          return { kind: 'enemy', target: enemy, point: point.clone(), distance: travelled };
        }
      }
      // Pedestrians.
      for (const ped of this.game.peds.peds) {
        if (ped.dead) continue;
        const dx = point.x - ped.position.x;
        const dz = point.z - ped.position.z;
        if (dx * dx + dz * dz < 0.8 && point.y > 0 && point.y < 2.1) {
          return { kind: 'ped', target: ped, point: point.clone(), distance: travelled };
        }
      }
      // Cars (rough cylinder test).
      const cars = [...this.game.traffic.cars, ...this.game.traffic.parked, ...this.game.police.cars];
      if (this.game.player.car) cars.push(this.game.player.car);
      for (const car of cars) {
        if (car.dead) continue;
        const dx = point.x - car.position.x;
        const dz = point.z - car.position.z;
        if (dx * dx + dz * dz < 4.6 && point.y > 0 && point.y < 1.9) {
          return { kind: 'car', target: car, point: point.clone(), distance: travelled };
        }
      }
      // Buildings.
      for (const box of this.game.city.colliders) {
        if (point.x > box.minX && point.x < box.maxX && point.z > box.minZ && point.z < box.maxZ && point.y < 60) {
          return { kind: 'wall', target: null, point: point.clone(), distance: travelled };
        }
      }
    }
    return { kind: 'none', target: null, point: origin.clone().addScaledVector(direction, maxDistance), distance: maxDistance };
  }

  playerShoot() {
    const player = this.game.player;
    const spec = WEAPONS[player.currentWeapon];
    const weapon = player.weapons[player.currentWeapon];
    if (player.fireCooldown > 0 || player.reloadTimer > 0 || weapon.mag <= 0) {
      if (weapon.mag <= 0) player.startReload();
      return;
    }
    player.fireCooldown = spec.fireInterval;
    weapon.mag -= 1;
    const camera = this.game.camera;
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    direction.x += (Math.random() - 0.5) * spec.spread * 2;
    direction.y += (Math.random() - 0.5) * spec.spread * 2;
    direction.z += (Math.random() - 0.5) * spec.spread * 2;
    direction.normalize();
    const origin = player.eyePosition();
    const muzzle = origin.clone().addScaledVector(direction, 0.9);
    muzzle.y -= 0.18;
    this.game.effects.spawnMuzzleFlash(muzzle);
    this.game.audio.gunshot(player.currentWeapon === 'smg');
    const hit = this.raycastShot(origin, direction, spec.range);
    this.game.effects.spawnTracer(muzzle, hit.point);
    this.game.cameraController.addShake(0.12);
    this.game.peds.scareNearby(origin, 26);
    if (this.shotWantedCooldown <= 0 && this.game.police.wanted === 0) {
      this.game.police.addWanted(1, 'Shots fired — someone called the cops.');
      this.shotWantedCooldown = 12;
    }
    if (hit.kind === 'enemy') {
      const killed = hit.target.damage(spec.damage);
      this.game.hud.showHitmarker();
      this.game.effects.spawnBurst(hit.point, 0xcc2222, 8, 3.5, 0.45, 8);
      if (killed) {
        this.game.onEnemyKilled(hit.target);
        this.spawnPickup(hit.target.position.x, hit.target.position.z, 'cash', 25 + Math.floor(Math.random() * 40));
      }
    } else if (hit.kind === 'ped') {
      hit.target.damage(spec.damage, origin);
      this.game.hud.showHitmarker();
      this.game.effects.spawnBurst(hit.point, 0xcc2222, 8, 3.5, 0.45, 8);
      if (hit.target.dead) this.game.police.addWanted(1, 'A bystander is down!');
    } else if (hit.kind === 'car') {
      hit.target.damage(spec.damage * 0.7, 'shot');
      this.game.hud.showHitmarker();
      this.game.effects.spawnSparks(hit.point);
      if (hit.target.isPolice && hit.target.dead) this.game.police.addWanted(1, 'You destroyed a police car!');
    } else if (hit.kind === 'wall') {
      this.game.effects.spawnSparks(hit.point);
      this.game.effects.spawnBurst(hit.point, 0x999999, 4, 2, 0.3, 6);
    }
  }

  update(dt, input) {
    this.shotWantedCooldown = Math.max(0, this.shotWantedCooldown - dt);
    const player = this.game.player;
    // Firing input: hold for automatics, click for the pistol.
    if (!player.isDriving() && this.game.state === 'playing') {
      const spec = WEAPONS[player.currentWeapon];
      const wantsFire = spec.auto ? input.mouseDown : input.mousePressed;
      if (wantsFire) this.playerShoot();
      if (input.wasPressed('KeyR')) player.startReload();
      if (input.wasPressed('Digit1')) player.switchWeapon('pistol');
      if (input.wasPressed('Digit2')) player.switchWeapon('smg');
    }
    for (const enemy of this.enemies) enemy.update(dt);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (enemy.dead && enemy.deathTimer <= 0) {
        enemy.dispose();
        this.enemies.splice(i, 1);
      }
    }
    // Pickups: bob, spin, collect.
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pickup = this.pickups[i];
      pickup.update(dt);
      const dist = distance2D(pickup.position.x, pickup.position.z, player.position.x, player.position.z);
      if (dist < 1.7 && !player.isDriving()) {
        if (pickup.kind === 'cash') {
          this.game.addMoney(pickup.amount, 'Picked up $' + pickup.amount);
        } else if (pickup.kind === 'health') {
          player.heal(50);
          this.game.hud.toast('Health restored.', 'good');
        } else if (pickup.kind === 'ammo') {
          player.giveWeapon('smg', 60);
          this.game.hud.toast('SMG ammo +60.', 'good');
        }
        this.game.audio.pickup();
        pickup.dispose();
        this.pickups.splice(i, 1);
        continue;
      }
      if (pickup.life <= 0) {
        pickup.dispose();
        this.pickups.splice(i, 1);
      }
    }
  }
}

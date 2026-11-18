// Pedestrians: procedurally built walkers who stroll the sidewalks, flee from
// danger and react when the player drives into them. Also builds the shared
// person model the player character uses.
import * as THREE from 'three';
import { clamp, distance2D, makeRng, pickRandom, rangeRandom } from './utils.js';
import { STREET_COORDS, CITY_LIMIT } from './city.js';

const SHIRT_COLORS = [0xd95f43, 0x3f7a9e, 0xe8c84a, 0x7a5fa0, 0x4a9e6b, 0xe8e4da, 0x9e3f5c, 0x3a4a5a, 0xf08a3c, 0x5aa8a0];
const PANTS_COLORS = [0x2b3a4a, 0x4a3b2b, 0x333333, 0x5a6a7a, 0x7a5a3a];
const SKIN_TONES = [0xf2c89b, 0xd9a066, 0x8a5a34, 0x6b4226, 0xe8b98a, 0xc98a5c];
const HAIR_COLORS = [0x2b2118, 0x4a2f1a, 0x777777, 0xd9b25c, 0x1a1a1a, 0x8a4a2a];

export function buildPersonMesh(shirtColor, pantsColor, skinColor, hairColor, scale) {
  const group = new THREE.Group();
  const shirtMaterial = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pantsMaterial = new THREE.MeshLambertMaterial({ color: pantsColor });
  const skinMaterial = new THREE.MeshLambertMaterial({ color: skinColor });
  const hairMaterial = new THREE.MeshLambertMaterial({ color: hairColor });
  const box = new THREE.BoxGeometry(1, 1, 1);

  const makeLimb = (material, width, height, depth, pivotY) => {
    const pivot = new THREE.Group();
    pivot.position.y = pivotY;
    const mesh = new THREE.Mesh(box, material);
    mesh.scale.set(width, height, depth);
    mesh.position.y = -height / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    return pivot;
  };

  const legL = makeLimb(pantsMaterial, 0.22, 0.78, 0.24, 0.82);
  legL.position.x = -0.15;
  const legR = makeLimb(pantsMaterial, 0.22, 0.78, 0.24, 0.82);
  legR.position.x = 0.15;
  const armL = makeLimb(shirtMaterial, 0.16, 0.62, 0.18, 1.42);
  armL.position.x = -0.38;
  const armR = makeLimb(shirtMaterial, 0.16, 0.62, 0.18, 1.42);
  armR.position.x = 0.38;
  group.add(legL, legR, armL, armR);

  const torso = new THREE.Mesh(box, shirtMaterial);
  torso.scale.set(0.56, 0.66, 0.3);
  torso.position.y = 1.15;
  torso.castShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(box, skinMaterial);
  head.scale.set(0.36, 0.38, 0.34);
  head.position.y = 1.7;
  head.castShadow = true;
  group.add(head);
  const hair = new THREE.Mesh(box, hairMaterial);
  hair.scale.set(0.38, 0.14, 0.36);
  hair.position.y = 1.92;
  group.add(hair);

  group.scale.setScalar(scale || 1);
  return { group, legL, legR, armL, armR, head };
}

export function animatePersonWalk(rig, phase, intensity) {
  const swing = Math.sin(phase) * 0.62 * intensity;
  rig.legL.rotation.x = swing;
  rig.legR.rotation.x = -swing;
  rig.armL.rotation.x = -swing * 0.7;
  rig.armR.rotation.x = swing * 0.7;
}

export class Pedestrian {
  constructor(game, x, z) {
    this.game = game;
    this.rng = game.rng;
    this.position = new THREE.Vector3(x, 0, z);
    this.heading = this.rng() * Math.PI * 2;
    this.speed = 1.4 + this.rng() * 1.1;
    this.walkPhase = this.rng() * 10;
    this.state = 'walking';
    this.stateTimer = 0;
    this.fleeFrom = null;
    this.dead = false;
    this.health = 50;
    // Sidewalk route: stroll along one street's sidewalk, turn at intersections.
    this.axis = this.rng() < 0.5 ? 'x' : 'z';
    this.streetCoord = STREET_COORDS[Math.floor(this.rng() * STREET_COORDS.length)];
    this.side = this.rng() < 0.5 ? -1 : 1;
    this.direction = this.rng() < 0.5 ? -1 : 1;
    const rig = buildPersonMesh(
      pickRandom(this.rng, SHIRT_COLORS),
      pickRandom(this.rng, PANTS_COLORS),
      pickRandom(this.rng, SKIN_TONES),
      pickRandom(this.rng, HAIR_COLORS),
      0.94 + this.rng() * 0.12,
    );
    this.rig = rig;
    this.mesh = rig.group;
    this.mesh.position.copy(this.position);
    game.scene.add(this.mesh);
  }

  scare(sourcePosition) {
    if (this.state === 'down' || this.dead) return;
    this.state = 'fleeing';
    this.stateTimer = 3.5 + this.rng() * 2;
    this.fleeFrom = sourcePosition.clone();
  }

  knockDown() {
    if (this.state === 'down' || this.dead) return;
    this.state = 'down';
    this.stateTimer = 2.6;
    this.mesh.rotation.x = Math.PI / 2 - 0.15;
    this.mesh.position.y = 0.3;
  }

  damage(amount, sourcePosition) {
    if (this.dead) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.dead = true;
      this.mesh.rotation.x = Math.PI / 2 - 0.15;
      this.mesh.position.y = 0.3;
      this.stateTimer = 4;
    } else {
      this.scare(sourcePosition || this.position);
    }
  }

  update(dt) {
    if (this.dead) {
      this.stateTimer -= dt;
      return;
    }
    if (this.state === 'down') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.state = 'fleeing';
        this.stateTimer = 4;
        this.fleeFrom = this.game.player.position.clone();
        this.mesh.rotation.x = 0;
        this.mesh.position.y = 0;
      }
      return;
    }
    let moveSpeed = this.speed;
    if (this.state === 'fleeing') {
      this.stateTimer -= dt;
      moveSpeed = 5.2;
      if (this.fleeFrom) {
        const away = Math.atan2(this.position.x - this.fleeFrom.x, this.position.z - this.fleeFrom.z);
        this.heading = away;
      }
      if (this.stateTimer <= 0) {
        this.state = 'walking';
        this.axis = this.rng() < 0.5 ? 'x' : 'z';
        this.streetCoord = this.nearestStreetCoord(this.axis === 'x' ? this.position.z : this.position.x);
        this.direction = this.rng() < 0.5 ? -1 : 1;
      }
    } else {
      // Stroll the sidewalk: advance along the axis, turn at intersections.
      const along = this.axis === 'x' ? this.position.x : this.position.z;
      const nextAlong = along + this.direction * moveSpeed * dt;
      const crossTarget = this.streetCoord + this.side * 8.4;
      if (this.axis === 'x') {
        this.position.x = nextAlong;
        this.position.z += (crossTarget - this.position.z) * Math.min(1, 4 * dt);
        this.heading = this.direction > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        this.position.z = nextAlong;
        this.position.x += (crossTarget - this.position.x) * Math.min(1, 4 * dt);
        this.heading = this.direction > 0 ? 0 : Math.PI;
      }
      for (const coord of STREET_COORDS) {
        if (Math.abs(nextAlong - coord) < 0.6 && this.rng() < 0.35) {
          this.axis = this.axis === 'x' ? 'z' : 'x';
          this.streetCoord = coord;
          this.side = this.rng() < 0.5 ? -1 : 1;
          this.direction = this.rng() < 0.5 ? -1 : 1;
          break;
        }
      }
      if (Math.abs(nextAlong) > CITY_LIMIT - 6) this.direction *= -1;
    }
    if (this.state === 'fleeing') {
      this.position.x += Math.sin(this.heading) * moveSpeed * dt;
      this.position.z += Math.cos(this.heading) * moveSpeed * dt;
      this.position.x = clamp(this.position.x, -CITY_LIMIT, CITY_LIMIT);
      this.position.z = clamp(this.position.z, -CITY_LIMIT, 206);
    }
    this.game.city.resolveCircle(this.position, 0.5);
    this.walkPhase += moveSpeed * dt * 2.6;
    animatePersonWalk(this.rig, this.walkPhase, 1);
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.heading;
  }

  nearestStreetCoord(value) {
    let best = STREET_COORDS[0];
    for (const coord of STREET_COORDS) {
      if (Math.abs(coord - value) < Math.abs(best - value)) best = coord;
    }
    return best;
  }

  dispose() {
    this.game.scene.remove(this.mesh);
  }
}

export class PedestrianManager {
  constructor(game) {
    this.game = game;
    this.peds = [];
    this.targetCount = 30;
    this.respawnTimer = 0;
  }

  spawnPed(minPlayerDistance) {
    const player = this.game.player.position;
    const rng = this.game.rng;
    for (let attempt = 0; attempt < 20; attempt++) {
      const x = rangeRandom(rng, -160, 160);
      const z = rangeRandom(rng, -160, 185);
      if (distance2D(x, z, player.x, player.z) < minPlayerDistance) continue;
      if (this.game.city.isOnRoad(x, z)) continue;
      const ped = new Pedestrian(this.game, x, z);
      this.peds.push(ped);
      return ped;
    }
    return null;
  }

  spawnInitial() {
    for (let i = 0; i < this.targetCount; i++) this.spawnPed(15);
  }

  scareNearby(sourcePosition, radius) {
    for (const ped of this.peds) {
      if (distance2D(ped.position.x, ped.position.z, sourcePosition.x, sourcePosition.z) < radius) {
        ped.scare(sourcePosition);
      }
    }
  }

  pedsInRadius(position, radius) {
    return this.peds.filter((ped) => !ped.dead && distance2D(ped.position.x, ped.position.z, position.x, position.z) < radius);
  }

  update(dt) {
    const player = this.game.player.position;
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) {
      this.respawnTimer = 2;
      for (let i = this.peds.length - 1; i >= 0; i--) {
        const ped = this.peds[i];
        const far = distance2D(ped.position.x, ped.position.z, player.x, player.z) > 170;
        const expired = ped.dead && ped.stateTimer <= 0;
        if (far || expired) {
          ped.dispose();
          this.peds.splice(i, 1);
        }
      }
      while (this.peds.length < this.targetCount) {
        if (!this.spawnPed(60)) break;
      }
    }
    for (const ped of this.peds) ped.update(dt);
    // Cars hitting pedestrians.
    const cars = [...this.game.traffic.cars, ...this.game.police.cars];
    if (this.game.player.car) cars.push(this.game.player.car);
    for (const car of cars) {
      if (car.dead || car.speed() < 3) continue;
      for (const ped of this.peds) {
        if (ped.dead || ped.state === 'down') continue;
        if (distance2D(ped.position.x, ped.position.z, car.position.x, car.position.z) < 1.9) {
          ped.knockDown();
          this.game.onPedHitByCar(ped, car);
        }
      }
    }
  }
}

// Vehicles: procedural car models, arcade driving physics, parked cars and
// the traffic system that keeps Marisol Bay's streets alive.
import * as THREE from 'three';
import { clamp, damp, angleDifference, distance2D, makeRng, pickRandom, rangeRandom } from './utils.js';
import { STREET_COORDS, CITY_LIMIT } from './city.js';

export const CAR_TYPES = {
  sedan: { name: 'Meridian Sedan', length: 4.4, width: 1.9, height: 0.62, maxSpeed: 34, accel: 13, grip: 6.5, seats: 4 },
  coupe: { name: 'Veloce Coupe', length: 4.1, width: 1.85, height: 0.55, maxSpeed: 40, accel: 17, grip: 7.5, seats: 2 },
  suv: { name: 'Trailblazer SUV', length: 4.7, width: 2.0, height: 0.85, maxSpeed: 32, accel: 12, grip: 6.0, seats: 5 },
  van: { name: 'Cargo Van', length: 4.9, width: 2.0, height: 1.15, maxSpeed: 28, accel: 10, grip: 5.5, seats: 3 },
  muscle: { name: 'Bravado Muscle', length: 4.6, width: 1.95, height: 0.6, maxSpeed: 42, accel: 19, grip: 6.0, seats: 2 },
  taxi: { name: 'City Taxi', length: 4.4, width: 1.9, height: 0.62, maxSpeed: 33, accel: 13, grip: 6.5, seats: 4 },
  police: { name: 'MBPD Interceptor', length: 4.5, width: 1.95, height: 0.62, maxSpeed: 44, accel: 18, grip: 7.2, seats: 4 },
};

const PAINT_COLORS = [0xc23b2e, 0x2e5f9e, 0xe8e4da, 0x2b2f33, 0x7a8a99, 0x3f7a4e, 0xd9a521, 0x8a5fa0, 0x4a7a8a, 0xb0b6bb, 0x6b3a2a, 0x224433];

const sharedGeometries = {};
function boxGeometry() {
  if (!sharedGeometries.box) sharedGeometries.box = new THREE.BoxGeometry(1, 1, 1);
  return sharedGeometries.box;
}
function wheelGeometry() {
  if (!sharedGeometries.wheel) {
    sharedGeometries.wheel = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 14);
    sharedGeometries.wheel.rotateZ(Math.PI / 2);
  }
  return sharedGeometries.wheel;
}

export function buildCarMesh(type, colorHex) {
  const spec = CAR_TYPES[type];
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshLambertMaterial({ color: colorHex });
  const darkMaterial = new THREE.MeshLambertMaterial({ color: 0x1c1f22 });
  const glassMaterial = new THREE.MeshPhongMaterial({ color: 0x33506a, shininess: 110, specular: 0xaaccee });
  const chromeMaterial = new THREE.MeshLambertMaterial({ color: 0xc8ccd0 });
  const box = boxGeometry();

  const body = new THREE.Mesh(box, bodyMaterial);
  body.scale.set(spec.width, spec.height, spec.length);
  body.position.y = 0.55 + spec.height / 2 - 0.31;
  body.castShadow = true;
  group.add(body);

  const cabinLength = type === 'van' ? spec.length * 0.8 : spec.length * 0.48;
  const cabin = new THREE.Mesh(box, glassMaterial);
  cabin.scale.set(spec.width * 0.86, 0.55, cabinLength);
  cabin.position.set(0, 0.55 + spec.height + 0.18, type === 'van' ? 0 : -spec.length * 0.08);
  cabin.castShadow = true;
  group.add(cabin);
  const roof = new THREE.Mesh(box, bodyMaterial);
  roof.scale.set(spec.width * 0.86, 0.09, cabinLength * 0.8);
  roof.position.set(0, 0.55 + spec.height + 0.46, type === 'van' ? 0 : -spec.length * 0.08);
  group.add(roof);

  // Bumpers and grille.
  const bumperF = new THREE.Mesh(box, darkMaterial);
  bumperF.scale.set(spec.width * 0.96, 0.22, 0.22);
  bumperF.position.set(0, 0.42, spec.length / 2);
  group.add(bumperF);
  const bumperR = bumperF.clone();
  bumperR.position.z = -spec.length / 2;
  group.add(bumperR);
  const grille = new THREE.Mesh(box, chromeMaterial);
  grille.scale.set(spec.width * 0.5, 0.18, 0.06);
  grille.position.set(0, 0.62, spec.length / 2 + 0.03);
  group.add(grille);

  // Headlights and tail lights.
  const headlightMaterial = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
  const tailMaterial = new THREE.MeshBasicMaterial({ color: 0xaa1a1a });
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(box, headlightMaterial);
    head.scale.set(0.42, 0.2, 0.08);
    head.position.set(side * spec.width * 0.32, 0.78, spec.length / 2 + 0.02);
    group.add(head);
    const tail = new THREE.Mesh(box, tailMaterial);
    tail.scale.set(0.42, 0.2, 0.08);
    tail.position.set(side * spec.width * 0.32, 0.78, -spec.length / 2 - 0.02);
    group.add(tail);
  }

  // Wheels with steering pivots at the front.
  const wheelMaterial = new THREE.MeshLambertMaterial({ color: 0x15171a });
  const hubMaterial = new THREE.MeshLambertMaterial({ color: 0x9aa0a6 });
  const wheels = [];
  const wheelZ = spec.length / 2 - 0.85;
  const wheelX = spec.width / 2 - 0.08;
  for (const [sx, sz, steers] of [[-1, 1, true], [1, 1, true], [-1, -1, false], [1, -1, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * wheelX, 0.36, sz * wheelZ);
    const wheel = new THREE.Mesh(wheelGeometry(), wheelMaterial);
    wheel.castShadow = true;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.32, 10), hubMaterial);
    hub.rotation.z = Math.PI / 2;
    wheel.add(hub);
    pivot.add(wheel);
    group.add(pivot);
    wheels.push({ pivot, wheel, steers });
  }

  let lightbar = null;
  if (type === 'police') {
    const barBase = new THREE.Mesh(box, darkMaterial);
    barBase.scale.set(1.1, 0.14, 0.4);
    barBase.position.set(0, 0.55 + spec.height + 0.55, -spec.length * 0.08);
    group.add(barBase);
    const redMaterial = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const blueMaterial = new THREE.MeshBasicMaterial({ color: 0x2266ff });
    const red = new THREE.Mesh(box, redMaterial);
    red.scale.set(0.5, 0.22, 0.36);
    red.position.set(-0.28, 0.55 + spec.height + 0.68, -spec.length * 0.08);
    group.add(red);
    const blue = new THREE.Mesh(box, blueMaterial);
    blue.scale.set(0.5, 0.22, 0.36);
    blue.position.set(0.28, 0.55 + spec.height + 0.68, -spec.length * 0.08);
    group.add(blue);
    lightbar = { redMaterial, blueMaterial };
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0xffe95c }));
    sign.scale.set(0.7, 0.22, 0.3);
    sign.position.set(0, 0.55 + spec.height + 0.56, -spec.length * 0.08);
    group.add(sign);
  }
  return { group, wheels, lightbar, tailMaterial };
}

export class Car {
  constructor(game, type, colorHex, x, z, heading) {
    this.game = game;
    this.type = type;
    this.spec = CAR_TYPES[type];
    this.position = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.velocity = new THREE.Vector3();
    this.steer = 0;
    this.health = 100;
    this.isPlayerControlled = false;
    this.isPolice = type === 'police';
    this.isParked = false;
    this.stolen = false;
    this.dead = false;
    this.smokeTimer = 0;
    this.flashTimer = 0;
    const built = buildCarMesh(type, colorHex);
    this.mesh = built.group;
    this.wheels = built.wheels;
    this.lightbar = built.lightbar;
    this.tailMaterial = built.tailMaterial;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = heading;
    game.scene.add(this.mesh);
  }

  forwardVector() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  speed() {
    return this.velocity.length();
  }

  speedMph() {
    return Math.round(this.speed() * 2.2);
  }

  applyInput(throttle, steerInput, handbrake, dt) {
    const forward = this.forwardVector();
    const forwardSpeed = this.velocity.dot(forward);
    const targetSteer = steerInput * 0.55;
    this.steer = damp(this.steer, targetSteer, 8, dt);
    if (throttle > 0) {
      this.velocity.addScaledVector(forward, this.spec.accel * throttle * dt);
    } else if (throttle < 0) {
      if (forwardSpeed > 0.5) {
        this.velocity.addScaledVector(forward, this.spec.accel * 1.6 * throttle * dt);
      } else {
        this.velocity.addScaledVector(forward, this.spec.accel * 0.55 * throttle * dt);
      }
    }
    // Grip pulls velocity toward the heading; handbrake loosens it for drifts.
    const grip = handbrake ? 1.6 : this.spec.grip;
    const aligned = forward.clone().multiplyScalar(forwardSpeed);
    this.velocity.lerp(aligned, Math.min(1, grip * dt));
    // Drag and speed caps.
    const drag = handbrake ? 1.4 : 0.55;
    this.velocity.multiplyScalar(Math.max(0, 1 - drag * dt));
    const maxForward = this.spec.maxSpeed;
    const maxReverse = 12;
    const newForwardSpeed = this.velocity.dot(forward);
    if (newForwardSpeed > maxForward) {
      this.velocity.addScaledVector(forward, maxForward - newForwardSpeed);
    } else if (newForwardSpeed < -maxReverse) {
      this.velocity.addScaledVector(forward, -maxReverse - newForwardSpeed);
    }
    // Steering turns the car, more at low speed, less at high speed.
    const speedFactor = clamp(Math.abs(newForwardSpeed) / 12, 0, 1);
    const turnRate = this.steer * (1.6 + 1.1 * (1 - speedFactor)) * (newForwardSpeed >= 0 ? 1 : -1);
    this.heading += turnRate * Math.min(1, Math.abs(newForwardSpeed) / 4) * dt;
    if (handbrake && Math.abs(newForwardSpeed) > 6 && this.game.effects) {
      this.game.effects.spawnSkidMark(this.position, this.heading);
    }
  }

  autopilot(targetX, targetZ, desiredSpeed, dt) {
    const dx = targetX - this.position.x;
    const dz = targetZ - this.position.z;
    const desiredHeading = Math.atan2(dx, dz);
    const diff = angleDifference(this.heading, desiredHeading);
    const steerInput = clamp(diff * 2.2, -1, 1);
    const aligned = Math.abs(diff) < 0.5;
    const speed = this.speed();
    let throttle = 0;
    if (aligned && speed < desiredSpeed) throttle = 0.8;
    else if (!aligned && speed > 8) throttle = -0.5;
    else if (speed < desiredSpeed * 0.5) throttle = 0.5;
    this.applyInput(throttle, steerInput, false, dt);
  }

  integrate(dt) {
    const previous = this.position.clone();
    this.position.addScaledVector(this.velocity, dt);
    // Keep cars inside the world.
    this.position.x = clamp(this.position.x, -CITY_LIMIT - 4, CITY_LIMIT + 4);
    this.position.z = clamp(this.position.z, -CITY_LIMIT - 4, BEACH_LIMIT_Z);
    const hitBuilding = this.game.city.resolveCircle(this.position, 1.55);
    if (hitBuilding) {
      const impact = this.velocity.length();
      if (impact > 4) {
        this.damage(impact * 0.55, 'crash');
        this.game.onCarCrash(this, impact, previous);
      }
      this.velocity.multiplyScalar(0.35);
    }
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.heading;
    // Wheel spin and steering visuals.
    const spin = (this.velocity.dot(this.forwardVector()) / 0.36) * dt;
    for (const wheel of this.wheels) {
      wheel.wheel.rotation.x += spin;
      if (wheel.steers) wheel.pivot.rotation.y = this.steer;
    }
    if (this.lightbar) {
      this.flashTimer += dt;
      const phase = Math.floor(this.flashTimer * 6) % 2 === 0;
      this.lightbar.redMaterial.color.setHex(phase ? 0xff2222 : 0x441111);
      this.lightbar.blueMaterial.color.setHex(phase ? 0x111144 : 0x2266ff);
    }
    if (this.health < 45 && this.health > 0) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.09;
        if (this.game.effects) {
          const front = this.position.clone().addScaledVector(this.forwardVector(), 1.6);
          front.y = 1.1;
          this.game.effects.spawnSmoke(front, 0.7);
        }
      }
    }
  }

  damage(amount, cause) {
    if (this.dead) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.game.onCarDestroyed(this, cause);
    }
  }

  update(dt) {
    this.integrate(dt);
  }

  dispose() {
    this.game.scene.remove(this.mesh);
  }
}

const BEACH_LIMIT_Z = 208;

export class TrafficManager {
  constructor(game) {
    this.game = game;
    this.cars = [];
    this.parked = [];
    this.rng = makeRng(987654);
    this.targetCount = 13;
    this.respawnTimer = 0;
  }

  randomPaint() {
    return pickRandom(this.rng, PAINT_COLORS);
  }

  randomStreetPoint(minPlayerDistance) {
    const player = this.game.player.position;
    for (let attempt = 0; attempt < 24; attempt++) {
      const horizontal = this.rng() < 0.5;
      const coord = pickRandom(this.rng, STREET_COORDS);
      const along = rangeRandom(this.rng, -150, 150);
      const x = horizontal ? along : coord;
      const z = horizontal ? coord : along;
      if (distance2D(x, z, player.x, player.z) >= minPlayerDistance) return { x, z, horizontal, coord };
    }
    return { x: 0, z: -160, horizontal: true, coord: -160 };
  }

  spawnTrafficCar() {
    const spot = this.randomStreetPoint(70);
    const type = pickRandom(this.rng, ['sedan', 'sedan', 'coupe', 'suv', 'van', 'muscle', 'taxi']);
    const heading = spot.horizontal ? (this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (this.rng() < 0.5 ? 0 : Math.PI);
    const car = new Car(this.game, type, type === 'taxi' ? 0xf2c230 : this.randomPaint(), spot.x, spot.z, heading);
    car.ai = { waypoint: this.pickWaypoint(car), cruiseSpeed: 10 + this.rng() * 5, stopTimer: 0 };
    this.cars.push(car);
    return car;
  }

  pickWaypoint(car) {
    const coord = pickRandom(this.rng, STREET_COORDS);
    const along = rangeRandom(this.rng, -155, 155);
    if (this.rng() < 0.5) return { x: along, z: coord };
    return { x: coord, z: along };
  }

  spawnParkedCars() {
    const rng = makeRng(13579);
    let placed = 0;
    let attempts = 0;
    while (placed < 12 && attempts < 80) {
      attempts++;
      const horizontal = rng() < 0.5;
      const coord = pickRandom(rng, STREET_COORDS);
      const along = rangeRandom(rng, -150, 150);
      const offset = (rng() < 0.5 ? -1 : 1) * 4.6;
      const x = horizontal ? along : coord + offset;
      const z = horizontal ? coord + offset : along;
      // Skip spots too close to intersections or landmarks.
      let nearIntersection = false;
      for (const c of STREET_COORDS) {
        if (horizontal && Math.abs(x - c) < 12) nearIntersection = true;
        if (!horizontal && Math.abs(z - c) < 12) nearIntersection = true;
      }
      if (nearIntersection) continue;
      const type = pickRandom(rng, ['sedan', 'coupe', 'suv', 'muscle', 'van']);
      const heading = horizontal ? (offset > 0 ? Math.PI / 2 : -Math.PI / 2) : (offset > 0 ? Math.PI : 0);
      const car = new Car(this.game, type, this.randomPaint(), x, z, heading);
      car.isParked = true;
      this.parked.push(car);
      placed++;
    }
  }

  nearestCar(position, maxDistance, includeParked) {
    let best = null;
    let bestDist = maxDistance;
    const consider = (car) => {
      if (car.dead || car.isPlayerControlled) return;
      const dist = distance2D(position.x, position.z, car.position.x, car.position.z);
      if (dist < bestDist) {
        bestDist = dist;
        best = car;
      }
    };
    for (const car of this.cars) consider(car);
    if (includeParked) for (const car of this.parked) consider(car);
    for (const car of this.game.police.cars) consider(car);
    return best;
  }

  removeCar(car) {
    const trafficIndex = this.cars.indexOf(car);
    if (trafficIndex !== -1) this.cars.splice(trafficIndex, 1);
    const parkedIndex = this.parked.indexOf(car);
    if (parkedIndex !== -1) this.parked.splice(parkedIndex, 1);
  }

  update(dt) {
    const player = this.game.player.position;
    // Maintain traffic density near the player.
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) {
      this.respawnTimer = 1.5;
      for (let i = this.cars.length - 1; i >= 0; i--) {
        const car = this.cars[i];
        if (car.dead) continue;
        if (distance2D(car.position.x, car.position.z, player.x, player.z) > 150) {
          car.dispose();
          this.cars.splice(i, 1);
        }
      }
      while (this.cars.length < this.targetCount) this.spawnTrafficCar();
    }
    for (const car of this.cars) {
      if (car.dead) continue;
      this.updateTrafficCar(car, dt);
      car.update(dt);
    }
    for (const car of this.parked) {
      if (!car.dead) car.update(dt);
    }
    this.resolveCarCollisions(dt);
  }

  updateTrafficCar(car, dt) {
    const ai = car.ai;
    if (!ai) return;
    const waypoint = ai.waypoint;
    const distToWaypoint = distance2D(car.position.x, car.position.z, waypoint.x, waypoint.z);
    if (distToWaypoint < 7) {
      ai.waypoint = this.pickWaypoint(car);
      return;
    }
    // Stop for red lights near intersections.
    let desiredSpeed = ai.cruiseSpeed;
    const phase = this.game.city.lightPhase();
    const movingAlongX = Math.abs(Math.sin(car.heading)) > 0.7;
    const lightIsRed = (movingAlongX && phase === 'ns') || (!movingAlongX && phase === 'ew');
    if (lightIsRed) {
      for (const coord of STREET_COORDS) {
        const along = movingAlongX ? car.position.x : car.position.z;
        const cross = movingAlongX ? car.position.z : car.position.x;
        const approaching = movingAlongX
          ? (Math.sin(car.heading) > 0 ? coord - along : along - coord)
          : (Math.cos(car.heading) > 0 ? coord - along : along - coord);
        if (approaching > 2 && approaching < 15 && Math.abs(cross - this.nearestStreetCoord(cross)) < 7) {
          desiredSpeed = 0;
          break;
        }
      }
    }
    // Brake for a car or pedestrian directly ahead.
    const ahead = car.position.clone().addScaledVector(car.forwardVector(), 7);
    const blocker = this.game.nearestObstacle(ahead, 3.5, car);
    if (blocker) desiredSpeed = 0;
    car.autopilot(waypoint.x, waypoint.z, desiredSpeed, dt);
  }

  nearestStreetCoord(value) {
    let best = STREET_COORDS[0];
    for (const coord of STREET_COORDS) {
      if (Math.abs(coord - value) < Math.abs(best - value)) best = coord;
    }
    return best;
  }

  resolveCarCollisions(dt) {
    const all = [...this.cars, ...this.parked, ...this.game.police.cars];
    const playerCar = this.game.player.car;
    if (playerCar && !all.includes(playerCar)) all.push(playerCar);
    for (let i = 0; i < all.length; i++) {
      const a = all[i];
      if (a.dead) continue;
      for (let j = i + 1; j < all.length; j++) {
        const b = all[j];
        if (b.dead) continue;
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const minDist = 3.1;
        if (dist > 0.001 && dist < minDist) {
          const push = (minDist - dist) / 2;
          const nx = dx / dist;
          const nz = dz / dist;
          if (!a.isParked) {
            a.position.x -= nx * push;
            a.position.z -= nz * push;
          }
          if (!b.isParked) {
            b.position.x += nx * push;
            b.position.z += nz * push;
          }
          const relativeSpeed = a.velocity.clone().sub(b.velocity).length();
          if (relativeSpeed > 5) {
            const impact = relativeSpeed * 0.4;
            a.damage(impact, 'crash');
            b.damage(impact, 'crash');
            if (a.isPlayerControlled || b.isPlayerControlled) {
              this.game.onCarCrash(a.isPlayerControlled ? a : b, relativeSpeed, null);
            }
          }
          const exchange = a.velocity.clone().multiplyScalar(0.4);
          a.velocity.lerp(b.velocity, 0.35);
          b.velocity.lerp(exchange, 0.35);
        }
      }
    }
  }
}

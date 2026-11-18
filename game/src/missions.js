// Story missions, side activities and world interactions: Nadia's five-job
// arc with Eddie Marlow, taxi fares, ten hidden packages, and the shops that
// keep her driving, armed and saved.
import * as THREE from 'three';
import { clamp, distance2D, formatMoney, pickRandom } from './utils.js';
import { LANDMARKS, STREET_COORDS } from './city.js';
import { buildPersonMesh } from './pedestrians.js';
import { Car } from './vehicles.js';
import { writeSave } from './savegame.js';

function makeBeacon(colorHex) {
  const group = new THREE.Group();
  const ringMaterial = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.18, 28, 1, true), ringMaterial);
  ring.position.y = 0.25;
  group.add(ring);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(2.4, 28),
    new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.12;
  group.add(disc);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.7),
    new THREE.MeshBasicMaterial({ color: colorHex }),
  );
  diamond.position.y = 4.2;
  group.add(diamond);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, 40, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 20;
  group.add(beam);
  group.userData.diamond = diamond;
  group.userData.ring = ring;
  return group;
}

class Npc {
  constructor(game, x, z, shirtColor) {
    this.game = game;
    const rig = buildPersonMesh(shirtColor, 0x3a3a3a, 0xc98a5c, 0x777777, 1.04);
    this.mesh = rig.group;
    this.baseY = 0;
    this.bobPhase = 0;
    this.mesh.position.set(x, 0, z);
    game.scene.add(this.mesh);
  }

  setPosition(x, z, heading) {
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading || 0;
  }

  update(dt) {
    this.bobPhase += dt * 1.6;
    this.mesh.position.y = this.baseY + Math.sin(this.bobPhase) * 0.03;
  }
}

const MISSION_SCRIPTS = [
  {
    id: 'first-fare',
    title: 'FIRST FARE',
    reward: 400,
    briefing: [
      { speaker: 'EDDIE MARLOW', text: 'Nadia! Good, you came. Look, I got a friend at the Grand who needs a driver he can trust. That is you. For now.' },
      { speaker: 'NADIA COLE', text: 'Eddie, I am a driver, not a miracle worker. You still owe me for the last three jobs.' },
      { speaker: 'EDDIE MARLOW', text: 'And you still owe fifty grand to people with much worse manners than me. Drive me to the casino. We talk on the way.' },
    ],
    closing: [
      { speaker: 'EDDIE MARLOW', text: 'Smooth. See? This city runs on people like us. Come find me at the docks when you want real money.' },
    ],
    steps: [
      { type: 'goto', x: LANDMARKS.casino.x, z: LANDMARKS.casino.z + 14, radius: 9, requiresCar: true, label: 'Drive Eddie to the Marisol Grand Casino' },
    ],
  },
  {
    id: 'borrowed-wheels',
    title: 'BORROWED WHEELS',
    reward: 800,
    briefing: [
      { speaker: 'EDDIE MARLOW', text: 'A Veloce Coupe is parked outside the Palms Hotel. Belongs to a gentleman who will not miss it until brunch.' },
      { speaker: 'NADIA COLE', text: 'You want me to steal a car in broad daylight.' },
      { speaker: 'EDDIE MARLOW', text: 'I want you to borrow it permanently and park it at Marisol Motors. The cops? Try not to introduce yourself.' },
    ],
    closing: [
      { speaker: 'EDDIE MARLOW', text: 'Beautiful. The boys at the garage will take good care of her. You are getting good at this, Nadia.' },
    ],
    steps: [
      { type: 'stealCar', carType: 'coupe', x: 60, z: 122, label: 'Steal the Veloce Coupe at the Palms Hotel' },
      { type: 'deliverCar', x: LANDMARKS.garage.x, z: LANDMARKS.garage.z + 12, radius: 10, label: 'Deliver the coupe to Marisol Motors' },
    ],
  },
  {
    id: 'the-getaway',
    title: 'THE GETAWAY',
    reward: 1200,
    briefing: [
      { speaker: 'EDDIE MARLOW', text: 'A package is waiting at Pier 9. Pick it up, bring it to your place. Simple. Except the MBPD has taken an interest in the pier.' },
      { speaker: 'NADIA COLE', text: 'How much interest?' },
      { speaker: 'EDDIE MARLOW', text: 'Two stars worth. Drive like the rent is due. Because it is.' },
    ],
    closing: [
      { speaker: 'NADIA COLE', text: 'Package delivered. Next time, warn me BEFORE the sirens.' },
      { speaker: 'EDDIE MARLOW', text: 'Where is the fun in that?' },
    ],
    steps: [
      { type: 'goto', x: LANDMARKS.warehouse.x, z: LANDMARKS.warehouse.z + 14, radius: 8, label: 'Go to Pier 9 Warehouse' },
      { type: 'pickup', x: LANDMARKS.warehouse.x + 4, z: LANDMARKS.warehouse.z + 12, radius: 4, label: 'Grab the package', onCollect: 'startChase' },
      { type: 'deliverTimed', x: LANDMARKS.safehouse.x, z: LANDMARKS.safehouse.z - 14, radius: 9, timeLimit: 150, requiresCar: false, label: 'Get the package to Casa Nadia — fast!' },
    ],
  },
  {
    id: 'dockside-trouble',
    title: 'DOCKSIDE TROUBLE',
    reward: 1800,
    briefing: [
      { speaker: 'EDDIE MARLOW', text: 'The Bay Vultures hit my warehouse crew last night. They took my ledger. That ledger has names in it, Nadia. Your name. My name.' },
      { speaker: 'NADIA COLE', text: 'So I go in loud.' },
      { speaker: 'EDDIE MARLOW', text: 'You go in loud, you come out with the ledger. Take this — you will need more than harsh words.' },
    ],
    closing: [
      { speaker: 'EDDIE MARLOW', text: 'The ledger! Nadia, you are a treasure. The Vultures will think twice now. One more job, and we are square with the big man.' },
    ],
    steps: [
      { type: 'goto', x: LANDMARKS.warehouse.x, z: LANDMARKS.warehouse.z + 16, radius: 10, label: 'Reach the Pier 9 Warehouse' },
      { type: 'kill', count: 6, x: LANDMARKS.warehouse.x, z: LANDMARKS.warehouse.z, radius: 26, label: 'Clear out the Bay Vultures (0/6)' },
      { type: 'pickup', x: LANDMARKS.warehouse.x - 6, z: LANDMARKS.warehouse.z + 6, radius: 4, label: 'Recover Eddie\'s ledger' },
      { type: 'goto', x: LANDMARKS.docks.x + 8, z: LANDMARKS.docks.z, radius: 8, label: 'Bring the ledger back to Eddie' },
    ],
  },
  {
    id: 'the-big-score',
    title: 'THE BIG SCORE',
    reward: 3500,
    briefing: [
      { speaker: 'EDDIE MARLOW', text: 'The casino moves its weekend take in an armored van. Tonight it parks behind the Grand, engine warm, guard on a smoke break.' },
      { speaker: 'NADIA COLE', text: 'Eddie. That is not a job, that is a headline.' },
      { speaker: 'EDDIE MARLOW', text: 'It is your freedom, Nadia. Take the van, lose the heat, bring it to the warehouse. Then we pay the man and you are free.' },
    ],
    closing: [
      { speaker: 'EDDIE MARLOW', text: 'We did it! The debt is paid, the van is gone, and Marisol Bay is ours. Drinks at Taco Pier — you are buying.' },
      { speaker: 'NADIA COLE', text: 'I am buying? After all that? ...Fine. One drink. Then I am taking a very long nap.' },
    ],
    steps: [
      { type: 'goto', x: LANDMARKS.casino.x, z: LANDMARKS.casino.z - 14, radius: 10, label: 'Reach the casino service yard' },
      { type: 'stealCar', carType: 'van', x: LANDMARKS.casino.x + 8, z: LANDMARKS.casino.z - 16, label: 'Steal the armored van', onSteal: 'bigHeat' },
      { type: 'deliverCar', x: LANDMARKS.warehouse.x, z: LANDMARKS.warehouse.z + 16, radius: 11, label: 'Deliver the van to Pier 9 Warehouse' },
      { type: 'loseWanted', label: 'Lose the cops' },
    ],
  },
];

export class MissionManager {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.stepIndex = 0;
    this.missionCar = null;
    this.stepTimer = 0;
    this.killsRemaining = 0;
    this.beacon = makeBeacon(0xffd23f);
    this.beacon.visible = false;
    game.scene.add(this.beacon);
    this.eddie = new Npc(game, LANDMARKS.docks.x + 8, LANDMARKS.docks.z, 0x9e3f5c);
    this.eddie.setPosition(LANDMARKS.docks.x + 8, LANDMARKS.docks.z, Math.PI / 2);
    this.beaconTime = 0;
  }

  get missionIndex() {
    return this.game.save.missionIndex;
  }

  get nextMission() {
    return MISSION_SCRIPTS[this.missionIndex] || null;
  }

  get storyComplete() {
    return this.missionIndex >= MISSION_SCRIPTS.length;
  }

  currentStep() {
    if (!this.active) return null;
    return this.active.steps[this.stepIndex] || null;
  }

  currentObjectivePosition() {
    const step = this.currentStep();
    if (step && step.x !== undefined) return { x: step.x, z: step.z };
    if (!this.active && this.nextMission) return { x: LANDMARKS.docks.x + 8, z: LANDMARKS.docks.z };
    return null;
  }

  objectiveScreenPosition(camera) {
    const objective = this.currentObjectivePosition();
    if (!objective) return null;
    const vector = new THREE.Vector3(objective.x, 4, objective.z).project(camera);
    const behind = vector.z > 1;
    return {
      x: (vector.x * 0.5 + 0.5) * window.innerWidth,
      y: (-vector.y * 0.5 + 0.5) * window.innerHeight,
      behind,
    };
  }

  startMission() {
    const script = this.nextMission;
    if (!script || this.active) return false;
    this.active = script;
    this.stepIndex = 0;
    this.missionCar = null;
    this.game.hud.banner(script.title, 'MISSION START');
    this.game.audio.uiClick();
    this.game.hud.showDialogue(script.briefing, () => this.beginStep(0));
    return true;
  }

  beginStep(index) {
    this.stepIndex = index;
    const step = this.currentStep();
    if (!step) {
      this.completeMission();
      return;
    }
    this.stepTimer = step.timeLimit || 0;
    if (step.type === 'stealCar') {
      this.spawnMissionCar(step);
    }
    if (step.type === 'kill') {
      this.killsRemaining = step.count;
      this.game.combat.spawnEnemiesAround(step.x, step.z, step.count, step.radius || 24);
      this.updateKillLabel();
    }
    if (step.x !== undefined) {
      this.beacon.visible = true;
      this.beacon.position.set(step.x, 0, step.z);
    } else {
      this.beacon.visible = false;
    }
    this.game.hud.setObjective(this.active.title, step.label);
  }

  updateKillLabel() {
    const step = this.currentStep();
    if (!step || step.type !== 'kill') return;
    const done = step.count - this.killsRemaining;
    this.game.hud.setObjective(this.active.title, `Clear out the Bay Vultures (${done}/${step.count})`);
  }

  spawnMissionCar(step) {
    if (this.missionCar && !this.missionCar.dead) {
      this.missionCar.dispose();
      this.game.traffic.removeCar(this.missionCar);
    }
    const color = step.carType === 'van' ? 0x3a3f45 : 0xc23b2e;
    const car = new Car(this.game, step.carType, color, step.x, step.z, Math.PI / 2);
    car.isParked = true;
    this.game.traffic.parked.push(car);
    this.missionCar = car;
  }

  onEnemyKilled() {
    const step = this.currentStep();
    if (!this.active || !step || step.type !== 'kill') return;
    this.killsRemaining = Math.max(0, this.killsRemaining - 1);
    this.updateKillLabel();
    if (this.killsRemaining <= 0) this.advanceStep();
  }

  onMissionCarDestroyed() {
    if (!this.active) return;
    this.failMission('The mission vehicle was destroyed.');
  }

  advanceStep() {
    this.game.audio.pickup();
    this.beginStep(this.stepIndex + 1);
  }

  completeMission() {
    const script = this.active;
    this.active = null;
    this.beacon.visible = false;
    this.missionCar = null;
    this.game.save.missionIndex = Math.min(this.missionIndex + 1, MISSION_SCRIPTS.length);
    this.game.save.missionsCompleted.push(script.id);
    this.game.addMoney(script.reward, `Mission complete: +${formatMoney(script.reward)}`);
    this.game.save.debt = Math.max(0, this.game.save.debt - script.reward);
    this.game.audio.missionComplete();
    this.game.hud.banner('MISSION COMPLETE', `${script.title}  •  ${formatMoney(script.reward)}`);
    if (script.id === 'dockside-trouble') {
      this.game.player.giveWeapon('smg', 90);
      this.game.hud.toast('Eddie gave you an SMG. Press 2 to equip it.', 'gold');
    }
    if (this.storyComplete) {
      this.game.hud.showDialogue(
        script.closing.concat([{ speaker: 'MARISOL BAY', text: 'Story complete! The city is yours — taxi fares, packages and chaos await. Thanks for playing.' }]),
        null,
      );
    } else {
      this.game.hud.showDialogue(script.closing, null);
    }
    writeSave(this.game.save);
  }

  failMission(reason) {
    if (!this.active) return;
    this.active = null;
    this.beacon.visible = false;
    this.game.combat.clearEnemies();
    if (this.missionCar) {
      this.game.traffic.removeCar(this.missionCar);
      this.missionCar.dispose();
      this.missionCar = null;
    }
    this.game.audio.missionFailed();
    this.game.hud.banner('MISSION FAILED', reason || 'Try again — Eddie is waiting at the docks.');
    this.game.hud.setObjective('FREE ROAM', 'Find Eddie Marlow at the docks to start the next job.');
  }

  update(dt) {
    this.beaconTime += dt;
    if (this.beacon.visible) {
      this.beacon.userData.diamond.rotation.y += dt * 2.2;
      this.beacon.userData.diamond.position.y = 4.2 + Math.sin(this.beaconTime * 2.4) * 0.35;
      this.beacon.userData.ring.rotation.y += dt * 0.6;
    }
    this.eddie.update(dt);
    const player = this.game.player;
    if (!this.active) {
      if (this.nextMission) {
        this.beacon.visible = true;
        this.beacon.position.set(LANDMARKS.docks.x + 8, 0, LANDMARKS.docks.z);
        this.game.hud.setObjective('FREE ROAM', `Find Eddie Marlow at the docks — next job: ${this.nextMission.title}`);
      } else {
        this.beacon.visible = false;
        this.game.hud.setObjective('FREE ROAM', 'Story complete! Taxi fares, packages and the open city await.');
      }
      return;
    }
    const step = this.currentStep();
    if (!step) return;
    // Timed steps.
    if (this.stepTimer > 0) {
      this.stepTimer -= dt;
      const remaining = Math.max(0, Math.ceil(this.stepTimer));
      const minutes = Math.floor(remaining / 60);
      const seconds = String(remaining % 60).padStart(2, '0');
      this.game.hud.setObjective(this.active.title, step.label, `${minutes}:${seconds}`);
      if (this.stepTimer <= 0) {
        this.failMission('Out of time.');
        return;
      }
    }
    const playerPos = player.position;
    const dist = step.x !== undefined ? distance2D(playerPos.x, playerPos.z, step.x, step.z) : Infinity;
    switch (step.type) {
      case 'goto':
        if (step.requiresCar && !player.isDriving()) {
          this.game.hud.setObjective(this.active.title, step.label + ' (get in a car first)');
          break;
        }
        if (dist < step.radius) this.advanceStep();
        break;
      case 'stealCar':
        if (player.isDriving() && player.car === this.missionCar) {
          if (step.onSteal === 'bigHeat') this.game.police.addWanted(3, 'The casino called the cops!');
          this.advanceStep();
        }
        break;
      case 'deliverCar':
        if (player.isDriving() && player.car === this.missionCar && dist < step.radius) this.advanceStep();
        break;
      case 'deliverTimed':
        if (dist < step.radius) this.advanceStep();
        break;
      case 'pickup':
        if (dist < step.radius && !player.isDriving()) {
          if (step.onCollect === 'startChase') {
            this.game.police.addWanted(2, 'The package was watched — cops incoming!');
          }
          this.game.hud.toast('Package secured.', 'good');
          this.advanceStep();
        }
        break;
      case 'loseWanted':
        if (this.game.police.wanted === 0) this.advanceStep();
        break;
      case 'kill':
        break;
      default:
        break;
    }
    // Mission car destroyed mid-mission fails the job.
    if (this.missionCar && this.missionCar.dead && (step.type === 'stealCar' || step.type === 'deliverCar')) {
      this.onMissionCarDestroyed();
    }
  }
}

const PACKAGE_SPOTS = [
  { x: -150, z: 152 }, { x: 150, z: -150 }, { x: 0, z: 170 }, { x: -166, z: 40 },
  { x: 140, z: 20 }, { x: -20, z: -146 }, { x: 100, z: 146 }, { x: -100, z: -106 },
  { x: 40, z: -160 }, { x: 162, z: 100 },
];

export class SideActivities {
  constructor(game) {
    this.game = game;
    this.packages = [];
    this.taxiState = 'idle';
    this.taxiTimer = 0;
    this.taxiCustomer = null;
    this.taxiDestination = null;
    this.taxiFare = 0;
    this.taxiBeacon = makeBeacon(0x37d67a);
    this.taxiBeacon.visible = false;
    game.scene.add(this.taxiBeacon);
    this.buildPackages();
  }

  buildPackages() {
    const found = this.game.save.packagesFound || [];
    PACKAGE_SPOTS.forEach((spot, index) => {
      const alreadyFound = found.includes(index);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.7, 0.7),
        new THREE.MeshLambertMaterial({ color: 0xc86bff, emissive: 0xc86bff, emissiveIntensity: 0.5 }),
      );
      mesh.position.set(spot.x, 1.1, spot.z);
      mesh.visible = !alreadyFound;
      this.game.scene.add(mesh);
      this.packages.push({ x: spot.x, z: spot.z, index, mesh, found: alreadyFound, spin: Math.random() * 6 });
    });
  }

  taxiTargetPosition() {
    if (this.taxiState === 'toCustomer' && this.taxiCustomer) return { x: this.taxiCustomer.x, z: this.taxiCustomer.z };
    if (this.taxiState === 'toDestination' && this.taxiDestination) return { x: this.taxiDestination.x, z: this.taxiDestination.z };
    return null;
  }

  spawnTaxiCustomer() {
    const rng = this.game.rng;
    const player = this.game.player.position;
    let spot = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      const x = STREET_COORDS[Math.floor(rng() * STREET_COORDS.length)] + 8.4;
      const z = -150 + rng() * 300;
      if (distance2D(x, z, player.x, player.z) > 35) {
        spot = { x, z };
        break;
      }
    }
    if (!spot) spot = { x: 8.4, z: 40 };
    const npc = new Npc(this.game, spot.x, spot.z, 0xe8c84a);
    npc.setPosition(spot.x, spot.z, 0);
    this.taxiCustomer = { x: spot.x, z: spot.z, npc };
    this.taxiState = 'toCustomer';
    this.taxiBeacon.visible = true;
    this.taxiBeacon.position.set(spot.x, 0, spot.z);
    this.game.hud.toast('A fare is waiting — drive a taxi to the green marker.', 'gold');
  }

  startFare() {
    if (!this.taxiCustomer) return;
    this.taxiCustomer.npc.mesh.visible = false;
    const rng = this.game.rng;
    const dest = {
      x: STREET_COORDS[Math.floor(rng() * STREET_COORDS.length)] + 8.4,
      z: -150 + rng() * 320,
    };
    this.taxiDestination = dest;
    this.taxiFare = 45 + Math.floor(rng() * 50);
    this.taxiTimer = 90;
    this.taxiState = 'toDestination';
    this.taxiBeacon.position.set(dest.x, 0, dest.z);
    this.game.hud.toast(`Fare: take them ${Math.round(distance2D(this.taxiCustomer.x, this.taxiCustomer.z, dest.x, dest.z))}m — $${this.taxiFare} plus tip.`, 'gold');
  }

  completeFare() {
    const tip = Math.max(0, Math.floor(this.taxiTimer / 6));
    const total = this.taxiFare + tip;
    this.game.addMoney(total, `Fare complete: +${formatMoney(total)}`);
    this.game.save.taxiFares += 1;
    this.game.audio.missionComplete();
    this.cleanupTaxi(14);
  }

  cleanupTaxi(respawnDelay) {
    if (this.taxiCustomer) {
      this.game.scene.remove(this.taxiCustomer.npc.mesh);
      this.taxiCustomer = null;
    }
    this.taxiDestination = null;
    this.taxiState = 'idle';
    this.taxiTimer = respawnDelay || 14;
    this.taxiBeacon.visible = false;
  }

  // The prompt shown when the player can interact, and its action.
  getPrompt() {
    const game = this.game;
    const player = game.player;
    const pos = player.position;
    if (!game.missions.active && !game.missions.storyComplete) {
      if (distance2D(pos.x, pos.z, LANDMARKS.docks.x + 8, LANDMARKS.docks.z) < 7 && !player.isDriving()) {
        return { html: '<b>E</b> — Talk to Eddie Marlow', action: () => game.missions.startMission() };
      }
    }
    if (this.taxiState === 'toCustomer' && player.isDriving() && player.car.type === 'taxi' && this.taxiCustomer) {
      if (distance2D(pos.x, pos.z, this.taxiCustomer.x, this.taxiCustomer.z) < 8) {
        return { html: '<b>E</b> — Pick up the fare', action: () => this.startFare() };
      }
    }
    if (player.isDriving()) {
      if (distance2D(pos.x, pos.z, LANDMARKS.garage.x, LANDMARKS.garage.z + 12) < 13) {
        return { html: '<b>E</b> — Repair &amp; respray $250 (clears wanted)', action: () => this.useGarage() };
      }
    } else {
      if (distance2D(pos.x, pos.z, LANDMARKS.gunshop.x, LANDMARKS.gunshop.z + 10) < 9) {
        if (!player.weapons.smg.owned) {
          return { html: '<b>E</b> — Buy SMG $800', action: () => this.buySmg() };
        }
        return { html: '<b>E</b> — Buy SMG ammo $120 (60 rounds)', action: () => this.buyAmmo() };
      }
      if (distance2D(pos.x, pos.z, LANDMARKS.safehouse.x, LANDMARKS.safehouse.z - 14) < 9) {
        return { html: '<b>E</b> — Save game at Casa Nadia', action: () => this.saveAtHome() };
      }
      if (distance2D(pos.x, pos.z, LANDMARKS.hospital.x, LANDMARKS.hospital.z + 12) < 10) {
        return { html: '<b>E</b> — Get patched up (free)', action: () => this.useHospital() };
      }
    }
    return null;
  }

  useGarage() {
    const game = this.game;
    const car = game.player.car;
    if (!car) return;
    if (game.save.money < 250) {
      game.hud.toast('Not enough cash — the respray costs $250.', 'bad');
      return;
    }
    game.addMoney(-250, 'Respray & repair: -$250');
    car.health = 100;
    game.police.clearWanted(true);
    game.hud.toast('Fresh paint, clean record. The cops lost interest.', 'good');
    game.audio.pickup();
  }

  buySmg() {
    const game = this.game;
    if (game.save.money < 800) {
      game.hud.toast('The SMG costs $800. Come back with cash.', 'bad');
      return;
    }
    game.addMoney(-800, 'SMG purchased: -$800');
    game.player.giveWeapon('smg', 90);
    game.hud.toast('SMG purchased. Press 2 to equip it.', 'good');
  }

  buyAmmo() {
    const game = this.game;
    if (game.save.money < 120) {
      game.hud.toast('Ammo costs $120.', 'bad');
      return;
    }
    game.addMoney(-120, 'SMG ammo: -$120');
    game.player.giveWeapon('smg', 60);
    game.hud.toast('SMG ammo +60.', 'good');
  }

  saveAtHome() {
    const game = this.game;
    game.savePlayerPosition();
    writeSave(game.save);
    game.hud.toast('Game saved at Casa Nadia.', 'good');
    game.audio.pickup();
  }

  useHospital() {
    const game = this.game;
    game.player.heal(100);
    game.player.armor = 50;
    game.hud.toast('Patched up — full health and some armor.', 'good');
    game.audio.pickup();
  }

  update(dt) {
    for (const pkg of this.packages) {
      if (pkg.found) continue;
      pkg.spin += dt * 1.8;
      pkg.mesh.rotation.y = pkg.spin;
      pkg.mesh.position.y = 1.1 + Math.sin(pkg.spin) * 0.15;
      const player = this.game.player;
      if (!player.isDriving() && distance2D(pkg.x, pkg.z, player.position.x, player.position.z) < 2.2) {
        pkg.found = true;
        pkg.mesh.visible = false;
        this.game.save.packagesFound.push(pkg.index);
        this.game.addMoney(500, `Hidden package ${this.game.save.packagesFound.length}/10: +$500`);
        this.game.audio.pickup();
        if (this.game.save.packagesFound.length >= 10) {
          this.game.addMoney(2500, 'All packages found! Bonus +$2,500');
          this.game.hud.banner('COLLECTOR', 'Every hidden package found');
        }
        writeSave(this.game.save);
      }
    }
    if (this.taxiCustomer) this.taxiCustomer.npc.update(dt);
    if (this.taxiBeacon.visible) {
      this.taxiBeacon.userData.diamond.rotation.y += dt * 2.2;
    }
    if (this.taxiState === 'idle') {
      this.taxiTimer -= dt;
      if (this.taxiTimer <= 0) this.spawnTaxiCustomer();
    } else if (this.taxiState === 'toDestination') {
      this.taxiTimer -= dt;
      const player = this.game.player;
      if (this.taxiDestination && player.isDriving() && distance2D(player.position.x, player.position.z, this.taxiDestination.x, this.taxiDestination.z) < 8) {
        this.completeFare();
      } else if (this.taxiTimer <= 0 || !player.isDriving()) {
        this.game.hud.toast('The fare stormed off. Find another customer.', 'bad');
        this.cleanupTaxi(16);
      }
    }
  }
}

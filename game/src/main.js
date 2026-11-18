// Marisol Bay — game entry point. Boots the renderer, builds the world,
// wires every system together and runs the main loop: menu, playing, paused,
// busted and wasted states, plus the interaction and debug hooks.
import * as THREE from 'three';
import { makeRng, clamp, distance2D, formatMoney } from './utils.js';
import { City, LANDMARKS } from './city.js';
import { TrafficManager } from './vehicles.js';
import { PedestrianManager } from './pedestrians.js';
import { Player, WEAPONS } from './player.js';
import { PoliceSystem } from './police.js';
import { CombatSystem } from './combat.js';
import { MissionManager, SideActivities } from './missions.js';
import { Hud } from './hud.js';
import { CameraController } from './camera.js';
import { EffectsSystem } from './effects.js';
import { AudioEngine } from './audio.js';
import { InputManager } from './input.js';
import { defaultSave, loadSave, writeSave, clearSave, hasSave } from './savegame.js';

// Adaptive quality: software rasterizers (SwiftShader, llvmpipe) get cheaper
// shadows and no MSAA so the game stays playable; real GPUs get the full look.
// Overridable with ?quality=high or ?quality=low.
function detectRenderQuality() {
  const param = new URLSearchParams(window.location.search).get('quality');
  let software = false;
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      const rendererName = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
      software = /swiftshader|llvmpipe|software|basic render/i.test(String(rendererName));
    }
  } catch (error) {
    software = false;
  }
  if (param === 'high') software = false;
  if (param === 'low') software = true;
  return {
    software,
    antialias: !software,
    shadowMapSize: software ? 1024 : 2048,
    shadowType: software ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap,
  };
}

class Game {
  constructor() {
    this.rng = makeRng((Date.now() % 2147483647) + 1);
    this.state = 'menu';
    this.save = loadSave() || defaultSave();
    this.clockMinutes = 12 * 60 + 5;
    this.elapsed = 0;
    this.endTimer = 0;
    this.pendingRespawn = null;
    this.lastPedWantedAt = -99;
    this.cityLandmarks = LANDMARKS;
    this.quality = detectRenderQuality();

    this.renderer = new THREE.WebGLRenderer({ antialias: this.quality.antialias, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = this.quality.shadowType;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    document.getElementById('app').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1600);
    this.camera.position.set(0, 30, -60);

    this.input = new InputManager();
    this.audio = new AudioEngine();
    this.city = new City(this.scene, this.quality).build();
    this.effects = new EffectsSystem(this.scene);
    this.hud = new Hud();
    this.cameraController = new CameraController(this.camera);

    const startPos = this.save.playerPosition || { x: LANDMARKS.safehouse.x, z: LANDMARKS.safehouse.z - 14 };
    this.player = new Player(this, startPos.x, startPos.z);
    this.player.weapons.smg.owned = !!this.save.weapons.smg;
    this.player.weapons.smg.reserve = this.save.ammo.smg || 0;
    this.traffic = new TrafficManager(this);
    this.traffic.spawnParkedCars();
    for (let i = 0; i < this.traffic.targetCount; i++) this.traffic.spawnTrafficCar();
    this.peds = new PedestrianManager(this);
    this.peds.spawnInitial();
    this.police = new PoliceSystem(this);
    this.combat = new CombatSystem(this);
    this.missions = new MissionManager(this);
    this.sideActivities = new SideActivities(this);

    this.clock = new THREE.Clock();
    this.bindMenus();
    this.bindWindowEvents();
    this.hud.setWanted(0, false);
    this.installDebugHooks();
    this.loop();
  }

  // ---------- menus ----------
  bindMenus() {
    const startScreen = document.getElementById('start-screen');
    const pauseMenu = document.getElementById('pause-menu');
    const howtoPanel = document.getElementById('howto-panel');
    const btnContinue = document.getElementById('btn-continue');
    if (hasSave()) btnContinue.classList.remove('hidden');
    document.getElementById('btn-new-game').addEventListener('click', () => {
      this.audio.start();
      this.audio.resume();
      this.audio.uiClick();
      clearSave();
      this.save = defaultSave();
      this.resetWorldForNewGame();
      this.beginPlay();
    });
    btnContinue.addEventListener('click', () => {
      this.audio.start();
      this.audio.resume();
      this.audio.uiClick();
      this.save = loadSave() || defaultSave();
      this.applySaveToWorld();
      this.beginPlay();
    });
    document.getElementById('btn-howto').addEventListener('click', () => {
      this.audio.start();
      howtoPanel.classList.toggle('hidden');
    });
    document.getElementById('btn-sound').addEventListener('click', (event) => {
      this.audio.start();
      const on = !this.audio.enabled;
      this.audio.setEnabled(on);
      event.target.textContent = 'SOUND: ' + (on ? 'ON' : 'OFF');
    });
    document.getElementById('btn-resume').addEventListener('click', () => this.resumeGame());
    document.getElementById('btn-save').addEventListener('click', () => {
      this.savePlayerPosition();
      writeSave(this.save);
      this.hud.toast('Game saved.', 'good');
    });
    document.getElementById('btn-restart-mission').addEventListener('click', () => {
      if (this.missions.active) {
        this.missions.failMission('Mission restarted.');
        this.teleportPlayer(LANDMARKS.docks.x + 6, LANDMARKS.docks.z + 4);
        this.police.clearWanted(true);
        this.player.heal(100);
      }
      this.resumeGame();
    });
    document.getElementById('btn-quit-menu').addEventListener('click', () => {
      this.savePlayerPosition();
      writeSave(this.save);
      pauseMenu.classList.add('hidden');
      this.state = 'menu';
      this.input.releasePointerLock();
      startScreen.classList.remove('hidden');
      this.hud.hide();
      if (hasSave()) btnContinue.classList.remove('hidden');
    });
    this.startScreen = startScreen;
    this.pauseMenu = pauseMenu;
  }

  bindWindowEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing' && !this.player.isDriving() && !this.hud.dialogueOpen) {
        this.input.requestPointerLock(this.renderer.domElement);
      }
    });
  }

  resetWorldForNewGame() {
    this.player.weapons.smg.owned = false;
    this.player.weapons.smg.reserve = 0;
    this.player.weapons.pistol.mag = 12;
    this.player.health = 100;
    this.player.armor = 0;
    this.teleportPlayer(LANDMARKS.safehouse.x, LANDMARKS.safehouse.z - 14);
    this.police.clearWanted(true);
    this.combat.clearEnemies();
  }

  applySaveToWorld() {
    this.player.weapons.smg.owned = !!this.save.weapons.smg;
    this.player.weapons.smg.reserve = this.save.ammo.smg || 0;
    const pos = this.save.playerPosition || { x: LANDMARKS.safehouse.x, z: LANDMARKS.safehouse.z - 14 };
    this.teleportPlayer(pos.x, pos.z);
    this.player.health = 100;
    this.police.clearWanted(true);
  }

  beginPlay() {
    this.startScreen.classList.add('hidden');
    this.hud.show();
    this.state = 'playing';
    this.hud.setObjective('FREE ROAM', 'Explore Marisol Bay. Press E near a car to drive it.');
    if (this.missions.storyComplete) {
      this.hud.toast('Welcome back to Marisol Bay.', 'gold');
    } else if (this.save.missionIndex > 0) {
      this.hud.toast('Welcome back. Eddie is waiting at the docks.', 'gold');
    } else {
      this.hud.toast('Welcome to Marisol Bay. Find Eddie at the docks.', 'gold');
    }
    this.audio.resume();
  }

  pauseGame() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.releasePointerLock();
    const stats = document.getElementById('pause-stats');
    stats.innerHTML =
      `Cash: <b>${formatMoney(this.save.money)}</b> &nbsp;•&nbsp; Debt left: <b>${formatMoney(this.save.debt)}</b><br>` +
      `Missions done: <b>${this.save.missionsCompleted.length} / 5</b> &nbsp;•&nbsp; Packages: <b>${this.save.packagesFound.length} / 10</b> &nbsp;•&nbsp; Taxi fares: <b>${this.save.taxiFares}</b>`;
    this.pauseMenu.classList.remove('hidden');
  }

  resumeGame() {
    if (this.state !== 'paused') return;
    this.pauseMenu.classList.add('hidden');
    this.state = 'playing';
  }

  // ---------- shared helpers used by the systems ----------
  addMoney(amount, toastText) {
    this.save.money += amount;
    if (toastText) this.hud.toast(toastText, amount >= 0 ? 'good' : 'bad');
  }

  savePlayerPosition() {
    this.save.playerPosition = { x: this.player.position.x, z: this.player.position.z };
    this.save.weapons = { pistol: true, smg: this.player.weapons.smg.owned };
    this.save.ammo = { pistol: 999, smg: this.player.weapons.smg.reserve };
  }

  teleportPlayer(x, z) {
    if (this.player.car) {
      this.player.car.isPlayerControlled = false;
      this.player.car = null;
      this.player.mesh.visible = true;
    }
    this.player.position.set(x, 0, z);
    this.player.mesh.position.copy(this.player.position);
    this.player.velocityY = 0;
    this.cameraController.snapTo(this.player.position, this.player.heading);
  }

  playerWeaponSpec() {
    return WEAPONS[this.player.currentWeapon];
  }

  nearestObstacle(point, radius, excludeCar) {
    const cars = [...this.traffic.cars, ...this.traffic.parked, ...this.police.cars];
    if (this.player.car) cars.push(this.player.car);
    for (const car of cars) {
      if (car === excludeCar || car.dead) continue;
      if (distance2D(point.x, point.z, car.position.x, car.position.z) < radius + 1.4) return car;
    }
    for (const ped of this.peds.peds) {
      if (ped.dead) continue;
      if (distance2D(point.x, point.z, ped.position.x, ped.position.z) < radius) return ped;
    }
    return null;
  }

  onCarCrash(car, impact, previous) {
    this.audio.crash(clamp(impact / 30, 0.15, 1));
    if (car.isPlayerControlled) {
      this.cameraController.addShake(clamp(impact / 28, 0.15, 0.8));
      this.effects.spawnSparks(car.position.clone().setY(0.8));
    }
  }

  onCarDestroyed(car, cause) {
    const position = car.position.clone();
    position.y = 1;
    this.effects.spawnExplosion(position);
    this.audio.explosion();
    if (car.isPlayerControlled) {
      this.cameraController.addShake(1.1);
      this.player.damage(25, position);
      this.player.exitCar();
    }
    if (car === this.missions.missionCar) this.missions.onMissionCarDestroyed();
    // Burn the wreck black.
    car.mesh.traverse((child) => {
      if (child.isMesh && child.material && child.material.color) {
        child.material.color.setHex(0x1a1a1a);
      }
    });
  }

  onPedHitByCar(ped, car) {
    this.audio.crash(0.4);
    if (car.isPlayerControlled) {
      this.cameraController.addShake(0.35);
      if (this.elapsed - this.lastPedWantedAt > 6) {
        this.lastPedWantedAt = this.elapsed;
        this.police.addWanted(1, 'You hit a pedestrian!');
      }
    }
  }

  onEnemyKilled(enemy) {
    this.missions.onEnemyKilled();
  }

  onPlayerWasted() {
    if (this.state !== 'playing') return;
    this.state = 'wasted';
    this.input.releasePointerLock();
    this.hud.showEndScreen('wasted');
    this.audio.missionFailed();
    this.endTimer = 2.6;
    this.pendingRespawn = 'hospital';
  }

  onPlayerBusted() {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    this.input.releasePointerLock();
    this.hud.showEndScreen('busted');
    this.audio.missionFailed();
    this.endTimer = 2.6;
    this.pendingRespawn = 'police';
  }

  respawn(kind) {
    this.hud.hideEndScreens();
    const fine = kind === 'hospital' ? 300 : 200;
    this.save.money -= fine;
    if (this.missions.active) this.missions.failMission(kind === 'hospital' ? 'You were wasted.' : 'You were busted.');
    this.combat.clearEnemies();
    this.police.clearWanted(true);
    if (this.player.car) {
      this.player.car.isPlayerControlled = false;
      this.player.car = null;
      this.player.mesh.visible = true;
    }
    const spot = kind === 'hospital' ? LANDMARKS.hospital : LANDMARKS.policeStation;
    this.teleportPlayer(spot.x, spot.z + 14);
    this.player.health = 100;
    this.player.armor = 0;
    this.state = 'playing';
    this.hud.toast(`You paid a $${fine} ${kind === 'hospital' ? 'hospital bill' : 'bail fine'}.`, 'bad');
  }

  // ---------- interaction ----------
  handleInteractionInput() {
    const input = this.input;
    if (input.wasPressed('KeyE')) {
      if (this.hud.dialogueOpen) {
        this.hud.advanceDialogue();
        this.audio.uiClick();
        return;
      }
      const prompt = this.sideActivities.getPrompt();
      if (prompt) {
        prompt.action();
        return;
      }
      if (this.player.isDriving()) {
        this.player.exitCar();
      } else {
        const car = this.traffic.nearestCar(this.player.position, 4.6, true);
        if (car) this.player.enterCar(car);
      }
    }
    if (input.wasPressed('KeyF') && !this.player.isDriving() && !this.hud.dialogueOpen) {
      const car = this.traffic.nearestCar(this.player.position, 4.6, true);
      if (car) this.player.enterCar(car);
    }
  }

  updatePrompt() {
    if (this.hud.dialogueOpen || this.state !== 'playing') {
      this.hud.setInteractPrompt(null);
      return;
    }
    const prompt = this.sideActivities.getPrompt();
    if (prompt) {
      this.hud.setInteractPrompt(prompt.html);
      return;
    }
    if (!this.player.isDriving()) {
      const car = this.traffic.nearestCar(this.player.position, 4.6, true);
      if (car) {
        const label = car.isPolice ? 'Steal the police car' : car.isParked || this.traffic.cars.includes(car) ? 'Steal the ' + car.spec.name : 'Get in the ' + car.spec.name;
        this.hud.setInteractPrompt('<b>E</b> — ' + label);
        return;
      }
    } else if (this.player.car.speed() < 3) {
      this.hud.setInteractPrompt('<b>E</b> — Exit the ' + this.player.car.spec.name);
      return;
    }
    this.hud.setInteractPrompt(null);
  }

  // ---------- main loop ----------
  loop() {
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.elapsed += dt;
      const input = this.input;
      if (this.state === 'menu') {
        this.cameraController.updateMenuCamera(dt, new THREE.Vector3(0, 0, 0));
        this.city.update(dt, this.elapsed, 0, 0);
        this.effects.update(dt);
        this.traffic.update(dt);
        this.peds.update(dt);
        this.renderer.render(this.scene, this.camera);
        input.endFrame();
        return;
      }
      if (this.state === 'paused') {
        this.renderer.render(this.scene, this.camera);
        if (input.wasPressed('KeyP') || input.wasPressed('Escape')) this.resumeGame();
        input.endFrame();
        return;
      }
      if (this.state === 'busted' || this.state === 'wasted') {
        this.endTimer -= dt;
        if (this.endTimer <= 0 && this.pendingRespawn) {
          const kind = this.pendingRespawn;
          this.pendingRespawn = null;
          this.respawn(kind);
        }
        this.renderer.render(this.scene, this.camera);
        input.endFrame();
        return;
      }
      // Playing.
      if (input.wasPressed('KeyP') || (input.wasPressed('Escape') && !input.pointerLocked)) {
        this.pauseGame();
        input.endFrame();
        this.renderer.render(this.scene, this.camera);
        return;
      }
      if (input.wasPressed('KeyM')) {
        this.audio.setMusicOn(!this.audio.musicOn);
        this.hud.toast('Music ' + (this.audio.musicOn ? 'on' : 'off') + '.', '');
      }
      if (input.wasPressed('KeyC')) this.cameraController.cycleDistance();
      this.clockMinutes = (this.clockMinutes + dt) % 1440;

      const dialogueOpen = this.hud.dialogueOpen;
      this.handleInteractionInput();
      if (!dialogueOpen) {
        this.player.aiming = !this.player.isDriving() && (input.pointerLocked || input.mouseDown);
        this.player.update(dt, input, this.cameraController.yaw + Math.PI);
        this.traffic.update(dt);
        this.peds.update(dt);
        this.police.update(dt);
        this.combat.update(dt, input);
        this.missions.update(dt);
        this.sideActivities.update(dt);
        this.effects.update(dt);
        this.city.update(dt, this.elapsed, this.player.position.x, this.player.position.z);
        const speedFraction = this.player.isDriving() ? clamp(this.player.car.speed() / 40, 0, 1) : 0;
        this.audio.setEngine(speedFraction, this.player.isDriving());
      }
      this.updatePrompt();
      const focus = this.player.isDriving() ? this.player.car.position : this.player.position;
      const focusLifted = focus.clone();
      focusLifted.y = this.player.position.y;
      const speed = this.player.isDriving() ? this.player.car.speed() : (this.player.moving ? 5 : 0);
      this.cameraController.update(dt, input, focusLifted, this.player.heading, speed, this.player.isDriving());
      this.hud.update(dt, this, this.camera, this.elapsed);
      this.renderer.render(this.scene, this.camera);
      input.endFrame();
    });
  }

  // ---------- debug hooks for play-testing and screenshots ----------
  installDebugHooks() {
    const game = this;
    window.__marisol = {
      game,
      ready: true,
      teleport(x, z) {
        game.teleportPlayer(x, z);
      },
      giveMoney(amount) {
        game.addMoney(amount, '');
      },
      setWanted(stars) {
        game.police.setWanted(stars);
        game.police.spawnTimer = 0;
      },
      startPlaying() {
        game.beginPlay();
      },
      driveCarAt(x, z, heading) {
        const car = game.traffic.nearestCar(new THREE.Vector3(x, 0, z), 60, true);
        if (car) {
          game.teleportPlayer(car.position.x + 2, car.position.z);
          game.player.enterCar(car);
          car.heading = heading;
        }
        return car;
      },
      stageChase() {
        game.beginPlay();
        const car = game.traffic.nearestCar(new THREE.Vector3(0, 0, -40), 80, true);
        if (car) {
          game.teleportPlayer(car.position.x + 2, car.position.z);
          game.player.enterCar(car);
          car.heading = Math.PI;
          car.velocity.set(0, 0, -18);
        }
        game.missions.active = {
          id: 'staged-chase',
          title: 'THE GETAWAY',
          reward: 0,
          closing: [{ speaker: 'EDDIE MARLOW', text: 'Nice driving, Nadia.' }],
          steps: [{ type: 'goto', x: LANDMARKS.safehouse.x, z: LANDMARKS.safehouse.z - 14, radius: 9, label: 'Get the package to Casa Nadia — fast!' }],
        };
        game.missions.stepIndex = 0;
        game.missions.beacon.visible = true;
        game.missions.beacon.position.set(LANDMARKS.safehouse.x, 0, LANDMARKS.safehouse.z - 14);
        game.hud.setObjective('THE GETAWAY', 'Get the package to Casa Nadia — fast!', '2:24');
        game.police.setWanted(3);
        game.police.spawnTimer = 0;
        game.police.update(0.1);
        // Pull two units in close behind the player so the chase reads at once.
        const forward = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
        game.police.cars.slice(0, 2).forEach((unit, i) => {
          const back = 13 + i * 13;
          unit.position.copy(car.position).addScaledVector(forward, -back);
          unit.position.x += (i === 0 ? 2.5 : -2.5);
          unit.heading = car.heading;
          unit.velocity.copy(forward).multiplyScalar(16);
          unit.mesh.position.copy(unit.position);
          unit.mesh.rotation.y = unit.heading;
        });
        game.cameraController.snapTo(car.position, car.heading);
        // Look-behind framing: the camera sits ahead of the car looking back,
        // so the pursuit units behind the player stay in frame.
        game.cameraController.yaw = car.heading;
        game.cameraController.lookYawOffset = Math.PI;
        game.cameraController.lockLookOffset = true;
        game.hud.clearToasts();
        // Hide the off-screen objective arrow for a clean chase frame; the
        // objective text, timer, wanted stars and minimap still show.
        game.missions.beacon.visible = false;
      },
      stageCombat() {
        game.beginPlay();
        game.teleportPlayer(LANDMARKS.warehouse.x + 6, LANDMARKS.warehouse.z + 20);
        game.combat.spawnEnemiesAround(LANDMARKS.warehouse.x, LANDMARKS.warehouse.z, 5, 20);
        game.hud.setObjective('DOCKSIDE TROUBLE', 'Clear out the Bay Vultures (0/5)');
        game.player.giveWeapon('smg', 90);
        game.player.switchWeapon('smg');
      },
      stageOnFoot(x, z) {
        game.beginPlay();
        game.missions.active = null;
        game.missions.beacon.visible = false;
        game.teleportPlayer(x === undefined ? 6 : x, z === undefined ? -34 : z);
        game.hud.clearToasts();
      },
    };
  }
}

new Game();

// Marisol Bay: a procedural sun-soaked coastal city. Streets on a grid, varied
// buildings with painted facades, a beach boardwalk, an ocean, palms, lamps,
// traffic lights and every story landmark. Also owns collision data.
import * as THREE from 'three';
import { makeRng, pickRandom, rangeRandom } from './utils.js';
import {
  makeBuildingTexture, makeGlassTowerTexture, makeRoadTexture, makeSidewalkTexture,
  makeSandTexture, makeGrassTexture, makePalmFrondTexture, makeSignTexture,
  makeBillboardTexture, makeCloudTexture,
} from './textures.js';

export const STREET_COORDS = [-160, -120, -80, -40, 0, 40, 80, 120, 160];
export const STREET_HALF_WIDTH = 6;
export const BLOCK_CENTERS = [-140, -100, -60, -20, 20, 60, 100, 140];
export const CITY_LIMIT = 172;
export const BEACH_Z = 178;

export const LANDMARKS = {
  safehouse: { x: -140, z: 140, name: 'Casa Nadia (Safehouse)' },
  policeStation: { x: 20, z: -20, name: 'MBPD Headquarters' },
  hospital: { x: -60, z: -60, name: 'St. Aurelia Hospital' },
  casino: { x: 60, z: 60, name: 'Marisol Grand Casino' },
  garage: { x: 100, z: -100, name: 'Marisol Motors' },
  gunshop: { x: -100, z: 60, name: 'Ironworks Arms' },
  warehouse: { x: -140, z: -20, name: 'Pier 9 Warehouse' },
  docks: { x: -160, z: -60, name: 'The Docks' },
  taxiStand: { x: 6, z: 6, name: 'Plaza Taxi Stand' },
  boardwalk: { x: 0, z: 178, name: 'Marisol Boardwalk' },
  hotel: { x: 60, z: 140, name: 'Palms Hotel' },
  diner: { x: -40, z: 176, name: 'Taco Pier' },
};

const SKY_TOP = new THREE.Color(0x3f8fd2);
const SKY_HORIZON = new THREE.Color(0xf7d9a8);

export class City {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality || { shadowMapSize: 2048 };
    this.colliders = [];
    this.trafficLightGroups = [];
    this.clouds = [];
    this.lightPhaseTime = 0;
    this.lightPhaseLength = 14;
    this.sun = null;
    this.ocean = null;
    this.oceanBase = null;
    this.nsLampMaterial = new THREE.MeshBasicMaterial({ color: 0x33dd55 });
    this.ewLampMaterial = new THREE.MeshBasicMaterial({ color: 0xdd3333 });
  }

  build() {
    this.buildSky();
    this.buildGround();
    this.buildRoads();
    this.buildBlocks();
    this.buildSpecialLandmarks();
    this.buildStreetProps();
    this.buildBeach();
    this.buildLighting();
    return this;
  }

  buildSky() {
    const skyGeometry = new THREE.SphereGeometry(820, 24, 14);
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: SKY_TOP },
        horizonColor: { value: SKY_HORIZON },
      },
      vertexShader: 'varying vec3 vWorldPosition; void main() { vec4 worldPosition = modelMatrix * vec4(position, 1.0); vWorldPosition = worldPosition.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 topColor; uniform vec3 horizonColor; varying vec3 vWorldPosition; void main() { float h = normalize(vWorldPosition).y; float t = clamp(h * 1.6 + 0.12, 0.0, 1.0); gl_FragColor = vec4(mix(horizonColor, topColor, t), 1.0); }',
    });
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    sky.name = 'skyDome';
    this.scene.add(sky);
    this.scene.fog = new THREE.Fog(0xd8e6ee, 300, 760);

    const cloudTexture = makeCloudTexture();
    const rng = makeRng(4242);
    for (let i = 0; i < 14; i++) {
      const material = new THREE.SpriteMaterial({ map: cloudTexture, transparent: true, opacity: 0.85, depthWrite: false });
      const sprite = new THREE.Sprite(material);
      const scale = 60 + rng() * 90;
      sprite.scale.set(scale, scale * 0.5, 1);
      sprite.position.set(rangeRandom(rng, -500, 500), 150 + rng() * 90, rangeRandom(rng, -450, 450));
      sprite.userData.drift = 1.2 + rng() * 1.8;
      this.clouds.push(sprite);
      this.scene.add(sprite);
    }
  }

  buildGround() {
    const grassTexture = makeGrassTexture();
    grassTexture.wrapS = THREE.RepeatWrapping;
    grassTexture.wrapT = THREE.RepeatWrapping;
    grassTexture.repeat.set(90, 90);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 1400),
      new THREE.MeshLambertMaterial({ map: grassTexture, color: 0xb8c49a }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.08;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // City slab under the street grid.
    const slab = new THREE.Mesh(
      new THREE.PlaneGeometry(352, 352),
      new THREE.MeshLambertMaterial({ color: 0x9a938a }),
    );
    slab.rotation.x = -Math.PI / 2;
    slab.position.y = 0;
    slab.receiveShadow = true;
    this.scene.add(slab);
  }

  buildRoads() {
    const roadTexture = makeRoadTexture();
    roadTexture.wrapS = THREE.RepeatWrapping;
    roadTexture.wrapT = THREE.RepeatWrapping;
    const roadMaterial = new THREE.MeshLambertMaterial({ map: roadTexture });
    const roadGeometryX = new THREE.PlaneGeometry(352, STREET_HALF_WIDTH * 2);
    const roadGeometryZ = new THREE.PlaneGeometry(STREET_HALF_WIDTH * 2, 352);
    for (const coord of STREET_COORDS) {
      const roadX = new THREE.Mesh(roadGeometryX, roadMaterial);
      roadX.rotation.x = -Math.PI / 2;
      roadX.rotation.z = 0;
      roadX.position.set(0, 0.06, coord);
      roadX.receiveShadow = true;
      this.scene.add(roadX);
      const roadZ = new THREE.Mesh(roadGeometryZ, roadMaterial);
      roadZ.rotation.x = -Math.PI / 2;
      roadZ.position.set(coord, 0.06, 0);
      roadZ.receiveShadow = true;
      this.scene.add(roadZ);
    }
    // Intersection patches hide the crossing texture seams.
    const patchMaterial = new THREE.MeshLambertMaterial({ color: 0x33373c });
    const patchGeometry = new THREE.PlaneGeometry(12.4, 12.4);
    for (const x of STREET_COORDS) {
      for (const z of STREET_COORDS) {
        const patch = new THREE.Mesh(patchGeometry, patchMaterial);
        patch.rotation.x = -Math.PI / 2;
        patch.position.set(x, 0.07, z);
        patch.receiveShadow = true;
        this.scene.add(patch);
      }
    }
  }

  buildBlocks() {
    const rng = makeRng(20261117);
    const facadeTextures = [];
    for (let i = 0; i < 9; i++) facadeTextures.push(makeBuildingTexture(1000 + i * 77));
    const glassTextures = [makeGlassTowerTexture(55), makeGlassTowerTexture(91)];
    const sidewalkTexture = makeSidewalkTexture();
    sidewalkTexture.wrapS = THREE.RepeatWrapping;
    sidewalkTexture.wrapT = THREE.RepeatWrapping;
    sidewalkTexture.repeat.set(4, 4);
    const sidewalkMaterial = new THREE.MeshLambertMaterial({ map: sidewalkTexture });
    const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x6b655e });
    const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    const specialBlocks = new Set(['-140,140', '20,-20', '-60,-60', '60,60', '100,-100', '-100,60', '-140,-20', '60,140']);

    for (const bx of BLOCK_CENTERS) {
      for (const bz of BLOCK_CENTERS) {
        const plinth = new THREE.Mesh(new THREE.BoxGeometry(28, 0.5, 28), sidewalkMaterial);
        plinth.position.set(bx, 0.25, bz);
        plinth.receiveShadow = true;
        this.scene.add(plinth);
        if (specialBlocks.has(bx + ',' + bz)) continue;
        const downtown = Math.abs(bx) <= 20 && Math.abs(bz) <= 20;
        const count = downtown ? 1 : 1 + Math.floor(rng() * 3);
        for (let i = 0; i < count; i++) {
          const isTower = downtown || rng() < 0.18;
          const w = isTower ? 16 + rng() * 6 : 8 + rng() * 8;
          const d = isTower ? 16 + rng() * 6 : 8 + rng() * 8;
          const h = isTower ? 26 + rng() * 26 : 7 + rng() * 14;
          const ox = count === 1 ? 0 : rangeRandom(rng, -5, 5);
          const oz = count === 1 ? 0 : rangeRandom(rng, -5, 5);
          const texture = isTower && rng() < 0.6 ? pickRandom(rng, glassTextures) : pickRandom(rng, facadeTextures);
          const sideMaterial = new THREE.MeshLambertMaterial({ map: texture });
          const mesh = new THREE.Mesh(boxGeometry, [sideMaterial, sideMaterial, roofMaterial, roofMaterial, sideMaterial, sideMaterial]);
          mesh.scale.set(w, h, d);
          mesh.position.set(bx + ox, 0.5 + h / 2, bz + oz);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          this.scene.add(mesh);
          this.addCollider(bx + ox - w / 2, bz + oz - d / 2, bx + ox + w / 2, bz + oz + d / 2);
          // Rooftop box for silhouette variety.
          if (rng() < 0.6) {
            const roofBox = new THREE.Mesh(boxGeometry, roofMaterial);
            roofBox.scale.set(w * 0.3, 1.6, d * 0.3);
            roofBox.position.set(bx + ox + w * 0.2, 0.5 + h + 0.8, bz + oz - d * 0.15);
            this.scene.add(roofBox);
          }
        }
        // A palm or two on ordinary blocks.
        if (rng() < 0.7) this.addPalm(bx + rangeRandom(rng, -11, 11), bz + rangeRandom(rng, -11, 11), 0.8 + rng() * 0.4);
      }
    }
  }

  buildSpecialLandmarks() {
    const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x6b655e });
    const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    // Landmarks wear the same painted facade as ordinary buildings, tinted
    // with their own colour, so none of them reads as a flat coloured box.
    const landmarkFacade = makeBuildingTexture(777);
    const makeBlock = (x, z, w, h, d, color, signLines, signBg, signFg) => {
      const material = new THREE.MeshLambertMaterial({ map: landmarkFacade, color });
      const mesh = new THREE.Mesh(boxGeometry, [material, material, roofMaterial, roofMaterial, material, material]);
      mesh.scale.set(w, h, d);
      mesh.position.set(x, 0.5 + h / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.addCollider(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
      if (signLines) {
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(Math.min(w * 0.9, 20), Math.min(w * 0.9, 20) * 0.25),
          new THREE.MeshBasicMaterial({ map: makeSignTexture(signLines, signBg, signFg) }),
        );
        sign.position.set(x, h * 0.72, z + d / 2 + 0.15);
        this.scene.add(sign);
      }
      return mesh;
    };

    // Safehouse: two-storey coral house with a garage.
    makeBlock(-140, 140, 14, 8, 12, 0xe8a58c, ['CASA NADIA'], '#274a63', '#ffd23f');
    // Police HQ: pale blue civic block.
    makeBlock(20, -20, 20, 12, 18, 0xd8e2e8, ['MBPD HEADQUARTERS'], '#1d3a5f', '#ffffff');
    // Hospital: white with a red cross band.
    makeBlock(-60, -60, 18, 14, 16, 0xf2f2ee, ['ST. AURELIA HOSPITAL'], '#b3202c', '#ffffff');
    // Casino: gold-trimmed tower.
    makeBlock(60, 60, 18, 30, 18, 0xe9c46a, ['MARISOL GRAND', 'CASINO • HOTEL'], '#7a1f2b', '#ffd23f');
    // Garage: low workshop with a wide door.
    makeBlock(100, -100, 20, 7, 14, 0xc96f2e, ['MARISOL MOTORS', 'REPAIRS • RESPRAY'], '#263238', '#ffd23f');
    // Gun shop: grey storefront with a warm neon sign.
    makeBlock(-100, 60, 14, 7, 12, 0x7d848c, ['IRONWORKS ARMS'], '#1c1e22', '#ff8a5c');
    // Warehouse: big rust-red shed at the docks.
    makeBlock(-140, -20, 24, 10, 18, 0x9e4a3a, ['PIER 9 WAREHOUSE'], '#3d2b22', '#ffe9a8');
    // Hotel: beachfront white tower.
    makeBlock(60, 140, 16, 24, 14, 0xf5efe2, ['PALMS HOTEL'], '#2e6f5e', '#ffffff');
    // Diner shack on the boardwalk.
    makeBlock(-40, 176, 10, 5, 8, 0x7fb069, ['TACO PIER'], '#e4572e', '#ffffff');

    // Shipping containers and crates at the docks.
    const rng = makeRng(777);
    const containerColors = [0xc94f32, 0x2e6f9e, 0xd9a521, 0x4a7a3d, 0x7a5fa0];
    for (let i = 0; i < 10; i++) {
      const w = 8, h = 3, d = 3;
      const x = -168 + (i % 5) * 9;
      const z = -84 + Math.floor(i / 5) * 10 + rng() * 3;
      const mesh = new THREE.Mesh(boxGeometry, new THREE.MeshLambertMaterial({ color: pickRandom(rng, containerColors) }));
      mesh.scale.set(w, h, d);
      mesh.position.set(x, h / 2, z);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.addCollider(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
    }
    // Crates near the warehouse.
    for (let i = 0; i < 8; i++) {
      const size = 1.6 + rng() * 0.8;
      const crate = new THREE.Mesh(boxGeometry, new THREE.MeshLambertMaterial({ color: 0xa9834f }));
      crate.scale.set(size, size, size);
      crate.position.set(-152 + rng() * 16, size / 2, -34 + rng() * 8);
      crate.rotation.y = rng() * Math.PI;
      crate.castShadow = true;
      this.scene.add(crate);
    }
    // Billboards.
    const billboards = [
      { x: -100, z: -100, lines: ['VISIT CAYO VERDE', 'Ferries daily from Pier 9'], bg: '#2e6f9e', fg: '#ffffff' },
      { x: 100, z: 100, lines: ['MARISOL GRAND', 'Play tonight — win tomorrow'], bg: '#7a1f2b', fg: '#ffd23f' },
      { x: 140, z: -60, lines: ['TACO PIER', 'Open late on the Boardwalk'], bg: '#e4572e', fg: '#ffffff' },
      { x: -60, z: 100, lines: ['PALMS HOTEL', 'Ocean views, honest rates'], bg: '#2e6f5e', fg: '#ffffff' },
    ];
    for (const board of billboards) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 10, 8), new THREE.MeshLambertMaterial({ color: 0x555555 }));
      pole.position.set(board.x, 5, board.z);
      this.scene.add(pole);
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(14, 7),
        new THREE.MeshBasicMaterial({ map: makeBillboardTexture(board.lines, board.bg, board.fg), side: THREE.DoubleSide }),
      );
      face.position.set(board.x, 12, board.z);
      face.rotation.y = Math.PI / 4;
      this.scene.add(face);
      this.addCollider(board.x - 1, board.z - 1, board.x + 1, board.z + 1);
    }
  }

  addPalm(x, z, scale) {
    const group = new THREE.Group();
    const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8a6a48 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 7, 7), trunkMaterial);
    trunk.position.y = 3.5;
    trunk.rotation.z = 0.06;
    trunk.castShadow = true;
    group.add(trunk);
    const frondMaterial = new THREE.MeshLambertMaterial({
      map: makePalmFrondTexture(), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, color: 0xffffff,
    });
    // A flattened cone gives the canopy volume from the side; the painted
    // frond plane on top gives it leaf detail from above.
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(3.4, 1.5, 9),
      new THREE.MeshLambertMaterial({ color: 0x3d7a2c }),
    );
    canopy.position.y = 7.0;
    canopy.castShadow = true;
    group.add(canopy);
    const fronds = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 7.5), frondMaterial);
    fronds.position.y = 7.7;
    fronds.rotation.x = -Math.PI / 2;
    group.add(fronds);
    group.position.set(x, 0, z);
    group.scale.setScalar(scale);
    this.scene.add(group);
    this.addCollider(x - 0.5, z - 0.5, x + 0.5, z + 0.5);
    return group;
  }

  buildStreetProps() {
    const rng = makeRng(5150);
    const poleGeometry = new THREE.CylinderGeometry(0.16, 0.22, 7, 6);
    const poleMaterial = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
    const lampHeadGeometry = new THREE.SphereGeometry(0.45, 10, 8);
    const lampHeadMaterial = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
    const headGeometry = new THREE.BoxGeometry(0.9, 2.2, 0.9);
    const headMaterial = new THREE.MeshLambertMaterial({ color: 0x22262b });

    for (const x of STREET_COORDS) {
      for (const z of STREET_COORDS) {
        // Street lamp on alternating corners.
        if ((Math.round(x / 40) + Math.round(z / 40)) % 2 === 0) {
          const pole = new THREE.Mesh(poleGeometry, poleMaterial);
          pole.position.set(x + 8, 3.5, z + 8);
          this.scene.add(pole);
          const head = new THREE.Mesh(lampHeadGeometry, lampHeadMaterial);
          head.position.set(x + 8, 7.1, z + 8);
          this.scene.add(head);
        }
        // Traffic light on one corner of every intersection.
        const pole = new THREE.Mesh(poleGeometry, poleMaterial);
        pole.position.set(x - 8, 3.5, z - 8);
        this.scene.add(pole);
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.set(x - 8, 7.6, z - 8);
        this.scene.add(head);
        const nsLamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), this.nsLampMaterial);
        nsLamp.position.set(x - 8, 8.2, z - 8 + 0.5);
        this.scene.add(nsLamp);
        const ewLamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), this.ewLampMaterial);
        ewLamp.position.set(x - 8 + 0.5, 7.1, z - 8);
        this.scene.add(ewLamp);
        this.trafficLightGroups.push({ x, z });
      }
    }
    // Fire hydrants at scattered corners.
    const hydrantMaterial = new THREE.MeshLambertMaterial({ color: 0xc22e2e });
    for (let i = 0; i < 24; i++) {
      const x = pickRandom(rng, STREET_COORDS) + 8;
      const z = pickRandom(rng, STREET_COORDS) + 8;
      const hydrant = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.9, 8), hydrantMaterial);
      hydrant.position.set(x, 0.45, z);
      this.scene.add(hydrant);
    }
  }

  buildBeach() {
    const sandTexture = makeSandTexture();
    sandTexture.wrapS = THREE.RepeatWrapping;
    sandTexture.wrapT = THREE.RepeatWrapping;
    sandTexture.repeat.set(30, 3);
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 42),
      new THREE.MeshLambertMaterial({ map: sandTexture }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.02, 194);
    sand.receiveShadow = true;
    this.scene.add(sand);

    // Boardwalk planks.
    const boardwalk = new THREE.Mesh(
      new THREE.BoxGeometry(352, 0.4, 8),
      new THREE.MeshLambertMaterial({ color: 0x9a7a52 }),
    );
    boardwalk.position.set(0, 0.2, 176);
    boardwalk.receiveShadow = true;
    this.scene.add(boardwalk);

    // Palms and umbrellas along the sand.
    const rng = makeRng(808);
    for (let x = -170; x <= 170; x += 17) {
      this.addPalm(x + rangeRandom(rng, -3, 3), 181 + rangeRandom(rng, 0, 4), 1 + rng() * 0.3);
    }
    const umbrellaColors = [0xe4572e, 0x2e6f9e, 0xffd23f, 0x7a5fa0];
    for (let i = 0; i < 10; i++) {
      const x = -160 + i * 35 + rangeRandom(rng, -8, 8);
      const z = 196 + rangeRandom(rng, 0, 10);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
      pole.position.set(x, 1.3, z);
      this.scene.add(pole);
      const canopy = new THREE.Mesh(
        new THREE.ConeGeometry(2.4, 0.9, 10),
        new THREE.MeshLambertMaterial({ color: pickRandom(rng, umbrellaColors) }),
      );
      canopy.position.set(x, 2.8, z);
      canopy.castShadow = true;
      this.scene.add(canopy);
    }

    // Ocean: a large animated plane.
    const oceanGeometry = new THREE.PlaneGeometry(1400, 500, 48, 20);
    const oceanMaterial = new THREE.MeshPhongMaterial({
      color: 0x2e7fa8, transparent: true, opacity: 0.92, shininess: 120, specular: 0x99ccff,
    });
    this.ocean = new THREE.Mesh(oceanGeometry, oceanMaterial);
    this.ocean.rotation.x = -Math.PI / 2;
    this.ocean.position.set(0, -0.25, 215 + 250);
    this.scene.add(this.ocean);
    this.oceanBase = oceanGeometry.attributes.position.array.slice();
  }

  buildLighting() {
    const hemisphere = new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 0.85);
    this.scene.add(hemisphere);
    const sun = new THREE.DirectionalLight(0xffe0b0, 1.9);
    sun.position.set(160, 230, 90);
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.quality.shadowMapSize, this.quality.shadowMapSize);
    sun.shadow.camera.left = -130;
    sun.shadow.camera.right = 130;
    sun.shadow.camera.top = 130;
    sun.shadow.camera.bottom = -130;
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 600;
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;
  }

  addCollider(minX, minZ, maxX, maxZ) {
    this.colliders.push({ minX, minZ, maxX, maxZ });
  }

  // Push a circle out of every collider it overlaps. Returns true on any hit.
  resolveCircle(position, radius) {
    let hit = false;
    for (const box of this.colliders) {
      const closestX = Math.max(box.minX, Math.min(position.x, box.maxX));
      const closestZ = Math.max(box.minZ, Math.min(position.z, box.maxZ));
      const dx = position.x - closestX;
      const dz = position.z - closestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < radius * radius) {
        hit = true;
        if (distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const push = radius - dist;
          position.x += (dx / dist) * push;
          position.z += (dz / dist) * push;
        } else {
          // Centre inside the box: push out along the smallest penetration.
          const pushLeft = position.x - box.minX + radius;
          const pushRight = box.maxX - position.x + radius;
          const pushBack = position.z - box.minZ + radius;
          const pushFront = box.maxZ - position.z + radius;
          const min = Math.min(pushLeft, pushRight, pushBack, pushFront);
          if (min === pushLeft) position.x = box.minX - radius;
          else if (min === pushRight) position.x = box.maxX + radius;
          else if (min === pushBack) position.z = box.minZ - radius;
          else position.z = box.maxZ + radius;
        }
      }
    }
    return hit;
  }

  isOnRoad(x, z) {
    for (const coord of STREET_COORDS) {
      if (Math.abs(x - coord) <= STREET_HALF_WIDTH || Math.abs(z - coord) <= STREET_HALF_WIDTH) {
        if (Math.abs(x) <= CITY_LIMIT + 6 && Math.abs(z) <= CITY_LIMIT + 6) return true;
      }
    }
    return false;
  }

  lightPhase() {
    return (this.lightPhaseTime % (this.lightPhaseLength * 2)) < this.lightPhaseLength ? 'ns' : 'ew';
  }

  update(dt, elapsed, focusX, focusZ) {
    this.lightPhaseTime += dt;
    const phase = this.lightPhase();
    this.nsLampMaterial.color.setHex(phase === 'ns' ? 0x33dd55 : 0xdd3333);
    this.ewLampMaterial.color.setHex(phase === 'ew' ? 0x33dd55 : 0xdd3333);
    for (const cloud of this.clouds) {
      cloud.position.x += cloud.userData.drift * dt;
      if (cloud.position.x > 560) cloud.position.x = -560;
    }
    if (this.ocean) {
      const positions = this.ocean.geometry.attributes.position;
      const base = this.oceanBase;
      for (let i = 0; i < positions.count; i++) {
        const bx = base[i * 3];
        const by = base[i * 3 + 1];
        positions.array[i * 3 + 2] = Math.sin(bx * 0.08 + elapsed * 0.9) * 0.35 + Math.cos(by * 0.11 + elapsed * 0.6) * 0.3;
      }
      positions.needsUpdate = true;
      this.ocean.geometry.computeVertexNormals();
    }
    if (this.sun) {
      this.sun.position.set(focusX + 160, 230, focusZ + 90);
      this.sun.target.position.set(focusX, 0, focusZ);
      this.sun.target.updateMatrixWorld();
    }
  }
}

// Juice: pooled particles, smoke puffs, skid marks, muzzle flashes, tracers
// and explosions. Everything is geometry and sprites — no textures loaded.
import * as THREE from 'three';
import { makeSoftCircleTexture } from './textures.js';

const MAX_PARTICLES = 600;
const MAX_SKIDS = 220;

export class EffectsSystem {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.smokes = [];
    this.skids = [];
    this.tracers = [];
    this.flashes = [];
    const geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.42, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.smokeTexture = makeSoftCircleTexture('rgba(200,200,200,0.85)', 'rgba(200,200,200,0)');
    this.flashTexture = makeSoftCircleTexture('rgba(255,240,180,1)', 'rgba(255,140,40,0)');
    this.skidMaterial = new THREE.MeshBasicMaterial({ color: 0x141414, transparent: true, opacity: 0.55, depthWrite: false });
    this.skidGeometry = new THREE.PlaneGeometry(0.35, 1.1);
  }

  spawnBurst(position, colorHex, count, speed, life, gravity, up) {
    const color = new THREE.Color(colorHex);
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const direction = new THREE.Vector3(Math.random() - 0.5, Math.random() * (up || 0.8), Math.random() - 0.5).normalize();
      this.particles.push({
        position: position.clone(),
        velocity: direction.multiplyScalar(speed * (0.4 + Math.random() * 0.8)),
        life: life * (0.6 + Math.random() * 0.7),
        maxLife: life,
        gravity: gravity === undefined ? 9 : gravity,
        color,
      });
    }
  }

  spawnSmoke(position, scale) {
    const material = new THREE.SpriteMaterial({ map: this.smokeTexture, transparent: true, opacity: 0.55, depthWrite: false, color: 0x555555 });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.setScalar(scale);
    this.scene.add(sprite);
    this.smokes.push({ sprite, life: 1.1, maxLife: 1.1, grow: 2.2, rise: 1.4 });
  }

  spawnSkidMark(position, heading) {
    const mesh = new THREE.Mesh(this.skidGeometry, this.skidMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = -heading;
    mesh.position.set(position.x, 0.09, position.z);
    this.scene.add(mesh);
    this.skids.push({ mesh, life: 9 });
    if (this.skids.length > MAX_SKIDS) {
      const old = this.skids.shift();
      this.scene.remove(old.mesh);
    }
  }

  spawnMuzzleFlash(position) {
    const material = new THREE.SpriteMaterial({ map: this.flashTexture, transparent: true, opacity: 1, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.setScalar(1.1);
    this.scene.add(sprite);
    this.flashes.push({ sprite, life: 0.06, maxLife: 0.06 });
  }

  spawnTracer(from, to, colorHex) {
    const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
    const material = new THREE.LineBasicMaterial({ color: colorHex || 0xffe9a8, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geometry, material);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.07, maxLife: 0.07 });
  }

  spawnExplosion(position) {
    this.spawnBurst(position, 0xff7a2a, 46, 11, 0.8, 7, 1.2);
    this.spawnBurst(position, 0xffd23f, 26, 8, 0.5, 5, 1.0);
    this.spawnBurst(position, 0x333333, 30, 6, 1.4, 2, 1.4);
    for (let i = 0; i < 5; i++) {
      const offset = position.clone();
      offset.x += (Math.random() - 0.5) * 2;
      offset.z += (Math.random() - 0.5) * 2;
      offset.y += Math.random() * 1.5;
      this.spawnSmoke(offset, 2.4);
    }
    const light = new THREE.PointLight(0xff8a3d, 60, 30, 1.8);
    light.position.copy(position);
    light.position.y = 2;
    this.scene.add(light);
    this.flashes.push({ light, life: 0.35, maxLife: 0.35 });
  }

  spawnSparks(position) {
    this.spawnBurst(position, 0xffd98a, 10, 7, 0.35, 12, 0.7);
  }

  update(dt) {
    // Particles.
    let count = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.life -= dt;
      if (particle.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      particle.velocity.y -= particle.gravity * dt;
      particle.position.addScaledVector(particle.velocity, dt);
      if (particle.position.y < 0.05) {
        particle.position.y = 0.05;
        particle.velocity.y = 0;
      }
    }
    for (const particle of this.particles) {
      this.positions[count * 3] = particle.position.x;
      this.positions[count * 3 + 1] = particle.position.y;
      this.positions[count * 3 + 2] = particle.position.z;
      const fade = particle.life / particle.maxLife;
      this.colors[count * 3] = particle.color.r * fade + 0.05;
      this.colors[count * 3 + 1] = particle.color.g * fade + 0.05;
      this.colors[count * 3 + 2] = particle.color.b * fade + 0.05;
      count++;
    }
    this.points.geometry.setDrawRange(0, count);
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    // Smoke.
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const smoke = this.smokes[i];
      smoke.life -= dt;
      if (smoke.life <= 0) {
        this.scene.remove(smoke.sprite);
        this.smokes.splice(i, 1);
        continue;
      }
      smoke.sprite.position.y += smoke.rise * dt;
      smoke.sprite.scale.addScalar(smoke.grow * dt);
      smoke.sprite.material.opacity = 0.55 * (smoke.life / smoke.maxLife);
    }
    // Skid marks fade slowly.
    for (let i = this.skids.length - 1; i >= 0; i--) {
      const skid = this.skids[i];
      skid.life -= dt;
      if (skid.life <= 0) {
        this.scene.remove(skid.mesh);
        this.skids.splice(i, 1);
      }
    }
    // Tracers.
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tracer = this.tracers[i];
      tracer.life -= dt;
      if (tracer.life <= 0) {
        this.scene.remove(tracer.line);
        tracer.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
    // Flashes and explosion lights.
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const flash = this.flashes[i];
      flash.life -= dt;
      if (flash.life <= 0) {
        if (flash.sprite) this.scene.remove(flash.sprite);
        if (flash.light) this.scene.remove(flash.light);
        this.flashes.splice(i, 1);
        continue;
      }
      if (flash.light) flash.light.intensity = 60 * (flash.life / flash.maxLife);
    }
  }
}

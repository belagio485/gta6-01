// Third-person chase camera: follows behind the player's heading, eases into
// place, lets the mouse look around, pulls in near buildings and kicks the
// field of view with speed. Also carries screen shake.
import * as THREE from 'three';
import { clamp, damp, dampAngle } from './utils.js';

export class CameraController {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI;
    this.pitch = 0.32;
    this.distance = 9;
    this.targetDistance = 9;
    this.shake = 0;
    this.lookYawOffset = 0;
    this.lookPitchOffset = 0;
    this.lockLookOffset = false;
    this.position = new THREE.Vector3(0, 6, -12);
    this.menuOrbit = 0;
  }

  addShake(amount) {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  // Place the camera directly behind the focus, with no easing: used when
  // play begins, after a respawn or teleport, so the first frame is framed.
  snapTo(focus, heading) {
    this.yaw = heading + Math.PI;
    this.lookYawOffset = 0;
    this.lookPitchOffset = 0;
    this.lockLookOffset = false;
    const height = 2.2 + this.distance * Math.sin(this.pitch);
    const horizontal = this.distance * Math.cos(this.pitch);
    this.position.set(
      focus.x + Math.sin(this.yaw) * horizontal,
      Math.max(focus.y + height, 1.1),
      focus.z + Math.cos(this.yaw) * horizontal,
    );
    this.camera.position.copy(this.position);
    this.camera.lookAt(focus.x, focus.y + 1.55, focus.z);
  }

  cycleDistance() {
    this.targetDistance = this.targetDistance < 8 ? 12 : this.targetDistance < 11 ? 7 : 9;
  }

  updateMenuCamera(dt, center) {
    this.menuOrbit += dt * 0.06;
    const radius = 55;
    const x = center.x + Math.sin(this.menuOrbit) * radius;
    const z = center.z + Math.cos(this.menuOrbit) * radius;
    this.camera.position.set(x, 26, z);
    this.camera.lookAt(center.x, 4, center.z);
    this.camera.fov = 55;
    this.camera.updateProjectionMatrix();
  }

  update(dt, input, focus, heading, speed, driving) {
    // Mouse look: pointer-lock deltas orbit, and decay back behind the action.
    if (input.mouseDX !== 0 || input.mouseDY !== 0) {
      this.lookYawOffset -= input.mouseDX * 0.0026;
      this.lookPitchOffset = clamp(this.lookPitchOffset + input.mouseDY * 0.002, -0.25, 0.45);
    } else if (!this.lockLookOffset) {
      this.lookYawOffset = damp(this.lookYawOffset, 0, 1.1, dt);
      this.lookPitchOffset = damp(this.lookPitchOffset, 0, 1.1, dt);
    }
    if (input.wheelDelta !== 0) {
      this.targetDistance = clamp(this.targetDistance + Math.sign(input.wheelDelta) * 1.5, 5, 16);
    }
    const desiredYaw = heading + Math.PI + this.lookYawOffset;
    this.yaw = dampAngle(this.yaw, desiredYaw, driving ? 3.2 : 5.5, dt);
    this.distance = damp(this.distance, this.targetDistance, 4, dt);
    const pitch = this.pitch + this.lookPitchOffset;
    const height = 2.2 + this.distance * Math.sin(pitch);
    const horizontal = this.distance * Math.cos(pitch);
    const desired = new THREE.Vector3(
      focus.x + Math.sin(this.yaw) * horizontal,
      focus.y + height,
      focus.z + Math.cos(this.yaw) * horizontal,
    );
    // Never let the camera sink under the street.
    desired.y = Math.max(desired.y, 1.1);
    this.position.lerp(desired, Math.min(1, 9 * dt));
    this.shake = Math.max(0, this.shake - dt * 2.4);
    const shakeOffset = new THREE.Vector3();
    if (this.shake > 0) {
      shakeOffset.set(
        (Math.random() - 0.5) * this.shake * 0.5,
        (Math.random() - 0.5) * this.shake * 0.4,
        (Math.random() - 0.5) * this.shake * 0.5,
      );
    }
    this.camera.position.copy(this.position).add(shakeOffset);
    const lookAt = new THREE.Vector3(focus.x, focus.y + (driving ? 1.4 : 1.55), focus.z);
    this.camera.lookAt(lookAt);
    const targetFov = 55 + clamp(speed / 40, 0, 1) * 13;
    this.camera.fov = damp(this.camera.fov, targetFov, 3, dt);
    this.camera.updateProjectionMatrix();
  }
}

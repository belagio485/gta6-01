// Keyboard and mouse input: held keys, edge-triggered presses, mouse deltas.
export class InputManager {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDown = false;
    this.mousePressed = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelDelta = 0;
    this.pointerLocked = false;
    this.anyKey = false;

    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      this.keys.add(event.code);
      this.pressed.add(event.code);
      this.anyKey = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
        event.preventDefault();
      }
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
    });
    document.addEventListener('mousemove', (event) => {
      if (this.pointerLocked) {
        this.mouseDX += event.movementX || 0;
        this.mouseDY += event.movementY || 0;
      }
    });
    document.addEventListener('mousedown', (event) => {
      // Only clicks that land on the game canvas count as fire input, so
      // clicking a menu button never discharges the player's weapon.
      if (event.button === 0 && event.target instanceof HTMLCanvasElement) {
        this.mouseDown = true;
        this.mousePressed = true;
      }
    });
    document.addEventListener('mouseup', (event) => {
      if (event.button === 0) this.mouseDown = false;
    });
    document.addEventListener('wheel', (event) => {
      this.wheelDelta += event.deltaY;
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement != null;
    });
  }

  isDown(code) {
    return this.keys.has(code);
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  axis(negativeCode, positiveCode) {
    return (this.isDown(positiveCode) ? 1 : 0) - (this.isDown(negativeCode) ? 1 : 0);
  }

  requestPointerLock(element) {
    if (!this.pointerLocked && element && element.requestPointerLock) {
      try {
        const result = element.requestPointerLock();
        if (result && result.catch) result.catch(() => {});
      } catch (error) {
        // Pointer lock is a nicety, not a requirement.
      }
    }
  }

  releasePointerLock() {
    if (this.pointerLocked) document.exitPointerLock();
  }

  endFrame() {
    this.pressed.clear();
    this.mousePressed = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelDelta = 0;
    this.anyKey = false;
  }
}

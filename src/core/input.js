import * as THREE from 'three';

// Keyboard + mouse state. Keys use KeyboardEvent.code ('KeyW', 'Space', 'Escape').
export class Input {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.camera = camera;
    this.down = new Set();
    this.justPressed = new Set();
    this.mouseButtons = new Set();      // 0 = left, 2 = right
    this.mousePx = new THREE.Vector2(innerWidth / 2, innerHeight / 2);
    this.ndc = new THREE.Vector2();
    this.mouseGround = new THREE.Vector3(); // world point under the cursor on y = 0
    this.wheel = 0;
    this._ray = new THREE.Raycaster();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.justPressed.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => { this.down.clear(); this.mouseButtons.clear(); });
    addEventListener('mousemove', (e) => this.mousePx.set(e.clientX, e.clientY));
    canvas.addEventListener('mousedown', (e) => { this.mouseButtons.add(e.button); });
    addEventListener('mouseup', (e) => this.mouseButtons.delete(e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  }

  isDown(code) { return this.down.has(code); }
  pressed(code) { return this.justPressed.has(code); }
  mouse(button) { return this.mouseButtons.has(button); }

  // Call once per frame before game update.
  update() {
    this.ndc.set((this.mousePx.x / innerWidth) * 2 - 1, -(this.mousePx.y / innerHeight) * 2 + 1);
    this._ray.setFromCamera(this.ndc, this.camera);
    this._ray.ray.intersectPlane(this._plane, this.mouseGround);
  }
  // Call once per frame after game update.
  endFrame() { this.justPressed.clear(); this.wheel = 0; }
}

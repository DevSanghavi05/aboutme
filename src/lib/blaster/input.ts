// Blaster Duel — keyboard + mouse + touch input capture.
//
// Desktop: WASD/arrows move, mouse aims, left-click / space fires, R reloads.
// Touch:   left-half virtual joystick moves; right-half drag aims and fires.
// Everything funnels into the same InputState the network layer sends, so the
// touch path exercises the identical authoritative pipeline as mouse/keyboard.

export interface StickView {
  active: boolean;
  ox: number;
  oy: number;
  cx: number;
  cy: number;
}

const MOVE_KEYS = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"]);
const MOVE_DEADZONE = 14;
const AIM_DEADZONE = 12;

export class InputController {
  private canvas: HTMLElement | null = null;
  private keys = new Set<string>();
  private enabled = false;

  fireDown = false; // mouse / space
  reloadDown = false;
  mouseX = 0;
  mouseY = 0;

  isTouch = false;
  aimActive = false;
  aimAngle = 0;
  touchFiring = false;

  // Virtual joystick views (CSS px) for on-screen rendering.
  moveStick: StickView = { active: false, ox: 0, oy: 0, cx: 0, cy: 0 };
  aimStick: StickView = { active: false, ox: 0, oy: 0, cx: 0, cy: 0 };

  private moveId: number | null = null;
  private aimId: number | null = null;
  private moveVec = { x: 0, y: 0 };

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    const k = e.key.toLowerCase();
    if (MOVE_KEYS.has(k) || k === "r" || k === " ") {
      this.keys.add(k);
      if (k === "r") this.reloadDown = true;
      if (k === " ") this.fireDown = true;
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.keys.delete(k);
    if (k === "r") this.reloadDown = false;
    if (k === " ") this.fireDown = false;
  };

  private localPoint(e: PointerEvent) {
    const rect = this.canvas!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onPointerDown = (e: PointerEvent) => {
    if (!this.canvas) return;
    const p = this.localPoint(e);
    if (e.pointerType === "touch") {
      this.isTouch = true;
      const rect = this.canvas.getBoundingClientRect();
      if (p.x < rect.width / 2 && this.moveId === null) {
        this.moveId = e.pointerId;
        this.moveStick = { active: true, ox: p.x, oy: p.y, cx: p.x, cy: p.y };
      } else if (this.aimId === null) {
        // Right side is a fire button (aim is automatic).
        this.aimId = e.pointerId;
        this.aimStick = { active: true, ox: p.x, oy: p.y, cx: p.x, cy: p.y };
        this.touchFiring = true;
      }
      e.preventDefault();
      return;
    }
    // Mouse.
    this.mouseX = p.x;
    this.mouseY = p.y;
    if (e.button === 0) this.fireDown = true;
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.canvas) return;
    const p = this.localPoint(e);
    if (e.pointerType === "touch") {
      if (e.pointerId === this.moveId) {
        this.moveStick.cx = p.x;
        this.moveStick.cy = p.y;
        const dx = p.x - this.moveStick.ox;
        const dy = p.y - this.moveStick.oy;
        const len = Math.hypot(dx, dy);
        if (len > MOVE_DEADZONE) {
          this.moveVec = { x: dx / len, y: dy / len };
        } else {
          this.moveVec = { x: 0, y: 0 };
        }
      } else if (e.pointerId === this.aimId) {
        this.aimStick.cx = p.x;
        this.aimStick.cy = p.y;
        const dx = p.x - this.aimStick.ox;
        const dy = p.y - this.aimStick.oy;
        if (Math.hypot(dx, dy) > AIM_DEADZONE) {
          this.aimActive = true;
          this.aimAngle = Math.atan2(dy, dx);
          this.touchFiring = true;
        }
      }
      e.preventDefault();
      return;
    }
    this.mouseX = p.x;
    this.mouseY = p.y;
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === "touch") {
      if (e.pointerId === this.moveId) {
        this.moveId = null;
        this.moveVec = { x: 0, y: 0 };
        this.moveStick.active = false;
      } else if (e.pointerId === this.aimId) {
        this.aimId = null;
        this.aimActive = false;
        this.touchFiring = false;
        this.aimStick.active = false;
      }
      return;
    }
    if (e.button === 0) this.fireDown = false;
  };

  private onContextMenu = (e: Event) => e.preventDefault();
  private onBlur = () => this.reset();

  attach(canvas: HTMLElement) {
    this.canvas = canvas;
    this.enabled = true;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("contextmenu", this.onContextMenu);
  }

  detach() {
    this.enabled = false;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    if (this.canvas) {
      this.canvas.removeEventListener("pointermove", this.onPointerMove);
      this.canvas.removeEventListener("pointerdown", this.onPointerDown);
      this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    }
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas = null;
    this.reset();
  }

  reset() {
    this.keys.clear();
    this.fireDown = false;
    this.reloadDown = false;
    this.touchFiring = false;
    this.aimActive = false;
    this.moveVec = { x: 0, y: 0 };
    this.moveId = null;
    this.aimId = null;
    this.moveStick.active = false;
    this.aimStick.active = false;
  }

  private keyUp() {
    return this.keys.has("w") || this.keys.has("arrowup");
  }
  private keyDown() {
    return this.keys.has("s") || this.keys.has("arrowdown");
  }
  private keyLeft() {
    return this.keys.has("a") || this.keys.has("arrowleft");
  }
  private keyRight() {
    return this.keys.has("d") || this.keys.has("arrowright");
  }

  get up() {
    return this.keyUp() || this.moveVec.y < -0.4;
  }
  get down() {
    return this.keyDown() || this.moveVec.y > 0.4;
  }
  get left() {
    return this.keyLeft() || this.moveVec.x < -0.4;
  }
  get right() {
    return this.keyRight() || this.moveVec.x > 0.4;
  }
  get firing() {
    return this.fireDown || this.touchFiring;
  }
}

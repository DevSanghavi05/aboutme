// Blaster Duel — canvas renderer (flat grey theme, no glows).
//
// Draws the arena, obstacles, shrinking hazard zone, both cartoon fighters with
// their blasters, energy projectiles, a light particle system and screen shake.
// Pure drawing: it reads a RenderState each frame and never mutates game state.

import { ARENA, BLASTER, OBSTACLES, PLAYER } from "./protocol";
import type { RenderState } from "./net";
import type { Seat } from "./protocol";

const COLORS = {
  me: "#4b8bff",
  meDark: "#2f6bef",
  foe: "#ff6f45",
  foeDark: "#e8552b",
  meShot: "#5aa0ff",
  foeShot: "#ffa06a",
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  drag: number;
}

interface Transform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private cssW = 1;
  private cssH = 1;
  private particles: Particle[] = [];
  private shake = 0;
  private transform: Transform = { scale: 1, offsetX: 0, offsetY: 0 };
  private time = 0;

  private flash: Record<Seat, number> = { a: 0, b: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    this.ctx = ctx;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cssW = Math.max(1, rect.width);
    this.cssH = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.computeTransform();
  }

  private computeTransform() {
    const pad = 8;
    const availW = this.cssW - pad * 2;
    const availH = this.cssH - pad * 2;
    const scale = Math.min(availW / ARENA.width, availH / ARENA.height);
    this.transform = {
      scale,
      offsetX: (this.cssW - ARENA.width * scale) / 2,
      offsetY: (this.cssH - ARENA.height * scale) / 2,
    };
  }

  getTransform() {
    return this.transform;
  }

  screenToWorld(sx: number, sy: number) {
    return {
      x: (sx - this.transform.offsetX) / this.transform.scale,
      y: (sy - this.transform.offsetY) / this.transform.scale,
    };
  }

  addShake(amount: number) {
    this.shake = Math.min(this.shake + amount, 24);
  }

  triggerFlash(seat: Seat) {
    this.flash[seat] = 140;
  }

  // --- Particle emitters (world coordinates) ---
  private emit(p: Particle) {
    if (this.particles.length < 360) this.particles.push(p);
  }

  muzzleFlash(x: number, y: number, aim: number, mine: boolean) {
    const color = mine ? COLORS.meShot : COLORS.foeShot;
    for (let i = 0; i < 5; i++) {
      const a = aim + (Math.random() - 0.5) * 0.7;
      const speed = 120 + Math.random() * 200;
      this.emit({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0.14 + Math.random() * 0.1,
        maxLife: 0.24,
        size: 2 + Math.random() * 2,
        color,
        drag: 4,
      });
    }
  }

  impactBurst(x: number, y: number, mine: boolean, big: boolean) {
    const color = mine ? COLORS.meShot : COLORS.foeShot;
    const n = big ? 18 : 10;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = (big ? 150 : 80) + Math.random() * (big ? 300 : 160);
      this.emit({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0.28 + Math.random() * 0.3,
        maxLife: 0.58,
        size: 2 + Math.random() * 2.5,
        color,
        drag: 3,
      });
    }
  }

  wallSpark(x: number, y: number, mine: boolean) {
    const color = mine ? COLORS.meShot : COLORS.foeShot;
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 120;
      this.emit({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0.14 + Math.random() * 0.16,
        maxLife: 0.3,
        size: 1.5 + Math.random() * 1.5,
        color,
        drag: 5,
      });
    }
  }

  deathBurst(x: number, y: number, seat: Seat) {
    const color = seat === "a" ? COLORS.me : COLORS.foe;
    for (let i = 0; i < 34; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 120 + Math.random() * 420;
      this.emit({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0.5 + Math.random() * 0.4,
        maxLife: 0.9,
        size: 2.5 + Math.random() * 3,
        color,
        drag: 2.4,
      });
    }
  }

  private updateParticles(dt: number) {
    const next: Particle[] = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      next.push(p);
    }
    this.particles = next;
  }

  update(dt: number) {
    this.time += dt;
    this.updateParticles(dt);
    this.shake *= Math.exp(-9 * dt);
    if (this.shake < 0.15) this.shake = 0;
    for (const seat of ["a", "b"] as Seat[]) {
      this.flash[seat] = Math.max(0, this.flash[seat] - dt * 1000);
    }
  }

  /** Draw a static arena backdrop for menu / non-match screens. */
  drawIdle() {
    const ctx = this.ctx;
    this.computeTransform();
    const { scale, offsetX, offsetY } = this.transform;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    ctx.fillStyle = "#1e2024";
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    this.drawArena({ bounds: { minX: 0, minY: 0, maxX: ARENA.width, maxY: ARENA.height } } as RenderState);
    this.drawObstacles();
    ctx.restore();
  }

  draw(state: RenderState) {
    const ctx = this.ctx;
    this.computeTransform();
    const { scale, offsetX, offsetY } = this.transform;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);

    // Grey backdrop behind the letterboxed arena.
    ctx.fillStyle = "#1e2024";
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    ctx.save();
    const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    ctx.translate(offsetX + sx, offsetY + sy);
    ctx.scale(scale, scale);

    this.drawArena(state);
    this.drawObstacles();
    this.drawProjectiles(state);
    this.drawPlayer(state, "foe");
    this.drawPlayer(state, "me");
    this.drawParticles();

    ctx.restore();
  }

  private drawArena(state: RenderState) {
    const ctx = this.ctx;
    // Flat grey arena floor.
    ctx.fillStyle = "#34373d";
    ctx.beginPath();
    ctx.roundRect(0, 0, ARENA.width, ARENA.height, 16);
    ctx.fill();

    // Subtle grid.
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, ARENA.width, ARENA.height, 16);
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1.5;
    for (let x = 0; x <= ARENA.width; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ARENA.height);
      ctx.stroke();
    }
    for (let y = 0; y <= ARENA.height; y += 80) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(ARENA.width, y);
      ctx.stroke();
    }
    ctx.restore();

    // Shrinking hazard zone: dim the area outside the playable rectangle.
    const b = state.bounds;
    const shrunk = b.minX > 0 || b.minY > 0 || b.maxX < ARENA.width || b.maxY < ARENA.height;
    if (shrunk) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(0, 0, ARENA.width, ARENA.height, 16);
      ctx.rect(b.maxX, b.minY, -(b.maxX - b.minX), b.maxY - b.minY);
      ctx.fillStyle = "rgba(190, 70, 60, 0.14)";
      ctx.fill("evenodd");
      ctx.restore();

      // Static (no pulsing) playable border.
      ctx.save();
      ctx.strokeStyle = "rgba(210, 90, 78, 0.7)";
      ctx.lineWidth = 3;
      ctx.setLineDash([16, 12]);
      ctx.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
      ctx.restore();
    }
  }

  private drawObstacles() {
    const ctx = this.ctx;
    for (const o of OBSTACLES) {
      ctx.beginPath();
      ctx.roundRect(o.x, o.y, o.w, o.h, 8);
      ctx.fillStyle = "#474b54";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#2a2d33";
      ctx.stroke();
    }
  }

  private drawProjectiles(state: RenderState) {
    const ctx = this.ctx;
    for (const p of state.projectiles) {
      const mine = p.owner === state.mySeat;
      const color = mine ? COLORS.meShot : COLORS.foeShot;
      const r = BLASTER.projectileRadius;
      // Short flat trail.
      const speed = Math.hypot(p.vx, p.vy) || 1;
      const tx = p.x - (p.vx / speed) * 16;
      const ty = p.y - (p.vy / speed) * 16;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = r * 1.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      // Solid core with outline.
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(20,22,26,0.55)";
      ctx.stroke();
    }
  }

  private drawPlayer(state: RenderState, which: "me" | "foe") {
    const ctx = this.ctx;
    const player = which === "me" ? state.me : state.foe;
    const seat: Seat = which === "me" ? state.mySeat : state.mySeat === "a" ? "b" : "a";
    const base = which === "me" ? COLORS.me : COLORS.foe;
    const dark = which === "me" ? COLORS.meDark : COLORS.foeDark;
    const r = PLAYER.radius;
    const { x, y, aim } = player;

    if (!player.alive) ctx.globalAlpha = 0.35;

    // Soft ground shadow.
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.85, r * 0.95, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Blaster (flat).
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(aim);
    ctx.fillStyle = "#d7dbe2";
    ctx.beginPath();
    ctx.roundRect(r * 0.2, -6, r * 1.35, 12, 4);
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.roundRect(r * 1.1, -7.5, 10, 15, 3);
    ctx.fill();
    ctx.restore();

    // Body (flat fill + outline).
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = dark;
    ctx.stroke();

    // Eyes (look toward aim).
    const ex = Math.cos(aim) * r * 0.32;
    const ey = Math.sin(aim) * r * 0.32;
    const perpX = Math.cos(aim + Math.PI / 2);
    const perpY = Math.sin(aim + Math.PI / 2);
    for (const s of [-1, 1]) {
      const cx = x + ex + perpX * s * r * 0.34;
      const cy = y + ey + perpY * s * r * 0.34;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#20242c";
      ctx.beginPath();
      ctx.arc(cx + Math.cos(aim) * r * 0.09, cy + Math.sin(aim) * r * 0.09, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hit flash overlay.
    if (this.flash[seat] > 0) {
      ctx.globalAlpha = (this.flash[seat] / 140) * 0.75;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Reload ring.
    if (player.reloading) {
      const prog = 1 - player.reloadRemainMs / BLASTER.reloadMs;
      ctx.strokeStyle = base;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r + 8, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
      ctx.stroke();
    }

    // "YOU" chevron.
    if (which === "me" && player.alive) {
      ctx.fillStyle = base;
      ctx.beginPath();
      const cy = y - r - 16;
      ctx.moveTo(x, cy + 8);
      ctx.lineTo(x - 8, cy - 4);
      ctx.lineTo(x + 8, cy - 4);
      ctx.closePath();
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  private drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

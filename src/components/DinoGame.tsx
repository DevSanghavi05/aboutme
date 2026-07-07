"use client";
import { useEffect, useRef } from "react";

interface Props { onMenu: () => void; }

interface Obstacle {
  type: 'cactus' | 'rock' | 'bird' | 'swoopBird';
  x: number; w: number; h: number; y: number; seed: number;
  variant?: 'small' | 'large' | 'cluster';
  state?: 'cruising' | 'swooping' | 'low' | 'rising';
  timer?: number;
}
interface PowerUp { x: number; y: number; w: number; h: number; type: 'shield' | 'multiplier' | 'doublejump'; }
interface Cloud { x: number; y: number; speed: number; w: number; h: number; alpha: number; }

/**
 * 8-BIT COLOR PIXELS - MYSTERY BOX EDITION
 * Ported into the mini-arcade from the standalone HTML game.
 */
export function DinoGame({ onMenu }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    if (!ctx) return;

    canvas.width = 400;
    canvas.height = 150;

    let rafId = 0;

    // --- 8-bit sound effects (Web Audio, no files needed) ---
    let audioCtx: AudioContext | null = null;
    let muted = false;
    function ensureAudio() {
      if (!audioCtx) {
        try {
          const Ctor = window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          audioCtx = Ctor ? new Ctor() : null;
        } catch { audioCtx = null; }
      }
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    }
    function tone(delay: number, freq: number, endFreq: number, dur: number, vol: number, type?: OscillatorType) {
      if (!audioCtx || muted) return;
      try {
        const t = audioCtx.currentTime + delay;
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = type || 'square';
        osc.frequency.setValueAtTime(freq, t);
        if (endFreq) osc.frequency.linearRampToValueAtTime(endFreq, t + dur);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g); g.connect(audioCtx.destination);
        osc.start(t); osc.stop(t + dur + 0.02);
      } catch { /* ignore */ }
    }
    const sfx = {
      jump()  { tone(0, 200, 420, 0.12, 0.06); },
      djump() { tone(0, 330, 660, 0.10, 0.06); },
      die()   { tone(0, 320, 200, 0.14, 0.08); tone(0.12, 200, 90, 0.3, 0.08); },
      power() { tone(0, 523, 0, 0.07, 0.05); tone(0.07, 659, 0, 0.07, 0.05); tone(0.14, 784, 0, 0.12, 0.05); },
      zap()   { tone(0, 620, 120, 0.09, 0.05, 'sawtooth'); },
      score() { tone(0, 880, 0, 0.06, 0.04); tone(0.07, 1175, 0, 0.09, 0.04); },
    };

    // Safe localStorage wrappers so the game still runs in sandboxed previews
    function loadHighScore() {
      try { return Number(localStorage.getItem('dinoColorPixelHS_v7')) || 0; } catch { return 0; }
    }
    function saveHighScore(v: number) {
      try { localStorage.setItem('dinoColorPixelHS_v7', String(v)); } catch { /* ignore */ }
    }

    let score = 0;
    let nextMilestone = 100;
    let highScore = loadHighScore();
    const baseSpeed = 4.0;
    let gameSpeed = baseSpeed;
    let isGameOver = false;
    const isPaused = false;
    let frameCount = 0;

    let groundScrollX = 0;
    let mountainScrollX = 0;
    let mountainScrollX2 = 0;

    const GROUND_Y = 125;
    const keys: Record<string, boolean> = {};

    const dino = {
      x: 30, y: GROUND_Y - 22, w: 24, h: 22,
      duckW: 34, duckH: 14, dy: 0,
      jumpForce: 7.2, gravity: 0.52, grounded: true,
      isDucking: false,
      invincibleTimer: 0,
      multiplierTimer: 0,
      doubleJumpTimer: 0,
      airJumpUsed: false,
    };

    let obstacles: Obstacle[] = [];
    let clouds: Cloud[] = [];
    let powerUps: PowerUp[] = [];

    // Time-of-day keyframes: day -> sunset -> night -> sunrise, blended at the edges
    const themes = [
      { bg: '#70d6ff', ground: '#e9ecef', groundDetail: '#adb5bd', groundDark: '#868e96', grass: '#57cc99', mountain: '#ff70a6', mountainShade: '#d6538a', mountainFar: '#f8a8c8', snow: '#ffffff', sun: '#ffe9a8', sunCore: '#fff6d8', sunShade: '#ffd166' },
      { bg: '#ff9d6f', ground: '#f3d9c2', groundDetail: '#c9a284', groundDark: '#9c7a5f', grass: '#7bab72', mountain: '#a84a7c', mountainShade: '#823a62', mountainFar: '#f7a488', snow: '#ffd9c4', sun: '#ff9548', sunCore: '#ffd08a', sunShade: '#e86a2f' },
      { bg: '#231942', ground: '#5e548e', groundDetail: '#9f86c0', groundDark: '#443a73', grass: '#5e9c82', mountain: '#3a2b68', mountainShade: '#271c4a', mountainFar: '#2c2050', snow: '#a99bd8', sun: '#b9a8e0', sunCore: '#e2d8f5', sunShade: '#8a76c2' },
      { bg: '#f9a3b5', ground: '#f4e3e7', groundDetail: '#c5a3ad', groundDark: '#977884', grass: '#66bd8f', mountain: '#e87ba8', mountainShade: '#b85684', mountainFar: '#f9c1d0', snow: '#fff0f4', sun: '#ffb17a', sunCore: '#ffe3c2', sunShade: '#f28d5c' },
    ];
    const PHASE_LEN = 120;   // score spent in each phase
    let phaseIndex = 0;      // 0 day, 1 sunset, 2 night, 3 sunrise
    let phaseT = 0;          // progress through the current phase, 0..1

    function mixHex(h1: string, h2: string, t: number) {
      const r1 = parseInt(h1.slice(1, 3), 16), g1 = parseInt(h1.slice(3, 5), 16), b1 = parseInt(h1.slice(5, 7), 16);
      const r2 = parseInt(h2.slice(1, 3), 16), g2 = parseInt(h2.slice(3, 5), 16), b2 = parseInt(h2.slice(5, 7), 16);
      return 'rgb(' + Math.round(r1 + (r2 - r1) * t) + ',' + Math.round(g1 + (g2 - g1) * t) + ',' + Math.round(b1 + (b2 - b1) * t) + ')';
    }

    type Theme = (typeof themes)[number];
    function currentTheme(): Theme {
      const a = themes[phaseIndex], b = themes[(phaseIndex + 1) % 4];
      const t = (phaseT - 0.7) / 0.3;   // hold each look, then ease into the next
      if (t <= 0) return a;
      const out = {} as Theme;
      for (const k in a) (out as Record<string, string>)[k] = mixHex((a as Record<string, string>)[k], (b as Record<string, string>)[k], Math.min(1, t));
      return out;
    }

    const colors = {
      moon: '#d8d0f0', moonShade: '#b4a7de',
      dino: '#ffbe0b',
      dinoShade: '#d99a00',
      dinoBelly: '#ffdd77',
      cactus: '#06d6a0', cactusShade: '#059d76', cactusSpine: '#d9fff2', cactusFlower: '#ff70a6',
      rock: '#ff477e', rockShade: '#c92a5d', rockLight: '#ff85a8',
      bird: '#118ab2', birdShade: '#0b6485', birdBeak: '#ffbe0b', birdBeakShade: '#d99a00',
      swoopBird: '#d90429', swoopBirdShade: '#9d0220',
      mysteryBox: '#fee440',
      mysteryCore: '#f15bb5',
      shieldAura: '#00f5d4',
      multiplierAura: '#f72585',
      doubleJumpAura: '#7209b7',
    };

    function jump() {
      if (isPaused || isGameOver || dino.isDucking) return;
      if (dino.grounded) {
        dino.dy = -dino.jumpForce;
        dino.grounded = false;
        dino.airJumpUsed = false;
        sfx.jump();
      } else if (dino.doubleJumpTimer > 0 && !dino.airJumpUsed) {
        // Mid-air second jump while the power-up is active
        dino.dy = -dino.jumpForce * 0.92;
        dino.airJumpUsed = true;
        sfx.djump();
      }
    }

    function resetGame() {
      score = 0; nextMilestone = 100; gameSpeed = baseSpeed;
      obstacles = []; powerUps = [];
      isGameOver = false;
      dino.y = GROUND_Y - dino.h; dino.dy = 0;
      dino.isDucking = false;
      dino.invincibleTimer = 0;
      dino.multiplierTimer = 0;
      dino.doubleJumpTimer = 0;
      dino.airJumpUsed = false;
      frameCount = 0; groundScrollX = 0; mountainScrollX = 0; mountainScrollX2 = 0;
      phaseIndex = 0; phaseT = 0;
      rafId = requestAnimationFrame(update);
    }

    function spawnObstacle() {
      const r = Math.random();
      let type: Obstacle['type'] = 'cactus';
      if (score > 200 && r < 0.25) type = 'swoopBird';
      else if (score > 100 && r < 0.45) type = 'bird';
      else if (r < 0.65) type = 'rock';

      const o: Obstacle = { type, x: canvas.width, w: 0, h: 0, y: 0, seed: Math.floor(Math.random() * 997) };
      if (type === 'cactus') {
        const v = (['small', 'large', 'cluster'] as const)[Math.floor(Math.random() * 3)];
        o.variant = v;
        if (v === 'small') { o.w = 12; o.h = 20; }
        else if (v === 'large') { o.w = 16; o.h = 26; }
        else { o.w = 26; o.h = 22; }
        o.y = GROUND_Y - o.h;
      } else if (type === 'rock') { o.w = 18; o.h = 9; o.y = GROUND_Y - o.h; }
      else if (type === 'bird') {
        o.w = 24; o.h = 14;
        if (Math.random() > 0.5) {
          // Overhead flyer: safely above the dino, anywhere in the vicinity
          o.y = GROUND_Y - 36 - Math.floor(Math.random() * 21);
        } else {
          // In the dino's path: still a threat, just a bit lower or higher
          o.y = GROUND_Y - 14 - Math.floor(Math.random() * 9);
        }
      }
      else if (type === 'swoopBird') { o.w = 24; o.h = 14; o.y = GROUND_Y - 60; o.state = 'cruising'; o.timer = 0; }
      obstacles.push(o);
    }

    function spawnPowerUp() {
      const types = ['shield', 'multiplier', 'doublejump'] as const;
      powerUps.push({
        x: canvas.width + 50,
        y: Math.random() > 0.5 ? GROUND_Y - 45 : GROUND_Y - 20,
        w: 12, h: 14,
        type: types[Math.floor(Math.random() * types.length)],
      });
    }

    function makeCloud(x: number): Cloud {
      const y = 8 + Math.random() * 42;
      return {
        x,
        y,
        // Speed is tied to height: same-altitude clouds move together,
        // so they keep their spacing and never pile up. Also gives parallax.
        speed: 0.1 + (y / 50) * 0.2,
        w: 20 + Math.floor(Math.random() * 18),
        h: 7 + Math.floor(Math.random() * 4),
        alpha: 0.3 + Math.random() * 0.25,
      };
    }

    function seedClouds() {
      clouds = [];
      for (let i = 0; i < 4; i++) {
        clouds.push(makeCloud(30 + i * 95 + Math.random() * 30));
      }
    }

    function trySpawnCloud() {
      if (clouds.length >= 6 || Math.random() > 0.02) return;
      const c = makeCloud(canvas.width + 10);
      // Skip the spawn if another cloud at a similar altitude is still near
      // the right edge; keeps clouds from spawning on top of each other.
      const crowded = clouds.some(o => Math.abs(o.y - c.y) < 12 && o.x + o.w > canvas.width - 80);
      if (!crowded) clouds.push(c);
    }

    function update() {
      if (isPaused || isGameOver) return;

      if (dino.invincibleTimer > 0) dino.invincibleTimer--;
      if (dino.multiplierTimer > 0) dino.multiplierTimer--;
      if (dino.doubleJumpTimer > 0) dino.doubleJumpTimer--;

      if (keys['ArrowDown']) {
        if (!dino.grounded) dino.dy += 1.5;
        else dino.isDucking = true;
      } else { dino.isDucking = false; }

      dino.dy += dino.gravity;
      dino.y += dino.dy;
      if (dino.y + dino.h >= GROUND_Y) {
        dino.y = GROUND_Y - dino.h;
        dino.dy = 0;
        dino.grounded = true;
        dino.airJumpUsed = false;
        // Instantly jump again if jump is already being held.
        if ((keys['Space'] || keys['ArrowUp']) &&
            !dino.isDucking &&
            !isPaused &&
            !isGameOver) {
          dino.dy = -dino.jumpForce;
          dino.grounded = false;
          sfx.jump();
        }
      }

      let scoreIncrement = 0.15;
      if (dino.multiplierTimer > 0) scoreIncrement *= 2;
      score += scoreIncrement;
      if (score >= nextMilestone) { sfx.score(); nextMilestone += 100; }

      gameSpeed = baseSpeed + Math.min(4.5, (score / 100) * 0.4);

      const phaseF = (score / PHASE_LEN) % 4;
      phaseIndex = Math.floor(phaseF);
      phaseT = phaseF - phaseIndex;
      groundScrollX = (groundScrollX + gameSpeed) % 50;
      mountainScrollX = (mountainScrollX + gameSpeed * 0.15) % 400;
      mountainScrollX2 = (mountainScrollX2 + gameSpeed * 0.06) % 400;

      trySpawnCloud();
      clouds.forEach((c, i) => { c.x -= c.speed; if (c.x + c.w < -30) clouds.splice(i, 1); });

      // Minimum obstacle spacing derived from the jump physics. A full jump lasts
      // ~27 frames, so consecutive obstacles must stay far enough apart — in pixels,
      // scaled by the current speed — that the dino can always land and re-jump.
      // The old formula collapsed to a fixed 75px floor at high scores, which let
      // fast runs spawn 3+ obstacle "trains" that were physically impossible to clear.
      // Scaling with gameSpeed keeps the reaction window roughly constant in frames
      // (and even tightens it slightly as speed rises, so it still gets harder).
      // Validated against a physics reachability simulation for trains up to 8 long.
      const minDistance = 18 * gameSpeed + 70;
      const lastObstacle = obstacles[obstacles.length - 1];
      if (!lastObstacle || (canvas.width - lastObstacle.x > minDistance && Math.random() < 0.04)) {
        spawnObstacle();
        if (Math.random() < 0.08) spawnPowerUp();
      }

      const curDinoW = dino.isDucking ? dino.duckW : dino.w;
      const curDinoH = dino.isDucking ? dino.duckH : dino.h;
      const curDinoY = dino.isDucking && dino.grounded ? GROUND_Y - curDinoH : dino.y;

      for (let i = powerUps.length - 1; i >= 0; i--) {
        const p = powerUps[i];
        p.x -= gameSpeed;
        if (p.x + p.w < -30) { powerUps.splice(i, 1); continue; }

        if (dino.x < p.x + p.w && dino.x + curDinoW > p.x && curDinoY < p.y + p.h && curDinoY + curDinoH > p.y) {
          if (p.type === 'shield') dino.invincibleTimer = 120;
          else if (p.type === 'multiplier') dino.multiplierTimer = 300;
          else if (p.type === 'doublejump') dino.doubleJumpTimer = 360;
          sfx.power();
          powerUps.splice(i, 1);
          continue;
        }
      }

      for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i];
        o.x -= gameSpeed;
        if (o.type === 'swoopBird') {
          if (o.state === 'cruising' && o.x < 260) o.state = 'swooping';
          if (o.state === 'swooping') {
            o.y += 3.0;
            if (o.y >= GROUND_Y - 20) { o.y = GROUND_Y - 20; o.state = 'low'; o.timer = 40; }
          }
          if (o.state === 'low') { o.timer!--; if (o.timer! <= 0) o.state = 'rising'; }
          if (o.state === 'rising') o.y -= 2.0;
        }
        if (o.x + o.w < -30) { obstacles.splice(i, 1); continue; }
        if (dino.x + 3 < o.x + o.w && dino.x + curDinoW - 3 > o.x && curDinoY + 2 < o.y + o.h && curDinoY + curDinoH - 2 > o.y) {
          if (dino.invincibleTimer > 0) { obstacles.splice(i, 1); sfx.zap(); }
          else { triggerGameOver(); return; }
        }
      }

      frameCount++; draw();
      rafId = requestAnimationFrame(update);
    }

    function draw() {
      const theme = currentTheme();
      ctx!.fillStyle = theme.bg; ctx!.fillRect(0, 0, canvas.width, canvas.height);

      drawCelestials(theme);

      clouds.forEach(c => {
        ctx!.fillStyle = `rgba(255, 255, 255, ${c.alpha})`;
        ctx!.fillRect(c.x, c.y + 4, c.w, c.h - 4);
        ctx!.fillRect(c.x + 3, c.y + 2, c.w - 8, 2);
        ctx!.fillRect(c.x + c.w - 9, c.y + 2, 6, 2);
        ctx!.fillStyle = `rgba(255, 255, 255, ${Math.min(0.8, c.alpha + 0.2)})`;
        ctx!.fillRect(c.x + 6, c.y, Math.max(4, c.w - 16), 2);
      });

      drawParallaxMountains(theme);
      drawConveyorGround(theme);
      drawPixelObstacles();

      powerUps.forEach(p => {
        const s = Math.abs(Math.cos(frameCount * 0.1));
        const w = Math.max(2, p.w * s);
        ctx!.fillStyle = colors.mysteryBox;
        ctx!.fillRect(p.x + (p.w - w) / 2, p.y, w, p.h);
        ctx!.fillStyle = colors.mysteryCore;
        ctx!.fillRect(p.x + (p.w - Math.max(1, (p.w * 0.5) * s)) / 2, p.y + 3, Math.max(1, (p.w * 0.5) * s), p.h - 6);
      });

      drawPixelDino();

      ctx!.fillStyle = phaseIndex === 0 ? '#222' : '#fff';
      ctx!.font = "bold 9px 'Courier New'";
      ctx!.textAlign = "right";
      ctx!.fillText(`HI ${String(Math.floor(highScore)).padStart(5, '0')}  ${String(Math.floor(score)).padStart(5, '0')}`, canvas.width - 10, 16);

      ctx!.textAlign = "left";
      let yOffset = 16;
      if (dino.invincibleTimer > 0) { ctx!.fillStyle = colors.shieldAura; ctx!.fillText("SHIELD: " + (dino.invincibleTimer / 60).toFixed(1) + "s", 10, yOffset); yOffset += 10; }
      if (dino.multiplierTimer > 0) { ctx!.fillStyle = colors.multiplierAura; ctx!.fillText("2X SCORE: " + (dino.multiplierTimer / 60).toFixed(1) + "s", 10, yOffset); yOffset += 10; }
      if (dino.doubleJumpTimer > 0) { ctx!.fillStyle = colors.doubleJumpAura; ctx!.fillText("DOUBLE JUMP: " + (dino.doubleJumpTimer / 60).toFixed(1) + "s", 10, yOffset); }
      if (muted) { ctx!.fillStyle = phaseIndex === 0 ? '#555' : '#bbb'; ctx!.fillText("MUTED", 10, canvas.height - 6); }

      if (isPaused) { ctx!.textAlign = "center"; ctx!.fillStyle = '#fff'; ctx!.fillText("PAUSED", canvas.width / 2, canvas.height / 2); }
    }

    function drawParallaxMountains(theme: Theme) {
      // Far hazy ridge, scrolling slower = deeper in the scene
      ctx!.fillStyle = theme.mountainFar;
      for (let i = 0; i < 4; i++) {
        const x = (i * 200) - mountainScrollX2 - 60;
        ctx!.fillRect(x, GROUND_Y - 26, 70, 26);
        ctx!.fillRect(x + 18, GROUND_Y - 36, 34, 10);
        ctx!.fillRect(x + 28, GROUND_Y - 42, 14, 6);
        ctx!.fillRect(x + 115, GROUND_Y - 20, 60, 20);
        ctx!.fillRect(x + 132, GROUND_Y - 28, 26, 8);
      }
      // Near mountains, lit from the left with a shadow face down the right
      for (let i = 0; i < 4; i++) {
        const x = (i * 200) - mountainScrollX;
        // Tall peak: lit side
        ctx!.fillStyle = theme.mountain;
        ctx!.fillRect(x, GROUND_Y - 40, 45, 40);
        ctx!.fillRect(x + 10, GROUND_Y - 55, 25, 15);
        ctx!.fillRect(x + 16, GROUND_Y - 65, 12, 10);
        // Tall peak: shadow face, ridge drifting right as it descends
        ctx!.fillStyle = theme.mountainShade;
        ctx!.fillRect(x + 22, GROUND_Y - 65, 6, 10);
        ctx!.fillRect(x + 24, GROUND_Y - 55, 11, 15);
        ctx!.fillRect(x + 26, GROUND_Y - 40, 19, 40);
        // Snow cap on the tall peak
        ctx!.fillStyle = theme.snow;
        ctx!.fillRect(x + 16, GROUND_Y - 65, 12, 3);
        ctx!.fillRect(x + 18, GROUND_Y - 62, 3, 2);
        ctx!.fillRect(x + 24, GROUND_Y - 62, 2, 1);
        // Low hill: lit side
        ctx!.fillStyle = theme.mountain;
        ctx!.fillRect(x + 90, GROUND_Y - 30, 50, 30);
        ctx!.fillRect(x + 105, GROUND_Y - 42, 20, 12);
        // Low hill: shadow face
        ctx!.fillStyle = theme.mountainShade;
        ctx!.fillRect(x + 113, GROUND_Y - 42, 12, 12);
        ctx!.fillRect(x + 116, GROUND_Y - 30, 24, 30);
      }
    }

    const stars = [
      { x: 62, y: 18, o: 0 },
      { x: 138, y: 34, o: 23 },
      { x: 208, y: 12, o: 47 },
      { x: 256, y: 42, o: 71 },
      { x: 96, y: 48, o: 95 },
      { x: 368, y: 46, o: 119 },
    ];

    function drawPixelDisc(cx: number, cy: number, c: string) {
      ctx!.fillStyle = c;
      ctx!.fillRect(cx - 3, cy - 7, 6, 1);
      ctx!.fillRect(cx - 5, cy - 6, 10, 1);
      ctx!.fillRect(cx - 6, cy - 5, 12, 2);
      ctx!.fillRect(cx - 7, cy - 3, 14, 6);
      ctx!.fillRect(cx - 6, cy + 3, 12, 2);
      ctx!.fillRect(cx - 5, cy + 5, 10, 1);
      ctx!.fillRect(cx - 3, cy + 6, 6, 1);
    }

    function drawPixelHalo(cx: number, cy: number, c: string) {
      ctx!.fillStyle = c;
      ctx!.fillRect(cx - 5, cy - 10, 10, 2);
      ctx!.fillRect(cx - 8, cy - 8, 16, 3);
      ctx!.fillRect(cx - 10, cy - 5, 20, 10);
      ctx!.fillRect(cx - 8, cy + 5, 16, 3);
      ctx!.fillRect(cx - 5, cy + 8, 10, 2);
    }

    function drawCelestials(theme: Theme) {
      const cx = 318;
      const pulse = 0.10 + 0.05 * Math.sin(frameCount * 0.03);
      if (phaseIndex === 2) {
        // Night: stars and a full moon, fading in and out at the phase edges
        const cy = 30;
        const fade = Math.max(0, Math.min(1, phaseT / 0.15, (1 - phaseT) / 0.15));
        ctx!.globalAlpha = fade;
        stars.forEach(s => {
          const a = (Math.floor((frameCount + s.o) / 45) % 2) ? 0.6 : 0.25;
          ctx!.fillStyle = `rgba(255, 255, 255, ${a})`;
          ctx!.fillRect(s.x, s.y, 1, 1);
        });
        drawPixelHalo(cx, cy, `rgba(214, 205, 242, ${(pulse * 0.8).toFixed(3)})`);
        drawPixelDisc(cx, cy, colors.moon);
        ctx!.fillStyle = colors.moonShade;
        ctx!.fillRect(cx - 4, cy - 2, 2, 2);
        ctx!.fillRect(cx - 1, cy + 2, 3, 2);
        ctx!.fillRect(cx + 1, cy - 5, 2, 1);
        ctx!.fillRect(cx + 3, cy + 1, 1, 1);
        ctx!.globalAlpha = 1;
      } else {
        // The sun rides the time of day: high at noon, sinking behind the
        // mountains through sunset, climbing back out during sunrise
        let cy = 28;
        if (phaseIndex === 1) cy = Math.round(28 + 106 * phaseT);
        if (phaseIndex === 3) cy = Math.round(134 - 106 * phaseT);
        drawPixelHalo(cx, cy, `rgba(255, 220, 170, ${pulse.toFixed(3)})`);
        drawPixelDisc(cx, cy, theme.sun);
        // Shaded lower rim for roundness
        ctx!.fillStyle = theme.sunShade;
        ctx!.fillRect(cx - 5, cy + 5, 10, 1);
        ctx!.fillRect(cx - 3, cy + 6, 6, 1);
        ctx!.fillRect(cx - 6, cy + 3, 2, 2);
        ctx!.fillRect(cx + 4, cy + 3, 2, 2);
        // Bright core, upper left
        ctx!.fillStyle = theme.sunCore;
        ctx!.fillRect(cx - 4, cy - 4, 4, 3);
        ctx!.fillRect(cx - 5, cy - 2, 2, 2);
      }
    }

    function drawConveyorGround(theme: Theme) {
      ctx!.fillStyle = theme.ground; ctx!.fillRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y);
      ctx!.fillStyle = '#222'; ctx!.fillRect(0, GROUND_Y, canvas.width, 2);
      for (let x = -groundScrollX; x <= canvas.width + 50; x += 50) {
        // Grass tufts poking up over the edge
        ctx!.fillStyle = theme.grass;
        ctx!.fillRect(x + 8, GROUND_Y - 2, 2, 2);
        ctx!.fillRect(x + 11, GROUND_Y - 3, 1, 3);
        ctx!.fillRect(x + 31, GROUND_Y - 2, 1, 2);
        ctx!.fillRect(x + 33, GROUND_Y - 3, 2, 3);
        // Dashes and pebbles
        ctx!.fillStyle = theme.groundDetail;
        ctx!.fillRect(x, GROUND_Y + 4, 8, 2);
        ctx!.fillRect(x + 22, GROUND_Y + 14, 4, 2);
        ctx!.fillRect(x + 35, GROUND_Y + 20, 10, 2);
        ctx!.fillRect(x + 14, GROUND_Y + 8, 4, 3);
        ctx!.fillRect(x + 41, GROUND_Y + 9, 3, 2);
        // Shadows, cracks, and specks
        ctx!.fillStyle = theme.groundDark;
        ctx!.fillRect(x + 14, GROUND_Y + 10, 4, 1);
        ctx!.fillRect(x + 41, GROUND_Y + 10, 3, 1);
        ctx!.fillRect(x + 27, GROUND_Y + 6, 1, 3);
        ctx!.fillRect(x + 28, GROUND_Y + 8, 2, 1);
        ctx!.fillRect(x + 5, GROUND_Y + 18, 1, 1);
        ctx!.fillRect(x + 47, GROUND_Y + 16, 1, 1);
        ctx!.fillRect(x + 19, GROUND_Y + 22, 1, 1);
        ctx!.fillRect(x + 38, GROUND_Y + 12, 1, 1);
      }
    }

    function drawPixelDino() {
      const curY = dino.isDucking && dino.grounded ? GROUND_Y - dino.duckH : dino.y;
      if (dino.invincibleTimer > 0 && Math.floor(frameCount / 4) % 2 === 0) {
        ctx!.fillStyle = colors.shieldAura;
        ctx!.fillRect(dino.x - 2, curY - 2, (dino.isDucking ? dino.duckW : dino.w) + 4, (dino.isDucking ? dino.duckH : dino.h) + 4);
      }

      if (dino.isDucking && dino.grounded) {
        const s = Math.floor(frameCount / 4) % 2;
        const wag = Math.floor(frameCount / 8) % 2;
        const blinking = frameCount % 160 < 7;
        const ty = curY + 4 - wag;
        // Base silhouette (tail wags)
        ctx!.fillStyle = colors.dino;
        ctx!.fillRect(dino.x, ty, 6, 6);
        ctx!.fillRect(dino.x + 6, curY + 2, 14, 10);
        ctx!.fillRect(dino.x + 20, curY + 4, 14, 6);
        ctx!.fillRect(dino.x + 20, curY, 10, 4);
        // Belly
        ctx!.fillStyle = colors.dinoBelly;
        ctx!.fillRect(dino.x + 8, curY + 8, 10, 3);
        // Back spikes (glow while double jump is charged), then shading
        ctx!.fillStyle = dino.doubleJumpTimer > 0 ? colors.doubleJumpAura : colors.dinoShade;
        ctx!.fillRect(dino.x + 9, curY, 2, 2);
        ctx!.fillRect(dino.x + 14, curY, 2, 2);
        ctx!.fillStyle = colors.dinoShade;
        ctx!.fillRect(dino.x, ty + 4, 6, 2);
        ctx!.fillRect(dino.x + 6, curY + 11, 14, 1);
        ctx!.fillRect(dino.x + 20, curY + 9, 14, 1);
        ctx!.fillRect(dino.x + 32, curY + 5, 1, 1);
        // Eye (blinks every few seconds)
        if (blinking) {
          ctx!.fillRect(dino.x + 23, curY + 2, 3, 1);
        } else {
          ctx!.fillStyle = '#fff';
          ctx!.fillRect(dino.x + 23, curY + 1, 3, 3);
          ctx!.fillStyle = '#000';
          ctx!.fillRect(dino.x + 25, curY + 2, 1, 2);
        }
        // Arm and legs
        ctx!.fillStyle = colors.dino;
        ctx!.fillRect(dino.x + 14, curY + 10, 4, 2);
        ctx!.fillRect(dino.x + (s === 0 ? 4 : 8), curY + 12, 4, 2);
        ctx!.fillRect(dino.x + (s === 0 ? 14 : 18), curY + 12, 6, 2);
      } else {
        const step = dino.grounded ? Math.floor(frameCount / 5) % 2 : 0;
        const wag = dino.grounded ? Math.floor(frameCount / 10) % 2 : 1;   // tail held high mid-jump
        const blinking = frameCount % 160 < 7;
        const ty = dino.y + 10 - wag;      // wagging tail offset
        const hy = dino.y + step;          // head bobs in step with the legs
        // Base silhouette
        ctx!.fillStyle = colors.dino;
        ctx!.fillRect(dino.x, ty, 4, 8);
        ctx!.fillRect(dino.x + 4, dino.y + 14, 2, 4);
        ctx!.fillRect(dino.x + 6, dino.y + 6, 8, 12);
        ctx!.fillRect(dino.x + 10, hy, 10, 8);
        ctx!.fillRect(dino.x + 20, hy, 4, 4);
        ctx!.fillRect(dino.x + 20, hy + 6, 4, 2);
        // Belly
        ctx!.fillStyle = colors.dinoBelly;
        ctx!.fillRect(dino.x + 10, dino.y + 11, 4, 6);
        // Back spikes (glow while double jump is charged), then shading
        ctx!.fillStyle = dino.doubleJumpTimer > 0 ? colors.doubleJumpAura : colors.dinoShade;
        ctx!.fillRect(dino.x + 7, dino.y + 4, 2, 2);
        ctx!.fillRect(dino.x + 2, ty - 2, 2, 2);
        ctx!.fillStyle = colors.dinoShade;
        ctx!.fillRect(dino.x, ty + 6, 4, 2);
        ctx!.fillRect(dino.x + 4, dino.y + 16, 2, 2);
        ctx!.fillRect(dino.x + 6, dino.y + 17, 8, 1);
        ctx!.fillRect(dino.x + 6, dino.y + 6, 1, 11);
        ctx!.fillRect(dino.x + 20, hy + 7, 4, 1);
        ctx!.fillRect(dino.x + 22, hy + 1, 1, 1);
        // Eye (blinks every few seconds)
        if (blinking) {
          ctx!.fillRect(dino.x + 12, hy + 2, 3, 1);
        } else {
          ctx!.fillStyle = '#fff';
          ctx!.fillRect(dino.x + 12, hy + 1, 3, 3);
          ctx!.fillStyle = '#000';
          ctx!.fillRect(dino.x + 14, hy + 2, 1, 2);
        }
        // Arm with claw, pumping in step
        ctx!.fillStyle = colors.dino;
        ctx!.fillRect(dino.x + 14, dino.y + 10 + step, 4, 2);
        ctx!.fillStyle = colors.dinoShade;
        ctx!.fillRect(dino.x + 17, dino.y + 11 + step, 1, 1);
        // Legs
        ctx!.fillStyle = colors.dino;
        if (!dino.grounded) { ctx!.fillRect(dino.x + 6, dino.y + 18, 2, 4); ctx!.fillRect(dino.x + 12, dino.y + 18, 2, 4); }
        else { ctx!.fillRect(dino.x + 6, dino.y + 18, 2, (step === 0 ? 4 : 2)); ctx!.fillRect(dino.x + (step === 0 ? 12 : 10), dino.y + 18, 2, (step === 0 ? 2 : 4)); }
      }
    }

    function drawPixelObstacles() {
      obstacles.forEach(o => {
        if (o.type === 'rock') {
          ctx!.fillStyle = colors.rock;
          ctx!.fillRect(o.x + 6, o.y, 6, 2); ctx!.fillRect(o.x + 4, o.y + 2, 10, 2); ctx!.fillRect(o.x + 2, o.y + 4, 14, 3); ctx!.fillRect(o.x, o.y + 7, o.w, 2);
          // Top-left highlight
          ctx!.fillStyle = colors.rockLight;
          ctx!.fillRect(o.x + 6, o.y, 3, 1); ctx!.fillRect(o.x + 4, o.y + 2, 2, 1); ctx!.fillRect(o.x + 2, o.y + 4, 2, 1);
          // Bottom shade and crack
          ctx!.fillStyle = colors.rockShade;
          ctx!.fillRect(o.x, o.y + 8, o.w, 1);
          ctx!.fillRect(o.x + 12, o.y + 3, 1, 1); ctx!.fillRect(o.x + 13, o.y + 4, 1, 3);
        } else if (o.type === 'cactus') {
          ctx!.fillStyle = colors.cactus;
          ctx!.fillRect(o.x + (o.w / 2) - 2, o.y, 4, o.h);
          if (o.variant !== 'cluster') {
            ctx!.fillRect(o.x, o.y + o.h / 2 - 2, 2, o.h / 3); ctx!.fillRect(o.x, o.y + o.h / 2 + o.h / 3 - 4, o.w / 2, 2); ctx!.fillRect(o.x + o.w - 2, o.y + o.h / 4, 2, o.h / 3); ctx!.fillRect(o.x + o.w / 2, o.y + o.h / 4 + o.h / 3 - 2, o.w / 2, 2);
            // Right-side shading
            ctx!.fillStyle = colors.cactusShade;
            ctx!.fillRect(o.x + o.w / 2 + 1, o.y + 2, 1, o.h - 2);
            ctx!.fillRect(o.x + o.w - 1, o.y + o.h / 4, 1, o.h / 3);
            // Spines
            ctx!.fillStyle = colors.cactusSpine;
            ctx!.fillRect(o.x + o.w / 2 - 2, o.y + 5, 1, 1);
            ctx!.fillRect(o.x + o.w / 2 + 1, o.y + 10, 1, 1);
            ctx!.fillRect(o.x + o.w / 2 - 2, o.y + 15, 1, 1);
            if (o.h > 22) ctx!.fillRect(o.x + o.w / 2 + 1, o.y + 20, 1, 1);
            // Flower on the large cactus
            if (o.variant === 'large') {
              ctx!.fillStyle = colors.cactusFlower;
              ctx!.fillRect(o.x + o.w / 2 - 1, o.y, 3, 2);
              ctx!.fillStyle = '#fff';
              ctx!.fillRect(o.x + o.w / 2, o.y, 1, 1);
            }
          } else {
            ctx!.fillRect(o.x + 2, o.y + 4, 4, o.h - 4); ctx!.fillRect(o.x, o.y + 10, 8, 2); ctx!.fillRect(o.x + 11, o.y, 4, o.h); ctx!.fillRect(o.x + 9, o.y + 13, 8, 2); ctx!.fillRect(o.x + 20, o.y + 6, 4, o.h - 6);
            // Right-side shading per stem
            ctx!.fillStyle = colors.cactusShade;
            ctx!.fillRect(o.x + 5, o.y + 6, 1, o.h - 6);
            ctx!.fillRect(o.x + 14, o.y + 2, 1, o.h - 2);
            ctx!.fillRect(o.x + 23, o.y + 8, 1, o.h - 8);
            // Spines
            ctx!.fillStyle = colors.cactusSpine;
            ctx!.fillRect(o.x + 3, o.y + 8, 1, 1);
            ctx!.fillRect(o.x + 12, o.y + 4, 1, 1);
            ctx!.fillRect(o.x + 21, o.y + 11, 1, 1);
          }
        } else if (o.type === 'bird') {
          const t = frameCount + o.seed;                      // per-bird clock so flocks desync
          const by = o.y + (Math.floor(t / 16) % 2);          // gentle 1px float (visual only)
          const tailUp = Math.floor(t / 12) % 2;              // tail feathers bob
          const blinking = t % 140 < 6;
          const squawk = t % 220 < 14;
          ctx!.fillStyle = colors.bird;
          ctx!.fillRect(o.x + 4, by + 4, 12, 4);
          ctx!.fillRect(o.x + 14, by + 2, 4, 4);
          ctx!.fillRect(o.x, by + 5 - tailUp, 4, 2);
          // Belly, tail, and neck shading
          ctx!.fillStyle = colors.birdShade;
          ctx!.fillRect(o.x + 4, by + 7, 12, 1);
          ctx!.fillRect(o.x, by + 6 - tailUp, 3, 1);
          ctx!.fillRect(o.x + 14, by + 5, 4, 1);
          // Beak, opening now and then
          ctx!.fillStyle = colors.birdBeak;
          if (squawk) {
            ctx!.fillRect(o.x + 18, by + 3, 4, 1);
            ctx!.fillRect(o.x + 18, by + 6, 3, 1);
          } else {
            ctx!.fillRect(o.x + 18, by + 4, 4, 2);
            ctx!.fillStyle = colors.birdBeakShade;
            ctx!.fillRect(o.x + 18, by + 5, 4, 1);
          }
          // Eye (blinks)
          if (blinking) {
            ctx!.fillStyle = colors.birdShade;
            ctx!.fillRect(o.x + 15, by + 3, 2, 1);
          } else {
            ctx!.fillStyle = '#fff';
            ctx!.fillRect(o.x + 15, by + 3, 1, 1);
            ctx!.fillStyle = '#000';
            ctx!.fillRect(o.x + 16, by + 3, 1, 1);
          }
          // Wings
          ctx!.fillStyle = colors.bird;
          const wingUp = Math.floor(t / 8) % 2 === 0;
          if (wingUp) { ctx!.fillRect(o.x + 6, by, 4, 4); ctx!.fillRect(o.x + 8, by - 2, 2, 2); }
          else { ctx!.fillRect(o.x + 6, by + 8, 4, 4); ctx!.fillRect(o.x + 8, by + 12, 2, 2); }
        } else if (o.type === 'swoopBird') {
          // Pterodactyl: slim body, backswept crest, long tapered beak, big membrane wings
          const t = frameCount + o.seed;
          const by = o.y + (Math.floor(t / 16) % 2);
          const blinking = t % 140 < 6;
          const attacking = o.state === 'swooping' || o.state === 'low';
          ctx!.fillStyle = colors.swoopBird;
          ctx!.fillRect(o.x + 4, by + 6, 12, 3);             // slim body
          ctx!.fillRect(o.x, by + 7, 4, 2);                  // pointed tail
          ctx!.fillRect(o.x + 1, by + 5, 2, 2);              // tail fin
          ctx!.fillRect(o.x + 14, by + 3, 5, 4);             // head
          ctx!.fillRect(o.x + 12, by + 1, 3, 2);             // crest sweeping back
          ctx!.fillRect(o.x + 11, by, 2, 1);                 // crest tip
          // Belly and crest shading
          ctx!.fillStyle = colors.swoopBirdShade;
          ctx!.fillRect(o.x + 4, by + 8, 12, 1);
          ctx!.fillRect(o.x, by + 8, 4, 1);
          ctx!.fillRect(o.x + 12, by + 3, 2, 1);
          // Long tapered beak, held open while attacking
          ctx!.fillStyle = colors.birdBeak;
          if (attacking) {
            ctx!.fillRect(o.x + 19, by + 3, 3, 1);
            ctx!.fillRect(o.x + 21, by + 2, 2, 1);
            ctx!.fillRect(o.x + 19, by + 6, 4, 1);
          } else {
            ctx!.fillRect(o.x + 19, by + 4, 3, 2);
            ctx!.fillRect(o.x + 22, by + 5, 2, 1);
            ctx!.fillStyle = colors.birdBeakShade;
            ctx!.fillRect(o.x + 19, by + 5, 3, 1);
          }
          // Eye (blinks)
          if (blinking) {
            ctx!.fillStyle = colors.swoopBirdShade;
            ctx!.fillRect(o.x + 15, by + 4, 2, 1);
          } else {
            ctx!.fillStyle = '#fff';
            ctx!.fillRect(o.x + 15, by + 4, 1, 1);
            ctx!.fillStyle = '#000';
            ctx!.fillRect(o.x + 16, by + 4, 1, 1);
          }
          // Wings: locked dive pose while swooping, otherwise flapping
          ctx!.fillStyle = colors.swoopBird;
          if (o.state === 'swooping') {
            ctx!.fillRect(o.x + 8, by + 3, 6, 3);
            ctx!.fillRect(o.x + 6, by + 1, 5, 3);
            ctx!.fillRect(o.x + 4, by - 1, 4, 3);
            ctx!.fillStyle = colors.swoopBirdShade;
            ctx!.fillRect(o.x + 4, by - 1, 2, 2);
          } else {
            const wingUp = Math.floor(t / (o.state === 'low' ? 3 : 8)) % 2 === 0;
            if (wingUp) {
              ctx!.fillRect(o.x + 8, by + 3, 5, 3);
              ctx!.fillRect(o.x + 6, by, 4, 3);
              ctx!.fillRect(o.x + 4, by - 3, 4, 3);
              ctx!.fillRect(o.x + 3, by - 4, 2, 2);
              ctx!.fillStyle = colors.swoopBirdShade;
              ctx!.fillRect(o.x + 8, by + 5, 5, 1);
            } else {
              ctx!.fillRect(o.x + 8, by + 8, 5, 2);
              ctx!.fillRect(o.x + 6, by + 10, 4, 2);
              ctx!.fillRect(o.x + 4, by + 12, 4, 2);
              ctx!.fillStyle = colors.swoopBirdShade;
              ctx!.fillRect(o.x + 4, by + 13, 4, 1);
            }
          }
        }
      });
    }

    function triggerGameOver() {
      isGameOver = true;
      sfx.die();
      if (score > highScore) { highScore = score; saveHighScore(highScore); }
      draw();
      ctx!.fillStyle = 'rgba(0, 0, 0, 0.4)'; ctx!.fillRect(0, 0, canvas.width, canvas.height);
      ctx!.fillStyle = '#ff477e'; ctx!.font = "bold 14px 'Courier New'"; ctx!.textAlign = "center"; ctx!.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 10);
      ctx!.fillStyle = '#fff'; ctx!.font = "8px 'Courier New'"; ctx!.fillText("PRESS SPACE TO RESTART", canvas.width / 2, canvas.height / 2 + 10);
    }

    // --- Input handlers (window-scoped so the arcade container can host the game) ---
    const handleKeyDown = (e: KeyboardEvent) => {
      ensureAudio();
      keys[e.code] = true;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault();
        if ((e.code === 'Space' || e.code === 'ArrowUp') && !e.repeat) jump();
      }
      if (e.key === 'm' || e.key === 'M') muted = !muted;
      if (isGameOver && e.code === 'Space') resetGame();
    };
    const handleKeyUp = (e: KeyboardEvent) => { keys[e.code] = false; };
    const handleClick = () => { ensureAudio(); };
    const handleTouch = (e: TouchEvent) => {
      e.preventDefault(); ensureAudio(); jump(); if (isGameOver) resetGame();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('touchstart', handleTouch, { passive: false });

    seedClouds();
    resetGame();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('touchstart', handleTouch);
      try { audioCtx?.close(); } catch { /* ignore */ }
    };
  }, []);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6 py-6">
      <div
        className="relative"
        style={{
          // Fill as much of the screen as possible while keeping the 400:150
          // aspect ratio, leaving room for the controls row below.
          width: 'min(96vw, calc((100vh - 160px) * 2.6667), 1800px)',
          aspectRatio: '400 / 150',
        }}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full rounded-lg border border-white/10 outline-none"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>
      <div className="flex flex-col items-center gap-3">
        <p className="text-zinc-500 text-xs tracking-widest uppercase text-center leading-relaxed">
          Space / ↑ to Jump · ↓ to Duck · M to Mute · Grab the Mystery Box
        </p>
        <button
          onClick={onMenu}
          className="cursor-target px-8 py-2 rounded-xl border-2 border-dashed border-zinc-600 bg-transparent text-white font-bold text-sm uppercase tracking-[0.15em] hover:border-white hover:bg-white/5 transition-all duration-200"
        >
          Menu
        </button>
      </div>
    </div>
  );
}

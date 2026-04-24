"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Difficulty = 'easy' | 'medium' | 'hard' | 'impossible';
type Mode = 'solo' | '2player';

const DIFFICULTY_SETTINGS = {
  easy:       { cpuSpeed: 6,  cpuReaction: 0.78, ballSpeed: 6,  speedGain: 0.40, maxSpeed: 17, playerSpeed: 17, playerLerp: 0.30 },
  medium:     { cpuSpeed: 8,  cpuReaction: 0.90, ballSpeed: 8,  speedGain: 0.55, maxSpeed: 23, playerSpeed: 18, playerLerp: 0.30 },
  hard:       { cpuSpeed: 11, cpuReaction: 0.97, ballSpeed: 10, speedGain: 0.70, maxSpeed: 30, playerSpeed: 20, playerLerp: 0.30 },
  impossible: { cpuSpeed: 20, cpuReaction: 1.0,  ballSpeed: 11, speedGain: 0.9,  maxSpeed: 50, playerSpeed: 26, playerLerp: 0.50 },
};

const WIN_SCORE = 5;
const COUNTDOWN_SECS = 3;

export function PongGame() {
  const [isOpen, setIsOpen] = useState(false);
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'gameover'>('menu');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [mode, setMode] = useState<Mode>('solo');
  const [winner, setWinner] = useState<'player' | 'cpu' | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);

  const playerRef = useRef({ x: 300, y: 0, width: 120, height: 12 });
  const cpuRef    = useRef({ x: 300, y: 40, width: 120, height: 12 });
  const ballRef   = useRef({ x: 300, y: 200, dx: 0, dy: 0, size: 50 });
  const mouseRef  = useRef(300);
  // keysRef: P1 — left/right for solo, up/down for 2P
  const keysRef   = useRef({ left: false, right: false, up: false, down: false });
  // keys2Ref: P2 — up/down arrows
  const keys2Ref  = useRef({ up: false, down: false });
  const inputModeRef = useRef<'mouse' | 'keyboard'>('mouse');
  const modeRef   = useRef<Mode>('solo');
  const countdownRef = useRef({ active: false, start: 0, pendingDx: 0, pendingDy: 0 });
  const hitCountRef    = useRef(0);
  const playerScoreRef = useRef(0);
  const cpuScoreRef    = useRef(0);

  // Toggle overlay with P key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'p') {
        setIsOpen(prev => {
          if (prev) {
            setGameState('menu');
            setWinner(null);
            playerScoreRef.current = 0;
            cpuScoreRef.current    = 0;
          }
          return !prev;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const startGame = useCallback((diff: Difficulty) => {
    modeRef.current = 'solo';
    setMode('solo');
    setDifficulty(diff);
    setGameState('playing');
    setWinner(null);
    playerScoreRef.current = 0;
    cpuScoreRef.current    = 0;
  }, []);

  const startTwoPlayer = useCallback(() => {
    modeRef.current = '2player';
    setMode('2player');
    setDifficulty('medium');
    setGameState('playing');
    setWinner(null);
    playerScoreRef.current = 0;
    cpuScoreRef.current    = 0;
  }, []);

  // Hide the TargetCursor boxing effect during gameplay
  useEffect(() => {
    const cursorEl = document.querySelector('.target-cursor-wrapper') as HTMLElement | null;
    if (!cursorEl) return;
    if (isOpen && gameState === 'playing') {
      cursorEl.style.display = 'none';
    } else {
      cursorEl.style.display = '';
    }
    return () => { cursorEl.style.display = ''; };
  }, [isOpen, gameState]);

  // Game loop
  useEffect(() => {
    if (!isOpen || gameState !== 'playing') {
      document.body.style.overflow = isOpen ? 'hidden' : '';
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      return;
    }

    document.body.style.overflow = 'hidden';

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new window.Image();
    img.src = '/profile.jpg';

    const settings = DIFFICULTY_SETTINGS[difficulty];
    modeRef.current = mode;
    const is2P = mode === '2player';

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      if (is2P) {
        // Vertical paddles on left/right sides
        playerRef.current.width  = 12;
        playerRef.current.height = 100;
        cpuRef.current.width     = 12;
        cpuRef.current.height    = 100;
        playerRef.current.x = 40;
        playerRef.current.y = canvas.height / 2 - 50;
        cpuRef.current.x    = canvas.width - 52;
        cpuRef.current.y    = canvas.height / 2 - 50;
      } else {
        playerRef.current.width  = 120;
        playerRef.current.height = 12;
        cpuRef.current.width     = 120;
        cpuRef.current.height    = 12;
        playerRef.current.y = canvas.height - 60;
        cpuRef.current.y    = 48;
        mouseRef.current    = canvas.width / 2;
      }
    };
    window.addEventListener('resize', resize);
    resize();

    if (!is2P) {
      playerRef.current.x = canvas.width / 2 - playerRef.current.width / 2;
      cpuRef.current.x    = canvas.width / 2 - cpuRef.current.width  / 2;
    }

    hitCountRef.current = 0;

    const ball = ballRef.current;
    ball.x  = canvas.width / 2;
    ball.y  = canvas.height / 2;
    ball.dx = 0;
    ball.dy = 0;

    const initSpd = is2P ? 8 : settings.ballSpeed;
    if (is2P) {
      // ±20° from horizontal so ball heads toward a paddle, not the corners
      const angle = (Math.random() - 0.5) * (Math.PI / 4.5);
      countdownRef.current = {
        active: true,
        start:  performance.now(),
        pendingDx: initSpd * Math.cos(angle) * (Math.random() > 0.5 ? 1 : -1),
        pendingDy: initSpd * Math.sin(angle),
      };
    } else {
      // ±25° from vertical so ball heads toward a paddle, not the corners
      const angle = (Math.random() - 0.5) * (Math.PI / 3.6);
      countdownRef.current = {
        active: true,
        start:  performance.now(),
        pendingDx: initSpd * Math.sin(angle),
        pendingDy: initSpd * Math.cos(angle),
      };
    }

    const handleMouse = (e: MouseEvent) => {
      if (modeRef.current === '2player') return;
      mouseRef.current   = e.clientX;
      inputModeRef.current = 'mouse';
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Solo mode — horizontal movement
      if (e.key === 'ArrowLeft')           { keysRef.current.left  = true; inputModeRef.current = 'keyboard'; e.preventDefault(); }
      if (e.key === 'ArrowRight')          { keysRef.current.right = true; inputModeRef.current = 'keyboard'; e.preventDefault(); }
      // 2P P1 — W/S vertical
      if (e.key === 'w' || e.key === 'W') { keysRef.current.up    = true; e.preventDefault(); }
      if (e.key === 's' || e.key === 'S') { keysRef.current.down  = true; e.preventDefault(); }
      // 2P P2 — arrow up/down vertical
      if (e.key === 'ArrowUp')             { keys2Ref.current.up   = true; e.preventDefault(); }
      if (e.key === 'ArrowDown')           { keys2Ref.current.down = true; e.preventDefault(); }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft')           keysRef.current.left  = false;
      if (e.key === 'ArrowRight')          keysRef.current.right = false;
      if (e.key === 'w' || e.key === 'W') keysRef.current.up    = false;
      if (e.key === 's' || e.key === 'S') keysRef.current.down  = false;
      if (e.key === 'ArrowUp')             keys2Ref.current.up   = false;
      if (e.key === 'ArrowDown')           keys2Ref.current.down = false;
    };

    const handleBlur = () => {
      keysRef.current.left  = false;
      keysRef.current.right = false;
      keysRef.current.up    = false;
      keysRef.current.down  = false;
      keys2Ref.current.up   = false;
      keys2Ref.current.down = false;
    };

    window.addEventListener('mousemove', handleMouse);
    window.addEventListener('keydown',   handleKeyDown);
    window.addEventListener('keyup',     handleKeyUp);
    window.addEventListener('blur',      handleBlur);

    const resetBall = () => {
      hitCountRef.current = 0;
      ball.x  = canvas.width  / 2;
      ball.y  = canvas.height / 2;
      ball.dx = 0;
      ball.dy = 0;
      const spd = modeRef.current === '2player' ? 8 : settings.ballSpeed;
      if (modeRef.current === '2player') {
        const angle = (Math.random() - 0.5) * (Math.PI / 4.5);
        countdownRef.current = {
          active: true,
          start:  performance.now(),
          pendingDx: spd * Math.cos(angle) * (Math.random() > 0.5 ? 1 : -1),
          pendingDy: spd * Math.sin(angle),
        };
      } else {
        const angle = (Math.random() - 0.5) * (Math.PI / 3.6);
        countdownRef.current = {
          active: true,
          start:  performance.now(),
          pendingDx: spd * Math.sin(angle),
          pendingDy: spd * Math.cos(angle) * (Math.random() > 0.5 ? 1 : -1),
        };
      }
    };

    const checkPaddleCollision = (
      px: number, py: number, pw: number, ph: number, goingToward: boolean
    ): boolean => {
      if (!goingToward) return false;
      const ballR    = ball.size / 2;
      const closestX = Math.max(px, Math.min(ball.x, px + pw));
      const closestY = Math.max(py, Math.min(ball.y, py + ph));
      const distX    = ball.x - closestX;
      const distY    = ball.y - closestY;
      return (distX * distX + distY * distY) <= (ballR * ballR);
    };

    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const player = playerRef.current;
      const cpu    = cpuRef.current;
      const cd     = countdownRef.current;

      // Resolve countdown — apply velocity when time expires
      if (cd.active) {
        const elapsed = (performance.now() - cd.start) / 1000;
        if (elapsed >= COUNTDOWN_SECS) {
          ball.dx  = cd.pendingDx;
          ball.dy  = cd.pendingDy;
          cd.active = false;
        }
      }

      const pSpd = modeRef.current === '2player' ? 20 : settings.playerSpeed;

      if (modeRef.current === '2player') {
        // P1 (left paddle) — W/S keys, vertical movement
        if (keysRef.current.up)        player.y -= pSpd;
        else if (keysRef.current.down) player.y += pSpd;
        player.y = Math.max(0, Math.min(player.y, canvas.height - player.height));

        // P2 (right paddle) — arrow up/down, vertical movement
        if (keys2Ref.current.up)        cpu.y -= 20;
        else if (keys2Ref.current.down) cpu.y += 20;
        cpu.y = Math.max(0, Math.min(cpu.y, canvas.height - cpu.height));
      } else {
        // P1 (bottom paddle) — arrows or mouse, horizontal movement
        if (keysRef.current.left)       player.x -= pSpd;
        else if (keysRef.current.right) player.x += pSpd;
        else if (inputModeRef.current === 'mouse')
          player.x += (mouseRef.current - player.width / 2 - player.x) * settings.playerLerp;
        player.x = Math.max(0, Math.min(player.x, canvas.width - player.width));

        // CPU AI (top paddle)
        const cpuCenter = cpu.x + cpu.width / 2;
        if (difficulty === 'impossible') {
          const dynCpuSpeed = settings.cpuSpeed + hitCountRef.current * 0.5;
          if (cpuCenter < ball.x - 4) cpu.x += dynCpuSpeed;
          else if (cpuCenter > ball.x + 4) cpu.x -= dynCpuSpeed;
        } else if (ball.dy < 0) {
          const target = ball.x + (Math.random() - 0.5) * (1 - settings.cpuReaction) * 80;
          if (cpuCenter < target - 8) cpu.x += settings.cpuSpeed;
          else if (cpuCenter > target + 8) cpu.x -= settings.cpuSpeed;
        } else {
          const center = canvas.width / 2 - cpu.width / 2;
          if (cpu.x < center - 5) cpu.x += settings.cpuSpeed * 0.3;
          else if (cpu.x > center + 5) cpu.x -= settings.cpuSpeed * 0.3;
        }
        cpu.x = Math.max(0, Math.min(cpu.x, canvas.width - cpu.width));
      }

      // Ball movement
      ball.x += ball.dx;
      ball.y += ball.dy;

      const curSpeedGain = modeRef.current === '2player' ? 0.6 : settings.speedGain;
      const curMaxSpeed  = modeRef.current === '2player' ? 28  : settings.maxSpeed;

      if (modeRef.current === '2player') {
        // Top/bottom walls bounce
        if (ball.y < ball.size / 2)                  { ball.dy = Math.abs(ball.dy);  ball.y = ball.size / 2; }
        if (ball.y > canvas.height - ball.size / 2)  { ball.dy = -Math.abs(ball.dy); ball.y = canvas.height - ball.size / 2; }

        // Left paddle (P1) collision — ball moving left
        if (checkPaddleCollision(player.x, player.y, player.width, player.height, ball.dx < 0)) {
          const hitPoint = (ball.y - (player.y + player.height / 2)) / (player.height / 2);
          let speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
          speed = Math.min(speed + curSpeedGain, curMaxSpeed);
          const angle = hitPoint * (Math.PI / 3);
          ball.dx = Math.cos(angle) * speed;
          ball.dy = Math.sin(angle) * speed;
          ball.x  = player.x + player.width + ball.size / 2;
        }

        // Right paddle (P2) collision — ball moving right
        if (checkPaddleCollision(cpu.x, cpu.y, cpu.width, cpu.height, ball.dx > 0)) {
          const hitPoint = (ball.y - (cpu.y + cpu.height / 2)) / (cpu.height / 2);
          let speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
          speed = Math.min(speed + curSpeedGain, curMaxSpeed);
          const angle = hitPoint * (Math.PI / 3);
          ball.dx = -Math.cos(angle) * speed;
          ball.dy = Math.sin(angle) * speed;
          ball.x  = cpu.x - ball.size / 2;
        }

        // Scoring — ball exits left (P2 scores) or right (P1 scores)
        if (ball.x > canvas.width + ball.size) {
          playerScoreRef.current += 1;
          if (playerScoreRef.current >= WIN_SCORE) { setGameState('gameover'); setWinner('player'); return; }
          resetBall();
        }
        if (ball.x < -ball.size) {
          cpuScoreRef.current += 1;
          if (cpuScoreRef.current >= WIN_SCORE) { setGameState('gameover'); setWinner('cpu'); return; }
          resetBall();
        }
      } else {
        // Left/right walls bounce (solo mode)
        if (ball.x < ball.size / 2)                  { ball.dx = Math.abs(ball.dx);  ball.x = ball.size / 2; }
        if (ball.x > canvas.width - ball.size / 2)   { ball.dx = -Math.abs(ball.dx); ball.x = canvas.width - ball.size / 2; }

        // P1 paddle collision (bottom)
        if (checkPaddleCollision(player.x, player.y, player.width, player.height, ball.dy > 0)) {
          const hitPoint = (ball.x - (player.x + player.width / 2)) / (player.width / 2);
          let speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
          if (difficulty === 'impossible') {
            const rampGain = curSpeedGain + hitCountRef.current * 0.25;
            const rampMax  = curMaxSpeed  + hitCountRef.current * 3;
            speed = Math.min(speed + rampGain, rampMax);
            hitCountRef.current += 1;
          } else {
            speed = Math.min(speed + curSpeedGain, curMaxSpeed);
          }
          const angle = hitPoint * (Math.PI / 3);
          ball.dx = Math.sin(angle) * speed;
          ball.dy = -Math.cos(angle) * speed;
          ball.y  = player.y - ball.size / 2;
        }

        // Top paddle collision (CPU)
        if (checkPaddleCollision(cpu.x, cpu.y, cpu.width, cpu.height, ball.dy < 0)) {
          const hitPoint = (ball.x - (cpu.x + cpu.width / 2)) / (cpu.width / 2);
          let speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
          if (difficulty === 'impossible') {
            const rampGain = curSpeedGain + hitCountRef.current * 0.25;
            const rampMax  = curMaxSpeed  + hitCountRef.current * 3;
            speed = Math.min(speed + rampGain, rampMax);
            hitCountRef.current += 1;
          } else {
            speed = Math.min(speed + curSpeedGain, curMaxSpeed);
          }
          const angle = hitPoint * (Math.PI / 3);
          ball.dx = Math.sin(angle) * speed;
          ball.dy = Math.cos(angle) * speed;
          ball.y  = cpu.y + cpu.height + ball.size / 2;
        }

        // Scoring — ball exits bottom (CPU scores) or top (player scores)
        if (ball.y > canvas.height + ball.size) {
          cpuScoreRef.current += 1;
          if (cpuScoreRef.current >= WIN_SCORE) { setGameState('gameover'); setWinner('cpu'); return; }
          resetBall();
        }
        if (ball.y < -ball.size) {
          playerScoreRef.current += 1;
          if (playerScoreRef.current >= WIN_SCORE) { setGameState('gameover'); setWinner('player'); return; }
          resetBall();
        }
      }

      // ── Draw ──

      // Center line — vertical for 2P, horizontal for solo
      ctx.setLineDash([8, 12]);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      if (modeRef.current === '2player') {
        ctx.moveTo(canvas.width / 2, 0);
        ctx.lineTo(canvas.width / 2, canvas.height);
      } else {
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Ball
      ctx.save();
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      if (img.complete) {
        ctx.drawImage(img, ball.x - ball.size / 2, ball.y - ball.size / 2, ball.size, ball.size);
      } else {
        ctx.fillStyle = '#fff';
        ctx.fill();
      }
      ctx.restore();

      // P1 paddle
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.roundRect(player.x, player.y, player.width, player.height, 6);
      ctx.fill();

      // P2 / CPU paddle
      ctx.fillStyle = modeRef.current === '2player' ? '#fff' : 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.roundRect(cpu.x, cpu.y, cpu.width, cpu.height, 6);
      ctx.fill();

      // Scores
      ctx.fillStyle    = 'rgba(255,255,255,0.2)';
      ctx.font         = '700 80px system-ui, sans-serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'alphabetic';
      if (modeRef.current === '2player') {
        // P1 score left half, P2 score right half
        ctx.fillText(`${playerScoreRef.current}`, canvas.width / 4,     canvas.height / 2 + 40);
        ctx.fillText(`${cpuScoreRef.current}`,    canvas.width * 3 / 4, canvas.height / 2 + 40);
      } else {
        ctx.fillText(`${cpuScoreRef.current}`,    canvas.width / 2, canvas.height / 2 - 30);
        ctx.fillText(`${playerScoreRef.current}`, canvas.width / 2, canvas.height / 2 + 90);
      }

      // 2P control hints — shown near each paddle
      if (modeRef.current === '2player') {
        ctx.fillStyle    = 'rgba(255,255,255,0.22)';
        ctx.font         = '500 11px system-ui, sans-serif';
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign    = 'left';
        ctx.fillText('P1  ·  W / S', player.x + player.width + 10, canvas.height / 2);
        ctx.textAlign    = 'right';
        ctx.fillText('P2  ·  ↑ / ↓', cpu.x - 10, canvas.height / 2);
      }

      // Countdown overlay
      if (cd.active) {
        const elapsed = (performance.now() - cd.start) / 1000;
        const num     = COUNTDOWN_SECS - Math.floor(elapsed);
        const pulse   = 1 - (elapsed % 1);
        ctx.save();
        ctx.font         = '700 100px system-ui, sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = `rgba(255,255,255,${0.2 + 0.5 * pulse})`;
        const countdownY = canvas.height * 0.2;
        ctx.fillText(String(num), canvas.width / 2, countdownY);
        ctx.restore();
      }

      // Impossible rally counter
      if (difficulty === 'impossible' && hitCountRef.current > 0) {
        const heat = Math.min(hitCountRef.current / 10, 1);
        const r = Math.round(239);
        const g = Math.round(68  * (1 - heat));
        const b = Math.round(68  * (1 - heat));
        ctx.save();
        ctx.font         = `700 ${13 + hitCountRef.current}px system-ui, sans-serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle    = `rgba(${r},${g},${b},${0.4 + 0.4 * heat})`;
        ctx.fillText(`× ${hitCountRef.current}`, canvas.width / 2, canvas.height * 0.25 + 60);
        ctx.restore();
      }

      // Mode / difficulty label (bottom-left)
      ctx.fillStyle    = difficulty === 'impossible' ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.2)';
      ctx.font         = '600 11px system-ui, sans-serif';
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(modeRef.current === '2player' ? '2P' : difficulty.toUpperCase(), 20, canvas.height - 16);

      // Exit hint
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font      = '500 11px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText("'P' to exit", canvas.width - 20, canvas.height - 16);

      // Win target
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.font      = '500 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`First to ${WIN_SCORE}`, canvas.width / 2, canvas.height - 16);

      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize',    resize);
      window.removeEventListener('mousemove', handleMouse);
      window.removeEventListener('keydown',   handleKeyDown);
      window.removeEventListener('keyup',     handleKeyUp);
      window.removeEventListener('blur',      handleBlur);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isOpen, gameState, difficulty, mode]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950/90 backdrop-blur-md flex items-center justify-center">

      {/* Menu */}
      {gameState === 'menu' && (
        <div className="flex flex-col items-center gap-8">
          <h2 className="text-white text-4xl font-black tracking-[0.2em] uppercase">Pong</h2>

          <div className="flex flex-col items-center gap-4">
            <p className="text-zinc-500 text-xs tracking-widest uppercase">VS CPU</p>
            <div className="flex gap-4 flex-wrap justify-center">
              {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  onClick={() => startGame(d)}
                  className="cursor-target px-8 py-3 rounded-xl border-2 border-dashed border-zinc-700 bg-transparent text-white font-bold text-sm uppercase tracking-[0.15em] hover:border-white hover:bg-white/5 transition-all duration-200 cursor-pointer"
                >
                  {d}
                </button>
              ))}
              <button
                onClick={() => startGame('impossible')}
                className="cursor-target px-8 py-3 rounded-xl border-2 border-dashed border-red-900 bg-transparent text-red-500 font-bold text-sm uppercase tracking-[0.15em] hover:border-red-500 hover:bg-red-500/10 transition-all duration-200 cursor-pointer"
              >
                impossible
              </button>
            </div>
          </div>

          <div className="w-64 border-t border-zinc-800" />

          <div className="flex flex-col items-center gap-4">
            <p className="text-zinc-500 text-xs tracking-widest uppercase">Local Multiplayer</p>
            <button
              onClick={startTwoPlayer}
              className="cursor-target px-10 py-3 rounded-xl border-2 border-dashed border-zinc-600 bg-transparent text-white font-bold text-sm uppercase tracking-[0.15em] hover:border-white hover:bg-white/5 transition-all duration-200 cursor-pointer"
            >
              2 Player
            </button>
            <p className="text-zinc-600 text-xs tracking-widest">P1: W / S  ·  P2: ↑ / ↓</p>
          </div>

          <p className="text-zinc-600 text-xs tracking-widest">First to {WIN_SCORE} wins · Press P to close</p>
        </div>
      )}

      {/* Playing */}
      {gameState === 'playing' && (
        <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full cursor-none" />
      )}

      {/* Game Over */}
      {gameState === 'gameover' && (
        <div className="flex flex-col items-center gap-6">
          <h2 className="text-white text-5xl font-black tracking-[0.15em] uppercase">
            {mode === '2player'
              ? (winner === 'player' ? 'Player 1 Wins!' : 'Player 2 Wins!')
              : (winner === 'player' ? 'You Win!' : 'CPU Wins')}
          </h2>
          <p className="text-zinc-500 text-sm tracking-widest">
            {playerScoreRef.current} — {cpuScoreRef.current}
          </p>
          <div className="flex gap-4 mt-4">
            <button
              onClick={() => mode === '2player' ? startTwoPlayer() : startGame(difficulty)}
              className="cursor-target px-8 py-3 rounded-xl border-2 border-dashed border-zinc-700 bg-transparent text-white font-bold text-sm uppercase tracking-[0.15em] hover:border-white hover:bg-white/5 transition-all duration-200 cursor-pointer"
            >
              Rematch
            </button>
            <button
              onClick={() => { setGameState('menu'); setWinner(null); }}
              className="cursor-target px-8 py-3 rounded-xl border-2 border-dashed border-zinc-700 bg-transparent text-white font-bold text-sm uppercase tracking-[0.15em] hover:border-white hover:bg-white/5 transition-all duration-200 cursor-pointer"
            >
              Menu
            </button>
          </div>
          <p className="text-zinc-600 text-xs tracking-widest mt-2">Press P to close</p>
        </div>
      )}

    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Difficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTY_SETTINGS = {
  easy:   { cpuSpeed: 5, cpuReaction: 0.75, ballSpeed: 5, speedGain: 0.3, maxSpeed: 13 },
  medium: { cpuSpeed: 7, cpuReaction: 0.92, ballSpeed: 6, speedGain: 0.4, maxSpeed: 17 },
  hard:   { cpuSpeed: 9, cpuReaction: 1.0, ballSpeed: 7, speedGain: 0.5, maxSpeed: 22 },
};

const WIN_SCORE = 5;

export function PongGame() {
  const [isOpen, setIsOpen] = useState(false);
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'gameover'>('menu');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [winner, setWinner] = useState<'player' | 'cpu' | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  
  const playerRef = useRef({ x: 300, y: 0, width: 120, height: 12 });
  const cpuRef = useRef({ x: 300, y: 40, width: 120, height: 12 });
  const ballRef = useRef({ x: 300, y: 200, dx: 4, dy: 4, size: 50 });
  const mouseRef = useRef(300);
  const keysRef = useRef({ left: false, right: false });
  const inputModeRef = useRef<'mouse' | 'keyboard'>('mouse');
  const playerScoreRef = useRef(0);
  const cpuScoreRef = useRef(0);

  // Toggle overlay with P key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'p') {
        setIsOpen(prev => {
          if (prev) {
            // Closing — reset everything
            setGameState('menu');
            setWinner(null);
            playerScoreRef.current = 0;
            cpuScoreRef.current = 0;
          }
          return !prev;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const startGame = useCallback((diff: Difficulty) => {
    setDifficulty(diff);
    setGameState('playing');
    setWinner(null);
    playerScoreRef.current = 0;
    cpuScoreRef.current = 0;
    const ball = ballRef.current;
    ball.dx = DIFFICULTY_SETTINGS[diff].ballSpeed * (Math.random() > 0.5 ? 1 : -1);
    ball.dy = DIFFICULTY_SETTINGS[diff].ballSpeed;
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
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const img = new window.Image();
    img.src = '/profile.jpg';

    const settings = DIFFICULTY_SETTINGS[difficulty];
    
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      playerRef.current.y = canvas.height - 60;
      cpuRef.current.y = 48;
    };
    
    window.addEventListener('resize', resize);
    resize();

    // Center ball
    const ball = ballRef.current;
    ball.x = canvas.width / 2;
    ball.y = canvas.height / 2;
    
    const handleMouse = (e: MouseEvent) => {
      mouseRef.current = e.clientX;
      inputModeRef.current = 'mouse';
    };
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { keysRef.current.left = true; inputModeRef.current = 'keyboard'; e.preventDefault(); }
      if (e.key === 'ArrowRight') { keysRef.current.right = true; inputModeRef.current = 'keyboard'; e.preventDefault(); }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') keysRef.current.left = false;
      if (e.key === 'ArrowRight') keysRef.current.right = false;
    };
    
    window.addEventListener('mousemove', handleMouse);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const resetBall = () => {
      const player = playerRef.current;
      const spawnPlayerSide = Math.random() > 0.5;
      if (spawnPlayerSide) {
        ball.x = player.x + player.width / 2;
        ball.y = canvas.height * 0.6;
        ball.dy = -settings.ballSpeed; // Go up toward CPU
      } else {
        ball.x = cpuRef.current.x + cpuRef.current.width / 2;
        ball.y = canvas.height * 0.4;
        ball.dy = settings.ballSpeed; // Go down toward player
      }
      ball.dx = settings.ballSpeed * (Math.random() > 0.5 ? 1 : -1);
    };

    const checkPaddleCollision = (
      px: number, py: number, pw: number, ph: number, goingToward: boolean
    ): boolean => {
      if (!goingToward) return false;
      const ballR = ball.size / 2;
      const closestX = Math.max(px, Math.min(ball.x, px + pw));
      const closestY = Math.max(py, Math.min(ball.y, py + ph));
      const distX = ball.x - closestX;
      const distY = ball.y - closestY;
      return (distX * distX + distY * distY) <= (ballR * ballR);
    };
    
    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const player = playerRef.current;
      const cpu = cpuRef.current;
      
      // Player paddle
      if (keysRef.current.left) player.x -= 16;
      else if (keysRef.current.right) player.x += 16;
      else if (inputModeRef.current === 'mouse') player.x += (mouseRef.current - player.width / 2 - player.x) * 0.3;
      // When keyboard mode and no keys pressed, paddle stays put
      player.x = Math.max(0, Math.min(player.x, canvas.width - player.width));
      
      // CPU paddle
      const cpuCenter = cpu.x + cpu.width / 2;
      if (ball.dy < 0) {
        const target = ball.x + (Math.random() - 0.5) * (1 - settings.cpuReaction) * 80;
        if (cpuCenter < target - 8) cpu.x += settings.cpuSpeed;
        else if (cpuCenter > target + 8) cpu.x -= settings.cpuSpeed;
      } else {
        const center = canvas.width / 2 - cpu.width / 2;
        if (cpu.x < center - 5) cpu.x += settings.cpuSpeed * 0.3;
        else if (cpu.x > center + 5) cpu.x -= settings.cpuSpeed * 0.3;
      }
      cpu.x = Math.max(0, Math.min(cpu.x, canvas.width - cpu.width));
      
      // Ball movement
      ball.x += ball.dx;
      ball.y += ball.dy;
      
      // Wall collision
      if (ball.x < ball.size / 2) { ball.dx = Math.abs(ball.dx); ball.x = ball.size / 2; }
      if (ball.x > canvas.width - ball.size / 2) { ball.dx = -Math.abs(ball.dx); ball.x = canvas.width - ball.size / 2; }

      // Player paddle collision
      if (checkPaddleCollision(player.x, player.y, player.width, player.height, ball.dy > 0)) {
        const hitPoint = (ball.x - (player.x + player.width / 2)) / (player.width / 2);
        let speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
        speed = Math.min(speed + settings.speedGain, settings.maxSpeed);
        const angle = hitPoint * (Math.PI / 3);
        ball.dx = Math.sin(angle) * speed;
        ball.dy = -Math.cos(angle) * speed;
        ball.y = player.y - ball.size / 2;
      }

      // CPU paddle collision
      if (checkPaddleCollision(cpu.x, cpu.y, cpu.width, cpu.height, ball.dy < 0)) {
        const hitPoint = (ball.x - (cpu.x + cpu.width / 2)) / (cpu.width / 2);
        let speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
        speed = Math.min(speed + settings.speedGain, settings.maxSpeed);
        const angle = hitPoint * (Math.PI / 3);
        ball.dx = Math.sin(angle) * speed;
        ball.dy = Math.cos(angle) * speed;
        ball.y = cpu.y + cpu.height + ball.size / 2;
      }
      
      // Scoring
      if (ball.y > canvas.height + ball.size) {
        cpuScoreRef.current += 1;
        if (cpuScoreRef.current >= WIN_SCORE) {
          setGameState('gameover');
          setWinner('cpu');
          return;
        }
        resetBall();
      }
      if (ball.y < -ball.size) {
        playerScoreRef.current += 1;
        if (playerScoreRef.current >= WIN_SCORE) {
          setGameState('gameover');
          setWinner('player');
          return;
        }
        resetBall();
      }
      
      // ── Draw ──

      // Center line
      ctx.setLineDash([8, 12]);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Ball
      ctx.save();
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip(); 
      if (img.complete) {
        ctx.drawImage(img, ball.x - ball.size/2, ball.y - ball.size/2, ball.size, ball.size);
      } else {
        ctx.fillStyle = '#fff';
        ctx.fill();
      }
      ctx.restore();
      
      // Player paddle
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.roundRect(player.x, player.y, player.width, player.height, 6);
      ctx.fill();

      // CPU paddle
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.roundRect(cpu.x, cpu.y, cpu.width, cpu.height, 6);
      ctx.fill();
      
      // Scores
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '700 80px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${cpuScoreRef.current}`, canvas.width / 2, canvas.height / 2 - 30);
      ctx.fillText(`${playerScoreRef.current}`, canvas.width / 2, canvas.height / 2 + 90);

      // Difficulty label
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(difficulty.toUpperCase(), 20, canvas.height - 16);

      // Exit hint
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '500 11px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText("'P' to exit", canvas.width - 20, canvas.height - 16);

      // Win target
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.font = '500 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`First to ${WIN_SCORE}`, canvas.width / 2, canvas.height - 16);
      
      requestRef.current = requestAnimationFrame(loop);
    };
    
    requestRef.current = requestAnimationFrame(loop);
    
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouse);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isOpen, gameState, difficulty]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950/90 backdrop-blur-md flex items-center justify-center">
      
      {/* Menu Screen */}
      {gameState === 'menu' && (
        <div className="flex flex-col items-center gap-8">
          <h2 className="text-white text-4xl font-black tracking-[0.2em] uppercase">Pong</h2>
          <p className="text-zinc-500 text-sm tracking-widest uppercase">Select Difficulty</p>
          <div className="flex gap-4">
            {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => startGame(d)}
                className="cursor-target px-8 py-3 rounded-xl border-2 border-dashed border-zinc-700 bg-transparent text-white font-bold text-sm uppercase tracking-[0.15em] hover:border-white hover:bg-white/5 transition-all duration-200 cursor-pointer"
              >
                {d}
              </button>
            ))}
          </div>
          <p className="text-zinc-600 text-xs tracking-widest mt-4">First to {WIN_SCORE} wins · Press P to close</p>
        </div>
      )}

      {/* Playing Screen */}
      {gameState === 'playing' && (
        <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full cursor-none" />
      )}

      {/* Game Over Screen */}
      {gameState === 'gameover' && (
        <div className="flex flex-col items-center gap-6">
          <h2 className="text-white text-5xl font-black tracking-[0.15em] uppercase">
            {winner === 'player' ? 'You Win!' : 'CPU Wins'}
          </h2>
          <p className="text-zinc-500 text-sm tracking-widest">
            {playerScoreRef.current} — {cpuScoreRef.current}
          </p>
          <div className="flex gap-4 mt-4">
            <button
              onClick={() => startGame(difficulty)}
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

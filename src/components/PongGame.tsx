"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Difficulty = 'easy' | 'medium' | 'hard' | 'impossible';
type Mode = 'solo' | '2player';
type ArcadeGame = 'pong' | 'invaders';
type InvaderOutcome = 'victory' | 'defeat' | null;
type BulletType = 'machinegun' | 'bazooka' | 'electric';

type UpgradeKey = 'blaster' | 'damage' | 'thrusters' | 'spread' | 'volley';

type InvaderUpgradeState = Record<UpgradeKey, number>;

type Bullet = {
  x: number; y: number; vx: number; vy: number;
  radius: number; damage: number; kind?: BulletType;
};

type Enemy = {
  x: number; y: number; width: number; height: number; hp: number; maxHp: number;
};

type EnemyBullet = {
  x: number; y: number; vy: number; radius: number;
};

type DiveAttacker = {
  x: number; y: number; vx: number; vy: number;
  size: number; hp: number; steer: number;
};

type Boss = {
  x: number; y: number; vx: number;
  width: number; height: number;
  hp: number; maxHp: number;
  shotTimer: number; phase: number;
};

type PowerUpKind = 'rapidfire' | 'tripleshot' | 'speed' | 'shield';

type PowerUpDrop = {
  x: number; y: number; vy: number; kind: PowerUpKind; id: number;
};

type ActiveBuff = {
  kind: PowerUpKind; expiresAt: number;
};

type Particle = {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; r: number; color: string;
};

type ElectricArc = {
  x1: number; y1: number; x2: number; y2: number; life: number;
};

type ScorePopup = {
  x: number; y: number; text: string; vy: number; life: number; color: string;
};

const POWERUP_COLORS: Record<PowerUpKind, string> = {
  rapidfire: '#ffe040',
  tripleshot: '#40e0ff',
  speed:      '#50ff80',
  shield:     '#8888ff',
};
const POWERUP_LABELS: Record<PowerUpKind, string> = {
  rapidfire: '⚡',
  tripleshot: '✦',
  speed:      '▶',
  shield:     '◈',
};

const BULLET_LABELS: Record<BulletType, string> = {
  machinegun: '▶▶ M-GUN',
  bazooka:    '◉ BAZOOKA',
  electric:   '⚡ ELECTRIC',
};

const BULLET_COLORS: Record<BulletType, string> = {
  machinegun: '#ffe040',
  bazooka:    '#ff8040',
  electric:   '#b060ff',
};

const POWERUP_DURATION = 6000;
const POWERUP_KINDS: PowerUpKind[] = ['rapidfire', 'tripleshot', 'speed', 'shield'];
let _puIdCounter = 0;

const DIFFICULTY_SETTINGS = {
  easy:       { cpuSpeed: 6,  cpuReaction: 0.78, ballSpeed: 6,  speedGain: 0.40, maxSpeed: 17, playerSpeed: 17, playerLerp: 0.30 },
  medium:     { cpuSpeed: 8,  cpuReaction: 0.90, ballSpeed: 8,  speedGain: 0.55, maxSpeed: 23, playerSpeed: 18, playerLerp: 0.30 },
  hard:       { cpuSpeed: 11, cpuReaction: 0.97, ballSpeed: 10, speedGain: 0.70, maxSpeed: 30, playerSpeed: 20, playerLerp: 0.30 },
  impossible: { cpuSpeed: 20, cpuReaction: 1.0,  ballSpeed: 11, speedGain: 0.9,  maxSpeed: 50, playerSpeed: 26, playerLerp: 0.50 },
};

const WIN_SCORE = 5;
const COUNTDOWN_SECS = 3;
const MAX_UPGRADE_LEVEL = 6;
const INVADER_TOTAL_WAVES = 12;

const UPGRADE_META: Record<UpgradeKey, { label: string; desc: string; baseCost: number; step: number }> = {
  blaster:   { label: 'Blaster Cooling',    desc: 'Shoot faster with tighter cooldown.',               baseCost: 140, step: 90 },
  damage:    { label: 'Plasma Damage',      desc: 'Each shot hits harder.',                             baseCost: 190, step: 120 },
  thrusters: { label: 'Thruster Power',     desc: 'Move your ship faster.',                            baseCost: 160, step: 100 },
  spread:    { label: 'Spread Shot',        desc: 'Unlock side projectiles for crowd control.',        baseCost: 260, step: 150 },
  volley:    { label: 'Volley Cannon',      desc: 'Fire a fan of bullets. Up to 10 at once at max.', baseCost: 340, step: 190 },
};

const getUpgradeCost = (key: UpgradeKey, level: number): number => {
  const m = UPGRADE_META[key];
  return m.baseCost + m.step * level;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, max));

// Draw a lightning bolt between two points
function drawLightning(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, segments: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  const dx = x2 - x1, dy = y2 - y1;
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const jitter = (Math.random() - 0.5) * 22;
    const px = x1 + dx * t + (-dy / Math.hypot(dx, dy)) * jitter;
    const py = y1 + dy * t + (dx / Math.hypot(dx, dy)) * jitter;
    ctx.lineTo(px, py);
  }
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

export function PongGame() {
  const [isOpen, setIsOpen] = useState(false);
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'gameover'>('menu');
  const [arcadeGame, setArcadeGame] = useState<ArcadeGame>('pong');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [mode, setMode] = useState<Mode>('solo');
  const [winner, setWinner] = useState<'player' | 'cpu' | null>(null);
  const [invaderOutcome, setInvaderOutcome] = useState<InvaderOutcome>(null);
  const [pongFinalScore, setPongFinalScore] = useState({ player: 0, cpu: 0 });
  const [invaderFinalStats, setInvaderFinalStats] = useState({ score: 0, wave: 1, coins: 0 });
  const [bankCoins, setBankCoins] = useState(0);
  const [storeOpen, setStoreOpen] = useState(false);
  const [bulletType, setBulletType] = useState<BulletType>(() => {
    try {
      const saved = localStorage.getItem('invaders_weapon') as BulletType | null;
      if (saved === 'machinegun' || saved === 'bazooka' || saved === 'electric') return saved;
    } catch {}
    return 'machinegun';
  });
  const [upgrades, setUpgrades] = useState<InvaderUpgradeState>({
    blaster: 0, damage: 0, thrusters: 0, spread: 0, volley: 0,
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  const storeOpenRef = useRef(false);
  const bankCoinsRef = useRef(0);
  const upgradesRef = useRef<InvaderUpgradeState>(upgrades);

  const playerRef = useRef({ x: 300, y: 0, width: 120, height: 12 });
  const cpuRef    = useRef({ x: 300, y: 40, width: 120, height: 12 });
  const ballRef   = useRef({ x: 300, y: 200, dx: 0, dy: 0, size: 50 });
  const mouseRef  = useRef(300);
  const keysRef   = useRef({ left: false, right: false, up: false, down: false });
  const keys2Ref  = useRef({ up: false, down: false });
  const inputModeRef = useRef<'mouse' | 'keyboard'>('mouse');
  const modeRef   = useRef<Mode>('solo');
  const countdownRef = useRef({ active: false, start: 0, pendingDx: 0, pendingDy: 0 });
  const hitCountRef    = useRef(0);
  const playerScoreRef = useRef(0);
  const cpuScoreRef    = useRef(0);

  const invPlayerRef = useRef({ x: 0, y: 0, width: 56, height: 26 });
  const invadersRef = useRef<Enemy[]>([]);
  const playerBulletsRef = useRef<Bullet[]>([]);
  const enemyBulletsRef = useRef<EnemyBullet[]>([]);
  const diveAttackersRef = useRef<DiveAttacker[]>([]);
  const bossRef = useRef<Boss | null>(null);
  const powerUpDropsRef = useRef<PowerUpDrop[]>([]);
  const activeBuffsRef = useRef<ActiveBuff[]>([]);
  const invaderDirectionRef = useRef(1);
  const invaderScoreRef = useRef(0);
  const invaderWaveRef = useRef(1);
  const invaderWaveNoticeUntilRef = useRef(0);
  const invaderLivesRef = useRef(3);
  const runCoinsRef = useRef(0);
  const invaderKeysRef = useRef({ left: false, right: false, fire: false });
  const lastShotAtRef = useRef(0);
  const enemyShotTimerRef = useRef(0);
  const diveSpawnTimerRef = useRef(0);
  const starsRef = useRef<{ x: number; y: number; r: number; s: number }[]>([]);

  // New gameplay refs
  const particlesRef = useRef<Particle[]>([]);
  const electricArcsRef = useRef<ElectricArc[]>([]);
  const scorePopupsRef = useRef<ScorePopup[]>([]);
  const bulletTypeRef = useRef<BulletType>('machinegun');
  const lastElectricShotRef = useRef(0);
  const screenShakeRef = useRef(0);

  useEffect(() => { storeOpenRef.current = storeOpen; }, [storeOpen]);
  useEffect(() => { bankCoinsRef.current = bankCoins; }, [bankCoins]);
  useEffect(() => { upgradesRef.current = upgrades; }, [upgrades]);
  useEffect(() => {
    bulletTypeRef.current = bulletType;
    try { localStorage.setItem('invaders_weapon', bulletType); } catch {}
  }, [bulletType]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setIsOpen(prev => {
          if (prev) {
            setGameState('menu');
            setWinner(null);
            setInvaderOutcome(null);
            setStoreOpen(false);
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
    setArcadeGame('pong');
    setStoreOpen(false);
    modeRef.current = 'solo';
    setMode('solo');
    setDifficulty(diff);
    setGameState('playing');
    setWinner(null);
    setPongFinalScore({ player: 0, cpu: 0 });
    playerScoreRef.current = 0;
    cpuScoreRef.current    = 0;
  }, []);

  const startTwoPlayer = useCallback(() => {
    setArcadeGame('pong');
    setStoreOpen(false);
    modeRef.current = '2player';
    setMode('2player');
    setDifficulty('medium');
    setGameState('playing');
    setWinner(null);
    setPongFinalScore({ player: 0, cpu: 0 });
    playerScoreRef.current = 0;
    cpuScoreRef.current    = 0;
  }, []);

  const startInvaders = useCallback(() => {
    setArcadeGame('invaders');
    setStoreOpen(false);
    setGameState('playing');
    setInvaderOutcome(null);
    setInvaderFinalStats({ score: 0, wave: 1, coins: 0 });
    invaderScoreRef.current = 0;
    invaderWaveRef.current = 1;
    invaderWaveNoticeUntilRef.current = performance.now() + 1800;
    runCoinsRef.current = 0;
    invaderLivesRef.current = 3;
    enemyShotTimerRef.current = 0;
    diveSpawnTimerRef.current = 0;
    lastShotAtRef.current = 0;
    bossRef.current = null;
    powerUpDropsRef.current = [];
    activeBuffsRef.current = [];
    invaderKeysRef.current = { left: false, right: false, fire: false };
    particlesRef.current = [];
    electricArcsRef.current = [];
    scorePopupsRef.current = [];
    const savedWeapon = (() => {
      try {
        const s = localStorage.getItem('invaders_weapon') as BulletType | null;
        if (s === 'machinegun' || s === 'bazooka' || s === 'electric') return s;
      } catch {}
      return 'machinegun';
    })();
    bulletTypeRef.current = savedWeapon;
    setBulletType(savedWeapon);
    lastElectricShotRef.current = 0;
    screenShakeRef.current = 0;
  }, []);

  const finishPong = useCallback((nextWinner: 'player' | 'cpu') => {
    setPongFinalScore({ player: playerScoreRef.current, cpu: cpuScoreRef.current });
    setWinner(nextWinner);
    setGameState('gameover');
  }, []);

  const finishInvaders = useCallback((outcome: 'victory' | 'defeat') => {
    setInvaderFinalStats({
      score: invaderScoreRef.current,
      wave: invaderWaveRef.current,
      coins: runCoinsRef.current,
    });
    setInvaderOutcome(outcome);
    setGameState('gameover');
  }, []);

  const purchaseUpgrade = useCallback((key: UpgradeKey) => {
    setUpgrades(prev => {
      const level = prev[key];
      if (level >= MAX_UPGRADE_LEVEL) return prev;
      const price = getUpgradeCost(key, level);
      if (bankCoinsRef.current < price) return prev;
      setBankCoins(c => {
        const next = c - price;
        bankCoinsRef.current = next;
        return next;
      });
      return { ...prev, [key]: level + 1 };
    });
  }, []);

  const spawnInvaderWave = useCallback((canvas: HTMLCanvasElement) => {
    const wave = invaderWaveRef.current;
    playerBulletsRef.current = [];
    enemyBulletsRef.current = [];
    diveAttackersRef.current = [];
    invaderWaveNoticeUntilRef.current = performance.now() + 1800;
    diveSpawnTimerRef.current = 0;
    invaderDirectionRef.current = 1;

    if (wave >= INVADER_TOTAL_WAVES) {
      invadersRef.current = [];
      const bossHp = 560 + (wave - INVADER_TOTAL_WAVES) * 220;
      bossRef.current = {
        x: canvas.width / 2 - 80, y: 70,
        vx: 2.6, width: 160, height: 52,
        hp: bossHp, maxHp: bossHp,
        shotTimer: 0, phase: 1,
      };
      return;
    }

    bossRef.current = null;
    const baseCount = 5 + (wave - 1) * 8;
    const totalEnemies = Math.min(baseCount, 80);
    const enemyW = 38, enemyH = 24, gapX = 12, gapY = 10;
    const cols = clamp(Math.ceil(Math.sqrt(totalEnemies * 1.6)), 5, 13);
    const rows = Math.ceil(totalEnemies / cols);
    const formationWidth = cols * enemyW + (cols - 1) * gapX;
    const startX = (canvas.width - formationWidth) / 2;
    const startY = 80;
    const hpBase = 1 + Math.floor(wave / 1.5);

    const enemies: Enemy[] = [];
    let placed = 0;
    for (let row = 0; row < rows && placed < totalEnemies; row++) {
      for (let col = 0; col < cols && placed < totalEnemies; col++) {
        const hp = hpBase + (row === 0 ? 1 : 0);
        enemies.push({ x: startX + col * (enemyW + gapX), y: startY + row * (enemyH + gapY), width: enemyW, height: enemyH, hp, maxHp: hp });
        placed++;
      }
    }

    invadersRef.current = enemies;
    powerUpDropsRef.current = [];
    activeBuffsRef.current = [];
  }, []);

  const drawInvaderStore = useCallback(() => {
    const order: UpgradeKey[] = ['blaster', 'damage', 'thrusters', 'spread', 'volley'];
    const weaponDescs: Record<BulletType, string> = {
      machinegun: 'Extremely rapid fire · low damage per shot',
      bazooka:    'Slow · massive AOE explosion on impact',
      electric:   'Chain lightning · hits tens of enemies at once',
    };
    return (
      <div className="pointer-events-auto w-[min(760px,92vw)] rounded-3xl border border-zinc-700 bg-zinc-950/95 shadow-2xl flex flex-col max-h-[min(580px,88vh)]">
        <div className="flex items-center justify-between gap-4 px-6 pt-6 pb-3 md:px-8 md:pt-8">
          <h3 className="text-white text-2xl font-black tracking-[0.12em] uppercase">Ship Upgrades</h3>
          <p className="text-emerald-300 text-sm tracking-widest uppercase">Coins: {bankCoins}</p>
        </div>

        {/* Weapon selector */}
        <div className="px-6 md:px-8 pb-4 border-b border-zinc-800/60">
          <p className="text-zinc-500 text-[10px] tracking-widest uppercase mb-2">Weapon</p>
          <div className="grid grid-cols-3 gap-2">
            {(['machinegun', 'bazooka', 'electric'] as BulletType[]).map(type => {
              const selected = bulletType === type;
              return (
                <button
                  key={type}
                  onClick={() => { setBulletType(type); bulletTypeRef.current = type; }}
                  className={`flex flex-col items-start px-3 py-2 rounded-lg border text-left transition-all duration-100 ${
                    selected
                      ? 'border-white bg-zinc-700 text-white'
                      : 'border-zinc-700 bg-zinc-900 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <span className="text-[11px] font-bold tracking-widest uppercase">{BULLET_LABELS[type]}</span>
                  <span className="text-[10px] font-normal mt-0.5 leading-tight opacity-70">{weaponDescs[type]}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 px-6 md:px-8 pb-2" style={{ scrollbarWidth: 'auto', scrollbarColor: '#52525b transparent' }} onWheel={e => e.stopPropagation()}>
          <div className="grid gap-3">
            {order.map((key) => {
              const meta = UPGRADE_META[key];
              const level = upgrades[key];
              const maxed = level >= MAX_UPGRADE_LEVEL;
              const price = getUpgradeCost(key, level);
              const afford = bankCoins >= price;
              return (
                <div key={key} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-white text-sm font-bold tracking-wide">{meta.label}</p>
                    <p className="text-zinc-400 text-xs">{meta.desc}</p>
                    <p className="text-zinc-500 text-[11px] mt-1 uppercase tracking-widest">Level {level}/{MAX_UPGRADE_LEVEL}</p>
                  </div>
                  <button
                    onClick={() => purchaseUpgrade(key)}
                    disabled={maxed || !afford}
                    className="cursor-target px-4 py-2 rounded-lg border border-dashed border-zinc-600 text-xs font-bold tracking-[0.1em] uppercase text-white disabled:opacity-35 disabled:cursor-not-allowed hover:border-emerald-400 hover:bg-emerald-400/10 transition"
                  >
                    {maxed ? 'Max' : `${price} C`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-zinc-500 tracking-wide px-6 py-4 md:px-8 border-t border-zinc-800/60">
          <p>Coins are rare - earned by clearing waves and hitting enemies.</p>
          <button onClick={() => setStoreOpen(false)} className="cursor-target px-3 py-2 rounded-lg border border-zinc-700 hover:border-white hover:bg-white/5 text-white text-[11px] uppercase tracking-[0.12em]">
            Close
          </button>
        </div>
      </div>
    );
  }, [bankCoins, bulletType, purchaseUpgrade, upgrades]);

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

  // ── Game loop ──
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

    if (arcadeGame === 'invaders') {
      const resizeInvaders = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        invPlayerRef.current.width = 56;
        invPlayerRef.current.height = 26;
        invPlayerRef.current.x = canvas.width / 2 - invPlayerRef.current.width / 2;
        invPlayerRef.current.y = canvas.height - 76;

        if (starsRef.current.length < 130) {
          starsRef.current = Array.from({ length: 160 }, () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            r: Math.random() * 1.8 + 0.4,
            s: Math.random() * 0.3 + 0.1,
          }));
        }
      };

      resizeInvaders();
      spawnInvaderWave(canvas);

      const onResize = () => resizeInvaders();

      const onKeyDown = (e: KeyboardEvent) => {
        const key = e.key.toLowerCase();
        if (key === 'arrowleft' || key === 'a') { invaderKeysRef.current.left = true; e.preventDefault(); }
        if (key === 'arrowright' || key === 'd') { invaderKeysRef.current.right = true; e.preventDefault(); }
        if (key === ' ' || key === 'spacebar') { invaderKeysRef.current.fire = true; e.preventDefault(); }
        if (key === 'b') { setStoreOpen(prev => !prev); e.preventDefault(); }
        // Weapon switching
        if (key === '1') { bulletTypeRef.current = 'machinegun'; setBulletType('machinegun'); e.preventDefault(); }
        if (key === '2') { bulletTypeRef.current = 'bazooka';    setBulletType('bazooka');    e.preventDefault(); }
        if (key === '3') { bulletTypeRef.current = 'electric';   setBulletType('electric');   e.preventDefault(); }
        if (key === 'q') {
          const types: BulletType[] = ['machinegun', 'bazooka', 'electric'];
          const next = types[(types.indexOf(bulletTypeRef.current) + 1) % types.length];
          bulletTypeRef.current = next;
          setBulletType(next);
          e.preventDefault();
        }
      };

      const onKeyUp = (e: KeyboardEvent) => {
        const key = e.key.toLowerCase();
        if (key === 'arrowleft' || key === 'a') invaderKeysRef.current.left = false;
        if (key === 'arrowright' || key === 'd') invaderKeysRef.current.right = false;
        if (key === ' ' || key === 'spacebar') invaderKeysRef.current.fire = false;
      };

      const onBlur = () => {
        invaderKeysRef.current.left = false;
        invaderKeysRef.current.right = false;
        invaderKeysRef.current.fire = false;
      };

      window.addEventListener('resize', onResize);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);

      let prevFrame = performance.now();

      // ── Helpers ──
      const spawnExplosion = (x: number, y: number, count: number, colors: string[]) => {
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 1.5 + Math.random() * 4.5;
          particlesRef.current.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 350 + Math.random() * 350,
            maxLife: 700,
            r: 1.5 + Math.random() * 3.5,
            color: colors[Math.floor(Math.random() * colors.length)],
          });
        }
      };

      const killEnemyAt = (e: number, enemies: Enemy[], cx: number, cy: number, popColor: string) => {
        const earn = 2 + invaderWaveRef.current;
        invaderScoreRef.current += 100;
        runCoinsRef.current += earn;
        setBankCoins(c => { const next = c + earn; bankCoinsRef.current = next; return next; });
        scorePopupsRef.current.push({ x: cx, y: cy, text: '+100', vy: -1.2, life: 900, color: popColor });
        if (Math.random() < 0.07) {
          const kind = POWERUP_KINDS[Math.floor(Math.random() * POWERUP_KINDS.length)];
          powerUpDropsRef.current.push({ x: cx, y: cy, vy: 1.8, kind, id: ++_puIdCounter });
        }
        spawnExplosion(cx, cy, 12, ['#ff6644', '#ffaa44', '#ff4422', '#ffcc88', '#ff8800']);
        enemies.splice(e, 1);
      };

      // Hits every enemy within range simultaneously - true spread damage
      const doElectricSpread = (hitX: number, hitY: number, enemies: Enemy[], damage: number, now: number) => {
        if (now - lastElectricShotRef.current < 500) return;
        lastElectricShotRef.current = now;

        const range = 280;
        screenShakeRef.current = 8;

        for (let i = enemies.length - 1; i >= 0; i--) {
          const ex = enemies[i].x + enemies[i].width / 2;
          const ey = enemies[i].y + enemies[i].height / 2;
          if (Math.hypot(ex - hitX, ey - hitY) > range) continue;

          electricArcsRef.current.push({ x1: hitX, y1: hitY, x2: ex, y2: ey, life: 400 });
          for (let j = 0; j < 5; j++) {
            particlesRef.current.push({
              x: ex + (Math.random() - 0.5) * 16, y: ey + (Math.random() - 0.5) * 16,
              vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4,
              life: 200, maxLife: 200, r: 1.5, color: Math.random() > 0.5 ? '#b060ff' : '#80c0ff',
            });
          }
          enemies[i].hp -= damage * 0.85;
          if (enemies[i].hp <= 0) killEnemyAt(i, enemies, ex, ey, '#b060ff');
        }
      };

      const doBazookaExplosion = (x: number, y: number, damage: number, enemies: Enemy[]) => {
        const radius = 140;
        spawnExplosion(x, y, 40, ['#ff8040', '#ff4422', '#ffcc00', '#ff6600', '#ff2200', '#ffffff']);
        particlesRef.current.push({ x, y, vx: 0, vy: 0, life: 440, maxLife: 440, r: radius, color: '#ff8040' });
        screenShakeRef.current = 20;
        for (let e = enemies.length - 1; e >= 0; e--) {
          const ex = enemies[e].x + enemies[e].width / 2;
          const ey = enemies[e].y + enemies[e].height / 2;
          const d = Math.hypot(ex - x, ey - y);
          if (d <= radius) {
            enemies[e].hp -= damage * Math.max(0.4, 1 - d / radius * 0.6);
            if (enemies[e].hp <= 0) killEnemyAt(e, enemies, ex, ey, '#ff8040');
          }
        }
      };

      const firePlayerShot = (now: number) => {
        const ship = invPlayerRef.current;
        const up = upgradesRef.current;
        const buffs = activeBuffsRef.current;
        const hasRapid = buffs.some(b => b.kind === 'rapidfire' && b.expiresAt > now);
        const hasTriple = buffs.some(b => b.kind === 'tripleshot' && b.expiresAt > now);
        const bType = bulletTypeRef.current;

        let cooldown: number;
        if (bType === 'machinegun') {
          cooldown = Math.max(18, 55 - up.blaster * 5) * (hasRapid ? 0.4 : 1);
        } else if (bType === 'bazooka') {
          cooldown = 500 * (hasRapid ? 0.65 : 1);
        } else {
          // electric
          cooldown = 500;
        }
        if (now - lastShotAtRef.current < cooldown) return;
        lastShotAtRef.current = now;

        const mainSpeed = 8.4 + up.blaster * 0.35;
        let baseDamage: number, baseRadius: number;
        if (bType === 'machinegun') {
          baseDamage = 0.5 + up.damage * 0.15;
          baseRadius = 2.5;
        } else if (bType === 'bazooka') {
          baseDamage = 5 + up.damage * 1.5;
          baseRadius = 8;
        } else {
          // electric
          baseDamage = 2 + up.damage * 0.5;
          baseRadius = 4.5;
        }

        const baseBullet: Bullet = {
          x: ship.x + ship.width / 2,
          y: ship.y,
          vx: 0,
          vy: bType === 'bazooka' ? -(mainSpeed * 0.65) : -mainSpeed,
          radius: baseRadius,
          damage: baseDamage,
          kind: bType,
        };

        // Spread + volley upgrades now generate real multi-shot patterns.
        const volleyCount = up.volley > 0 ? (1 + Math.ceil((up.volley / MAX_UPGRADE_LEVEL) * 9)) : 1;
        const spreadCount = up.spread === 0 ? 1 : (up.spread >= 4 ? 3 : 2);
        const buffCount = hasTriple ? 3 : 1;
        const shotCount = clamp(Math.max(volleyCount, spreadCount, buffCount), 1, 10);
        const angleStep = 0.055 + up.spread * 0.01;

        if (shotCount === 1) {
          playerBulletsRef.current.push(baseBullet);
          return;
        }

        const center = (shotCount - 1) / 2;
        for (let i = 0; i < shotCount; i++) {
          const offset = i - center;
          const theta = offset * angleStep;
          const speed = bType === 'bazooka' ? (mainSpeed * 0.65) : mainSpeed;
          const damageScale = 1 - Math.min(0.3, Math.abs(offset) * 0.04);
          playerBulletsRef.current.push({
            ...baseBullet,
            vx: Math.sin(theta) * speed,
            vy: -Math.cos(theta) * speed,
            damage: baseDamage * damageScale,
          });
        }
      };

      // ── Draw helpers ──
      const drawShip = (x: number, y: number, w: number, h: number, hasShield: boolean) => {
        const cx = x + w / 2;
        ctx.save();

        // Engine glow
        const engineGlow = ctx.createRadialGradient(cx, y + h + 6, 0, cx, y + h + 6, 22);
        engineGlow.addColorStop(0, 'rgba(255,140,40,0.9)');
        engineGlow.addColorStop(0.5, 'rgba(255,80,20,0.4)');
        engineGlow.addColorStop(1, 'rgba(255,60,10,0)');
        ctx.fillStyle = engineGlow;
        ctx.beginPath();
        ctx.ellipse(cx, y + h + 4, 10, 16, 0, 0, Math.PI * 2);
        ctx.fill();

        // Shield ring
        if (hasShield) {
          ctx.save();
          ctx.strokeStyle = 'rgba(136,136,255,0.6)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(cx, y + h / 2, w * 0.75, h * 1.2, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // Wings
        ctx.fillStyle = '#3ab8d8';
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(x - 14, y + h + 8);
        ctx.lineTo(x + 10, y + h * 0.55);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(x + w, y + h);
        ctx.lineTo(x + w + 14, y + h + 8);
        ctx.lineTo(x + w - 10, y + h * 0.55);
        ctx.closePath();
        ctx.fill();

        // Body
        ctx.fillStyle = '#5ce8ff';
        ctx.beginPath();
        ctx.moveTo(cx, y - 10);
        ctx.lineTo(x + w * 0.85, y + h);
        ctx.lineTo(x + w * 0.6, y + h);
        ctx.lineTo(cx, y + h * 0.6);
        ctx.lineTo(x + w * 0.4, y + h);
        ctx.lineTo(x + w * 0.15, y + h);
        ctx.closePath();
        ctx.fill();

        // Cockpit
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.ellipse(cx, y + h * 0.35, 5, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        // Weapon indicator color stripe
        ctx.fillStyle = BULLET_COLORS[bulletTypeRef.current];
        ctx.fillRect(cx - 12, y + h - 4, 24, 3);

        ctx.restore();
      };

      const drawEnemy = (enemy: Enemy, now: number, index: number) => {
        const { x, y, width: w, height: h, hp, maxHp } = enemy;
        const cx = x + w / 2, cy = y + h / 2;
        const hpFrac = hp / maxHp;
        const wobble = Math.sin(now * 0.003 + index * 0.8) * 1.5;

        ctx.save();

        // Color shifts from green → red as hp drops
        const r = Math.round(120 + (1 - hpFrac) * 135);
        const g = Math.round(180 * hpFrac + 60);
        const b = Math.round(80 + hpFrac * 40);
        ctx.fillStyle = `rgb(${r},${g},${b})`;

        // Body
        ctx.beginPath();
        ctx.roundRect(x + 3, y + wobble, w - 6, h * 0.7, 5);
        ctx.fill();

        // Head dome
        ctx.beginPath();
        ctx.ellipse(cx, y + h * 0.28 + wobble, w * 0.38, h * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();

        // Legs
        ctx.strokeStyle = `rgb(${r},${g},${b})`;
        ctx.lineWidth = 2;
        for (let leg = 0; leg < 3; leg++) {
          const lx = x + w * 0.2 + leg * w * 0.3;
          const ly = y + h * 0.7 + wobble;
          ctx.beginPath();
          ctx.moveTo(lx, ly);
          ctx.lineTo(lx - 5, ly + h * 0.28);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(lx, ly);
          ctx.lineTo(lx + 5, ly + h * 0.28);
          ctx.stroke();
        }

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx - 8, y + h * 0.22 + wobble, 5, 5);
        ctx.fillRect(cx + 3, y + h * 0.22 + wobble, 5, 5);
        ctx.fillStyle = '#111122';
        ctx.fillRect(cx - 7, y + h * 0.23 + wobble, 3, 3);
        ctx.fillRect(cx + 4, y + h * 0.23 + wobble, 3, 3);

        ctx.restore();
      };

      const drawBoss = (boss: Boss, now: number) => {
        const { x, y, width: bw, height: bh, hp, maxHp, phase } = boss;
        const cx = x + bw / 2;
        const hpPct = hp / maxHp;
        const pulse = 0.85 + 0.15 * Math.sin(now * 0.006);
        const isP2 = phase === 2;

        ctx.save();

        // Wings
        ctx.fillStyle = isP2 ? '#cc1133' : '#991144';
        ctx.beginPath();
        ctx.moveTo(x - 20, y + bh * 0.3);
        ctx.lineTo(x - 50, y + bh);
        ctx.lineTo(x + 20, y + bh * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + bw + 20, y + bh * 0.3);
        ctx.lineTo(x + bw + 50, y + bh);
        ctx.lineTo(x + bw - 20, y + bh * 0.6);
        ctx.closePath();
        ctx.fill();

        // Body
        ctx.fillStyle = isP2 ? '#ff2244' : '#cc2266';
        ctx.beginPath();
        ctx.roundRect(x, y, bw, bh, 8);
        ctx.fill();

        // Cannon barrels
        ctx.fillStyle = isP2 ? '#ff4466' : '#dd3355';
        ctx.fillRect(cx - 50, y + bh, 10, 14);
        ctx.fillRect(cx - 5, y + bh, 10, 18);
        ctx.fillRect(cx + 40, y + bh, 10, 14);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 22, y + 12, 16, 14);
        ctx.fillRect(x + bw - 38, y + 12, 16, 14);
        ctx.fillStyle = isP2 ? '#ff0000' : '#111';
        ctx.fillRect(x + 28, y + 15, 8, 8);
        ctx.fillRect(x + bw - 32, y + 15, 8, 8);

        // HP bar
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x, y + bh + 10, bw, 8);
        const barGrad = ctx.createLinearGradient(x, 0, x + bw * hpPct, 0);
        barGrad.addColorStop(0, isP2 ? '#ff4422' : '#22ff88');
        barGrad.addColorStop(1, isP2 ? '#ff8822' : '#88ffcc');
        ctx.fillStyle = barGrad;
        ctx.fillRect(x, y + bh + 10, bw * hpPct, 8);

        // Label
        ctx.fillStyle = isP2 ? '#ff6688' : '#ff99aa';
        ctx.font = `700 ${isP2 ? 14 : 12}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(isP2 ? '⚠ FINAL BOSS - PHASE 2' : 'FINAL BOSS', cx, y - 10);
        ctx.textAlign = 'left';
        ctx.restore();
      };

      const loopInvaders = () => {
        const now = performance.now();
        const delta = Math.min(40, now - prevFrame);
        prevFrame = now;
        const dt = delta / 16.666;

        const width = canvas.width;
        const height = canvas.height;

        // Screen shake decay
        const shake = screenShakeRef.current;
        const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0;
        const sy = shake > 0 ? (Math.random() - 0.5) * shake : 0;
        screenShakeRef.current = Math.max(0, shake - 1.2 * dt);

        ctx.clearRect(0, 0, width, height);
        ctx.save();
        ctx.translate(sx, sy);

        // Background
        const bg = ctx.createLinearGradient(0, 0, 0, height);
        bg.addColorStop(0, '#04060e');
        bg.addColorStop(1, '#090f1e');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, width, height);

        // Stars
        const stars = starsRef.current;
        for (let i = 0; i < stars.length; i++) {
          const star = stars[i];
          star.y += star.s * dt;
          if (star.y > height) { star.y = 0; star.x = Math.random() * width; }
          const brightness = 0.4 + star.r / 2.2 * 0.6;
          ctx.fillStyle = `rgba(180,210,255,${brightness})`;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
          ctx.fill();
        }

        if (storeOpenRef.current) {
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.fillRect(0, 0, width, height);
          ctx.restore();
          requestRef.current = requestAnimationFrame(loopInvaders);
          return;
        }

        const up = upgradesRef.current;
        const ship = invPlayerRef.current;
        const buffsNow = activeBuffsRef.current.filter(b => b.expiresAt > now);
        activeBuffsRef.current = buffsNow;
        const hasSpeed  = buffsNow.some(b => b.kind === 'speed');
        const hasShield = buffsNow.some(b => b.kind === 'shield');
        const shipSpeed = (5.7 + up.thrusters * 0.75) * (hasSpeed ? 1.7 : 1);

        if (invaderKeysRef.current.left)  ship.x -= shipSpeed * dt;
        if (invaderKeysRef.current.right) ship.x += shipSpeed * dt;
        ship.x = clamp(ship.x, 20, width - ship.width - 20);
        if (invaderKeysRef.current.fire) firePlayerShot(now);

        // Update player bullets
        const bullets = playerBulletsRef.current;
        for (let i = bullets.length - 1; i >= 0; i--) {
          bullets[i].x += bullets[i].vx * dt;
          bullets[i].y += bullets[i].vy * dt;
          if (bullets[i].y < -30 || bullets[i].x < -30 || bullets[i].x > width + 30) bullets.splice(i, 1);
        }

        // Boss logic
        const wave = invaderWaveRef.current;
        const boss = bossRef.current;
        if (boss) {
          boss.phase = boss.hp <= boss.maxHp * 0.5 ? 2 : 1;
          const bossSpeed = (2.8 + wave * 0.3 + (boss.phase === 2 ? 1.6 : 0)) * dt;
          boss.x += boss.vx * bossSpeed;
          if (boss.x <= 0 || boss.x + boss.width >= width) boss.vx *= -1;

          boss.shotTimer += delta;
          const bossShotInterval = boss.phase === 2 ? 320 : 560;
          if (boss.shotTimer >= bossShotInterval) {
            boss.shotTimer = 0;
            const cx = boss.x + boss.width / 2;
            const cy = boss.y + boss.height;
            const bulletCount = boss.phase === 2 ? 5 : 3;
            for (let s = 0; s < bulletCount; s++) {
              const spread = ((s - Math.floor(bulletCount / 2)) / Math.max(1, Math.floor(bulletCount / 2))) * 3.5;
              const eb: EnemyBullet & { vx?: number } = { x: cx, y: cy, vy: 5.5 + Math.abs(spread) * 0.4, radius: 5.5 };
              eb.vx = spread;
              enemyBulletsRef.current.push(eb);
            }
          }

          for (let b = bullets.length - 1; b >= 0; b--) {
            const bullet = bullets[b];
            if (bullet.x > boss.x && bullet.x < boss.x + boss.width && bullet.y > boss.y && bullet.y < boss.y + boss.height) {
              boss.hp -= bullet.damage;
              spawnExplosion(bullet.x, bullet.y, 5, ['#ff4488', '#ff8844', '#ffcc44']);
              bullets.splice(b, 1);
              if (boss.hp <= 0) {
                invaderScoreRef.current += 2000;
                const earn = 60;
                runCoinsRef.current += earn;
                setBankCoins(c => { const next = c + earn; bankCoinsRef.current = next; return next; });
                scorePopupsRef.current.push({ x: boss.x + boss.width / 2, y: boss.y, text: '+2000 BOSS!', vy: -1.5, life: 1400, color: '#ffcc00' });
                spawnExplosion(boss.x + boss.width / 2, boss.y + boss.height / 2, 40, ['#ff4488', '#ff8844', '#ffcc44', '#ff2222', '#ffaa00']);
                finishInvaders('victory');
                return;
              }
            }
          }

          if (boss.x < ship.x + ship.width + 16 && boss.x + boss.width > ship.x - 16 && boss.y + boss.height > ship.y - 16) {
            invaderLivesRef.current -= 1;
            screenShakeRef.current = 18;
            if (invaderLivesRef.current <= 0) { finishInvaders('defeat'); return; }
            bossRef.current = null;
            finishInvaders('defeat');
            return;
          }
        }

        const enemies = invadersRef.current;
        if (!boss && enemies.length === 0 && diveAttackersRef.current.length === 0) {
          invaderWaveRef.current += 1;
          const waveBonus = 15 + invaderWaveRef.current * 5;
          runCoinsRef.current += waveBonus;
          setBankCoins(c => { const next = c + waveBonus; bankCoinsRef.current = next; return next; });
          scorePopupsRef.current.push({ x: width / 2, y: height / 2, text: `WAVE CLEAR! +${waveBonus}`, vy: -0.8, life: 1600, color: '#ffcc00' });
          spawnInvaderWave(canvas);
        }

        const wavePressure = 1 + Math.max(0, wave - 1) * 0.2;
        const lateWaveBoost = wave >= 4 ? 1 + (wave - 3) * 0.18 : 1;
        const endgamePressure = wave >= 9 ? 1 + (wave - 8) * 0.22 : 1;
        const enemySpeed = (0.62 + wave * 0.17) * wavePressure * lateWaveBoost * dt;
        let touchEdge = false;

        for (let i = 0; i < enemies.length; i++) {
          enemies[i].x += enemySpeed * invaderDirectionRef.current;
          if (enemies[i].x <= 24 || enemies[i].x + enemies[i].width >= width - 24) touchEdge = true;
        }

        if (touchEdge) {
          invaderDirectionRef.current *= -1;
          const dropDistance = 20 + wave * 3;
          for (let i = 0; i < enemies.length; i++) {
            enemies[i].y += dropDistance;
            if (enemies[i].y + enemies[i].height >= ship.y - 6) { finishInvaders('defeat'); return; }
          }
        }

        // Bullet-enemy collisions
        for (let b = bullets.length - 1; b >= 0; b--) {
          const bullet = bullets[b];
          let consumed = false;
          for (let e = enemies.length - 1; e >= 0; e--) {
            const enemy = enemies[e];
            if (bullet.x > enemy.x && bullet.x < enemy.x + enemy.width && bullet.y > enemy.y && bullet.y < enemy.y + enemy.height) {
              const cx = enemy.x + enemy.width / 2;
              const cy = enemy.y + enemy.height / 2;

              if (bullet.kind === 'bazooka') {
                doBazookaExplosion(cx, cy, bullet.damage, enemies);
                consumed = true;
                break;
              }

              if (bullet.kind === 'electric') {
                doElectricSpread(cx, cy, enemies, bullet.damage, now);
              }

              enemy.hp -= bullet.damage;
              consumed = true;
              spawnExplosion(cx, cy, 4, ['#ff6644', '#ffaa44']);

              if (enemy.hp <= 0) {
                killEnemyAt(e, enemies, cx, cy, '#8ef9a8');
              }
              break;
            }
          }
          if (consumed) bullets.splice(b, 1);
        }

        // Power-up drops
        const drops = powerUpDropsRef.current;
        for (let i = drops.length - 1; i >= 0; i--) {
          const drop = drops[i];
          drop.y += drop.vy * dt;
          if (drop.x > ship.x - 18 && drop.x < ship.x + ship.width + 18 && drop.y > ship.y - 18 && drop.y < ship.y + ship.height + 18) {
            drops.splice(i, 1);
            if (drop.kind === 'shield') {
              activeBuffsRef.current.push({ kind: 'shield', expiresAt: now + 30000 });
            } else {
              activeBuffsRef.current.push({ kind: drop.kind, expiresAt: now + POWERUP_DURATION });
            }
            continue;
          }
          if (drop.y > height + 40) drops.splice(i, 1);
        }

        // Enemy shooting
        enemyShotTimerRef.current += delta;
        diveSpawnTimerRef.current += delta;
        const alive = invadersRef.current;
        const densityFactor = Math.max(0.64, alive.length / 88);
        const shootInterval = Math.max(80, ((820 - wave * 105 - Math.max(0, wave - 3) * 70) * densityFactor) / endgamePressure);
        const diveInterval = Math.max(180, (1700 - wave * 170 - Math.max(0, wave - 4) * 100) / endgamePressure);

        if (alive.length > 0 && enemyShotTimerRef.current >= shootInterval) {
          enemyShotTimerRef.current = 0;
          const candidates = alive.slice().sort((a, b) => a.x - b.x).filter((enemy, idx, arr) => {
            return !arr.some(other => Math.abs(other.x - enemy.x) < 12 && other.y > enemy.y);
          });
          const shooterPool = candidates.length > 0 ? candidates : alive;
          const shooter = shooterPool[Math.floor(Math.random() * shooterPool.length)];
          enemyBulletsRef.current.push({ x: shooter.x + shooter.width / 2, y: shooter.y + shooter.height, vy: (5.3 + wave * 0.7 + Math.max(0, wave - 4) * 0.4) * Math.min(1.6, 1 + Math.max(0, wave - 7) * 0.08), radius: 4.5 });
        }

        if (alive.length > 0 && diveSpawnTimerRef.current >= diveInterval) {
          diveSpawnTimerRef.current = 0;
          const diveCount = wave >= 6 ? 2 : 1;
          for (let n = 0; n < diveCount; n++) {
            if (alive.length === 0) break;
            const shipCenter = ship.x + ship.width / 2;
            let pickIndex = 0, bestDist = Number.POSITIVE_INFINITY;
            for (let i = 0; i < alive.length; i++) {
              const dist = Math.abs(alive[i].x + alive[i].width / 2 - shipCenter);
              if (dist < bestDist) { bestDist = dist; pickIndex = i; }
            }
            const picked = alive.splice(pickIndex, 1)[0];
            const px = picked.x + picked.width / 2;
            const py = picked.y + picked.height;
            diveAttackersRef.current.push({ x: px, y: py, vx: clamp((shipCenter - px) * 0.012, -3.4, 3.4), vy: 5.8 + wave * 0.8, size: 14, hp: Math.max(1, Math.ceil(picked.hp * 0.75)), steer: 0.22 + wave * 0.03 });
          }
        }

        // Enemy bullets
        const eBullets = enemyBulletsRef.current;
        for (let i = eBullets.length - 1; i >= 0; i--) {
          const shot = eBullets[i];
          const shotVx = (shot as EnemyBullet & { vx?: number }).vx ?? 0;
          shot.x += shotVx * dt;
          shot.y += shot.vy * dt;
          if (shot.x > ship.x && shot.x < ship.x + ship.width && shot.y > ship.y && shot.y < ship.y + ship.height) {
            eBullets.splice(i, 1);
            const shieldIdx = activeBuffsRef.current.findIndex(b => b.kind === 'shield');
            if (shieldIdx !== -1) {
              activeBuffsRef.current.splice(shieldIdx, 1);
              spawnExplosion(ship.x + ship.width / 2, ship.y, 8, ['#8888ff', '#aaaaff', '#ffffff']);
              continue;
            }
            invaderLivesRef.current -= 1;
            screenShakeRef.current = 16;
            spawnExplosion(ship.x + ship.width / 2, ship.y + ship.height / 2, 14, ['#ff4444', '#ff8844', '#ffaa44']);
            if (invaderLivesRef.current <= 0) { finishInvaders('defeat'); return; }
            continue;
          }
          if (shot.y > height + 30) eBullets.splice(i, 1);
        }

        // Dive attackers
        const divers = diveAttackersRef.current;
        for (let d = divers.length - 1; d >= 0; d--) {
          const diver = divers[d];
          const shipCenter = ship.x + ship.width / 2;
          diver.vx += clamp((shipCenter - diver.x) * 0.0032 * diver.steer, -0.22, 0.22) * dt;
          diver.vx = clamp(diver.vx, -8.4, 8.4);
          diver.vy = Math.min(diver.vy + 0.05 * dt, 10.5 + wave * 0.7);
          diver.x += diver.vx * dt;
          diver.y += diver.vy * dt;

          for (let b = bullets.length - 1; b >= 0; b--) {
            const bullet = bullets[b];
            if (bullet.x > diver.x - diver.size && bullet.x < diver.x + diver.size && bullet.y > diver.y - diver.size && bullet.y < diver.y + diver.size) {
              diver.hp -= bullet.damage;
              bullets.splice(b, 1);
              spawnExplosion(diver.x, diver.y, 5, ['#ff6644', '#ff4422']);
              if (diver.hp <= 0) {
                invaderScoreRef.current += 180;
                const diveEarn = 4 + wave * 2;
                runCoinsRef.current += diveEarn;
                setBankCoins(c => { const next = c + diveEarn; bankCoinsRef.current = next; return next; });
                scorePopupsRef.current.push({ x: diver.x, y: diver.y, text: '+180', vy: -1.3, life: 800, color: '#ff8844' });
                spawnExplosion(diver.x, diver.y, 14, ['#ff6644', '#ff4422', '#ffaa44', '#ff8800']);
                divers.splice(d, 1);
                break;
              }
            }
          }

          if (!divers[d]) continue;

          const hitShip = diver.x > ship.x - diver.size && diver.x < ship.x + ship.width + diver.size && diver.y > ship.y - diver.size && diver.y < ship.y + ship.height + diver.size;
          if (hitShip) {
            invaderLivesRef.current -= 1;
            screenShakeRef.current = 16;
            spawnExplosion(diver.x, diver.y, 16, ['#ff4444', '#ff8800', '#ffaa44']);
            divers.splice(d, 1);
            if (invaderLivesRef.current <= 0) { finishInvaders('defeat'); return; }
            continue;
          }
          if (diver.y > height + 50 || diver.x < -60 || diver.x > width + 60) divers.splice(d, 1);
        }

        // ── Draw ──

        // Player ship
        drawShip(ship.x, ship.y, ship.width, ship.height, hasShield);

        // Player bullets
        for (let i = 0; i < bullets.length; i++) {
          const bullet = bullets[i];
          const bColor = BULLET_COLORS[bullet.kind ?? 'machinegun'];
          ctx.save();
          ctx.fillStyle = bColor;
          if (bullet.kind === 'bazooka') {
            ctx.beginPath();
            ctx.ellipse(bullet.x, bullet.y, bullet.radius, bullet.radius * 1.8, 0, 0, Math.PI * 2);
            ctx.fill();
          } else if (bullet.kind === 'machinegun') {
            ctx.fillRect(bullet.x - 1.5, bullet.y - 5, 3, 8);
          } else {
            ctx.beginPath();
            ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        // Enemy bullets
        for (let i = 0; i < eBullets.length; i++) {
          const bullet = eBullets[i];
          ctx.save();
          ctx.fillStyle = '#ff6e8c';
          ctx.beginPath();
          ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Dive attackers
        for (let i = 0; i < divers.length; i++) {
          const diver = divers[i];
          ctx.save();
          ctx.fillStyle = '#ff4466';
          ctx.beginPath();
          ctx.moveTo(diver.x, diver.y + diver.size);
          ctx.lineTo(diver.x + diver.size * 0.85, diver.y - diver.size);
          ctx.lineTo(diver.x - diver.size * 0.85, diver.y - diver.size);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        // Boss
        const bossDrawn = bossRef.current;
        if (bossDrawn) drawBoss(bossDrawn, now);

        // Enemies
        for (let i = 0; i < enemies.length; i++) drawEnemy(enemies[i], now, i);

        // Power-up drops
        for (let i = 0; i < drops.length; i++) {
          const drop = drops[i];
          const col = POWERUP_COLORS[drop.kind];
          const pulse = 0.7 + 0.3 * Math.sin(now * 0.005 + i);
          ctx.save();
          ctx.globalAlpha = pulse;
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(drop.x, drop.y, 13, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#000';
          ctx.font = 'bold 13px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(POWERUP_LABELS[drop.kind], drop.x, drop.y);
          ctx.textBaseline = 'alphabetic';
          ctx.restore();
        }

        // Particles
        const parts = particlesRef.current;
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i];
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 0.96;
          p.vy *= 0.96;
          p.life -= delta;
          if (p.life <= 0) { parts.splice(i, 1); continue; }
          const alpha = p.life / p.maxLife;
          // Special case: large r = shockwave ring
          if (p.r > 20) {
            ctx.save();
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 3;
            ctx.globalAlpha = alpha * 0.7;
            const ringR = p.r * (1 - alpha);
            ctx.beginPath();
            ctx.arc(p.x, p.y, ringR, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          } else {
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * alpha + 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }

        // Electric arcs
        const arcs = electricArcsRef.current;
        for (let i = arcs.length - 1; i >= 0; i--) {
          const arc = arcs[i];
          arc.life -= delta;
          if (arc.life <= 0) { arcs.splice(i, 1); continue; }
          const alpha = arc.life / 380;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = '#b060ff';
          ctx.lineWidth = 2;
          drawLightning(ctx, arc.x1, arc.y1, arc.x2, arc.y2, 7);
          ctx.strokeStyle = 'rgba(200,180,255,0.8)';
          ctx.lineWidth = 1;
          drawLightning(ctx, arc.x1, arc.y1, arc.x2, arc.y2, 7);
          ctx.restore();
        }

        // Score popups
        const popups = scorePopupsRef.current;
        for (let i = popups.length - 1; i >= 0; i--) {
          const p = popups[i];
          p.y += p.vy * dt;
          p.life -= delta;
          if (p.life <= 0) { popups.splice(i, 1); continue; }
          const alpha = Math.min(1, p.life / 400);
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = p.color;
          ctx.font = 'bold 14px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(p.text, p.x, p.y);
          ctx.restore();
        }

        // HUD
        ctx.save();

        // Score / wave / lives panel (top-left)
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.roundRect(12, 12, 190, 90, 10);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = '700 13px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`Score  ${invaderScoreRef.current}`, 22, 34);
        ctx.fillText(`Wave   ${invaderWaveRef.current}/${INVADER_TOTAL_WAVES}`, 22, 54);
        ctx.fillStyle = '#ff6f86';
        // Lives as hearts
        let livesStr = '';
        for (let l = 0; l < invaderLivesRef.current; l++) livesStr += '♥ ';
        ctx.fillText(livesStr, 22, 74);
        ctx.fillStyle = hasShield ? '#8888ff' : '#79ffa1';
        ctx.fillText(`Coins  +${runCoinsRef.current}`, 22, 94);

        // Controls hint
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.font = '500 10px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('A/D: Move  SPACE: Fire  B: Store  P: Exit', width - 14, height - 12);

        // Wave notice
        if (now < invaderWaveNoticeUntilRef.current) {
          const remainingMs = invaderWaveNoticeUntilRef.current - now;
          const fade = Math.min(1, remainingMs / 450);
          ctx.save();
          ctx.globalAlpha = fade;
          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(255,255,255,0.96)';
          ctx.font = '900 56px system-ui, sans-serif';
          ctx.fillText(`WAVE ${invaderWaveRef.current}`, width / 2, height / 2 - 8);
          ctx.fillStyle = 'rgba(130,245,255,0.9)';
          ctx.font = '700 20px system-ui, sans-serif';
          ctx.fillText('INCOMING', width / 2, height / 2 + 30);
          ctx.restore();
        }

        // Active buffs (top-right)
        if (buffsNow.length > 0) {
          ctx.font = 'bold 12px system-ui, sans-serif';
          ctx.textAlign = 'right';
          let bY = 36;
          for (let i = 0; i < buffsNow.length; i++) {
            const buff = buffsNow[i];
            const remaining = Math.max(0, (buff.expiresAt - now) / 1000);
            ctx.fillStyle = POWERUP_COLORS[buff.kind];
            const label = buff.kind === 'shield' ? `${POWERUP_LABELS[buff.kind]} SHIELD` : `${POWERUP_LABELS[buff.kind]} ${buff.kind.toUpperCase()} ${remaining.toFixed(1)}s`;
            ctx.fillText(label, width - 22, bY);
            bY += 22;
          }
        }

        ctx.restore();
        ctx.restore(); // screen shake

        requestRef.current = requestAnimationFrame(loopInvaders);
      };

      requestRef.current = requestAnimationFrame(loopInvaders);

      return () => {
        window.removeEventListener('resize', onResize);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', onBlur);
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
      };
    }

    // ── Pong ──
    const img = new window.Image();
    img.src = '/profile.jpg';

    const settings = DIFFICULTY_SETTINGS[difficulty];
    modeRef.current = mode;
    const is2P = mode === '2player';

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      if (is2P) {
        playerRef.current.width  = 12; playerRef.current.height = 100;
        cpuRef.current.width     = 12; cpuRef.current.height    = 100;
        playerRef.current.x = 40;
        playerRef.current.y = canvas.height / 2 - 50;
        cpuRef.current.x    = canvas.width - 52;
        cpuRef.current.y    = canvas.height / 2 - 50;
      } else {
        playerRef.current.width  = 120; playerRef.current.height = 12;
        cpuRef.current.width     = 120; cpuRef.current.height    = 12;
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
    ball.x = canvas.width / 2; ball.y = canvas.height / 2; ball.dx = 0; ball.dy = 0;

    const initSpd = is2P ? 12 : settings.ballSpeed;
    if (is2P) {
      const angle = (Math.random() - 0.5) * (Math.PI / 4.5);
      countdownRef.current = { active: true, start: performance.now(), pendingDx: initSpd * Math.cos(angle) * (Math.random() > 0.5 ? 1 : -1), pendingDy: initSpd * Math.sin(angle) };
    } else {
      const angle = (Math.random() - 0.5) * (Math.PI / 3.6);
      countdownRef.current = { active: true, start: performance.now(), pendingDx: initSpd * Math.sin(angle), pendingDy: initSpd * Math.cos(angle) };
    }

    const handleMouse = (e: MouseEvent) => {
      if (modeRef.current === '2player') return;
      mouseRef.current = e.clientX;
      inputModeRef.current = 'mouse';
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft')           { keysRef.current.left  = true; inputModeRef.current = 'keyboard'; e.preventDefault(); }
      if (e.key === 'ArrowRight')          { keysRef.current.right = true; inputModeRef.current = 'keyboard'; e.preventDefault(); }
      if (e.key === 'w' || e.key === 'W') { keysRef.current.up    = true; e.preventDefault(); }
      if (e.key === 's' || e.key === 'S') { keysRef.current.down  = true; e.preventDefault(); }
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
      keysRef.current.left = false; keysRef.current.right = false;
      keysRef.current.up   = false; keysRef.current.down  = false;
      keys2Ref.current.up  = false; keys2Ref.current.down = false;
    };

    window.addEventListener('mousemove', handleMouse);
    window.addEventListener('keydown',   handleKeyDown);
    window.addEventListener('keyup',     handleKeyUp);
    window.addEventListener('blur',      handleBlur);

    const resetBall = () => {
      hitCountRef.current = 0;
      ball.x = canvas.width / 2; ball.y = canvas.height / 2; ball.dx = 0; ball.dy = 0;
      const spd = modeRef.current === '2player' ? 12 : settings.ballSpeed;
      if (modeRef.current === '2player') {
        const angle = (Math.random() - 0.5) * (Math.PI / 4.5);
        countdownRef.current = { active: true, start: performance.now(), pendingDx: spd * Math.cos(angle) * (Math.random() > 0.5 ? 1 : -1), pendingDy: spd * Math.sin(angle) };
      } else {
        const angle = (Math.random() - 0.5) * (Math.PI / 3.6);
        countdownRef.current = { active: true, start: performance.now(), pendingDx: spd * Math.sin(angle), pendingDy: spd * Math.cos(angle) * (Math.random() > 0.5 ? 1 : -1) };
      }
    };

    const checkPaddleCollision = (px: number, py: number, pw: number, ph: number, goingToward: boolean): boolean => {
      if (!goingToward) return false;
      const ballR = ball.size / 2;
      const closestX = Math.max(px, Math.min(ball.x, px + pw));
      const closestY = Math.max(py, Math.min(ball.y, py + ph));
      const distX = ball.x - closestX, distY = ball.y - closestY;
      return (distX * distX + distY * distY) <= (ballR * ballR);
    };

    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const player = playerRef.current;
      const cpu    = cpuRef.current;
      const cd     = countdownRef.current;

      if (cd.active) {
        const elapsed = (performance.now() - cd.start) / 1000;
        if (elapsed >= COUNTDOWN_SECS) { ball.dx = cd.pendingDx; ball.dy = cd.pendingDy; cd.active = false; }
      }

      const pSpd = modeRef.current === '2player' ? 20 : settings.playerSpeed;

      if (modeRef.current === '2player') {
        if (keysRef.current.up)        player.y -= pSpd;
        else if (keysRef.current.down) player.y += pSpd;
        player.y = Math.max(0, Math.min(player.y, canvas.height - player.height));
        if (keys2Ref.current.up)        cpu.y -= pSpd;
        else if (keys2Ref.current.down) cpu.y += pSpd;
        cpu.y = Math.max(0, Math.min(cpu.y, canvas.height - cpu.height));
      } else {
        if (keysRef.current.left)       player.x -= pSpd;
        else if (keysRef.current.right) player.x += pSpd;
        else if (inputModeRef.current === 'mouse') player.x += (mouseRef.current - player.width / 2 - player.x) * settings.playerLerp;
        player.x = Math.max(0, Math.min(player.x, canvas.width - player.width));
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

      ball.x += ball.dx; ball.y += ball.dy;
      const curSpeedGain = modeRef.current === '2player' ? 0.9 : settings.speedGain;
      const curMaxSpeed  = modeRef.current === '2player' ? 40  : settings.maxSpeed;

      if (modeRef.current === '2player') {
        if (ball.y < ball.size / 2)                 { ball.dy =  Math.abs(ball.dy); ball.y = ball.size / 2; }
        if (ball.y > canvas.height - ball.size / 2) { ball.dy = -Math.abs(ball.dy); ball.y = canvas.height - ball.size / 2; }
        if (checkPaddleCollision(player.x, player.y, player.width, player.height, ball.dx < 0)) {
          const hitPoint = (ball.y - (player.y + player.height / 2)) / (player.height / 2);
          const speed = Math.min(Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy) + curSpeedGain, curMaxSpeed);
          const angle = hitPoint * (Math.PI / 3);
          ball.dx = Math.cos(angle) * speed; ball.dy = Math.sin(angle) * speed;
          ball.x = player.x + player.width + ball.size / 2;
        }
        if (checkPaddleCollision(cpu.x, cpu.y, cpu.width, cpu.height, ball.dx > 0)) {
          const hitPoint = (ball.y - (cpu.y + cpu.height / 2)) / (cpu.height / 2);
          const speed = Math.min(Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy) + curSpeedGain, curMaxSpeed);
          const angle = hitPoint * (Math.PI / 3);
          ball.dx = -Math.cos(angle) * speed; ball.dy = Math.sin(angle) * speed;
          ball.x = cpu.x - ball.size / 2;
        }
        if (ball.x > canvas.width + ball.size)  { playerScoreRef.current += 1; if (playerScoreRef.current >= WIN_SCORE) { finishPong('player'); return; } resetBall(); }
        if (ball.x < -ball.size)                 { cpuScoreRef.current += 1;    if (cpuScoreRef.current >= WIN_SCORE)    { finishPong('cpu');    return; } resetBall(); }
      } else {
        if (ball.x < ball.size / 2)                  { ball.dx =  Math.abs(ball.dx); ball.x = ball.size / 2; }
        if (ball.x > canvas.width - ball.size / 2)   { ball.dx = -Math.abs(ball.dx); ball.x = canvas.width - ball.size / 2; }
        if (checkPaddleCollision(player.x, player.y, player.width, player.height, ball.dy > 0)) {
          const hitPoint = (ball.x - (player.x + player.width / 2)) / (player.width / 2);
          let speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
          if (difficulty === 'impossible') { const rG = curSpeedGain + hitCountRef.current * 0.25; const rM = curMaxSpeed + hitCountRef.current * 3; speed = Math.min(speed + rG, rM); hitCountRef.current++; } else { speed = Math.min(speed + curSpeedGain, curMaxSpeed); }
          const angle = hitPoint * (Math.PI / 3);
          ball.dx = Math.sin(angle) * speed; ball.dy = -Math.cos(angle) * speed;
          ball.y = player.y - ball.size / 2;
        }
        if (checkPaddleCollision(cpu.x, cpu.y, cpu.width, cpu.height, ball.dy < 0)) {
          const hitPoint = (ball.x - (cpu.x + cpu.width / 2)) / (cpu.width / 2);
          let speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
          if (difficulty === 'impossible') { const rG = curSpeedGain + hitCountRef.current * 0.25; const rM = curMaxSpeed + hitCountRef.current * 3; speed = Math.min(speed + rG, rM); hitCountRef.current++; } else { speed = Math.min(speed + curSpeedGain, curMaxSpeed); }
          const angle = hitPoint * (Math.PI / 3);
          ball.dx = Math.sin(angle) * speed; ball.dy = Math.cos(angle) * speed;
          ball.y = cpu.y + cpu.height + ball.size / 2;
        }
        if (ball.y > canvas.height + ball.size) { cpuScoreRef.current += 1;    if (cpuScoreRef.current >= WIN_SCORE)    { finishPong('cpu');    return; } resetBall(); }
        if (ball.y < -ball.size)                 { playerScoreRef.current += 1; if (playerScoreRef.current >= WIN_SCORE) { finishPong('player'); return; } resetBall(); }
      }

      ctx.setLineDash([8, 12]);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (modeRef.current === '2player') { ctx.moveTo(canvas.width / 2, 0); ctx.lineTo(canvas.width / 2, canvas.height); }
      else { ctx.moveTo(0, canvas.height / 2); ctx.lineTo(canvas.width, canvas.height / 2); }
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.save();
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      if (img.complete) ctx.drawImage(img, ball.x - ball.size / 2, ball.y - ball.size / 2, ball.size, ball.size);
      else { ctx.fillStyle = '#fff'; ctx.fill(); }
      ctx.restore();

      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.roundRect(player.x, player.y, player.width, player.height, 6); ctx.fill();
      ctx.fillStyle = modeRef.current === '2player' ? '#fff' : 'rgba(255,255,255,0.6)';
      ctx.beginPath(); ctx.roundRect(cpu.x, cpu.y, cpu.width, cpu.height, 6); ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '700 80px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      if (modeRef.current === '2player') {
        ctx.fillText(`${playerScoreRef.current}`, canvas.width / 4, canvas.height / 2 + 40);
        ctx.fillText(`${cpuScoreRef.current}`, canvas.width * 3 / 4, canvas.height / 2 + 40);
      } else {
        ctx.fillText(`${cpuScoreRef.current}`, canvas.width / 2, canvas.height / 2 - 30);
        ctx.fillText(`${playerScoreRef.current}`, canvas.width / 2, canvas.height / 2 + 90);
      }

      if (modeRef.current === '2player') {
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.font = '500 11px system-ui, sans-serif';
        ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
        ctx.fillText('P1  ·  W / S', player.x + player.width + 10, canvas.height / 2);
        ctx.textAlign = 'right';
        ctx.fillText('P2  ·  ↑ / ↓', cpu.x - 10, canvas.height / 2);
      }

      if (cd.active) {
        const elapsed = (performance.now() - cd.start) / 1000;
        const num = COUNTDOWN_SECS - Math.floor(elapsed);
        const pulse = 1 - (elapsed % 1);
        ctx.save();
        ctx.font = '700 100px system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(255,255,255,${0.2 + 0.5 * pulse})`;
        ctx.fillText(String(num), canvas.width / 2, canvas.height * 0.2);
        ctx.restore();
      }

      if (difficulty === 'impossible' && hitCountRef.current > 0) {
        const heat = Math.min(hitCountRef.current / 10, 1);
        ctx.save();
        ctx.font = `700 ${13 + hitCountRef.current}px system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = `rgba(239,${Math.round(68 * (1 - heat))},${Math.round(68 * (1 - heat))},${0.4 + 0.4 * heat})`;
        ctx.fillText(`× ${hitCountRef.current}`, canvas.width / 2, canvas.height * 0.25 + 60);
        ctx.restore();
      }

      ctx.fillStyle = difficulty === 'impossible' ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.2)';
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(modeRef.current === '2player' ? '2P' : difficulty.toUpperCase(), 20, canvas.height - 16);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '500 11px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText("'P' to exit", canvas.width - 20, canvas.height - 16);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.font = '500 11px system-ui, sans-serif';
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
  }, [isOpen, gameState, difficulty, mode, arcadeGame, spawnInvaderWave, finishInvaders, finishPong]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950/90 backdrop-blur-md flex items-center justify-center">

      {/* Menu */}
      {gameState === 'menu' && (
        <div className="flex flex-col items-center gap-8 w-full px-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setArcadeGame('pong')} className={`cursor-target px-5 py-2 rounded-lg border text-xs font-bold tracking-[0.12em] uppercase transition ${arcadeGame === 'pong' ? 'border-white text-white bg-white/10' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'}`}>
              Pong
            </button>
            <button onClick={() => setArcadeGame('invaders')} className={`cursor-target px-5 py-2 rounded-lg border text-xs font-bold tracking-[0.12em] uppercase transition ${arcadeGame === 'invaders' ? 'border-emerald-300 text-emerald-300 bg-emerald-300/10' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'}`}>
              Space Invaders
            </button>
          </div>

          {arcadeGame === 'pong' && (
            <>
              <h2 className="text-white text-4xl font-black tracking-[0.2em] uppercase">Pong</h2>
              <div className="flex flex-col items-center gap-4">
                <p className="text-zinc-500 text-xs tracking-widest uppercase">VS CPU</p>
                <div className="flex gap-4 flex-wrap justify-center">
                  {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                    <button key={d} onClick={() => startGame(d)} className="cursor-target px-8 py-3 rounded-xl border-2 border-dashed border-zinc-700 bg-transparent text-white font-bold text-sm uppercase tracking-[0.15em] hover:border-white hover:bg-white/5 transition-all duration-200">{d}</button>
                  ))}
                  <button onClick={() => startGame('impossible')} className="cursor-target px-8 py-3 rounded-xl border-2 border-dashed border-red-900 bg-transparent text-red-500 font-bold text-sm uppercase tracking-[0.15em] hover:border-red-500 hover:bg-red-500/10 transition-all duration-200">impossible</button>
                </div>
              </div>
              <div className="w-64 border-t border-zinc-800" />
              <div className="flex flex-col items-center gap-4">
                <p className="text-zinc-500 text-xs tracking-widest uppercase">Local Multiplayer</p>
                <button onClick={startTwoPlayer} className="cursor-target px-10 py-3 rounded-xl border-2 border-dashed border-zinc-600 bg-transparent text-white font-bold text-sm uppercase tracking-[0.15em] hover:border-white hover:bg-white/5 transition-all duration-200">2 Player</button>
                <p className="text-zinc-600 text-xs tracking-widest">P1: W / S  ·  P2: ↑ / ↓</p>
              </div>
              <p className="text-zinc-600 text-xs tracking-widest">First to {WIN_SCORE} wins · Press P to close</p>
            </>
          )}

          {arcadeGame === 'invaders' && (
            <div className="flex flex-col items-center gap-5">
              <h2 className="text-4xl md:text-5xl font-black uppercase tracking-[0.14em] text-emerald-300">Space Invaders</h2>
              <p className="text-zinc-400 text-sm tracking-wide text-center max-w-sm">
                Clear 12 waves. Earn rare coins. Upgrade your ship.
              </p>

              <div className="flex gap-4">
                <button onClick={startInvaders} className="cursor-target px-10 py-3 rounded-xl border-2 border-dashed border-emerald-300/70 bg-emerald-300/10 text-emerald-200 font-bold text-sm uppercase tracking-[0.15em] hover:bg-emerald-300/20 transition-all duration-200">
                  Launch Mission
                </button>
                <button onClick={() => setStoreOpen(prev => !prev)} className="cursor-target px-10 py-3 rounded-xl border-2 border-dashed border-zinc-600 bg-transparent text-white font-bold text-sm uppercase tracking-[0.15em] hover:border-white hover:bg-white/5 transition-all duration-200">
                  {storeOpen ? 'Hide Store' : 'Open Store'}
                </button>
              </div>
              <p className="text-zinc-600 text-xs tracking-widest">Coins: {bankCoins} · Press P to close</p>
              {storeOpen && drawInvaderStore()}
            </div>
          )}
        </div>
      )}

      {/* Playing */}
      {gameState === 'playing' && (
        <>
          <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full cursor-none" />

          {arcadeGame === 'invaders' && storeOpen && (
            <div className="absolute inset-0 flex items-center justify-center p-4 bg-black/35">
              {drawInvaderStore()}
            </div>
          )}
        </>
      )}

      {/* Game Over */}
      {gameState === 'gameover' && !storeOpen && (
        <div className="flex flex-col items-center gap-6">
          <h2 className="text-white text-5xl font-black tracking-[0.15em] uppercase">
            {arcadeGame === 'pong'
              ? (mode === '2player' ? (winner === 'player' ? 'Player 1 Wins!' : 'Player 2 Wins!') : (winner === 'player' ? 'You Win!' : 'CPU Wins'))
              : (invaderOutcome === 'victory' ? 'Sector Cleared!' : 'Ship Destroyed')}
          </h2>
          {arcadeGame === 'pong' ? (
            <p className="text-zinc-500 text-sm tracking-widest">{pongFinalScore.player} - {pongFinalScore.cpu}</p>
          ) : (
            <p className="text-zinc-500 text-sm tracking-widest">Score {invaderFinalStats.score} · Wave {invaderFinalStats.wave} · Coins +{invaderFinalStats.coins}</p>
          )}
          <div className="flex gap-4 mt-4 flex-wrap justify-center">
            <button
              onClick={() => arcadeGame === 'pong' ? (mode === '2player' ? startTwoPlayer() : startGame(difficulty)) : startInvaders()}
              className="cursor-target px-8 py-3 rounded-xl border-2 border-dashed border-zinc-700 bg-transparent text-white font-bold text-sm uppercase tracking-[0.15em] hover:border-white hover:bg-white/5 transition-all duration-200"
            >
              {arcadeGame === 'pong' ? 'Rematch' : 'Retry'}
            </button>
            <button
              onClick={() => { setGameState('menu'); setWinner(null); setInvaderOutcome(null); }}
              className="cursor-target px-8 py-3 rounded-xl border-2 border-dashed border-zinc-700 bg-transparent text-white font-bold text-sm uppercase tracking-[0.15em] hover:border-white hover:bg-white/5 transition-all duration-200"
            >
              Menu
            </button>
            {arcadeGame === 'invaders' && (
              <button
                onClick={() => setStoreOpen(true)}
                className="cursor-target px-8 py-3 rounded-xl border-2 border-dashed border-emerald-700 bg-transparent text-emerald-300 font-bold text-sm uppercase tracking-[0.15em] hover:border-emerald-300 hover:bg-emerald-300/10 transition-all duration-200"
              >
                Store
              </button>
            )}
          </div>
          <p className="text-zinc-600 text-xs tracking-widest mt-2">Press P to close</p>
        </div>
      )}

      {/* Store overlay on game over */}
      {gameState === 'gameover' && storeOpen && arcadeGame === 'invaders' && (
        <div className="absolute inset-0 flex items-center justify-center p-4">
          {drawInvaderStore()}
        </div>
      )}

    </div>
  );
}

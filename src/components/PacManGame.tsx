"use client";
import { useEffect, useRef, useState } from "react";

const COLS = 21, ROWS = 23;

// Multiple map layouts
const TILE_MAPS = [
  // Map 1: Original Classic
  [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,2,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,2,1],
    [1,3,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,3,1],
    [1,2,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,2,1,2,1,1,1,1,1,1,1,2,1,2,1,1,2,1],
    [1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1],
    [1,1,1,1,2,1,1,1,0,0,0,0,0,1,1,1,2,1,1,1,1],
    [1,1,1,1,2,0,0,0,0,0,0,0,0,0,0,0,2,1,1,1,1],
    [1,1,1,1,2,0,1,1,0,0,0,0,0,1,1,0,2,1,1,1,1],
    [0,0,0,0,2,0,1,0,0,0,0,0,0,0,1,0,2,0,0,0,0],
    [1,1,1,1,2,0,1,0,0,0,0,0,0,0,1,0,2,1,1,1,1],
    [1,1,1,1,2,0,0,0,0,0,0,0,0,0,0,0,2,1,1,1,1],
    [1,1,1,1,2,1,0,1,1,1,1,1,1,1,0,1,2,1,1,1,1],
    [1,2,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,2,1],
    [1,3,2,1,2,2,2,2,2,2,0,2,2,2,2,2,2,1,2,3,1],
    [1,1,2,1,2,1,2,1,1,1,1,1,1,1,2,1,2,1,2,1,1],
    [1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1],
    [1,2,1,1,1,1,1,1,2,1,1,1,2,1,1,1,1,1,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,2,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  ],
  // Map 2: Diamond Maze
  [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3,1],
    [1,2,1,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,1,2,1],
    [1,2,1,2,1,1,1,1,1,2,1,2,1,1,1,1,1,2,1,2,1],
    [1,2,1,2,1,2,2,2,1,2,1,2,1,2,2,2,1,2,1,2,1],
    [1,3,1,2,1,2,0,2,1,2,1,2,1,2,0,2,1,2,1,3,1],
    [1,1,1,2,1,2,2,2,1,2,1,2,1,2,2,2,1,2,1,1,1],
    [0,0,0,2,1,1,1,1,1,2,1,2,1,1,1,1,1,2,0,0,0],
    [1,1,1,2,1,1,1,1,1,0,0,0,1,1,1,1,1,2,1,1,1],
    [1,2,2,2,2,2,2,2,2,0,0,0,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,1,1,1,1,1,0,0,0,1,1,1,1,1,1,1,2,1],
    [0,2,0,0,0,2,1,2,1,2,1,2,1,2,1,2,0,0,0,2,0],
    [1,2,1,1,1,2,1,2,1,2,1,2,1,2,1,2,1,1,1,2,1],
    [1,2,1,2,2,2,1,2,1,2,1,2,1,2,1,2,2,2,1,2,1],
    [1,2,1,2,1,1,1,2,1,2,1,2,1,2,1,1,1,2,1,2,1],
    [1,3,1,2,1,2,2,2,1,2,1,2,1,2,2,2,1,2,1,3,1],
    [1,1,1,2,1,2,1,1,1,2,1,2,1,1,1,2,1,2,1,1,1],
    [1,2,2,2,2,2,1,2,2,2,1,2,2,2,1,2,2,2,2,2,1],
    [1,2,1,1,1,1,1,2,1,1,1,1,2,1,1,1,1,1,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,3,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,3,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  ],
  // Map 3: Cross Corridors
  [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,2,2,2,2,2,1,2,2,2,2,2,2,2,2,2,1,2,2,2,1],
    [1,3,1,1,1,2,1,2,1,1,1,1,1,1,1,2,1,2,1,3,1],
    [1,2,1,1,1,2,1,2,1,1,1,1,1,1,1,2,1,2,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,1,1,1,1,1,2,1,2,1,1,1,1,1,1,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,1,1,2,1,1,1,0,0,0,0,0,0,0,1,1,1,2,1,1,1],
    [0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0],
    [1,1,1,2,1,1,1,0,0,0,0,0,0,0,1,1,1,2,1,1,1],
    [1,2,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,1,1,1,1,1,2,1,2,1,1,1,1,1,1,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,1,2,1,2,1,1,1,1,1,1,1,2,1,2,1,2,1],
    [1,3,1,1,1,2,1,2,1,1,1,1,1,1,1,2,1,2,1,3,1],
    [1,2,1,1,1,2,1,2,1,1,1,1,1,1,1,2,1,2,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,1,1,1,1,1,2,1,2,1,1,1,1,1,1,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,3,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,3,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  ],
  // Map 4: Open Spaces
  [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,2,1,1,2,1,1,1,1,1,2,1,1,2,1,1,3,1],
    [1,2,1,1,2,1,1,2,1,1,1,1,1,2,1,1,2,1,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,1,1,1,1,1,2,1,2,1,1,1,1,1,1,1,2,1],
    [1,2,1,2,2,2,2,2,1,2,1,2,1,2,2,2,2,2,1,2,1],
    [1,2,1,2,0,0,0,2,1,2,1,2,1,2,0,0,0,2,1,2,1],
    [0,2,1,2,0,0,0,2,0,0,0,0,0,2,0,0,0,2,1,2,0],
    [1,2,1,2,0,0,0,2,1,2,1,2,1,2,0,0,0,2,1,2,1],
    [1,2,1,2,2,2,2,2,1,2,1,2,1,2,2,2,2,2,1,2,1],
    [1,2,1,1,1,1,1,1,1,2,1,2,1,1,1,1,1,1,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,2,1,1,2,1,1,1,1,1,2,1,1,2,1,1,2,1],
    [1,3,1,1,2,1,1,2,1,1,1,1,1,2,1,1,2,1,1,3,1],
    [1,2,1,1,2,1,1,2,1,1,1,1,1,2,1,1,2,1,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,1],
    [1,2,1,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,1,2,1],
    [1,2,1,2,1,1,1,1,1,2,1,2,1,1,1,1,1,2,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,3,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,3,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  ],
  // Map 5: Spiral Maze
  [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3,1],
    [1,2,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,2,1],
    [1,2,1,2,1,1,1,1,1,1,1,1,1,1,1,1,1,2,1,2,1],
    [1,2,1,2,1,2,2,2,2,2,2,2,2,2,2,2,1,2,1,2,1],
    [1,3,1,2,1,2,1,1,1,1,1,1,1,1,1,2,1,2,1,3,1],
    [1,1,1,2,1,2,1,2,2,2,2,2,2,2,1,2,1,2,1,1,1],
    [0,0,0,2,1,2,1,2,0,0,0,0,0,2,1,2,1,2,0,0,0],
    [1,1,1,2,1,2,1,2,0,0,0,0,0,2,1,2,1,2,1,1,1],
    [1,2,2,2,2,2,1,2,2,2,1,2,2,2,1,2,1,2,2,2,1],
    [1,2,1,1,1,1,1,1,1,2,1,2,1,1,1,1,1,2,1,2,1],
    [1,2,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,2,1],
    [1,2,1,2,1,1,1,1,1,1,1,1,1,1,1,1,1,2,1,2,1],
    [1,2,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,2,1],
    [1,2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,1,1,1,1,1,1,2,1,2,1,1,1,1,1,1,1,2,1],
    [1,3,1,2,2,2,2,2,1,2,1,2,1,2,2,2,2,2,1,3,1],
    [1,2,1,2,1,1,1,2,1,2,1,2,1,2,1,1,1,2,1,2,1],
    [1,2,2,2,2,2,1,2,2,2,2,2,2,2,1,2,2,2,2,2,1],
    [1,2,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,2,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  ],
  // Map 6: Chambers
  [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,2,2,2,1,2,2,2,1,2,2,2,1,2,2,2,1,2,2,2,1],
    [1,3,1,2,1,2,1,3,1,2,1,2,1,2,1,2,1,2,1,3,1],
    [1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1],
    [1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1],
    [1,2,1,2,1,2,1,2,0,0,0,0,0,2,1,2,1,2,1,2,1],
    [0,2,1,2,0,2,0,2,0,0,0,0,0,2,0,2,0,2,1,2,0],
    [1,2,1,2,1,2,1,2,0,0,0,0,0,2,1,2,1,2,1,2,1],
    [1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1],
    [1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1],
    [1,3,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,3,1],
    [1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1],
    [1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1],
    [1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1],
    [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
    [1,3,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,3,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  ],
];

const GHOST_DEFS = [
  { x: 9,  y: 10, color: '#ef4444', delay: 0  }, // Blinky — red
  { x: 10, y: 10, color: '#f472b6', delay: 8  }, // Pinky  — pink
  { x: 11, y: 10, color: '#22d3ee', delay: 16 }, // Inky   — cyan
  { x: 10, y: 11, color: '#fb923c', delay: 24 }, // Clyde  — orange
];

type Ghost = {
  x: number; y: number; dx: number; dy: number;
  color: string; delay: number;
  exited: boolean; dtimer: number;
};

type Pac = {
  x: number; y: number; dx: number; dy: number;
  mouth: number; mdir: number; lastAngle: number;
};

type GameState = 'waiting' | 'playing' | 'dead' | 'win';
interface Ended { outcome: 'dead' | 'win'; score: number; }
interface Props { onMenu: () => void; }

export function PacManGame({ onMenu }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const actionsRef = useRef<{ retry: () => void; switchMap: (idx: number) => void } | null>(null);

  const [ended,        setEnded]        = useState<Ended | null>(null);
  const [livesDisplay, setLivesDisplay] = useState(3);
  const [scoreDisplay, setScoreDisplay] = useState(0);
  const [bestScore,    setBestScore]    = useState<number>(() => {
    try { return parseInt(localStorage.getItem('pacman_best') ?? '0', 10) || 0; } catch { return 0; }
  });
  const [currentMapIndex, setCurrentMapIndex] = useState(0);

  // Show the cursor on the game-over overlay; hide it again when playing resumes or on unmount.
  useEffect(() => {
    const cursorEl = document.querySelector('.target-cursor-wrapper') as HTMLElement | null;
    if (!cursorEl) return;
    if (ended) cursorEl.style.display = '';
    return () => { cursorEl.style.display = 'none'; };
  }, [ended]);

  // Randomly select a map on component mount
  useEffect(() => {
    const randomIdx = Math.floor(Math.random() * TILE_MAPS.length);
    setCurrentMapIndex(randomIdx);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    if (!ctx) return;

    let map: number[][];
    let pac: Pac;
    let ghosts: Ghost[];
    let score: number;
    let lives: number;
    let state: GameState;
    let tick0: number;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let inputQ: { dx: number; dy: number }[] = [];

    let CS = 20, OX = 0, OY = 0;

    function computeLayout() {
      CS = Math.floor(Math.min(canvas.width / COLS, canvas.height / ROWS));
      OX = Math.floor((canvas.width  - COLS * CS) / 2);
      OY = Math.floor((canvas.height - ROWS * CS) / 2);
    }
    function onResize() {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      computeLayout(); render();
    }
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    computeLayout();

    function cloneMap() { return TILE_MAPS[currentMapIndex].map(r => [...r]); }
    function dotCount(m: number[][]) {
      let n = 0;
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (m[r][c] === 2 || m[r][c] === 3) n++;
      return n;
    }
    function gCanMove(x: number, y: number) {
      if (x < 0) x = COLS - 1; if (x >= COLS) x = 0;
      if (y < 0 || y >= ROWS) return false;
      return map[y][x] !== 1;
    }
    function pCanMove(x: number, y: number) {
      if (x < 0) x = COLS - 1; if (x >= COLS) x = 0;
      if (y < 0 || y >= ROWS) return false;
      if (y >= 9 && y <= 11 && x >= 7 && x <= 13) return false;
      return map[y][x] !== 1;
    }

    function spawnAll() {
      pac = { x: 10, y: 17, dx: 0, dy: 0, mouth: 0.25, mdir: 1, lastAngle: 0 };
      ghosts = GHOST_DEFS.map(g => ({
        ...g, dx: 0, dy: -1,
        exited: false, dtimer: g.delay,
      }));
    }

    function doInit() {
      map = cloneMap();
      score = 0; lives = 3; state = 'waiting'; tick0 = 0; inputQ = [];
      setLivesDisplay(3); setScoreDisplay(0);
      spawnAll(); render();
    }

    function moveGhost(g: Ghost) {
      if (!g.exited) {
        g.dtimer--;
        if (g.dtimer > 0) return;
        if (g.x !== 10) { g.x += g.x < 10 ? 1 : -1; return; }
        if (g.y > 7)    { g.y--; return; }
        g.exited = true;
        g.dx = Math.random() < 0.5 ? 1 : -1; g.dy = 0;
        return;
      }
      const dirs = [{ dx:1,dy:0 },{ dx:-1,dy:0 },{ dx:0,dy:1 },{ dx:0,dy:-1 }];
      let nx = g.x + g.dx, ny = g.y + g.dy;
      if (nx < 0) nx = COLS - 1; if (nx >= COLS) nx = 0;
      const canContinue = gCanMove(nx, ny);
      if (!canContinue || Math.random() < 0.18) {
        let opts = dirs.filter(d => {
          if (d.dx === -g.dx && d.dy === -g.dy) return false;
          let tx = g.x + d.dx, ty = g.y + d.dy;
          if (tx < 0) tx = COLS-1; if (tx >= COLS) tx = 0;
          return gCanMove(tx, ty);
        });
        if (!opts.length) opts = dirs.filter(d => {
          let tx = g.x + d.dx, ty = g.y + d.dy;
          if (tx < 0) tx = COLS-1; if (tx >= COLS) tx = 0;
          return gCanMove(tx, ty);
        });
        if (opts.length) { const d = opts[Math.floor(Math.random() * opts.length)]; g.dx = d.dx; g.dy = d.dy; }
        if (!canContinue) return;
      }
      g.x = nx; g.y = ny;
    }

    function finishGame(outcome: 'dead' | 'win') {
      if (state !== 'playing') return;
      state = outcome;
      if (intervalId) clearInterval(intervalId);
      render();
      const final = score;
      try {
        const prev = parseInt(localStorage.getItem('pacman_best') ?? '0', 10) || 0;
        if (final > prev) {
          localStorage.setItem('pacman_best', String(final));
          setBestScore(final);
        }
      } catch {}
      setEnded({ outcome, score: final });
    }

    function loseLife() {
      if (state !== 'playing') return;
      lives--;
      setLivesDisplay(lives);
      if (lives <= 0) { finishGame('dead'); return; }
      spawnAll(); inputQ = [];
    }

    function addScore(pts: number) {
      score += pts;
      setScoreDisplay(score);
    }

    function gameTick() {
      if (state !== 'playing') return;
      tick0++;

      if (inputQ.length) {
        const { dx, dy } = inputQ[0];
        let tx = pac.x + dx, ty = pac.y + dy;
        if (tx < 0) tx = COLS-1; if (tx >= COLS) tx = 0;
        if (pCanMove(tx, ty)) { pac.dx = dx; pac.dy = dy; }
        inputQ.shift();
      }

      // Snapshot positions BEFORE movement for pass-through detection
      const prevPacX = pac.x, prevPacY = pac.y;
      const ghostSnap = ghosts.map(g => ({ x: g.x, y: g.y }));

      // Move pac
      let nx = pac.x + pac.dx, ny = pac.y + pac.dy;
      if (nx < 0) nx = COLS-1; if (nx >= COLS) nx = 0;
      if (pCanMove(nx, ny)) { pac.x = nx; pac.y = ny; }

      // Eat dots / power pellets
      const cell = map[pac.y][pac.x];
      if (cell === 2) { map[pac.y][pac.x] = 0; addScore(10); }
      else if (cell === 3) {
        map[pac.y][pac.x] = 0; addScore(50);
      }

      // Win check
      if (dotCount(map) === 0) { finishGame('win'); return; }

      // Move all ghosts
      for (const g of ghosts) moveGhost(g);

      // Collision: "same cell after movement" OR "swapped cells" (pass-through)
      for (let i = 0; i < ghosts.length; i++) {
        const g = ghosts[i];
        if (state !== 'playing') break;

        const sameCellNow = g.x === pac.x && g.y === pac.y;
        const swapped = ghostSnap[i].x === pac.x && ghostSnap[i].y === pac.y
                     && g.x === prevPacX && g.y === prevPacY;

        if (sameCellNow || swapped) { loseLife(); break; }
      }

      pac.mouth += 0.09 * pac.mdir;
      if (pac.mouth > 0.35) pac.mdir = -1;
      if (pac.mouth < 0.02) pac.mdir = 1;
      if (pac.dx || pac.dy) pac.lastAngle = Math.atan2(pac.dy, pac.dx);

      render();
    }

    function startGame() {
      if (intervalId) clearInterval(intervalId);
      state = 'playing';
      intervalId = setInterval(gameTick, 140);
    }

    function render() {
      const W = canvas.width, H = canvas.height;
      const GW = COLS * CS, GH = ROWS * CS;

      ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, W, H);

      // Maze tiles
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const x = OX + c * CS, y = OY + r * CS, v = map[r][c];
          if (v === 1) {
            ctx.fillStyle = '#1d4ed8'; ctx.fillRect(x, y, CS, CS);
            ctx.fillStyle = '#1e3a8a'; ctx.fillRect(x+2, y+2, CS-4, CS-4);
          } else if (v === 2) {
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath(); ctx.arc(x+CS/2, y+CS/2, CS*0.1, 0, Math.PI*2); ctx.fill();
          } else if (v === 3) {
            const p = CS*0.17 + Math.sin(tick0*0.25)*CS*0.06;
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath(); ctx.arc(x+CS/2, y+CS/2, p, 0, Math.PI*2); ctx.fill();
          }
        }
      }

      // Ghost pen door
      ctx.strokeStyle = 'rgba(250,204,21,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(OX+8*CS, OY+9*CS+CS/2);
      ctx.lineTo(OX+13*CS, OY+9*CS+CS/2);
      ctx.stroke();

      // Ghosts
      ghosts.forEach(g => {
        const gx = OX + g.x*CS + CS/2, gy = OY + g.y*CS + CS/2, r2 = CS/2 - 1;

        // Body
        ctx.fillStyle = g.color;
        ctx.beginPath();
        ctx.arc(gx, gy-1, r2, Math.PI, 0, false);
        ctx.lineTo(gx+r2, gy+r2);
        for (let j = 0; j < 4; j++) {
          const bx  = gx + r2 - (j+0.5) * (r2*0.5);
          const cx2 = gx + r2 - (j+1)   * (r2*0.5);
          ctx.quadraticCurveTo(bx, gy+r2-r2*0.45, cx2, gy+r2);
        }
        ctx.lineTo(gx-r2, gy-1); ctx.closePath(); ctx.fill();

        // Outline so distinct colours don't bleed into each other
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
        ctx.stroke();

        // Eyes
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(gx-r2*0.38, gy-r2*0.28, r2*0.28, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(gx+r2*0.38, gy-r2*0.28, r2*0.28, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#1e40af';
        ctx.beginPath(); ctx.arc(gx-r2*0.38+g.dx*r2*0.12, gy-r2*0.28+g.dy*r2*0.12, r2*0.14, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(gx+r2*0.38+g.dx*r2*0.12, gy-r2*0.28+g.dy*r2*0.12, r2*0.14, 0, Math.PI*2); ctx.fill();
      });

      // Pac-Man
      const px = OX + pac.x*CS + CS/2, py = OY + pac.y*CS + CS/2;
      const a = pac.lastAngle + pac.mouth * Math.PI;
      ctx.fillStyle = '#facc15';
      ctx.beginPath(); ctx.moveTo(px, py);
      ctx.arc(px, py, CS/2-1, a, a + Math.PI*(2-pac.mouth*2), false);
      ctx.closePath(); ctx.fill();

      // Waiting splash
      if (state === 'waiting') {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(OX, OY, GW, GH);
        const tFS = Math.max(20, Math.min(CS*1.8, 44));
        ctx.fillStyle = '#facc15'; ctx.font = `bold ${tFS}px Courier New`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('PAC-MAN', OX+GW/2, OY+GH/2 - tFS*0.9);
      }

      // Game-over dim (React overlay handles title + buttons)
      if (state === 'dead' || state === 'win') {
        ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(OX, OY, GW, GH);
      }
    }

    const DIR_MAP: Record<string, { dx: number; dy: number }> = {
      ArrowUp:   { dx:0, dy:-1 }, ArrowDown: { dx:0, dy:1 },
      ArrowLeft: { dx:-1, dy:0 }, ArrowRight:{ dx:1, dy:0 },
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ') { e.preventDefault(); if (state === 'waiting') startGame(); return; }
      if (DIR_MAP[e.key]) {
        e.preventDefault(); inputQ = [DIR_MAP[e.key]];
        if (state === 'waiting') startGame();
      }
    };

    actionsRef.current = {
      retry: () => { doInit(); startGame(); },
      switchMap: (idx: number) => {
        if (idx >= 0 && idx < TILE_MAPS.length) {
          setCurrentMapIndex(idx);
          setEnded(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize',  onResize);
    doInit();

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize',  onResize);
      if (intervalId) clearInterval(intervalId);
    };
  }, [currentMapIndex]);

  function handleRetry() {
    setEnded(null);
    actionsRef.current?.retry();
  }

  const btnBase =
    "px-8 py-3 rounded-xl border-2 border-dashed font-bold text-sm uppercase tracking-[0.15em] transition-all duration-200 cursor-pointer";

  return (
    <div className="absolute inset-0">
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* Hearts — left edge, vertically centred */}
      <div className="absolute left-5 top-1/2 -translate-y-1/2 flex flex-col gap-4 pointer-events-none select-none z-10">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="text-4xl leading-none transition-all duration-300"
            style={{
              color: i < livesDisplay ? '#ef4444' : '#3f3f46',
            }}
          >
            ♥
          </span>
        ))}
      </div>

      {/* Score panel — right edge, vertically centred */}
      <div className="absolute right-5 top-1/2 -translate-y-1/2 flex flex-col items-end gap-5 pointer-events-none select-none z-10">
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">Score</span>
          <span className="text-3xl font-black font-mono text-white tabular-nums">{scoreDisplay}</span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">Best</span>
          <span className="text-3xl font-black font-mono text-yellow-400 tabular-nums">{bestScore}</span>
        </div>
      </div>

      {/* Map selector — bottom center */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 pointer-events-auto select-none z-20">
        <button
          onClick={() => {
            const prev = (currentMapIndex - 1 + TILE_MAPS.length) % TILE_MAPS.length;
            actionsRef.current?.switchMap(prev);
          }}
          className="px-3 py-2 rounded-lg border border-zinc-600 bg-zinc-900/80 text-white hover:border-yellow-400 hover:bg-yellow-400/10 transition-all duration-200 text-sm font-mono"
        >
          ← Prev
        </button>
        <span className="text-xs text-zinc-400 font-mono whitespace-nowrap">
          Map {currentMapIndex + 1} / {TILE_MAPS.length}
        </span>
        <button
          onClick={() => {
            const next = (currentMapIndex + 1) % TILE_MAPS.length;
            actionsRef.current?.switchMap(next);
          }}
          className="px-3 py-2 rounded-lg border border-zinc-600 bg-zinc-900/80 text-white hover:border-yellow-400 hover:bg-yellow-400/10 transition-all duration-200 text-sm font-mono"
        >
          Next →
        </button>
      </div>

      {/* Game-over overlay */}
      {ended && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 pointer-events-none">
          <h2
            className="text-5xl font-black tracking-[0.15em] uppercase"
            style={{ color: ended.outcome === 'win' ? '#facc15' : '#fff' }}
          >
            {ended.outcome === 'win' ? 'You Win!' : 'Game Over'}
          </h2>
          <p className="text-zinc-400 text-sm tracking-widest font-mono">score  {ended.score}</p>
          <div className="flex gap-4 pointer-events-auto mt-2">
            <button
              onClick={handleRetry}
              className={`${btnBase} border-yellow-400/70 bg-yellow-400/10 text-yellow-200 hover:bg-yellow-400/20`}
            >
              Retry
            </button>
            <button
              onClick={onMenu}
              className={`${btnBase} border-zinc-600 bg-transparent text-white hover:border-white hover:bg-white/5`}
            >
              Menu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

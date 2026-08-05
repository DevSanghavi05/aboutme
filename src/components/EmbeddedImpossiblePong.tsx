"use client";

import { useEffect, useRef } from "react";
import {
  getHorizontalPaddleImpact,
  PONG_DIFFICULTY_SETTINGS,
  PONG_WIN_SCORE,
} from "@/lib/pongSettings";

const WIN_SCORE = PONG_WIN_SCORE;
const IMPOSSIBLE = PONG_DIFFICULTY_SETTINGS.impossible;

type Paddle = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Ball = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  radius: number;
};

export function EmbeddedImpossiblePong() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!canvas || !container) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const player: Paddle = { x: 0, y: 0, width: 200, height: 12 };
    const cpu: Paddle = { x: 0, y: 48, width: 200, height: 12 };
    const ball: Ball = { x: 0, y: 0, dx: 0, dy: 0, radius: 25 };
    const ballImage = new window.Image();
    ballImage.src = "/pong-ball.png";
    const keys = { left: false, right: false };
    let pointerX = 0;
    let pointerActive = false;
    let playerScore = 0;
    let cpuScore = 0;
    let hitCount = 0;
    let waitingForServe = true;
    let gameOver = false;
    let animationFrame = 0;
    let lastTime = performance.now();
    let width = 1;
    let height = 1;
    const siteFont = window.getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";

    const positionPaddles = () => {
      player.y = height - 54;
      cpu.y = 48;
      player.x = Math.max(0, Math.min(player.x || width / 2 - player.width / 2, width - player.width));
      cpu.x = Math.max(0, Math.min(cpu.x || width / 2 - cpu.width / 2, width - cpu.width));
      if (!pointerActive) pointerX = player.x + player.width / 2;
    };

    const centerBall = () => {
      ball.x = width / 2;
      ball.y = height / 2;
      ball.dx = 0;
      ball.dy = 0;
      hitCount = 0;
      waitingForServe = true;
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, container.clientWidth);
      height = Math.max(1, container.clientHeight);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      positionPaddles();
      if (waitingForServe) centerBall();
    };

    const serve = () => {
      if (gameOver) {
        playerScore = 0;
        cpuScore = 0;
        gameOver = false;
      }
      const speed = IMPOSSIBLE.ballSpeed;
      const angle = (Math.random() - 0.5) * (Math.PI / 3.6);
      ball.dx = Math.sin(angle) * speed;
      ball.dy = Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1);
      waitingForServe = false;
    };

    const resetAfterPoint = () => {
      if (playerScore >= WIN_SCORE || cpuScore >= WIN_SCORE) gameOver = true;
      centerBall();
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerX = ((event.clientX - rect.left) / rect.width) * width;
      pointerActive = true;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        keys.left = true;
        pointerActive = false;
        event.preventDefault();
      }
      if (event.key === "ArrowRight") {
        keys.right = true;
        pointerActive = false;
        event.preventDefault();
      }
      if ((event.key === " " || event.code === "Space") && waitingForServe) {
        serve();
        event.preventDefault();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") keys.left = false;
      if (event.key === "ArrowRight") keys.right = false;
    };

    const onPointerDown = () => {
      if (waitingForServe) serve();
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);

      context.save();
      context.setLineDash([8, 14]);
      context.strokeStyle = "rgba(24, 32, 51, 0.12)";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(0, height / 2);
      context.lineTo(width, height / 2);
      context.stroke();
      context.restore();

      context.fillStyle = "rgba(24, 32, 51, 0.1)";
      context.font = `700 ${Math.min(104, Math.max(64, width * 0.07))}px ${siteFont}`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(String(cpuScore), width / 2, height * 0.27);
      context.fillText(String(playerScore), width / 2, height * 0.73);

      context.fillStyle = "#2864f0";
      context.beginPath();
      context.roundRect(player.x, player.y, player.width, player.height, 7);
      context.fill();
      context.beginPath();
      context.roundRect(cpu.x, cpu.y, cpu.width, cpu.height, 7);
      context.fill();

      if (!gameOver) {
        context.save();
        context.beginPath();
        context.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        context.clip();
        if (ballImage.complete && ballImage.naturalWidth > 0) {
          context.drawImage(
            ballImage,
            ball.x - ball.radius,
            ball.y - ball.radius,
            ball.radius * 2,
            ball.radius * 2,
          );
        } else {
          context.fillStyle = "#2864f0";
          context.fill();
        }
        context.restore();
      }

      if (gameOver) {
        context.fillStyle = "#182033";
        let titleSize = Math.min(76, Math.max(42, width * 0.075));
        const title = playerScore > cpuScore ? "YOU WIN" : "IMPOSSIBLE WINS";
        context.font = `750 ${titleSize}px ${siteFont}`;
        while (context.measureText(title).width > width - 64 && titleSize > 30) {
          titleSize -= 2;
          context.font = `750 ${titleSize}px ${siteFont}`;
        }
        context.fillText(title, width / 2, height / 2 - 16);
        context.fillStyle = "#182033";
        context.font = `650 ${Math.min(30, Math.max(22, width * 0.025))}px ${siteFont}`;
        context.fillText("Press Space to Start", width / 2, height / 2 + 62);
      } else if (waitingForServe) {
        context.fillStyle = "#182033";
        context.font = `650 ${Math.min(30, Math.max(22, width * 0.025))}px ${siteFont}`;
        context.fillText("Press Space to Start", width / 2, height / 2 + ball.radius + 42);
      }
    };

    const tick = (time: number) => {
      const frameScale = Math.min((time - lastTime) / (1000 / 60), 1.5);
      lastTime = time;

      if (keys.left) player.x -= IMPOSSIBLE.playerSpeed * frameScale;
      else if (keys.right) player.x += IMPOSSIBLE.playerSpeed * frameScale;
      else if (pointerActive) {
        const frameLerp = 1 - Math.pow(1 - IMPOSSIBLE.playerLerp, frameScale);
        player.x += (pointerX - player.width / 2 - player.x) * frameLerp;
      }
      player.x = Math.max(0, Math.min(player.x, width - player.width));

      if (!waitingForServe) {
        const previousBallX = ball.x;
        const previousBallY = ball.y;
        ball.x += ball.dx * frameScale;
        ball.y += ball.dy * frameScale;

        if (ball.x < ball.radius) {
          ball.x = ball.radius;
          ball.dx = Math.abs(ball.dx);
        } else if (ball.x > width - ball.radius) {
          ball.x = width - ball.radius;
          ball.dx = -Math.abs(ball.dx);
        }

        const cpuCenter = cpu.x + cpu.width / 2;
        const cpuStep = (IMPOSSIBLE.cpuSpeed + hitCount * 0.5) * frameScale;
        const cpuDelta = ball.x - cpuCenter;
        if (cpuDelta > 4) cpu.x += Math.min(cpuStep, cpuDelta);
        else if (cpuDelta < -4) cpu.x -= Math.min(cpuStep, -cpuDelta);
        cpu.x = Math.max(0, Math.min(cpu.x, width - cpu.width));

        const playerImpact = getHorizontalPaddleImpact(
          previousBallX,
          previousBallY,
          ball.x,
          ball.y,
          ball.radius,
          player,
          true,
        );
        if (playerImpact !== null) {
          ball.x = playerImpact;
          const offset = Math.max(-1, Math.min(1, (playerImpact - (player.x + player.width / 2)) / (player.width / 2)));
          const speedGain = IMPOSSIBLE.speedGain + hitCount * 0.25;
          const maxSpeed = IMPOSSIBLE.maxSpeed + hitCount * 3;
          const speed = Math.min(Math.hypot(ball.dx, ball.dy) + speedGain, maxSpeed);
          const angle = offset * (Math.PI / 3);
          ball.dx = Math.sin(angle) * speed;
          ball.dy = -Math.cos(angle) * speed;
          ball.y = player.y - ball.radius;
          hitCount += 1;
        }

        const cpuImpact = getHorizontalPaddleImpact(
          previousBallX,
          previousBallY,
          ball.x,
          ball.y,
          ball.radius,
          cpu,
          false,
        );
        if (cpuImpact !== null) {
          ball.x = cpuImpact;
          const offset = Math.max(-1, Math.min(1, (cpuImpact - (cpu.x + cpu.width / 2)) / (cpu.width / 2)));
          const speedGain = IMPOSSIBLE.speedGain + hitCount * 0.25;
          const maxSpeed = IMPOSSIBLE.maxSpeed + hitCount * 3;
          const speed = Math.min(Math.hypot(ball.dx, ball.dy) + speedGain, maxSpeed);
          const angle = offset * (Math.PI / 3);
          ball.dx = Math.sin(angle) * speed;
          ball.dy = Math.cos(angle) * speed;
          ball.y = cpu.y + cpu.height + ball.radius;
          hitCount += 1;
        }

        if (ball.y > height + ball.radius) {
          cpuScore += 1;
          resetAfterPoint();
        } else if (ball.y < -ball.radius) {
          playerScore += 1;
          resetAfterPoint();
        }
      }

      draw();
      animationFrame = requestAnimationFrame(tick);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    resize();
    animationFrame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-label="Impossible Pong. Move with the mouse or arrow keys and press Space to serve."
      role="img"
      style={{ display: "block", width: "100%", height: "100%", touchAction: "none" }}
    />
  );
}

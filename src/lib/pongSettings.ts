export const PONG_DIFFICULTY_SETTINGS = {
  easy: { cpuSpeed: 6, cpuReaction: 0.78, ballSpeed: 6, speedGain: 0.4, maxSpeed: 17, playerSpeed: 17, playerLerp: 0.3 },
  medium: { cpuSpeed: 8, cpuReaction: 0.9, ballSpeed: 8, speedGain: 0.55, maxSpeed: 23, playerSpeed: 18, playerLerp: 0.3 },
  hard: { cpuSpeed: 11, cpuReaction: 0.97, ballSpeed: 10, speedGain: 0.7, maxSpeed: 30, playerSpeed: 20, playerLerp: 0.3 },
  impossible: { cpuSpeed: 20, cpuReaction: 1, ballSpeed: 11, speedGain: 0.9, maxSpeed: 50, playerSpeed: 26, playerLerp: 0.5 },
} as const;

export const PONG_WIN_SCORE = 5;

type HorizontalPaddle = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function getHorizontalPaddleImpact(
  previousX: number,
  previousY: number,
  nextX: number,
  nextY: number,
  radius: number,
  paddle: HorizontalPaddle,
  movingDown: boolean,
): number | null {
  const movementY = nextY - previousY;
  if ((movingDown && movementY <= 0) || (!movingDown && movementY >= 0)) return null;

  const collisionY = movingDown
    ? paddle.y - radius
    : paddle.y + paddle.height + radius;
  const crossedFace = movingDown
    ? previousY <= collisionY && nextY >= collisionY
    : previousY >= collisionY && nextY <= collisionY;

  if (!crossedFace) return null;

  const travel = collisionY - previousY;
  const time = travel / movementY;
  const impactX = previousX + (nextX - previousX) * time;
  const leftEdge = paddle.x - radius;
  const rightEdge = paddle.x + paddle.width + radius;

  return impactX >= leftEdge && impactX <= rightEdge ? impactX : null;
}

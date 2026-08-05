export const PONG_DIFFICULTY_SETTINGS = {
  easy: { cpuSpeed: 6, cpuReaction: 0.78, ballSpeed: 6, speedGain: 0.4, maxSpeed: 17, playerSpeed: 17, playerLerp: 0.3 },
  medium: { cpuSpeed: 8, cpuReaction: 0.9, ballSpeed: 8, speedGain: 0.55, maxSpeed: 23, playerSpeed: 18, playerLerp: 0.3 },
  hard: { cpuSpeed: 11, cpuReaction: 0.97, ballSpeed: 10, speedGain: 0.7, maxSpeed: 30, playerSpeed: 20, playerLerp: 0.3 },
  impossible: { cpuSpeed: 20, cpuReaction: 1, ballSpeed: 11, speedGain: 0.9, maxSpeed: 50, playerSpeed: 26, playerLerp: 0.5 },
} as const;

export const PONG_WIN_SCORE = 5;

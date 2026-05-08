export const defaultTeams = [
  'Brasil',
  'Argentina',
  'França',
  'Alemanha',
  'Espanha',
  'Itália',
  'Inglaterra',
  'Portugal',
  'Holanda',
  'Bélgica',
  'Uruguai',
  'México',
  'Japão',
  'EUA',
  'Croácia',
  'Suécia',
];

export let gameConfig = createInitialConfig();

export function createInitialConfig() {
  return {
    matchTime: '60',
    maxGoals: '3',
    controlMode: 'drag',
    powerUpsEnabled: true,
    powerSpawnInterval: 6,
    powerDuration: 8,
    goalieAuto: true,
    gameSpeed: 1,
    soundEnabled: true,
    aiDifficulty: 'normal', // easy | normal | hard
  };
}

export function setConfig(next) {
  gameConfig = {
    ...gameConfig,
    ...next,
  };
}

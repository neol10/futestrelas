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
    dribbleMode: 'pesada',
    powerUpsEnabled: true,
    powerSpawnInterval: 6,
    powerDuration: 8,
    goalieAuto: true,
    gameSpeed: 1,
    soundEnabled: true,
    difficulty: 'medium', // legacy fallback: easy | medium | hard
    botDifficulty: 'medium',
    goalieDifficulty: 'medium',
    botsPerTeam: '3', // 1-10 bots per team
    weatherMode: 'clear',  // clear | rain | snow | wind | storm
  };
}

export function setConfig(next) {
  gameConfig = {
    ...gameConfig,
    ...next,
  };
}

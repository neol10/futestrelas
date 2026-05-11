import { defaultTeams, createInitialConfig, gameConfig, setConfig } from './config.js';
import { clamp } from './utils.js';
import { createUI } from './ui.js';
import { Ball } from './entities/ball.js';
import { Button } from './entities/button.js';
import { Goalie } from './entities/goalie.js';
import { WorldPhysics } from './physics.js';
import { PowerUpSystem } from './powerups.js';
import { GameAudio } from './audio.js';
import * as online from './online.js';

const FIELD = {
  width: 1000,
  height: 600,
  wall: 18,
  goalWidth: 170,
  goalDepth: 26,
};

const TEAM_COLORS = {
  Brasil: ['#ffd200', '#1f6f3a'],
  Argentina: ['#7cc7ff', '#ffffff'],
  França: ['#2e6cff', '#ffffff'],
  Alemanha: ['#f5f5f5', '#111111'],
  Espanha: ['#ff3b30', '#ffd200'],
  Itália: ['#1d65ff', '#ffffff'],
  Inglaterra: ['#ffffff', '#ff3b30'],
  Portugal: ['#1f6f3a', '#ff3b30'],
  Holanda: ['#ff7a18', '#111111'],
  Bélgica: ['#ff3b30', '#111111'],
  Uruguai: ['#7cc7ff', '#ffffff'],
  México: ['#1f6f3a', '#ffffff'],
  Japão: ['#ffffff', '#ff3b30'],
  EUA: ['#2e6cff', '#ff3b30'],
  Croácia: ['#ffffff', '#ff3b30'],
  Suécia: ['#2e6cff', '#ffd200'],
};

const TEAM_FLAGS = {
  Brasil: '🇧🇷',
  Argentina: '🇦🇷',
  França: '🇫🇷',
  Alemanha: '🇩🇪',
  Espanha: '🇪🇸',
  Itália: '🇮🇹',
  Inglaterra: '🇬🇧',
  Portugal: '🇵🇹',
  Holanda: '🇳🇱',
  Bélgica: '🇧🇪',
  Uruguai: '🇺🇾',
  México: '🇲🇽',
  Japão: '🇯🇵',
  EUA: '🇺🇸',
  Croácia: '🇭🇷',
  Suécia: '🇸🇪',
};

const DEFAULT_STATS = { curve: 1.0, power: 1.0, mass: 1.0, speed: 1.0 };
let continueButtonHitbox = null;
let isOnline = false;
let isHost = false;

// Cache do Campo
let fieldCacheCanvas = null;
function prerenderField() {
  if (!fieldCacheCanvas) {
    fieldCacheCanvas = document.createElement('canvas');
    fieldCacheCanvas.width = FIELD.width;
    fieldCacheCanvas.height = FIELD.height;
  }
  const fctx = fieldCacheCanvas.getContext('2d');
  
  // 1. BASE VERDE
  fctx.fillStyle = '#1e5d2c';
  fctx.fillRect(0, 0, FIELD.width, FIELD.height);

  // 2. LISTRAS PROFISSIONAIS
  const stripeWidth = FIELD.width / 12;
  for (let i = 0; i < 12; i++) {
    fctx.fillStyle = i % 2 === 0 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.03)';
    fctx.fillRect(i * stripeWidth, 0, stripeWidth, FIELD.height);
  }

  // 3. TEXTURA DE GRAMA (Fibras Cheadas)
  fctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  fctx.lineWidth = 0.5;
  for (let x = 0; x < FIELD.width; x += 12) {
    for (let y = 0; y < FIELD.height; y += 12) {
      fctx.beginPath();
      fctx.moveTo(x + Math.sin(y) * 3, y);
      fctx.lineTo(x + Math.sin(y) * 3, y + 4);
      fctx.stroke();
    }
  }

  // 4. MARCAÇÕES BRANCAS
  fctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  fctx.lineWidth = 3;
  fctx.strokeRect(10, 10, FIELD.width - 20, FIELD.height - 20); // Bordas

  // Linha central
  fctx.beginPath();
  fctx.moveTo(FIELD.width / 2, 10);
  fctx.lineTo(FIELD.width / 2, FIELD.height - 10);
  fctx.stroke();

  // Círculo central
  fctx.beginPath();
  fctx.arc(FIELD.width / 2, FIELD.height / 2, 80, 0, Math.PI * 2);
  fctx.stroke();

  // Áreas
  fctx.strokeRect(10, FIELD.height / 2 - 120, 100, 240); // Esquerda
  fctx.strokeRect(FIELD.width - 110, FIELD.height / 2 - 120, 100, 240); // Direita
}
const TEAM_STATS = {
  Brasil: { curve: 1.0, power: 1.0, mass: 1.0, speed: 1.0 },
  Alemanha: { curve: 1.0, power: 1.0, mass: 1.0, speed: 1.0 },
  Itália: { curve: 1.0, power: 1.0, mass: 1.0, speed: 1.0 },
  Espanha: { curve: 1.0, power: 1.0, mass: 1.0, speed: 1.0 },
  França: { curve: 1.0, power: 1.0, mass: 1.0, speed: 1.0 },
  Argentina: { curve: 1.0, power: 1.0, mass: 1.0, speed: 1.0 },
  Inglaterra: { curve: 1.0, power: 1.0, mass: 1.0, speed: 1.0 },
  Holanda: { curve: 1.0, power: 1.0, mass: 1.0, speed: 1.0 },
};

const KEYBOARD_SHOT_THRESHOLD_MS = 220;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const ui = createUI({
  teams: defaultTeams,
  flags: TEAM_FLAGS,
  onGoConfig: () => showConfig(),
  onBackToMenu: () => showMenu(),
  onRestart: () => restartMatch(),
  onStartMatch: (config, selections) => startMatch(config, selections),
});

let state = 'menu'; // menu | config | playing | goalPause | finished
let world = null;
let physics = null;
let powerUps = null;
let audio = new GameAudio();
let camera = { 
  x: FIELD.width / 2, 
  y: FIELD.height / 2, 
  zoom: 1, 
  targetZoom: 1,
  shake: 0 
};

let selections = { p1Team: defaultTeams[0], p2Team: defaultTeams[1] };

let players = [];
let currentPlayerIndex = 0;
let keyboardInput = {
  keysDown: new Set(),
};
let keyboardCharge = [0, 0];
let keyboardChargeHeld = [false, false];
let keyboardShotLatch = [false, false];
let keyboardPassHeld = [false, false]; // Pass action (R for P1, L for P2)
let drag = {
  active: false,
  playerIndex: 0,
  buttonId: null,
  start: { x: 0, y: 0 },
  now: { x: 0, y: 0 },
};

let turnLock = false;
let lastKeyboardShotTime = [0, 0];

let match = {
  timeLeft: 60,
  infinite: false,
  score: [0, 0],
  lastTimestamp: performance.now(),
};

let rafId = 0;
let timeWarningMarks = new Set();
let goldenGoalMode = false;
let goalPauseTimer = 0;
let slowMoTimer = 0;
let slowMoSpeed = 0.3;
let netSwingTimer = 0;


function showMenu() {
  state = 'menu';
  isOnline = false;
  isHost = false;
  ui.showScreen('menu');
  ui.setTopButtons({ back: false, restart: false });
}

function showConfig() {
  state = 'config';
  ui.showScreen('config');
  ui.setTopButtons({ back: true, restart: false });
}

function startMatch(config, sel) {
  // support quick match where UI may call without args
  const usedConfig = config ?? createInitialConfig();
  selections = sel ?? selections;
  setConfig(usedConfig);
  audio.setEnabled(!!usedConfig.soundEnabled);

  if (isOnline && isHost) {
    online.sendGameData({
      type: 'startMatch',
      config: usedConfig,
      selections: selections
    });
  }

  setupWorld();
  state = 'playing';
  ui.showScreen('game');
  ui.setTopButtons({ back: false, restart: true });

  // Reset rastro da bola
  if (world.ball) world.ball.trail = [];

  if (rafId) cancelAnimationFrame(rafId);
  match.lastTimestamp = performance.now();
  rafId = requestAnimationFrame(gameLoop);
}

function restartMatch() {
  if (state === 'menu' || state === 'config') return;
  
  // Limpa overlay se existir
  const overlay = document.getElementById('victoryOverlay');
  if (overlay) overlay.remove();

  setupWorld();
  state = 'playing';
  goalPauseTimer = 0;
  ui.toast('Reiniciado', 600);

  if (rafId) cancelAnimationFrame(rafId);
  match.lastTimestamp = performance.now();
  rafId = requestAnimationFrame(gameLoop);
}

function setupWorld() {
  const p1Colors = TEAM_COLORS[selections.p1Team] ?? ['#2e6cff', '#ffffff'];
  const p2Colors = TEAM_COLORS[selections.p2Team] ?? ['#ff3b30', '#ffffff'];

  const p1Stats = { curve: 1.0, power: 1.0, mass: 1.0, speed: 1.0 };
  const p2Stats = { curve: 1.0, power: 1.0, mass: 1.0, speed: 1.0 };

  players = [
    { id: 0, name: 'Jogador 1', team: selections.p1Team, colors: p1Colors, activePower: null, storedPower: null, stats: p1Stats },
    { id: 1, name: 'Jogador 2', team: selections.p2Team, colors: p2Colors, activePower: null, storedPower: null, stats: p2Stats },
  ];
  currentPlayerIndex = 0;

  match.score = [0, 0];
  match.infinite = gameConfig.matchTime === 'infinite';
  match.timeLeft = match.infinite ? Infinity : Number(gameConfig.matchTime);
  match.maxGoals = normalizeMaxGoals(gameConfig.maxGoals);
  match.maxGoals = normalizeMaxGoals(gameConfig.maxGoals);
  match.lastTimestamp = performance.now();
  timeWarningMarks = new Set();
  goldenGoalMode = false;
  goalPauseTimer = 0;

  world = {
    field: FIELD,
    ball: new Ball({ x: FIELD.width / 2, y: FIELD.height / 2 }),
    buttons: [],
    goalies: [],
    effects: { impacts: [], goalText: null, goalCelebration: null },
    activeShotPlayerId: null,
    extraTurnGranted: false,
    extraTurnGrantedPlayerId: null,
    keyboardSelectedIndices: [0, 0],
    controlledButtonId: null,
    shotCount: 0,
    maxShots: gameConfig.controlMode === 'keyboard' ? Infinity : 3,
  };

  world.goalies.push(new Goalie({ side: 'left', auto: gameConfig.goalieAuto }));
  world.goalies.push(new Goalie({ side: 'right', auto: gameConfig.goalieAuto }));

  const formations = createFormation();
  for (const b of formations.p1) world.buttons.push(new Button({ ...b, playerId: 0, colors: p1Colors, team: TEAM_FLAGS[selections.p1Team], stats: p1Stats }));
  for (const b of formations.p2) world.buttons.push(new Button({ ...b, playerId: 1, colors: p2Colors, team: TEAM_FLAGS[selections.p2Team], stats: p2Stats }));

  physics = new WorldPhysics({ field: FIELD });
  powerUps = new PowerUpSystem({ field: FIELD });
  audio.setEnabled(!!gameConfig.soundEnabled);

  drag.active = false;
  turnLock = false;
  goalPauseTimer = 0;
  keyboardInput.keysDown.clear();
  keyboardCharge = [0, 0];
  keyboardChargeHeld = [false, false];
  keyboardShotLatch = [false, false];
  ui.syncHUD({
    players,
    currentPlayerIndex,
    match,
    config: gameConfig,
    state,
    canShoot: allStopped() && !drag.active,
    controlMode: gameConfig.controlMode,
    keyboardSelectionText: getKeyboardSelectionText(),
    shotCount: world?.shotCount ?? 0,
    maxShots: world?.maxShots ?? 3,
  });

  // Seleciona automaticamente o botão mais perto da bola para o jogador atual
  selectNearestButtonForPlayer(currentPlayerIndex);
}

function getButtonsForPlayer(playerId) {
  return world?.buttons?.filter((button) => button.playerId === playerId) ?? [];
}

function getKeyboardSelection(playerId) {
  const buttons = getButtonsForPlayer(playerId);
  if (buttons.length === 0) return null;
  const index = world?.keyboardSelectedIndices?.[playerId] ?? 0;
  return buttons[index % buttons.length] ?? buttons[0];
}

function selectNearestButtonForPlayer(playerId) {
  if (!world) return;
  const buttons = world.buttons.filter((b) => b.playerId === playerId);
  if (!buttons || buttons.length === 0) return;
  const ball = world.ball;
  let best = buttons[0];
  let bestDist = Math.hypot(best.x - ball.x, best.y - ball.y);
  for (const b of buttons) {
    const d = Math.hypot(b.x - ball.x, b.y - ball.y);
    if (d < bestDist) {
      best = b; bestDist = d;
    }
  }
  world.controlledButtonId = best.id;
  if (gameConfig.controlMode === 'keyboard') {
    const idx = buttons.findIndex((x) => x.id === best.id);
    if (typeof idx === 'number' && idx >= 0) world.keyboardSelectedIndices[playerId] = idx;
  }
}

function getKeyboardSelectionText() {
  if (gameConfig.controlMode !== 'keyboard') return '';
  return `WASD+E (P1) • Setas+O (P2) • Dash: Shift/Space (P1) • Ctrl/Enter (P2) • Trocar: F / P`;
}

function cycleKeyboardSelection(playerId) {
  if (!world) return;
  const buttons = getButtonsForPlayer(playerId);
  if (buttons.length === 0) return;

  const current = world.keyboardSelectedIndices[playerId] ?? 0;
  const next = (current + 1) % buttons.length;
  world.keyboardSelectedIndices[playerId] = next;
}

function useKeyboardPower(playerId) {
  if (state !== 'playing') return;
  const player = players[playerId];
  
  // Se tem poder guardado, ativa agora
  if (player?.storedPower) {
    const type = player.storedPower;
    player.storedPower = null;
    
    // Efeitos instantâneos na ativação
    if (type === 'split') {
      world.maxShots += 2;
      ui.pop({ title: 'Multiplicação', message: '+2 chutes ganhos!', kind: 'success' });
      return;
    }
    if (type === 'void') {
      const opponent = players.find(p => p.id !== player.id);
      if (opponent.activePower) {
        opponent.activePower = null;
        ui.pop({ title: 'Vazio', message: 'Poder do oponente anulado!', kind: 'danger' });
      } else {
        ui.pop({ title: 'Vazio', message: 'Nenhum poder para anular', kind: 'info' });
      }
      return;
    }

    if (type === 'explosion') {
      const button = getKeyboardSelection(playerId);
      if (button) {
        createExplosion(button.x, button.y, 180, 1200);
        audio.hit(1.0);
        ui.pop({ title: 'EXPLOSÃO!', message: `${player.name} detonou tudo!`, kind: 'danger' });
      }
      return;
    }

    if (type === 'bomb') {
      player.activePower = { type: 'bomb', armed: true, usesLeft: 1 };
      ui.pop({ title: 'Bomba Armada!', message: 'Próximo contato será explosivo', kind: 'warning' });
      return;
    }

    if (type === 'repulsor') {
      player.activePower = { type: 'repulsor', timeLeft: 4, total: 4 };
      ui.pop({ title: 'Repulsor Ativo', message: 'Nada chega perto de você!', kind: 'info' });
      return;
    }

    player.activePower = {
      type,
      timeLeft: null,
      total: null,
      usesLeft: 1,
      isDebuff: false
    };
    
    audio.power(type);
    const tip = powerTip(type);
    ui.pop({ title: 'Poder Ativado!', message: `${player.name} ativou ${powerLabel(type)}${tip ? ` - ${tip}` : ''}`, kind: 'success' });
    return;
  }
  
  // Se não tem poder, apenas troca o botão selecionado
  cycleKeyboardSelection(playerId);
}

function kickBallKeyboard(playerId, duration) {
  if (state !== 'playing') return;
  if (turnLock) return;
  
  const now = performance.now();
  if (now - lastKeyboardShotTime[playerId] < 150) return; // Reduzido para maior responsividade
  
  const button = getKeyboardSelection(playerId);
  if (!button) return;
  
  // Define se é passe ou chute baseado no tempo (curto = passe, longo = chute)
  const isShoot = duration >= KEYBOARD_SHOT_THRESHOLD_MS;
  let dirx, diry, basePower;

  // No modo teclado, tanto passe quanto chute miram na bola.
  const dx = world.ball.x - button.x;
  const dy = world.ball.y - button.y;
  const dist = Math.hypot(dx, dy) || 1;
  dirx = dx / dist;
  diry = dy / dist;

  if (isShoot) {
    const charge = Math.min(1.0, duration / 750);
    basePower = 800 + charge * 1000;
    ui.toast('CHUTE!', 400);
  } else {
    basePower = 580;
    ui.toast('PASSE', 400);
  }

  // Aplica física e poderes
  const power = button.computeShotPower(basePower, players[playerId]?.activePower);
  const aim = button.applyAimAssist({ x: dirx, y: diry }, players[playerId]?.activePower);
  dirx = aim.x;
  diry = aim.y;
  button.ownerPower = players[playerId]?.activePower ?? null;
  
  button.vx += dirx * power;
  button.vy += diry * power;
  button.lastShotAt = performance.now();
  
  // Apenas bloqueia turno se realmente gastou chute
  if (world.shotCount < world.maxShots) {
    world.activeShotPlayerId = playerId;
    world.extraTurnGranted = false;
    world.extraTurnGrantedPlayerId = null;
    world.shotCount++;
    if (world.shotCount >= world.maxShots) turnLock = true;
  }
  
  if (players[playerId]?.activePower) {
    powerUps.applyBallEffects(world.ball, players[playerId].activePower.type);
    consumeKeyboardPower(players[playerId]);
  }
  
  audio.kick(power / 1300);
  lastKeyboardShotTime[playerId] = now;
}

function clampMagnitude(vx, vy, maxSpeed) {
  const speed = Math.hypot(vx, vy);
  if (speed <= maxSpeed || speed === 0) return { vx, vy };
  const scale = maxSpeed / speed;
  return { vx: vx * scale, vy: vy * scale };
}

function createFormation() {
  const marginX = 170;
  const p1 = [
    { x: marginX, y: 170 },
    { x: marginX + 50, y: 300 },
    { x: marginX, y: 430 },
  ];

  const p2 = p1.map((pos) => ({ x: FIELD.width - pos.x, y: pos.y }));
  return { p1, p2 };
}

function resizeCanvasToCSS() {
  const container = canvas.parentElement;
  if (!container) return;
  
  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  
  const targetW = Math.round(rect.width * dpr);
  const targetH = Math.round(rect.height * dpr);

  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }
}

function toWorldCoords(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * FIELD.width;
  const y = ((clientY - rect.top) / rect.height) * FIELD.height;
  return { x, y };
}

function allStopped() {
  const threshold = 0.045; // Relaxado um pouco para evitar travas
  if (Math.hypot(world.ball.vx, world.ball.vy) > threshold) return false;
  for (const b of world.buttons) {
    if (Math.hypot(b.vx, b.vy) > threshold) return false;
  }
  return true;
}

function pickButtonAtPoint(playerIndex, p) {
  let best = null;
  let bestD = Infinity;
  for (const b of world.buttons) {
    if (b.playerId !== playerIndex) continue;
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (d <= b.radius && d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

canvas.addEventListener('pointerdown', (e) => {
  if (state !== 'playing') return;
  if (gameConfig.controlMode === 'keyboard') return;
  if (!allStopped()) return;

  const p = toWorldCoords(e.clientX, e.clientY);
  const b = pickButtonAtPoint(currentPlayerIndex, p);
  if (!b) return;

  if (isOnline) {
    const myId = isHost ? 0 : 1;
    if (b.playerId !== myId) return;
  }

  drag.active = true;
  drag.playerIndex = currentPlayerIndex;
  drag.buttonId = b.id;
  world.controlledButtonId = b.id;
  drag.start = { x: p.x, y: p.y };
  drag.now = { x: p.x, y: p.y };
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag.active) return;
  const p = toWorldCoords(e.clientX, e.clientY);
  drag.now = p;
});

canvas.addEventListener('pointerup', () => {
  if (!drag.active) return;

  const b = world.buttons.find((x) => x.id === drag.buttonId);
  if (!b) {
    drag.active = false;
    world.controlledButtonId = null;
    return;
  }

  // Bloqueia se já fez o máximo de chutes neste turno
  if (world.shotCount >= world.maxShots) {
    drag.active = false;
    world.controlledButtonId = null;
    return;
  }

  const dx = drag.start.x - drag.now.x;
  const dy = drag.start.y - drag.now.y;
  const dist = Math.hypot(dx, dy);

  const pull = Math.min(290, dist);
  if (pull < 8) {
    drag.active = false;
    world.controlledButtonId = null;
    return;
  }

  let dirx = dx / dist;
  let diry = dy / dist;

  const power = b.computeShotPower(pull, players[currentPlayerIndex]?.activePower);
  const aim = b.applyAimAssist({ x: dirx, y: diry }, players[currentPlayerIndex]?.activePower);
  dirx = aim.x;
  diry = aim.y;
  b.ownerPower = players[currentPlayerIndex]?.activePower ?? null;

  b.vx += dirx * power;
  b.vy += diry * power;
  b.lastShotAt = performance.now();
  turnLock = true;
  world.activeShotPlayerId = currentPlayerIndex;
  world.extraTurnGranted = false;
  world.extraTurnGrantedPlayerId = null;
  world.shotCount++;

  const shotPower = players[currentPlayerIndex]?.activePower;
  if (shotPower) {
    powerUps.applyBallEffects(world.ball, shotPower.type);
    consumeKeyboardPower(players[currentPlayerIndex]);
  }

  audio.kick(power / 1300);

  drag.active = false;
  world.controlledButtonId = null;
});

canvas.addEventListener('pointercancel', () => {
  drag.active = false;
  if (world) world.controlledButtonId = null;
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('click', (e) => {
  // Handle continue button in goal celebration overlay
  if (state === 'goalPause' && continueButtonHitbox && continueButtonHitbox.visible) {
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    if (clickX >= continueButtonHitbox.x && clickX <= continueButtonHitbox.x + continueButtonHitbox.w &&
        clickY >= continueButtonHitbox.y && clickY <= continueButtonHitbox.y + continueButtonHitbox.h) {
      goalPauseTimer = 0;
      e.preventDefault();
    }
  }
});

window.addEventListener('keydown', (e) => {
  if (state === 'finished') return;
  if (e.key.toLowerCase() === 'r') {
    restartMatch();
  }
  if (e.key.toLowerCase() === 'c' && state === 'menu') {
    showConfig();
  }

  if (gameConfig.controlMode !== 'keyboard') {
    return;
  }

  const code = e.code;
  const moveCodes = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 
    'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 
    'KeyF', 'KeyP', 'KeyE', 'KeyO',
    'ShiftLeft', 'ControlRight', 'Space', 'Enter'
  ]);
  if (moveCodes.has(code)) e.preventDefault();

  if (e.repeat) return;
  
  // Comandos de usar poder (F/P) e chute (E/O)
  if (code === 'KeyF' && state === 'playing') {
    useKeyboardPower(0);
  }
  if (code === 'KeyP' && state === 'playing') {
    useKeyboardPower(1);
  }
  if (code === 'KeyE' && state === 'playing') {
    keyboardChargeHeld[0] = true;
  }
  if (code === 'KeyO' && state === 'playing') {
    keyboardChargeHeld[1] = true;
  }
  
  // Pass actions: R for P1 (WASD), L for P2 (Arrows)
  if (code === 'KeyR' && state === 'playing') {
    keyboardPassHeld[0] = true;
  }
  if (code === 'KeyL' && state === 'playing') {
    keyboardPassHeld[1] = true;
  }
  
  if (code === 'ShiftLeft' || code === 'Space') {
    performDash(0);
    return;
  }
  if (code === 'ControlRight' || code === 'Enter') {
    performDash(1);
    return;
  }
  
  keyboardInput.keysDown.add(code);

  if (state !== 'playing') return;
});

// fallback: permitir forçar continuar após celebração/pause de gol
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && state === 'goalPause') {
    console.info('Space pressed during goalPause — forcing resume');
    goalPauseTimer = 0;
  }
});

window.addEventListener('keyup', (e) => {
  const code = e.code;
  if (code === 'KeyE') {
    keyboardChargeHeld[0] = false;
    keyboardShotLatch[0] = false;
    keyboardCharge[0] = 0;
  }
  if (code === 'KeyO') {
    keyboardChargeHeld[1] = false;
    keyboardShotLatch[1] = false;
    keyboardCharge[1] = 0;
  }
  if (code === 'KeyR') {
    keyboardPassHeld[0] = false;
  }
  if (code === 'KeyL') {
    keyboardPassHeld[1] = false;
  }
  keyboardInput.keysDown.delete(code);
});

document.addEventListener('game:toggle-fullscreen', toggleFullscreen);
window.addEventListener('game:explosion', (e) => {
  createExplosion(e.detail.x, e.detail.y, 220, 1400);
});

// Wire fullscreen button
const btnFullscreen = document.getElementById('btnFullscreen');
if (btnFullscreen) {
  btnFullscreen.addEventListener('click', toggleFullscreen);
}

window.addEventListener('resize', () => resizeCanvasToCSS());
resizeCanvasToCSS();
ui.setTopButtons({ back: false, restart: false });
ui.setTeams(selections);
ui.setConfig(createInitialConfig());
showMenu();

// ONLINE EVENTS
document.addEventListener('online:init', () => {
  online.initOnlineSystem({
    onConnectionSuccess: ({ isHost: hostFlag }) => {
      isOnline = true;
      isHost = hostFlag;
      ui.toast(isHost ? '🟢 Amigo conectado!' : '🟢 Conectado ao Host!', 2500);
      if (!isHost) {
        ui.pop({ title: 'Aguardando', message: 'O Host vai configurar a partida...', kind: 'info', ttl: 4000 });
      }
    },
    onDataReceived: (data) => handleOnlineData(data),
    onPeerError: (err) => {
      const msg = err?.message ?? 'Erro na conexão online';
      ui.toast('❌ ' + msg, 4000);
      ui.pop({ title: 'Erro Online', message: msg, kind: 'error', ttl: 4000 });
    }
  });
});

document.addEventListener('online:connect', (e) => {
  online.connectToPeer(e.detail.remoteId, {
    onConnectionSuccess: ({ isHost: hostFlag }) => {
      isOnline = true;
      isHost = hostFlag;
      ui.toast('🟢 Conectado com sucesso!', 2000);
    },
    onDataReceived: (data) => handleOnlineData(data)
  });
});

document.addEventListener('online:stop', () => {
  isOnline = false;
  isHost = false;
  online.destroyOnlineSession?.();
});

// Desconexão do parceiro durante a partida — sem reload!
window.addEventListener('online:disconnected', () => {
  isOnline = false;
  isHost = false;
  ui.toast('⚠️ Parceiro desconectado', 4000);
  ui.pop({ title: 'Desconectado', message: 'Seu parceiro caiu. A partida foi pausada.', kind: 'warning', ttl: 5000 });
  if (state === 'playing') state = 'finished';
});

// Erro de rede durante partida
window.addEventListener('online:error', (e) => {
  const msg = e.detail?.message ?? 'Erro de rede';
  ui.toast('❌ ' + msg, 3000);
});

// MOBILE CONTROLS LOGIC
function setupMobileControls() {
  const zone = document.getElementById('joystickZone');
  const stick = document.getElementById('joystickStick');
  const btnPower = document.getElementById('btnMobilePower');
  const btnSwitch = document.getElementById('btnMobileSwitch');
  const btnDash = document.getElementById('btnMobileDash');
  const btnPass = document.getElementById('btnMobilePass');
  const btnKick = document.getElementById('btnMobileKick');

  if (!zone || !stick) return;

  let dragging = false;
  let startX, startY;
  const maxRadius = 40;

  const updateJoystick = (px, py) => {
    let dx = px - startX;
    let dy = py - startY;
    const dist = Math.hypot(dx, dy);
    
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }

    stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    // Map to WASD
    keyboardInput.keysDown.delete('KeyW');
    keyboardInput.keysDown.delete('KeyS');
    keyboardInput.keysDown.delete('KeyA');
    keyboardInput.keysDown.delete('KeyD');

    if (dist > 10) {
      if (dy < -15) keyboardInput.keysDown.add('KeyW');
      if (dy > 15) keyboardInput.keysDown.add('KeyS');
      if (dx < -15) keyboardInput.keysDown.add('KeyA');
      if (dx > 15) keyboardInput.keysDown.add('KeyD');
    }
  };

  zone.addEventListener('touchstart', (e) => {
    dragging = true;
    const touch = e.touches[0];
    const rect = zone.getBoundingClientRect();
    startX = rect.left + rect.width / 2;
    startY = rect.top + rect.height / 2;
    updateJoystick(touch.clientX, touch.clientY);
  });

  window.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const touch = e.touches[0];
    updateJoystick(touch.clientX, touch.clientY);
  }, { passive: false });

  window.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    stick.style.transform = 'translate(-50%, -50%)';
    keyboardInput.keysDown.delete('KeyW');
    keyboardInput.keysDown.delete('KeyS');
    keyboardInput.keysDown.delete('KeyA');
    keyboardInput.keysDown.delete('KeyD');
  });

  // Action Buttons
  btnPower?.addEventListener('touchstart', (e) => { e.preventDefault(); useKeyboardPower(0); });
  btnSwitch?.addEventListener('touchstart', (e) => { e.preventDefault(); cycleKeyboardSelection(0); });
  btnDash?.addEventListener('touchstart', (e) => { e.preventDefault(); performDash(0); });
  
  btnPass?.addEventListener('touchstart', (e) => { 
    e.preventDefault(); 
    keyboardPassHeld[0] = true;
    const b = getKeyboardSelection(0);
    if (b) performKeyboardPass(0, b);
    setTimeout(() => keyboardPassHeld[0] = false, 150);
  });

  btnKick?.addEventListener('touchstart', (e) => { 
    e.preventDefault(); 
    keyboardChargeHeld[0] = true; 
  });
  btnKick?.addEventListener('touchend', (e) => { 
    e.preventDefault(); 
    keyboardChargeHeld[0] = false;
    const b = getKeyboardSelection(0);
    if (b) maybeReleaseKeyboardKick(0, b);
  });
}

// Inicia controles móveis
setupMobileControls();

function handleOnlineData(data) {
  if (!data || typeof data !== 'object') return;

  if (data.type === 'kick') {
    if (!world?.ball || !world.buttons) return;
    const button = world.buttons.find(b => b.id === data.buttonId);
    if (button && data.aim && typeof data.power === 'number') {
      const power = data.power;
      const aim = data.aim;
      world.ball.vx += aim.x * power;
      world.ball.vy += aim.y * power;
      button.vx -= aim.x * power * 0.05;
      button.vy -= aim.y * power * 0.05;
      // Trigger PowerShot remoto
      if (data.isPowerShot) {
        world.ball.isPowerShot = true;
        world.ball.lastShooterPlayerId = data.shooterPlayerId ?? null;
      }
      audio.kick(power / 1300);
    }
  }

  if (data.type === 'syncState') {
    if (!isHost && world?.ball && data.ball) {
      // Interpolação suave em vez de teleporte brusco
      world.ball.x += (data.ball.x - world.ball.x) * 0.4;
      world.ball.y += (data.ball.y - world.ball.y) * 0.4;
      world.ball.vx = data.ball.vx;
      world.ball.vy = data.ball.vy;

      if (data.buttons && world.buttons) {
        data.buttons.forEach(sb => {
          const b = world.buttons.find(rb => rb.id === sb.id);
          if (b) {
            b.x += (sb.x - b.x) * 0.4;
            b.y += (sb.y - b.y) * 0.4;
            b.vx = sb.vx;
            b.vy = sb.vy;
          }
        });
      }
      if (data.score) match.score = data.score;
    }
  }

  if (data.type === 'startMatch') {
    if (data.config && data.selections) {
      startMatch(data.config, data.selections);
      ui.showScreen('game');
    }
  }

  if (data.type === 'goalScored') {
    if (!isHost) {
      handleGoal(data.scorer);
    }
  }
}

function update(dt) {
  try {
    if (!world) return;
    if (state === 'finished') return;

    const gameSpeed = Number(gameConfig.gameSpeed);

    // goalPause usa dt BRUTO (sem slow-mo) para não travar
    if (state === 'goalPause') {
      if (!Number.isFinite(goalPauseTimer) || goalPauseTimer <= 0) {
        goalPauseTimer = 0;
        slowMoTimer = 0;
        state = 'playing';
        physics.resetPositions(world);
        return;
      }

      const tick = Number.isFinite(dt) && dt > 0 ? dt : 0.016;
      goalPauseTimer = Math.max(0, goalPauseTimer - tick);
      if (goalPauseTimer === 0) {
        slowMoTimer = 0;
        state = 'playing';
        physics.resetPositions(world);
      }
      return;
    }

    // Apply slow-mo effect
    let effectiveDt = dt;
    if (slowMoTimer > 0) {
      slowMoTimer -= dt;
      effectiveDt *= 0.3;
    }
    effectiveDt *= gameSpeed;
    dt = effectiveDt;

  if (state === 'playing') {
    if (gameConfig.controlMode === 'keyboard') {
      updateKeyboardControls(dt);
    }

    if (!match.infinite) {
      match.timeLeft = Math.max(0, match.timeLeft - dt);
      emitTimeWarnings(match.timeLeft);
      if (match.timeLeft <= 0) {
        startGoldenGoal();
      }
    }

    powerUps.update(dt, world, players, currentPlayerIndex, gameConfig, {
      onCollect: (type, player) => {
        audio.power(type);
        const tip = powerTip(type);
        ui.pop({
          title: 'Power coletado',
          message: `${player.name} pegou ${powerLabel(type)}${tip ? ` - ${tip}` : ''}`,
          kind: 'success',
          ttl: 2200,
        });
        if (gameConfig.controlMode === 'keyboard') {
          ui.pop({
            title: 'Power pronto',
            message: `${player.name} vai usar no próximo chute`,
            kind: 'info',
            ttl: 1800,
          });
        }

        if (type === 'split' && gameConfig.controlMode !== 'keyboard') {
          world.maxShots += 2;
          ui.pop({ title: 'Multiplicação', message: '+2 chutes ganhos!', kind: 'success' });
        }

        if (type === 'void' && gameConfig.controlMode !== 'keyboard') {
          const opponent = players.find(p => p.id !== player.id);
          if (opponent.activePower) {
            opponent.activePower = null;
            ui.pop({ title: 'Vazio', message: 'Poder do oponente anulado!', kind: 'danger' });
          }
        }
      },
      onExpire: (type, player) => {
        ui.pop({
          title: 'Power encerrado',
          message: `${player.name} terminou ${powerLabel(type)}`,
          kind: 'info',
          ttl: 1800,
        });
      },
    });

    updateBotMovement(dt);

    for (const g of world.goalies) g.update(dt, world, gameConfig);

    // Power-ups em tempo real no loop principal
    for (const p of players) {
      if (p.activePower?.type === 'repulsor') {
        const button = getKeyboardSelection(p.id);
        if (button) applyRepulsion(button, 160, 550 * dt);
      }
      if (p.activePower?.type === 'magnet') {
        const buttons = getButtonsForPlayer(p.id);
        for (const b of buttons) applyAttraction(b, world.ball, 250, 400 * dt);
      }
      if (p.activePower?.type === 'zap' && Math.random() < 0.05) {
         // Pequenos choques aleatórios tiram velocidade
         const buttons = getButtonsForPlayer(p.id);
         for (const b of buttons) { b.vx *= 0.5; b.vy *= 0.5; }
      }
    }

    for (const p of players) {
      if (p.activePower?.type === 'gravity') {
        const buttons = getButtonsForPlayer(p.id);
        const anchor = gameConfig.controlMode === 'keyboard' ? getKeyboardSelection(p.id) : buttons[0];
        if (!anchor) continue;

        for (const b of world.buttons) {
          const isFriendly = b.playerId === p.id;
          const dx = anchor.x - b.x;
          const dy = anchor.y - b.y;
          const dist = Math.hypot(dx, dy);
          const range = 250;
          if (dist <= 4 || dist > range) continue;
          const pull = (1 - dist / range) * 220 * dt;
          b.vx += (dx / dist) * pull * (isFriendly ? 1.1 : 0.8);
          b.vy += (dy / dist) * pull * (isFriendly ? 1.1 : 0.8);
        }
      }
    }

    updateCautiousBotTouches(dt);

    stabilizeControlledButtons(dt);

    weather.update(dt, gameConfig.weatherMode ?? 'clear');

    physics.step(dt, world, gameConfig, (impact) => {
      world.effects.impacts.push(impact);
      camera.shake = Math.min(5, camera.shake + impact.strength * 0.3);
      if (impact.strength > 0.18) audio.hit(impact.strength);

      // Gerar fa\u00edscas metálicas em impactos extremos
      if (impact.strength > 0.6) {
        for (let i = 0; i < 8; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 200 + Math.random() * 400;
          world.effects.impacts.push({
            type: 'spark',
            x: impact.x,
            y: impact.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: 1 + Math.random() * 2,
            life: 0.3 + Math.random() * 0.3,
            maxLife: 0.6,
            color: '#fff700'
          });
        }
      }

      // Gerar partículas de grama em impactos fortes
      if (impact.strength > 0.35) {
        const count = Math.floor(impact.strength * 12);
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 100 + Math.random() * 300;
          world.effects.impacts.push({
            type: 'grass',
            x: impact.x,
            y: impact.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 150, // Pulo inicial
            radius: 2 + Math.random() * 3,
            life: 0.6 + Math.random() * 0.6,
            maxLife: 1.2,
            color: Math.random() > 0.5 ? '#1a5d2e' : '#2ecc71',
            scale: 1.0
          });
        }
      }
    });

    try {
      const goal = physics.checkGoal(world);
      if (goal) {
        // Reseta o PowerShot ao marcar gol
        if (world.ball) world.ball.isPowerShot = false;
        // Sincroniza gol com parceiro online
        if (isOnline && isHost) {
          online.sendGameData({ type: 'goalScored', scorer: goal.scorer });
        }
        handleGoal(goal.scorer);
      }
    } catch (err) {
      console.error('Error while checking/handling goal:', err);
      // Recover gracefully to avoid freezing the game
      if (typeof goalPauseTimer === 'number') goalPauseTimer = 0;
      state = 'playing';
    }

    if (turnLock && allStopped() && !drag.active && state === 'playing') {
      if (world.extraTurnGranted && world.extraTurnGrantedPlayerId === currentPlayerIndex) {
        world.extraTurnGranted = false;
        world.extraTurnGrantedPlayerId = null;
        world.activeShotPlayerId = null;
        turnLock = false;
        ui.pop({
          title: 'Jogada extra',
          message: `${players[currentPlayerIndex].name} ganhou mais uma vez`,
          kind: 'success',
          ttl: 1800,
        });
        } else if (world.shotCount < world.maxShots) {
        // Ainda tem chutes no turno
        turnLock = false;
        world.activeShotPlayerId = null;
      } else {
        // Alterna turno
        currentPlayerIndex = 1 - currentPlayerIndex;
        selectNearestButtonForPlayer(currentPlayerIndex);
        world.activeShotPlayerId = null;
        world.shotCount = 0;
        world.maxShots = gameConfig.controlMode === 'keyboard' ? Infinity : 3; // Reseta para padrão ou infinito no modo teclado
        turnLock = false;
      }
    }



    const winner = checkWinner();
    if (winner != null) {
      finishWithWinner(winner);
    }

    // Som da torcida din\u00e2mico
    if (Math.floor(performance.now() / 1200) % 1 === 0 && Math.random() < 0.1) {
      const ballNearGoal = world.ball.x < 300 || world.ball.x > FIELD.width - 300;
      audio.crowd(ballNearGoal ? 0.8 : 0.3);
    }

    ui.syncHUD({
      players,
      currentPlayerIndex,
      match,
      config: gameConfig,
      state,
      canShoot: allStopped() && !drag.active,
      controlMode: gameConfig.controlMode,
      keyboardSelectionText: getKeyboardSelectionText(),
      goldenGoalMode,
      shotCount: world.shotCount,
      maxShots: world.maxShots,
    });
    
    // Sincronização Periódica do Host
    if (isOnline && isHost && Math.floor(ts / 16) % 10 === 0) {
      online.sendGameData({
        type: 'syncState',
        ball: { x: world.ball.x, y: world.ball.y, vx: world.ball.vx, vy: world.ball.vy },
        buttons: world.buttons.map(b => ({ id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy })),
        score: match.score
      });
    }
  }

  // Lógica de Câmera Dinâmica
  updateCamera(dt);

  // efeitos visuais
  camera.shake = Math.max(0, camera.shake - dt * 20);
  world.effects.impacts = world.effects.impacts.filter((i) => {
    if (i.vx) i.x += i.vx * dt;
    if (i.vy) i.y += i.vy * dt;
    // Gravidade simples para partículas de grama (tipo: grass)
    if (i.type === 'grass') {
      i.vy += 650 * dt;
      i.scale = (i.scale || 1) * 0.98;
    }
    if (i.type === 'confetti') {
      i.vy += 520 * dt;
      i.rot = (i.rot || 0) + (i.spin || 0) * dt;
      i.scale = (i.scale || 1) * 0.995;
    }
    return (i.life -= dt) > 0;
  });

  } catch (err) {
    console.error('Unexpected error in update loop:', err);
    try { if (world && physics) physics.resetPositions(world); } catch (e) {}
    state = 'playing';
    goalPauseTimer = 0;
  }
}

function updateCamera(dt) {
  if (!world || state === 'menu' || state === 'config') return;

  const baseScale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
  let targetX, targetY;
  let targetZoom = 1.4; // Zoom base mais próximo (estilo Mamoball)

  // 1. CÂMERA DE COMEMORAÇÃO (Foco no Artilheiro/Vencedor)
  if ((state === 'goalPause' || state === 'finished') && world.effects.goalCelebration) {
    const scorerId = world.effects.goalCelebration.scorerButtonId;
    const scorer = world.buttons.find(b => b.id === scorerId);
    if (scorer) {
      targetX = scorer.x;
      targetY = scorer.y;
      targetZoom = 1.8;
    } else {
      targetX = world.ball.x;
      targetY = world.ball.y;
    }
  } else {
    // 2. LÓGICA NORMAL (Antecipação/Look-ahead)
    // Aumentamos o look-ahead para a câmera "prever" a direção da bola
    const lookAheadX = world.ball.vx * 0.45;
    const lookAheadY = world.ball.vy * 0.45;
    targetX = world.ball.x + lookAheadX;
    targetY = world.ball.y + lookAheadY;

    if (drag.active) {
      targetX = (targetX + drag.now.x) / 2;
      targetY = (targetY + drag.now.y) / 2;
    }

    const ballSpeed = Math.hypot(world.ball.vx, world.ball.vy);
    if (ballSpeed > 600) {
      targetZoom = 1.1; // Abre um pouco quando a bola corre muito
    } else if (world.ball.x < 150 || world.ball.x > FIELD.width - 150) {
      targetZoom = 1.6; // Foca mais perto nos gols
    }
  }

  // INTERPOLAÇÃO (Smoothing)
  const followSpeed = state === 'goalPause' ? 3.0 : 5.5;
  camera.x += (targetX - camera.x) * followSpeed * dt;
  camera.y += (targetY - camera.y) * followSpeed * dt;

  const zoomSpeed = state === 'goalPause' ? 2.0 : 3.0;
  camera.zoom += (targetZoom - camera.zoom) * zoomSpeed * dt;

  // CLAMPING CORRIGIDO
  // Usamos o finalScale real para calcular o tamanho da tela em unidades do mundo
  const finalScale = baseScale * camera.zoom;
  const viewWidth = (canvas.width / finalScale) / 2;
  const viewHeight = (canvas.height / finalScale) / 2;

  // Margem de segurança para garantir que as bordas do campo fiquem visíveis
  const margin = 15;

  // Se a largura da visão for maior que o campo total (tela muito larga), centraliza
  if (viewWidth * 2 >= FIELD.width + margin * 2) {
    camera.x = FIELD.width / 2;
  } else {
    camera.x = Math.max(viewWidth - margin, Math.min(FIELD.width - viewWidth + margin, camera.x));
  }

  // Se a altura da visão for maior que o campo total (tela muito alta), centraliza
  if (viewHeight * 2 >= FIELD.height + margin * 2) {
    camera.y = FIELD.height / 2;
  } else {
    camera.y = Math.max(viewHeight - margin, Math.min(FIELD.height - viewHeight + margin, camera.y));
  }
}

function updateKeyboardControls(dt) {
  const controls = [
    { playerId: 0, up: 'KeyW', left: 'KeyA', down: 'KeyS', right: 'KeyD' },
    { playerId: 1, up: 'ArrowUp', left: 'ArrowLeft', down: 'ArrowDown', right: 'ArrowRight' },
  ];

  for (const control of controls) {
    // Só bloqueia controle se for uma partida ONLINE ativa
    if (isOnline) {
      const myId = isHost ? 0 : 1;
      if (control.playerId !== myId) continue;
    }

    const button = getKeyboardSelection(control.playerId);
    if (!button) continue;

    const up = keyboardInput.keysDown.has(control.up) ? 1 : 0;
    const left = keyboardInput.keysDown.has(control.left) ? 1 : 0;
    const down = keyboardInput.keysDown.has(control.down) ? 1 : 0;
    const right = keyboardInput.keysDown.has(control.right) ? 1 : 0;

    const hasReverse = players[control.playerId]?.activePower?.type === 'reverse';
    const mult = hasReverse ? -1 : 1;

    let accelMult = 1.0;
    let speedMult = 1.0;

    const dx = (right - left) * mult;
    const dy = (down - up) * mult;
    
    if (dx !== 0 || dy !== 0) {
      const accel = 6500 * accelMult;
      button.vx += dx * accel * dt;
      button.vy += dy * accel * dt;

      const maxSpeed = 850 * speedMult;
      const clamped = clampMagnitude(button.vx, button.vy, maxSpeed);
      button.vx = clamped.vx;
      button.vy = clamped.vy;
    }

    if (keyboardChargeHeld[control.playerId]) {
      keyboardCharge[control.playerId] = Math.min(1, keyboardCharge[control.playerId] + dt / 0.85);
      maybeReleaseKeyboardKick(control.playerId, button);
    } else {
      keyboardCharge[control.playerId] = 0;
      keyboardShotLatch[control.playerId] = false;
    }
    
    // Pass action (R for P1, L for P2)
    if (keyboardPassHeld[control.playerId]) {
      performKeyboardPass(control.playerId, button);
      keyboardPassHeld[control.playerId] = false; // Single-tap action
    }

    // Chute Rápido (Mamoball Style): se estiver muito perto da bola, o chute é automático no pressionar de E/O
    if (keyboardChargeHeld[control.playerId]) {
       const dist = Math.hypot(button.x - world.ball.x, button.y - world.ball.y);
       if (dist < button.radius + world.ball.radius + 12) {
         // Chute imediato com força proporcional ao tempo de pressão
         maybeReleaseKeyboardKick(control.playerId, button);
       }
    }
  }
}

function performDash(playerId) {
  if (!world || state !== 'playing') return;
  const button = getKeyboardSelection(playerId);
  if (!button || button.stamina < button.dashCost) return;

  const up = keyboardInput.keysDown.has(playerId === 0 ? 'KeyW' : 'ArrowUp');
  const left = keyboardInput.keysDown.has(playerId === 0 ? 'KeyA' : 'ArrowLeft');
  const down = keyboardInput.keysDown.has(playerId === 0 ? 'KeyS' : 'ArrowDown');
  const right = keyboardInput.keysDown.has(playerId === 0 ? 'KeyD' : 'ArrowRight');

  let dx = (right ? 1 : 0) - (left ? 1 : 0);
  let dy = (down ? 1 : 0) - (up ? 1 : 0);
  
  // Se não estiver se movendo, dá o dash pra onde o botão já está virado ou pra frente (campo do adversário)
  if (dx === 0 && dy === 0) {
    dx = playerId === 0 ? 1 : -1;
  }

  const mag = Math.hypot(dx, dy);
  const dashForce = 1250;
  
  button.vx += (dx / mag) * dashForce;
  button.vy += (dy / mag) * dashForce;
  button.stamina -= button.dashCost;
  button.isDashing = true;
  button.dashTimer = 0.25;

  // Efeito visual de dash
  world.effects.impacts.push({
    x: button.x,
    y: button.y,
    strength: 0.6,
    radius: 25,
    life: 0.3,
    maxLife: 0.3,
    color: playerId === 0 ? 'rgba(0, 168, 255, 0.4)' : 'rgba(255, 59, 48, 0.4)'
  });

  audio.hit(0.4); // Som leve de dash
  ui.toast('DASH!', 250);
}

function updateCautiousBotTouches(dt) {
  if (!world || state !== 'playing') return;

  const ball = world.ball;
  const now = performance.now();
  const touchDistance = ball.radius + 18;

  for (const button of world.buttons) {
    const player = players[button.playerId];
    if (!player) continue;

    const isDraggedButton = drag.active && button.id === drag.buttonId;
    const isKeyboardButton = gameConfig.controlMode === 'keyboard' && getKeyboardSelection(button.playerId) === button;
    if (isDraggedButton || isKeyboardButton) continue;

    if (player.activePower?.type === 'stun' || player.activePower?.type === 'freeze') continue;
    if (now - button.botActionAt < 700) continue;

    const dx = ball.x - button.x;
    const dy = ball.y - button.y;
    const dist = Math.hypot(dx, dy);
    if (dist > button.radius + touchDistance) continue;
    if (Math.hypot(ball.vx, ball.vy) > 520) continue;

    const teammates = getButtonsForPlayer(button.playerId).filter((candidate) => candidate.id !== button.id);
    let target = null;

    if (teammates.length > 0) {
      target = teammates.reduce((best, candidate) => {
        if (!best) return candidate;
        const bestScore = Math.hypot(best.x - ball.x, best.y - ball.y);
        const candidateScore = Math.hypot(candidate.x - ball.x, candidate.y - ball.y);
        return candidateScore < bestScore ? candidate : best;
      }, null);
    }

    const goalX = button.playerId === 0 ? FIELD.width : 0;
    const goalY = FIELD.height / 2;
    
    // AI difficulty settings
    const difficultySettings = {
      easy: { passChance: 0.5 },
      normal: { passChance: 0.3 },
      hard: { passChance: 0.15 },
    };
    const difficulty = gameConfig.aiDifficulty || 'normal';
    const settings = difficultySettings[difficulty] || difficultySettings.normal;
    
    // Tactical decision: preferir passe se companheiro estiver em boa posicao
    let shouldPass = false;
    if (target) {
      const teammateGoalDist = Math.hypot(goalX - target.x, goalY - target.y);
      const selfGoalDist = Math.hypot(goalX - button.x, goalY - target.y);
      const passLooksGood = teammateGoalDist < selfGoalDist - 40;
      const passRoll = Math.random();
      shouldPass = passLooksGood || passRoll < settings.passChance;
    }
    
    let targetX, targetY;
    let shotPowerMult = 1;

    if (shouldPass && target) {
      targetX = target.x;
      targetY = target.y;
      shotPowerMult = 0.35; // Gentler for passes
    } else {
      targetX = goalX;
      targetY = goalY;
      shotPowerMult = 0.65; // Stronger for shots
    }

    let shotDx = targetX - button.x;
    let shotDy = targetY - button.y;
    let shotDist = Math.hypot(shotDx, shotDy) || 1;
    shotDx /= shotDist;
    shotDy /= shotDist;

    const basePull = 72 + Math.random() * 64;
    const gentlePower = button.computeShotPower(basePull, player.activePower) * shotPowerMult;
    const distanceToGoal = Math.hypot(goalX - button.x, goalY - targetY);
    const aim = button.applyAimAssist({ x: shotDx, y: shotDy }, player.activePower, distanceToGoal, gentlePower);

    ball.vx += aim.x * gentlePower;
    ball.vy += aim.y * gentlePower;

    // Trigger PowerShot
    if (player.activePower?.type === 'powershot') {
      ball.isPowerShot = true;
      ball.lastShooterPlayerId = player.id;
    }

    ball.spin += (Math.random() > 0.5 ? 1 : -1) * 0.6;
    button.vx -= aim.x * gentlePower * 0.045;
    button.vy -= aim.y * gentlePower * 0.045;
    button.lastShotAt = now;
    button.botActionAt = now;

    if (world.effects) {
      world.effects.impacts.push({
        x: (button.x + ball.x) / 2,
        y: (button.y + ball.y) / 2,
        strength: 0.25,
        radius: 10,
        life: 0.16,
        maxLife: 0.16,
        color: player.colors?.[0] ?? 'rgba(255,255,255,.7)',
      });
    }

    audio.kick(gentlePower / 1300, shouldPass ? 'pass' : 'shoot');
  }
}

function updateBotMovement(dt) {
  if (!world || state !== 'playing') return;

  // Multiplicadores de Dificuldade
  const difficulty = gameConfig.difficulty || 'medium';
  const diffMap = {
    'easy': { accel: 0.65, maxSpeed: 0.7 },
    'medium': { accel: 1.0, maxSpeed: 1.0 },
    'hard': { accel: 1.45, maxSpeed: 1.35 }
  };
  const mods = diffMap[difficulty] || diffMap.medium;

  const maxSpeed = 170 * mods.maxSpeed;
  const accel = 620 * mods.accel;

  for (const player of players) {
    const teamButtons = getButtonsForPlayer(player.id);
    if (teamButtons.length === 0) continue;

    const ordered = [...teamButtons].sort((a, b) => {
      const da = Math.hypot(a.x - world.ball.x, a.y - world.ball.y);
      const db = Math.hypot(b.x - world.ball.x, b.y - world.ball.y);
      return da - db;
    });

    const chasers = new Set(ordered.slice(0, 1).map((b) => b.id));

    for (const b of teamButtons) {
      const isDragged = drag.active && drag.buttonId === b.id;
      const isKeyboardSelected = gameConfig.controlMode === 'keyboard' && getKeyboardSelection(b.playerId) === b;
      const isExplicitControlled = world.controlledButtonId === b.id;
      if (isDragged || isKeyboardSelected || isExplicitControlled) continue;
      if (player.activePower?.type === 'stun' || player.activePower?.type === 'freeze') continue;

      if (chasers.has(b.id)) {
        const dx = world.ball.x - b.x;
        const dy = world.ball.y - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 6) continue;

        b.vx += (dx / dist) * accel * dt;
        b.vy += (dy / dist) * accel * dt;

        const clamped = clampMagnitude(b.vx, b.vy, maxSpeed);
        b.vx = clamped.vx;
        b.vy = clamped.vy;
      } else {
        b.applyIdleWander(dt);
      }
    }
  }
}

function hasMovementKeysForPlayer(playerId) {
  if (playerId === 0) {
    return keyboardInput.keysDown.has('KeyW') || keyboardInput.keysDown.has('KeyA') || keyboardInput.keysDown.has('KeyS') || keyboardInput.keysDown.has('KeyD');
  }
  return keyboardInput.keysDown.has('ArrowUp') || keyboardInput.keysDown.has('ArrowLeft') || keyboardInput.keysDown.has('ArrowDown') || keyboardInput.keysDown.has('ArrowRight');
}

function stabilizeControlledButtons(dt) {
  if (!world || gameConfig.controlMode !== 'keyboard') return;

  const brakePower = Math.pow(0.82, dt * 60); 

  for (const b of world.buttons) {
    const isSelected = getKeyboardSelection(b.playerId) === b;
    if (!isSelected) continue;

    if (!hasMovementKeysForPlayer(b.playerId)) {
      b.vx *= brakePower;
      b.vy *= brakePower;
      if (Math.abs(b.vx) < 1) b.vx = 0;
      if (Math.abs(b.vy) < 1) b.vy = 0;
    }
  }
}

function maybeReleaseKeyboardKick(playerId, button) {
  if (!world || state !== 'playing') return;
  if (keyboardShotLatch[playerId]) return;

  const ball = world.ball;
  // Margem de contato aumentada para tornar o chute de teclado muito mais confiável
  const contactDistance = button.radius + ball.radius + 18; 
  const dist = Math.hypot(button.x - ball.x, button.y - ball.y);
  if (dist > contactDistance) return;

  const charge = keyboardCharge[playerId];
  if (charge < 0.04) return;

  const kickPower = 320 + charge * 980;
  let dirx = ball.x - button.x;
  let diry = ball.y - button.y;
  let mag = Math.hypot(dirx, diry);

  if (mag < 0.001) {
    mag = Math.hypot(button.vx, button.vy);
    if (mag > 0.001) {
      dirx = button.vx / mag;
      diry = button.vy / mag;
    } else {
      const goalX = playerId === 0 ? FIELD.width : 0;
      const goalY = FIELD.height / 2;
      dirx = goalX - button.x;
      diry = goalY - button.y;
      mag = Math.hypot(dirx, diry) || 1;
      dirx /= mag;
      diry /= mag;
    }
  } else {
    dirx /= mag;
    diry /= mag;
  }

  const power = button.computeShotPower(kickPower, players[playerId]?.activePower);
  const aim = button.applyAimAssist({ x: dirx, y: diry }, players[playerId]?.activePower);
  ball.vx += aim.x * power;
  ball.vy += aim.y * power;

  // Trigger PowerShot
  if (players[playerId]?.activePower?.type === 'powershot') {
    ball.isPowerShot = true;
    ball.lastShooterPlayerId = playerId;
  }

  ball.spin += (button.vx - button.vy) * 0.002;

  // mark the shot so turn logic and shot counters behave like a normal kick
  world.activeShotPlayerId = playerId;
  world.shotCount = (world.shotCount || 0) + 1;
  turnLock = true;
  lastKeyboardShotTime[playerId] = performance.now();

  if (players[playerId]?.activePower) {
    powerUps.applyBallEffects(ball, players[playerId].activePower.type);
    consumeKeyboardPower(players[playerId]);
  }

  if (isOnline) {
    online.sendGameData({
      type: 'kick',
      buttonId: button.id,
      power,
      aim,
      isPowerShot: players[playerId]?.activePower?.type === 'powershot',
      shooterPlayerId: playerId
    });
  }

  audio.kick(power / 1300);
  ui.toast('CHUTE!', 320);
  keyboardShotLatch[playerId] = true;
  keyboardCharge[playerId] = 0;
  keyboardChargeHeld[playerId] = false;
}

function consumeKeyboardPower(player) {
  if (!player?.activePower) return;
  if (typeof player.activePower.usesLeft !== 'number') return;

  player.activePower.usesLeft -= 1;
  if (player.activePower.usesLeft <= 0) {
    const endedType = player.activePower.type;
    player.activePower = null;
    ui.pop({
      title: 'Power usado',
      message: `O ${powerLabel(endedType)} acabou`,
      kind: 'warning',
      ttl: 1700,
    });
  }
}

function performKeyboardPass(playerId, button) {
  if (!world || state !== 'playing') return;
  if (!button) return;

  const ball = world.ball;
  const contactDistance = button.radius + ball.radius + 18;
  const dist = Math.hypot(button.x - ball.x, button.y - ball.y);
  if (dist > contactDistance) return;

  // Find teammate
  const teammates = getButtonsForPlayer(playerId).filter((b) => b.id !== button.id);
  if (teammates.length === 0) return;

  const target = teammates[0]; // Pass to first teammate
  let dirx = target.x - button.x;
  let diry = target.y - button.y;
  const mag = Math.hypot(dirx, diry) || 1;
  dirx /= mag;
  diry /= mag;

  // Pass power (lower than shot)
  const passPower = button.computeShotPower(150, players[playerId]?.activePower) * 0.4;
  const aim = button.applyAimAssist({ x: dirx, y: diry }, players[playerId]?.activePower, mag, passPower);
  
  ball.vx += aim.x * passPower;
  ball.vy += aim.y * passPower;
  ball.spin += (Math.random() > 0.5 ? 1 : -1) * 0.3;

  world.activeShotPlayerId = playerId;
  world.shotCount = (world.shotCount || 0) + 1;
  turnLock = true;

  if (players[playerId]?.activePower) {
    powerUps.applyBallEffects(ball, players[playerId].activePower.type);
    consumeKeyboardPower(players[playerId]);
  }

  audio.kick(passPower / 1300, 'pass');
  ui.toast('PASSE!', 320);
}

function toggleFullscreen() {
  const element = document.documentElement;
  if (document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
    return;
  }

  element.requestFullscreen?.().catch(() => {});
}

function emitTimeWarnings(timeLeft) {
  const marks = [60, 30, 15, 10, 5, 4, 3, 2, 1];
  for (const mark of marks) {
    if (timeLeft <= mark && !timeWarningMarks.has(mark)) {
      timeWarningMarks.add(mark);
      ui.pop({
        title: 'Tempo',
        message: `${mark}s restantes`,
        kind: mark <= 5 ? 'danger' : mark <= 15 ? 'warning' : 'info',
        ttl: mark <= 5 ? 2000 : 1600,
      });
    }
  }
}

function powerLabel(type) {
  const labels = {
    superShot: 'super chute',
    curve: 'curva',
    magnet: 'magneto',
    slow: 'câmera lenta',
    precision: 'precisão',
    shield: 'escudo',
    boost: 'acelerador',
    dash: 'arrancada',
    freeze: 'congelamento',
    teleport: 'teletransporte',
    split: 'divisão',
    block: 'bloqueio',
    spinner: 'rotação',
    smoke: 'fumaça',
    lightning: 'raio',
    void: 'vazio',
    gravity: 'gravidade',
    shockwave: 'onda de choque',
    // Poderes adversários
    webSlowdown: 'teia de aranha',
    reverse: 'inverter',
    blur: 'visão turva',
    stun: 'atordoamento',
    drain: 'drenar',
    swamp: 'pântano',
    zap: 'choque',
    confuse: 'confusão',
  };
  return labels[type] || type;
}

function powerTip(type) {
  const tips = {
    superShot: 'chute muito mais forte',
    curve: 'bola faz curva',
    magnet: 'puxa a bola',
    slow: 'tempo mais lento',
    precision: 'mira perfeita',
    shield: 'fica mais pesado',
    boost: 'mais velocidade',
    dash: 'arrancada rapida',
    freeze: 'congela a bola',
    teleport: 'impacto teleport',
    split: 'ganha chutes extras',
    block: 'mais peso e bloqueio',
    spinner: 'gira e curva forte',
    smoke: 'reduz precisao',
    lightning: 'impacto eletrico',
    void: 'anula poder adversario',
    gravity: 'puxa objetos',
    shockwave: 'empurra ao redor',
    webSlowdown: 'desacelera adversario',
    reverse: 'inverte controles',
    blur: 'mira ruim',
    stun: 'paralisa',
    drain: 'tira energia',
    swamp: 'pesa os movimentos',
    zap: 'choque leve',
    confuse: 'controle confuso',
  };
  return tips[type] || '';
}

function checkWinner() {
  const maxGoals = Number.isFinite(match.maxGoals) ? match.maxGoals : normalizeMaxGoals(gameConfig.maxGoals);
  if (!Number.isFinite(maxGoals) || maxGoals <= 0) return null;
  if (match.score[0] >= maxGoals) return 0;
  if (match.score[1] >= maxGoals) return 1;
  return null;
}

function normalizeMaxGoals(value) {
  const parsed = Number.parseInt(value, 10);
  if (parsed === 1 || parsed === 3 || parsed === 5) return parsed;
  return 3;
}

function startGoldenGoal() {
  if (goldenGoalMode || state === 'finished') return;
  goldenGoalMode = true;
  match.timeLeft = 0;
  ui.pop({
    title: 'Gol de ouro',
    message: 'O tempo acabou. O primeiro gol vence.',
    kind: 'warning',
    ttl: 2600,
  });
  ui.toast('Gol de ouro ativado', 1300);
}

function finishWithWinner(winnerIndex) {
  if (state === 'finished') return;
  if (world?.effects) {
    const scorerButton = world.buttons
      .filter(b => b.playerId === winnerIndex)
      .sort((a, b) => Math.hypot(a.x - world.ball.x, a.y - world.ball.y) - Math.hypot(b.x - world.ball.x, b.y - world.ball.y))[0];
    
    world.effects.goalCelebration = {
      scorerIndex: winnerIndex,
      scorerButtonId: scorerButton?.id,
      startAt: performance.now(),
      duration: 3000,
      color: players[winnerIndex]?.colors?.[0] ?? '#ffffff',
      scoreText: `${match.score[0]} - ${match.score[1]}`,
    };

    const winnerColor = players[winnerIndex]?.colors?.[0] ?? '#ffffff';
    
    // Explos\u00e3o Massiva de Confete (200 part\u00edculas)
    for (let i = 0; i < 200; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 150 + Math.random() * 450;
      // Espalha pelo campo todo
      const startX = Math.random() * FIELD.width;
      const startY = Math.random() * FIELD.height;
      
      world.effects.impacts.push({
        type: 'confetti',
        x: startX,
        y: startY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 150,
        radius: 2 + Math.random() * 4,
        life: 2.0 + Math.random() * 1.5,
        maxLife: 3.5,
        color: Math.random() > 0.4 ? winnerColor : (Math.random() > 0.5 ? '#ffd700' : '#ffffff'),
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 15,
      });
    }
    
    camera.shake = 6;
  }
  
  state = 'finished';
  audio.goal();
  audio.applause(); 
  ui.toast(`🏆 ${players[winnerIndex].name} \u00c9 O CAMPE\u00c3O! 🏆`, 3000);

  // Mostra overlay de vit\u00f3ria ap\u00f3s delay de comemora\u00e7\u00e3o
  setTimeout(() => {
    ui.setTopButtons({ back: true, restart: true });
    
    const overlay = document.createElement('div');
    overlay.className = 'victory-overlay';
    overlay.id = 'victoryOverlay';
    overlay.innerHTML = `
      <h2 style="color: #fff; margin: 0; font-size: 32px;">FIM DE JOGO</h2>
      <p style="color: #ffd700; margin: 0 0 10px 0; font-size: 18px; font-weight: 700;">${players[winnerIndex].name} VENCEU!</p>
      <button class="btn-restart-large" onclick="window.restartGame()">Jogar Novamente</button>
    `;
    document.body.appendChild(overlay);
  }, 2500);
}

// Global para o bot\u00e3o de rein\u00edcio
window.restartGame = () => {
  const overlay = document.getElementById('victoryOverlay');
  if (overlay) overlay.remove();
  restartMatch();
};

function finishByTime() {
  startGoldenGoal();
}

function handleGoal(scorerIndex) {
  if (state !== 'playing') return;
  match.score[scorerIndex] += 1;

  if (goldenGoalMode) {
    finishWithWinner(scorerIndex);
    return;
  }

  const winner = checkWinner();
  if (winner != null) {
    finishWithWinner(winner);
    return;
  }

  // após gol, o saque é de quem sofreu o gol.
  currentPlayerIndex = 1 - scorerIndex;
  selectNearestButtonForPlayer(currentPlayerIndex);
  state = 'goalPause';
  audio.goal();
  audio.goalVoice();
  audio.applause();
  ui.toast('GOL!', 1200);

  // Encontra o botão que mais provavelmente fez o gol (o mais próximo da bola no momento do gol)
  const scorerButton = world.buttons
    .filter(b => b.playerId === scorerIndex)
    .sort((a, b) => Math.hypot(a.x - world.ball.x, a.y - world.ball.y) - Math.hypot(b.x - world.ball.x, b.y - world.ball.y))[0];

  if (world?.effects) {
    world.effects.goalCelebration = {
      scorerIndex,
      scorerButtonId: scorerButton?.id,
      startAt: performance.now(),
      duration: 3000,
      color: players[scorerIndex]?.colors?.[0] ?? '#ffffff',
      scoreText: `${match.score[0]} - ${match.score[1]}`,
    };
  }
  
  // Slow-mo replay effect mais dramático
  slowMoTimer = 1.2;
  slowMoSpeed = 0.25;
  netSwingTimer = 2.0;

  // Efeito de partículas de gol - mais partículas e impacto
  if (world) {
    const scorerColor = players[scorerIndex].colors[0];
    const goalX = scorerIndex === 0 ? FIELD.width - 20 : 20;
    const goalY = FIELD.height / 2;
    
    for (let i = 0; i < 60; i++) {
      const angle = (i / 60) * Math.PI * 2;
      const distance = 80 + Math.random() * 120;
      world.effects.impacts.push({
        x: goalX,
        y: goalY + (Math.random() - 0.5) * 100,
        strength: Math.random() * 2.5,
        radius: 6 + Math.random() * 12,
        life: 1.0 + Math.random() * 1.0,
        maxLife: 2.0,
        color: Math.random() > 0.4 ? scorerColor : '#ffffff',
        vx: Math.cos(angle) * distance * 1.2 + (Math.random() - 0.5) * 200,
        vy: Math.sin(angle) * distance * 1.2 + (Math.random() - 0.5) * 200,
      });
    }

    // Confete
    for (let i = 0; i < 90; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 220 + Math.random() * 320;
      const color = Math.random() > 0.5 ? scorerColor : '#ffffff';
      world.effects.impacts.push({
        type: 'confetti',
        x: goalX + (Math.random() - 0.5) * 40,
        y: goalY + (Math.random() - 0.5) * 80,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 120,
        radius: 3 + Math.random() * 3,
        life: 1.4 + Math.random() * 0.8,
        maxLife: 2.2,
        color,
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 10,
      });
    }
  }

  goalPauseTimer = 3.0; // 3 segundos de foco no artilheiro
}

function render() {
  if (!world) return;
  resizeCanvasToCSS();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const isPerspective = state === 'playing' && drag.active;

  // camera shake
  let ox = 0;
  let oy = 0;
  if (camera.shake > 0.05) {
    const a = Math.random() * Math.PI * 2;
    const r = camera.shake;
    ox = Math.cos(a) * r;
    oy = Math.sin(a) * r;
  }

  if (isPerspective) {
    renderPerspective(ox, oy);
  } else {
    renderTopDown(ox, oy);
  }

  // Overlay de Estádio / Vinheta Estática Superior
  drawStadiumOverlay();

  drawGoalCelebrationOverlay();
}

function drawStadiumOverlay() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  
  // Sombra suave de refletores/estádio
  const grad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, canvas.width/4, canvas.width/2, canvas.height/2, canvas.width);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function renderTopDown(ox, oy) {
  // Configuração da Câmera Dinâmica
  const baseScale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
  const finalScale = baseScale * camera.zoom;
  
  const viewportX = canvas.width / 2 - camera.x * finalScale;
  const viewportY = canvas.height / 2 - camera.y * finalScale;

  ctx.setTransform(finalScale, 0, 0, finalScale, viewportX + ox, viewportY + oy);

  drawStadium(ctx); // Desenha a arquibancada em volta do campo
  drawField(ctx);
  powerUps.render(ctx, world);

  // 1. DESENHAR SOMBRAS (Atrás dos objetos)
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
  const shadowOffset = 4;
  
  // Sombra da Bola
  ctx.beginPath();
  ctx.arc(world.ball.x + shadowOffset, world.ball.y + shadowOffset, world.ball.radius, 0, Math.PI * 2);
  ctx.fill();
  
  // Sombra dos Botões
  for (const b of world.buttons) {
    ctx.beginPath();
    ctx.arc(b.x + shadowOffset, b.y + shadowOffset, b.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 2. DESENHAR HALO DO CRAQUE (Botão Selecionado)
  if (gameConfig.controlMode === 'keyboard') {
    for (const pId in world.keyboardSelectedIndices) {
      const b = getKeyboardSelection(pId);
      if (b) {
        ctx.save();
        const pulse = Math.sin(performance.now() / 150) * 2;
        ctx.strokeStyle = players[pId].colors[0];
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]); // Linha pontilhada estilosa
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius + 5 + pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // Efeito de Fumaça (Debuff)
  for (const p of players) {
    if (p.activePower?.type === 'smoke' && p.activePower.isDebuff) {
      drawSmokeEffect(ctx, p.id);
    }
  }

  for (const g of world.goalies) g.render(ctx);
  for (const b of world.buttons) {
    const player = players[b.playerId];
    b.render(ctx, player?.activePower);
  }
  drawCurrentTurnGlow(ctx, world.buttons);
  drawKeyboardSelectionGlow(ctx, world.buttons, null);
  drawKeyboardAimPreview(ctx, null);
  
  // Barra de força
  if (gameConfig.controlMode === 'keyboard') {
    for (const playerId of [0, 1]) {
      if (keyboardCharge[playerId] <= 0) continue;
      const button = getKeyboardSelection(playerId);
      if (button) {
        drawPowerBar(ctx, button, keyboardCharge[playerId]);
        drawCurvePreview(ctx, button, keyboardCharge[playerId], playerId);
      }
    }
  }
  
  world.ball.render(ctx);

  weather.render(ctx, gameConfig.weatherMode ?? 'clear');

  for (const i of world.effects.impacts) {
    ctx.globalAlpha = Math.max(0, i.life / i.maxLife);
    if (i.type === 'grass') {
      ctx.fillStyle = i.color;
      const size = (i.radius || 3) * (i.scale || 1);
      ctx.fillRect(i.x - size/2, i.y - size/2, size, size);
    } else if (i.type === 'confetti') {
      const size = (i.radius || 3) * (i.scale || 1);
      ctx.save();
      ctx.translate(i.x, i.y);
      ctx.rotate(i.rot || 0);
      ctx.fillStyle = i.color;
      ctx.fillRect(-size, -size * 0.5, size * 2, size);
      ctx.restore();
    } else if (i.type === 'spark') {
      ctx.save();
      ctx.strokeStyle = i.color;
      ctx.lineWidth = i.radius;
      ctx.shadowBlur = 8;
      ctx.shadowColor = i.color;
      ctx.beginPath();
      ctx.moveTo(i.x, i.y);
      ctx.lineTo(i.x - i.vx * 0.03, i.y - i.vy * 0.03);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(i.x, i.y, i.radius * (1 + (1 - i.life / i.maxLife) * 0.35), 0, Math.PI * 2);
      ctx.fillStyle = i.color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  if (drag.active && state === 'playing') {
    const b = world.buttons.find((x) => x.id === drag.buttonId);
    if (b) drawShotIndicator(ctx, b, drag, players[currentPlayerIndex]);
  }
}

function renderPerspective(ox, oy) {
  const project = createPerspectiveProjector();

  ctx.setTransform(1, 0, 0, 1, ox, oy);
  drawPerspectiveField(ctx, project);

  powerUps.render(ctx, world, { project });

  // Fumaça em perspectiva
  for (const p of players) {
    if (p.activePower?.type === 'smoke' && p.activePower.isDebuff) {
      drawPerspectiveSmokeEffect(ctx, p.id, project);
    }
  }

  for (const g of world.goalies) drawProjectedEntity(ctx, g, project, { fill: 'rgba(245,245,245,.86)', outline: 'rgba(10,16,30,.40)' });
  for (const b of world.buttons) {
    const player = players[b.playerId];
    drawProjectedButton(ctx, b, project, b.id === drag.buttonId, player?.activePower);
  }
  drawProjectedGlow(ctx, world.buttons, project);
  drawKeyboardSelectionGlow(ctx, world.buttons, project);
  drawKeyboardAimPreview(ctx, project);
  drawProjectedEntity(ctx, world.ball, project, { fill: '#f5f5f5', outline: 'rgba(10,16,30,.35)', spin: true });

  for (const i of world.effects.impacts) {
    const p = project(i.x, i.y);
    ctx.globalAlpha = Math.max(0, i.life / i.maxLife);
    ctx.beginPath();
    ctx.arc(p.x, p.y, i.radius * p.scale * (1 + (1 - i.life / i.maxLife) * 0.35), 0, Math.PI * 2);
    ctx.fillStyle = i.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (drag.active && state === 'playing') {
    const b = world.buttons.find((x) => x.id === drag.buttonId);
    if (b) drawPerspectiveShotIndicator(ctx, b, drag, players[currentPlayerIndex], project);
  }
}

function createPerspectiveProjector() {
  const focusX = camera.x;
  const focusShift = (focusX - FIELD.width / 2) * 0.08;
  const horizon = canvas.height * 0.15;
  const vanishingX = canvas.width * 0.5 - focusShift;

  return (x, y) => {
    const depth = y / FIELD.height;
    // Ajusta o scale baseado no zoom da câmera
    const scale = (0.28 + depth * 1.02) * camera.zoom;
    const spread = 0.30 + depth * 0.92;
    const px = vanishingX + (x - focusX) * spread * (canvas.width / FIELD.width) * camera.zoom;
    const py = horizon + depth * (canvas.height - horizon - 28);
    return { x: px, y: py, scale };
  };
}

function drawPerspectiveField(ctx2d, project) {
  const topLeft = project(0, 0);
  const topRight = project(FIELD.width, 0);
  const bottomLeft = project(0, FIELD.height);
  const bottomRight = project(FIELD.width, FIELD.height);

  ctx2d.save();
  ctx2d.fillStyle = '#0e7c42';
  ctx2d.beginPath();
  ctx2d.moveTo(topLeft.x, topLeft.y);
  ctx2d.lineTo(topRight.x, topRight.y);
  ctx2d.lineTo(bottomRight.x, bottomRight.y);
  ctx2d.lineTo(bottomLeft.x, bottomLeft.y);
  ctx2d.closePath();
  ctx2d.fill();

  ctx2d.globalAlpha = 0.08;
  ctx2d.fillStyle = '#ffffff';
  for (let y = 0; y < FIELD.height; y += 60) {
    const y1 = y;
    const y2 = Math.min(FIELD.height, y + 30);
    const a1 = project(0, y1);
    const a2 = project(FIELD.width, y1);
    const b1 = project(0, y2);
    const b2 = project(FIELD.width, y2);
    ctx2d.beginPath();
    ctx2d.moveTo(a1.x, a1.y);
    ctx2d.lineTo(a2.x, a2.y);
    ctx2d.lineTo(b2.x, b2.y);
    ctx2d.lineTo(b1.x, b1.y);
    ctx2d.closePath();
    ctx2d.fill();
  }
  ctx2d.globalAlpha = 1;

  ctx2d.strokeStyle = 'rgba(255,255,255,.70)';
  ctx2d.lineWidth = 2.4;
  ctx2d.beginPath();
  ctx2d.moveTo(topLeft.x, topLeft.y);
  ctx2d.lineTo(topRight.x, topRight.y);
  ctx2d.lineTo(bottomRight.x, bottomRight.y);
  ctx2d.lineTo(bottomLeft.x, bottomLeft.y);
  ctx2d.closePath();
  ctx2d.stroke();

  const centerTop = project(FIELD.width / 2, 0);
  const centerBottom = project(FIELD.width / 2, FIELD.height);
  ctx2d.beginPath();
  ctx2d.moveTo(centerTop.x, centerTop.y);
  ctx2d.lineTo(centerBottom.x, centerBottom.y);
  ctx2d.stroke();

  const ring = project(FIELD.width / 2, FIELD.height * 0.45);
  ctx2d.beginPath();
  ctx2d.ellipse(ring.x, ring.y, 72 * ring.scale, 42 * ring.scale, 0, 0, Math.PI * 2);
  ctx2d.stroke();

  ctx2d.fillStyle = 'rgba(255,255,255,.10)';
  const goalA = project(0, 0);
  const goalB = project(FIELD.width, 0);
  ctx2d.beginPath();
  ctx2d.moveTo(goalA.x - 18, goalA.y - 8);
  ctx2d.lineTo(goalB.x + 18, goalB.y - 8);
  ctx2d.lineTo(goalB.x + 18, goalB.y + 10);
  ctx2d.lineTo(goalA.x - 18, goalA.y + 10);
  ctx2d.closePath();
  ctx2d.fill();
  ctx2d.restore();
}

function drawProjectedEntity(ctx2d, entity, project, opts = {}) {
  const p = project(entity.x, entity.y);
  const radius = entity.radius * p.scale;
  const shadowY = p.y + radius * 0.35;

  ctx2d.globalAlpha = 0.24;
  ctx2d.beginPath();
  ctx2d.ellipse(p.x + radius * 0.12, shadowY, radius * 1.05, radius * 0.72, 0, 0, Math.PI * 2);
  ctx2d.fillStyle = '#000';
  ctx2d.fill();
  ctx2d.globalAlpha = 1;

  ctx2d.beginPath();
  ctx2d.ellipse(p.x, p.y, Math.max(3, radius), Math.max(3, radius * 0.9), 0, 0, Math.PI * 2);
  ctx2d.fillStyle = opts.fill ?? '#f5f5f5';
  ctx2d.fill();

  ctx2d.lineWidth = Math.max(1.5, radius * 0.12);
  ctx2d.strokeStyle = opts.outline ?? 'rgba(10,16,30,.35)';
  ctx2d.stroke();

  if (opts.spin && entity.spin && Math.abs(entity.spin) > 0.2) {
    ctx2d.save();
    ctx2d.translate(p.x, p.y);
    ctx2d.scale(1, 0.7);
    ctx2d.rotate(performance.now() / 300 * (entity.spin > 0 ? 1 : -1));
    ctx2d.beginPath();
    ctx2d.arc(0, 0, Math.max(3, radius * 0.82), 0.2, 2.5);
    ctx2d.strokeStyle = 'rgba(46,108,255,.55)';
    ctx2d.lineWidth = Math.max(1.5, radius * 0.1);
    ctx2d.stroke();
    ctx2d.restore();
  }
}

function drawProjectedButton(ctx2d, button, project, selected, activePower) {
  const p = project(button.x, button.y);
  const radius = button.radius * p.scale;

  // Brilho de poder ativo
  if (activePower) {
    const auraMap = {
      bomb: 'rgba(255, 80, 30, 0.3)',
      repulsor: 'rgba(0, 255, 255, 0.22)',
      boost: 'rgba(0, 255, 128, 0.28)',
      dash: 'rgba(255, 140, 0, 0.28)',
      gravity: 'rgba(122, 92, 255, 0.28)',
      shockwave: 'rgba(0, 212, 255, 0.24)',
      magnet: 'rgba(46, 224, 255, 0.24)',
      freeze: 'rgba(0, 204, 255, 0.22)',
      smoke: 'rgba(160, 160, 160, 0.2)',
      lightning: 'rgba(255, 204, 0, 0.24)',
    };
    const auraColor = auraMap[activePower.type];
    if (auraColor) {
      ctx2d.save();
      ctx2d.beginPath();
      ctx2d.ellipse(p.x, p.y, radius + 6, (radius + 6) * 0.94, 0, 0, Math.PI * 2);
      ctx2d.strokeStyle = auraColor;
      ctx2d.lineWidth = Math.max(2, radius * 0.12);
      ctx2d.stroke();
      if (activePower.type === 'shockwave' || activePower.type === 'gravity') {
        ctx2d.setLineDash([6 * p.scale, 4 * p.scale]);
        ctx2d.beginPath();
        ctx2d.ellipse(p.x, p.y, radius + 11, (radius + 11) * 0.94, 0, 0, Math.PI * 2);
        ctx2d.strokeStyle = auraColor;
        ctx2d.lineWidth = Math.max(1.5, radius * 0.08);
        ctx2d.stroke();
        ctx2d.setLineDash([]);
      }
      ctx2d.restore();
    }
  }

  if (activePower?.type === 'bomb' || activePower?.type === 'repulsor') {
    ctx2d.save();
    ctx2d.beginPath();
    ctx2d.ellipse(p.x, p.y, radius + 8, (radius + 8) * 0.93, 0, 0, Math.PI * 2);
    ctx2d.fillStyle = activePower.type === 'bomb' ? 'rgba(255, 0, 0, 0.3)' : 'rgba(0, 255, 255, 0.2)';
    ctx2d.fill();
    ctx2d.restore();
  }

  const [c1, c2] = button.colors;
  const grad = ctx2d.createRadialGradient(p.x - radius * 0.35, p.y - radius * 0.35, radius * 0.2, p.x, p.y, radius);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);

  ctx2d.globalAlpha = 0.26;
  ctx2d.beginPath();
  ctx2d.ellipse(p.x + radius * 0.14, p.y + radius * 0.44, radius * 1.05, radius * 0.75, 0, 0, Math.PI * 2);
  ctx2d.fillStyle = '#000';
  ctx2d.fill();
  ctx2d.globalAlpha = 1;

  ctx2d.beginPath();
  ctx2d.ellipse(p.x, p.y, Math.max(3, radius), Math.max(3, radius * 0.93), 0, 0, Math.PI * 2);
  ctx2d.fillStyle = grad;
  ctx2d.fill();
  ctx2d.lineWidth = Math.max(1.5, radius * 0.1);
  ctx2d.strokeStyle = selected ? 'rgba(255,255,255,.92)' : 'rgba(255,255,255,.35)';
  ctx2d.stroke();

  ctx2d.beginPath();
  ctx2d.ellipse(p.x, p.y, Math.max(2, radius * 0.26), Math.max(2, radius * 0.26), 0, 0, Math.PI * 2);
  ctx2d.fillStyle = 'rgba(10,16,30,.55)';
  ctx2d.fill();
}

function drawProjectedGlow(ctx2d, buttons, project) {
  if (state !== 'playing' || !allStopped() || drag.active) return;

  for (const b of buttons) {
    if (b.playerId !== currentPlayerIndex) continue;
    const p = project(b.x, b.y);
    const radius = b.radius * p.scale + 7;
    ctx2d.beginPath();
    ctx2d.ellipse(p.x, p.y, radius, radius * 0.9, 0, 0, Math.PI * 2);
    ctx2d.strokeStyle = 'rgba(255,255,255,.38)';
    ctx2d.lineWidth = 2;
    ctx2d.stroke();
  }
}

function drawPerspectiveShotIndicator(ctx2d, button, dragState, player, project) {
  if (player?.activePower?.type === 'smoke' && player.activePower.isDebuff) return;
  const start = project(dragState.start.x, dragState.start.y);
  const now = project(dragState.now.x, dragState.now.y);
  const buttonP = project(button.x, button.y);
  const dist = Math.hypot(dragState.start.x - dragState.now.x, dragState.start.y - dragState.now.y);
  const maxPull = 210;
  const pull = Math.min(maxPull, dist);
  if (pull < 3) return;

  ctx2d.lineCap = 'round';
  ctx2d.strokeStyle = 'rgba(255,255,255,.9)';
  ctx2d.lineWidth = 4;
  ctx2d.beginPath();
  ctx2d.moveTo(buttonP.x, buttonP.y);
  ctx2d.lineTo(now.x, now.y);
  ctx2d.stroke();

  if (player?.activePower?.type === 'curve') {
    ctx2d.strokeStyle = 'rgba(255,255,255,.44)';
    ctx2d.lineWidth = 2.5;
    ctx2d.beginPath();
    ctx2d.moveTo(buttonP.x, buttonP.y);
    ctx2d.lineTo(now.x - (now.y - buttonP.y) * 0.08, now.y + (buttonP.x - now.x) * 0.08);
    ctx2d.stroke();
  }

  ctx2d.fillStyle = 'rgba(255,255,255,.95)';
  ctx2d.beginPath();
  ctx2d.arc(now.x, now.y, 5, 0, Math.PI * 2);
  ctx2d.fill();
}

function drawField(ctx2d) {
  if (!fieldCacheCanvas) prerenderField();
  
  // Desenha o campo pré-renderizado (Alta Performance)
  ctx2d.drawImage(fieldCacheCanvas, 0, 0);

  // Gols e Redes
  ctx2d.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx2d.lineWidth = 4;
  
  // Poste esquerdo
  const gy0 = (FIELD.height - FIELD.goalWidth) / 2;
  ctx2d.strokeRect(0, gy0, FIELD.goalDepth, FIELD.goalWidth);
  // Poste direito
  ctx2d.strokeRect(FIELD.width - FIELD.goalDepth, gy0, FIELD.goalDepth, FIELD.goalWidth);

  // Redes
  drawGoalNet(ctx2d, 0, gy0, FIELD.goalDepth, FIELD.goalWidth);
  drawGoalNet(ctx2d, FIELD.width - FIELD.goalDepth, gy0, FIELD.goalDepth, FIELD.goalWidth);

  // Iluminação (Sempre viva por cima)
  drawStadiumLighting(ctx2d, FIELD.width, FIELD.height);
}

function drawGoalNet(ctx, x, y, w, h) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  const step = 8;
  // Horizontais
  for (let j = y; j <= y + h; j += step) {
    ctx.beginPath(); ctx.moveTo(x, j); ctx.lineTo(x + w, j); ctx.stroke();
  }
  // Verticais
  for (let i = x; i <= x + w; i += step) {
    ctx.beginPath(); ctx.moveTo(i, y); ctx.lineTo(i, y + h); ctx.stroke();
  }
  ctx.restore();
}

function drawStadiumLighting(ctx2d, w, h) {
  ctx2d.save();
  ctx2d.globalCompositeOperation = 'screen';
  
  // Gradientes de luz nos cantos (simulando refletores)
  const corners = [
    [0, 0], [w, 0], [0, h], [w, h]
  ];
  
  corners.forEach(([cx, cy]) => {
    const light = ctx2d.createRadialGradient(cx, cy, 0, cx, cy, w * 0.6);
    light.addColorStop(0, 'rgba(255, 255, 240, 0.12)');
    light.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx2d.fillStyle = light;
    ctx2d.fillRect(0, 0, w, h);
  });
  
  ctx2d.restore();
}

function drawShotIndicator(ctx2d, button, dragState, player) {
  if (player?.activePower?.type === 'smoke' && player.activePower.isDebuff) return;
  const dx = dragState.start.x - dragState.now.x;
  const dy = dragState.start.y - dragState.now.y;
  const dist = Math.hypot(dx, dy);
  const maxPull = 210;
  const pull = Math.min(maxPull, dist);
  if (pull < 3) return;

  const nx = dx / dist;
  const ny = dy / dist;

  const baseLen = pull * 0.9;
  const endX = button.x + nx * baseLen;
  const endY = button.y + ny * baseLen;

  drawAimArrow(ctx2d, button.x, button.y, endX, endY, 'rgba(255,255,255,.92)', 'rgba(255,255,255,.42)', 5, 18, 22);

  // "indicar curva": se power curve ativo, mostra uma leve inclinação
  const hasCurve = player?.activePower?.type === 'curve';
  if (hasCurve) {
    const tilt = 18;
    ctx2d.strokeStyle = 'rgba(255,255,255,.45)';
    ctx2d.lineWidth = 3;
    ctx2d.beginPath();
    ctx2d.moveTo(button.x, button.y);
    ctx2d.lineTo(endX - ny * tilt, endY + nx * tilt);
    ctx2d.stroke();
  }

  // ponta
  ctx2d.fillStyle = 'rgba(255,255,255,.9)';
  ctx2d.beginPath();
  ctx2d.arc(endX, endY, 6, 0, Math.PI * 2);
  ctx2d.fill();
}

function drawCurrentTurnGlow(ctx2d, buttons) {
  if (state !== 'playing') return;
  if (!allStopped() || drag.active) return;

  for (const b of buttons) {
    if (b.playerId !== currentPlayerIndex) continue;
    ctx2d.beginPath();
    ctx2d.arc(b.x, b.y, b.radius + 7, 0, Math.PI * 2);
    ctx2d.strokeStyle = 'rgba(255,255,255,.38)';
    ctx2d.lineWidth = 2;
    ctx2d.stroke();
  }
}

function drawKeyboardSelectionGlow(ctx2d, buttons, project) {
  if (gameConfig.controlMode !== 'keyboard') return;

  const selectionsByPlayer = [
    { playerId: 0, color: 'rgba(60,198,255,.85)' },
    { playerId: 1, color: 'rgba(255,91,91,.85)' },
  ];

  for (const selection of selectionsByPlayer) {
    const selected = buttons.filter((button) => button.playerId === selection.playerId)[world.keyboardSelectedIndices?.[selection.playerId] ?? 0];
    if (!selected) continue;

    if (project) {
      const p = project(selected.x, selected.y);
      const radius = selected.radius * p.scale + 8;
      ctx2d.beginPath();
      ctx2d.ellipse(p.x, p.y, radius, radius * 0.92, 0, 0, Math.PI * 2);
      ctx2d.strokeStyle = selection.color;
      ctx2d.lineWidth = 3;
      ctx2d.stroke();
      continue;
    }

    ctx2d.beginPath();
    ctx2d.arc(selected.x, selected.y, selected.radius + 8, 0, Math.PI * 2);
    ctx2d.strokeStyle = selection.color;
    ctx2d.lineWidth = 3;
    ctx2d.stroke();
  }
}

function drawKeyboardAimPreview(ctx2d, project) {
  if (gameConfig.controlMode !== 'keyboard' || !world) return;

  for (const playerId of [0, 1]) {
    if (!keyboardChargeHeld[playerId] && keyboardCharge[playerId] <= 0) continue;

    const button = getKeyboardSelection(playerId);
    if (!button) continue;

    const target = world.ball;
    const dx = target.x - button.x;
    const dy = target.y - button.y;
    const dist = Math.hypot(dx, dy) || 1;
    const maxPull = 210;
    const pull = Math.min(maxPull, dist);
    const nx = dx / dist;
    const ny = dy / dist;
    const endX = button.x + nx * pull;
    const endY = button.y + ny * pull;

    const color = playerId === 0 ? 'rgba(60,198,255,.95)' : 'rgba(255,91,91,.95)';
    const glow = playerId === 0 ? 'rgba(60,198,255,.35)' : 'rgba(255,91,91,.35)';

    if (project) {
      const a = project(button.x, button.y);
      const b = project(endX, endY);
      drawAimArrow(ctx2d, a.x, a.y, b.x, b.y, color, glow, 4.5, 16, 16);
      continue;
    }

    drawAimArrow(ctx2d, button.x, button.y, endX, endY, color, glow, 4.5, 16, 16);
  }
}

function drawSmokeEffect(ctx2d, playerId) {
  const buttons = getButtonsForPlayer(playerId);
  ctx2d.save();
  for (const b of buttons) {
    for (let i = 0; i < 6; i++) {
      const offX = Math.sin(performance.now() / 200 + i) * 15;
      const offY = Math.cos(performance.now() / 250 + i) * 15;
      ctx2d.beginPath();
      ctx2d.arc(b.x + offX, b.y + offY, 20, 0, Math.PI * 2);
      ctx2d.fillStyle = 'rgba(100, 100, 100, 0.4)';
      ctx2d.fill();
    }
  }
  ctx2d.restore();
}

function drawPerspectiveSmokeEffect(ctx2d, playerId, project) {
  const buttons = getButtonsForPlayer(playerId);
  ctx2d.save();
  for (const b of buttons) {
    const p = project(b.x, b.y);
    for (let i = 0; i < 5; i++) {
      const offX = Math.sin(performance.now() / 200 + i) * 12 * p.scale;
      const offY = Math.cos(performance.now() / 250 + i) * 12 * p.scale;
      ctx2d.beginPath();
      ctx2d.arc(p.x + offX, p.y + offY, 18 * p.scale, 0, Math.PI * 2);
      ctx2d.fillStyle = 'rgba(80, 80, 80, 0.45)';
      ctx2d.fill();
    }
  }
  ctx2d.restore();
}

function drawPowerBar(ctx2d, button, charge) {
  const barW = 64;
  const barH = 8;
  const x = button.x - barW / 2;
  const y = button.y - button.radius - 15;
  
  ctx2d.fillStyle = 'rgba(0,0,0,0.58)';
  ctx2d.fillRect(x, y, barW, barH);
  
  const color = charge < 0.3 ? '#37d67a' : charge < 0.7 ? '#ffd200' : '#ff3b30';
  ctx2d.fillStyle = color;
  ctx2d.fillRect(x, y, barW * charge, barH);
  
  ctx2d.strokeStyle = 'rgba(255,255,255,.92)';
  ctx2d.lineWidth = 1.5;
  ctx2d.strokeRect(x, y, barW, barH);

  ctx2d.font = 'bold 10px Arial, sans-serif';
  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'bottom';
  ctx2d.fillStyle = 'rgba(255,255,255,.95)';
  ctx2d.fillText(`${Math.round(charge * 100)}%`, button.x, y - 1);
}

function drawAimArrow(ctx2d, fromX, fromY, toX, toY, color, glowColor, lineWidth = 4, headLength = 16, headWidth = 14) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.hypot(dx, dy);
  if (length < 2) return;

  const angle = Math.atan2(dy, dx);
  const tailX = fromX + Math.cos(angle) * Math.max(0, length - headLength * 0.9);
  const tailY = fromY + Math.sin(angle) * Math.max(0, length - headLength * 0.9);

  ctx2d.save();
  ctx2d.lineCap = 'round';
  ctx2d.lineJoin = 'round';
  ctx2d.setLineDash([10, 6]);
  ctx2d.strokeStyle = glowColor;
  ctx2d.lineWidth = lineWidth + 3;
  ctx2d.beginPath();
  ctx2d.moveTo(fromX, fromY);
  ctx2d.lineTo(toX, toY);
  ctx2d.stroke();

  ctx2d.setLineDash([]);
  ctx2d.strokeStyle = color;
  ctx2d.lineWidth = lineWidth;
  ctx2d.beginPath();
  ctx2d.moveTo(fromX, fromY);
  ctx2d.lineTo(tailX, tailY);
  ctx2d.stroke();

  ctx2d.fillStyle = color;
  ctx2d.beginPath();
  ctx2d.moveTo(toX, toY);
  ctx2d.lineTo(toX - Math.cos(angle - Math.PI / 8) * headLength, toY - Math.sin(angle - Math.PI / 8) * headLength);
  ctx2d.lineTo(toX - Math.cos(angle + Math.PI / 8) * headLength, toY - Math.sin(angle + Math.PI / 8) * headLength);
  ctx2d.closePath();
  ctx2d.fill();
  ctx2d.restore();
}

function drawGoalCelebrationOverlay() {
  const celebration = world?.effects?.goalCelebration;
  if (!celebration) return;

  const elapsed = performance.now() - celebration.startAt;
  const progress = clamp(elapsed / celebration.duration, 0, 1);
  if (progress >= 1) {
    world.effects.goalCelebration = null;
    return;
  }
  const easeOut = 1 - Math.pow(1 - progress, 3);
  const flash = 1 - progress;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.save();

  ctx.globalAlpha = 0.34 * flash;
  ctx.fillStyle = celebration.scorerIndex === 0 ? 'rgba(46,108,255,.9)' : 'rgba(255,59,48,.9)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const centerX = canvas.width * 0.5;
  const centerY = canvas.height * 0.24;
  const scale = 0.82 + easeOut * 0.44;

  ctx.translate(centerX, centerY);
  ctx.scale(scale, scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.shadowBlur = 26;
  ctx.shadowColor = celebration.color;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = celebration.color;
  ctx.lineWidth = 8;
  ctx.font = '900 76px Impact, Arial Black, sans-serif';
  ctx.strokeText('GOL!', 0, 0);
  ctx.fillText('GOL!', 0, 0);

  ctx.shadowBlur = 0;
  ctx.font = '900 28px Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.96)';
  const scorerTeam = (players?.[celebration.scorerIndex]?.team) ?? 'Jogador';
  ctx.fillText(`GOL do ${scorerTeam}`, 0, 58);

  ctx.font = '800 24px Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  const scoreText = celebration?.scoreText ?? `${match.score[0]} - ${match.score[1]}`;
  ctx.fillText(`Placar ${scoreText}`, 0, 95);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = flash;
  for (let i = 0; i < 30; i++) {
    const angle = (i / 30) * Math.PI * 2 + progress * 5;
    const distance = 40 + progress * 220 + (i % 5) * 10;
    const x = canvas.width * 0.5 + Math.cos(angle) * distance;
    const y = canvas.height * 0.35 + Math.sin(angle) * distance * 0.65;
    ctx.beginPath();
    ctx.arc(x, y, 3 + (i % 3), 0, Math.PI * 2);
    ctx.fillStyle = i % 2 === 0 ? celebration.color : '#ffffff';
    ctx.fill();
  }
  ctx.restore();

  // Continue button
  ctx.save();
  ctx.globalAlpha = 0.88 * flash;
  ctx.fillStyle = 'rgba(10,16,30,.82)';
  const btnW = canvas.width * 0.28;
  const btnH = 54;
  const btnX = canvas.width * 0.36;
  const btnY = canvas.height * 0.68;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(btnX, btnY, btnW, btnH, 18);
  } else {
    ctx.rect(btnX, btnY, btnW, btnH);
  }
  ctx.fill();
  ctx.strokeStyle = celebration.color;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 22px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Continuar', canvas.width * 0.5, btnY + btnH / 2);
  ctx.restore();
  
  // Store hitbox for click detection
  continueButtonHitbox = { x: btnX, y: btnY, w: btnW, h: btnH, visible: flash > 0.3 };
}

function createExplosion(ex, ey, radius, force) {
  if (!world) return;
  
  // Afeta a bola
  const dball = Math.hypot(world.ball.x - ex, world.ball.y - ey);
  if (dball < radius) {
    const angle = Math.atan2(world.ball.y - ey, world.ball.x - ex);
    const push = (1 - dball / radius) * force;
    world.ball.vx += Math.cos(angle) * push * world.ball.invMass;
    world.ball.vy += Math.sin(angle) * push * world.ball.invMass;
  }
  
  // Afeta botões
  for (const b of world.buttons) {
    const d = Math.hypot(b.x - ex, b.y - ey);
    if (d < radius && d > 1) {
      const angle = Math.atan2(b.y - ey, b.x - ex);
      const push = (1 - d / radius) * force;
      b.vx += Math.cos(angle) * push * b.invMass;
      b.vy += Math.sin(angle) * push * b.invMass;
    }
  }
  
  // Efeito visual
  world.effects.impacts.push({
    x: ex, y: ey,
    strength: 1.0,
    radius: radius * 0.8,
    life: 0.5,
    maxLife: 0.5,
    color: 'rgba(255, 100, 0, 0.7)'
  });
  camera.shake = Math.max(15, camera.shake + 12);
}

function applyRepulsion(source, radius, force) {
  if (!world) return;
  const dball = Math.hypot(world.ball.x - source.x, world.ball.y - source.y);
  if (dball < radius) {
    const angle = Math.atan2(world.ball.y - source.y, world.ball.x - source.x);
    world.ball.vx += Math.cos(angle) * force;
    world.ball.vy += Math.sin(angle) * force;
  }
  for (const b of world.buttons) {
    if (b.id === source.id) continue;
    const d = Math.hypot(b.x - source.x, b.y - source.y);
    if (d < radius) {
      const angle = Math.atan2(b.y - source.y, b.x - source.x);
      b.vx += Math.cos(angle) * force;
      b.vy += Math.sin(angle) * force;
    }
  }
}

function applyAttraction(source, target, radius, force) {
  const d = Math.hypot(target.x - source.x, target.y - source.y);
  if (d < radius && d > 5) {
    const angle = Math.atan2(source.y - target.y, source.x - target.x);
    target.vx += Math.cos(angle) * force;
    target.vy += Math.sin(angle) * force;
  }
}

function drawStadium(ctx) {
  ctx.save();
  const now = performance.now();
  
  // 1. FUNDO PROFUNDO
  ctx.fillStyle = '#050a14';
  ctx.fillRect(-1200, -1200, FIELD.width + 2400, FIELD.height + 2400);

  const drawTiers = (x, y, w, h, isVertical) => {
    const tierCount = 10;
    const tierSize = 22;
    
    for (let i = 0; i < tierCount; i++) {
      const offset = i * tierSize;
      const depthColor = 1 - (i / tierCount);
      
      // Cor do degrau com gradiente de profundidade
      ctx.fillStyle = i % 2 === 0 ? `rgba(22,34,53,${depthColor})` : `rgba(28,44,68,${depthColor})`;
      
      let tx = x, ty = y, tw = w, th = h;
      if (isVertical) {
        tx = x + (x < 0 ? -offset : offset);
        tw = tierSize;
      } else {
        ty = y + (y < 0 ? -offset : offset);
        th = tierSize;
      }
      ctx.fillRect(tx, ty, tw, th);

      // Faixas e Bandeiras (ocasionais)
      if (i === 1 && Math.sin(x + y) > 0) {
        ctx.fillStyle = ['#ff4444', '#4444ff', '#ffffff'][Math.floor((x+y)%3)];
        const fw = isVertical ? 4 : 40;
        const fh = isVertical ? 40 : 4;
        ctx.fillRect(tx + 5, ty + 5, fw, fh);
      }
      
      // P\u00fablico Vibrante
      ctx.save();
      const seed = (x + y + i) * 1000;
      for (let p = 0; p < 45; p++) {
        const pSeed = seed + p * 123;
        const jump = Math.sin(now * 0.008 + pSeed) * 2; // Pulinho da torcida
        
        const px = tx + (isVertical ? 4 : 2) + ((pSeed * 17) % (isVertical ? tierSize - 8 : tw - 4));
        const py = ty + (isVertical ? 2 : 4) + ((pSeed * 23) % (isVertical ? th - 4 : tierSize - 8));
        
        // Cor do torcedor
        ctx.fillStyle = ['#ff5555', '#55ff55', '#5555ff', '#ffffff', '#ffff55', '#aaaaaa'][Math.floor((pSeed % 6))];
        ctx.globalAlpha = 0.5 * depthColor;
        
        ctx.beginPath();
        ctx.arc(px, py + jump, 1.4, 0, Math.PI * 2);
        ctx.fill();

        // Flash de C\u00e2mera (raro e r\u00e1pido)
        if (Math.random() < 0.0005) {
          ctx.globalAlpha = 0.8;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(px, py, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  };

  // Arquibancadas
  drawTiers(-50, -50, FIELD.width + 100, -250, false); // Cima
  drawTiers(-50, FIELD.height + 50, FIELD.width + 100, 250, false); // Baixo
  drawTiers(-50, -50, -250, FIELD.height + 100, true); // Esquerda
  drawTiers(FIELD.width + 50, -50, 250, FIELD.height + 100, true); // Direita

  // 3. EFEITO DE SOMBRA E LUZ (Vinha para o campo)
  const grad = ctx.createRadialGradient(FIELD.width/2, FIELD.height/2, 400, FIELD.width/2, FIELD.height/2, 1200);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = grad;
  ctx.fillRect(-1000, -1000, FIELD.width + 2000, FIELD.height + 2000);

  ctx.restore();
}

class WeatherSystem {
  constructor() {
    this.particles = [];
    this.lightningTimer = 0;
    this.lightningFlash = 0;
  }

  update(dt, mode) {
    const maxCount = { rain: 180, snow: 120, wind: 90, storm: 250, clear: 0 }[mode] ?? 0;

    // Spawn partículas conforme o clima
    if (this.particles.length < maxCount) {
      if (mode === 'rain' || mode === 'storm') {
        this.particles.push({
          type: 'rain',
          x: Math.random() * (FIELD.width + 200) - 100,
          y: -20,
          vx: mode === 'storm' ? -80 : 0,
          vy: 900 + Math.random() * 400,
          len: 14 + Math.random() * 8,
          life: 1,
        });
      } else if (mode === 'snow') {
        this.particles.push({
          type: 'snow',
          x: Math.random() * FIELD.width,
          y: -10,
          vx: (Math.random() - 0.5) * 30,
          vy: 60 + Math.random() * 60,
          radius: 2 + Math.random() * 3,
          wobble: Math.random() * Math.PI * 2,
          life: 1,
        });
      } else if (mode === 'wind') {
        this.particles.push({
          type: 'wind',
          x: -20,
          y: Math.random() * FIELD.height,
          vx: 500 + Math.random() * 300,
          vy: (Math.random() - 0.5) * 60,
          len: 30 + Math.random() * 40,
          life: 1,
        });
      }
    }

    // Atualizar partículas
    this.particles = this.particles.filter(p => {
      if (p.type === 'snow') p.wobble += dt * 2;
      p.x += (p.vx + (p.type === 'snow' ? Math.sin(p.wobble) * 15 : 0)) * dt;
      p.y += p.vy * dt;
      return p.y < FIELD.height + 20 && p.x < FIELD.width + 50;
    });

    // Relâmpago na tempestade
    if (mode === 'storm') {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningFlash = 0.4;
        this.lightningTimer = 2 + Math.random() * 4;
      }
      this.lightningFlash = Math.max(0, this.lightningFlash - dt * 3);
    } else {
      this.lightningFlash = 0;
    }

    // Efeito de vento na bola e botões
    if ((mode === 'wind' || mode === 'storm') && world?.ball) {
      const windForce = mode === 'storm' ? 18 : 8;
      world.ball.vx += windForce * dt;
      for (const b of world.buttons) b.vx += (windForce * 0.4) * dt;
    }
  }

  render(ctx, mode) {
    if (mode === 'clear') return;
    ctx.save();

    // Flash de relâmpago
    if (this.lightningFlash > 0) {
      ctx.fillStyle = `rgba(200, 220, 255, ${this.lightningFlash * 0.15})`;
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    }

    this.particles.forEach(p => {
      ctx.globalAlpha = 0.7;
      if (p.type === 'rain') {
        ctx.strokeStyle = 'rgba(174, 194, 224, 0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.vx * 0.015, p.y + p.len);
        ctx.stroke();
      } else if (p.type === 'snow') {
        ctx.fillStyle = 'rgba(230, 240, 255, 0.85)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'wind') {
        ctx.strokeStyle = `rgba(200, 220, 255, ${p.life * 0.3})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 10]);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.len, p.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
const weather = new WeatherSystem();

function gameLoop(ts) {
  if (state === 'menu' || state === 'config') return;

  const dt = Math.min(0.033, (ts - match.lastTimestamp) / 1000);
  match.lastTimestamp = ts;

  update(dt);
  render();

  rafId = requestAnimationFrame(gameLoop);
}

function drawCurvePreview(ctx, b, charge, pId) {
  const isP1 = Number(pId) === 0;
  const curveDir = isP1 ? (keyboardInput.keysDown.has('KeyQ') ? -1 : (keyboardInput.keysDown.has('KeyR') ? 1 : 0)) : 0;
  if (curveDir === 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 2.5;

  let tx = b.x;
  let ty = b.y;
  const dirX = isP1 ? 1 : -1;
  let tvx = dirX * 600 * charge;
  let tvy = 0;

  ctx.moveTo(tx, ty);
  for (let i = 0; i < 15; i++) {
    tx += tvx * 0.045;
    ty += tvy * 0.045;
    tvy += curveDir * 180 * 0.045; 
    ctx.lineTo(tx, ty);
  }
  ctx.stroke();
  ctx.restore();
}

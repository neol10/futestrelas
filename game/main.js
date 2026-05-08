import { defaultTeams, createInitialConfig, gameConfig, setConfig } from './config.js';
import { createUI } from './ui.js';
import { Ball } from './entities/ball.js';
import { Button } from './entities/button.js';
import { Goalie } from './entities/goalie.js';
import { WorldPhysics } from './physics.js';
import { PowerUpSystem } from './powerups.js';
import { GameAudio } from './audio.js';

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
const TEAM_STATS = {
  Brasil: { curve: 1.5, power: 1.0, mass: 1.0, speed: 1.1 },
  Alemanha: { curve: 1.0, power: 1.25, mass: 1.1, speed: 1.0 },
  Itália: { curve: 1.0, power: 1.0, mass: 1.3, speed: 0.9 }, // Defesa pesada
  Espanha: { curve: 1.2, power: 1.0, mass: 1.0, speed: 1.15 }, // Passes rápidos
  França: { curve: 1.0, power: 1.1, mass: 1.0, speed: 1.25 }, // Alta velocidade
  Argentina: { curve: 1.3, power: 1.1, mass: 1.0, speed: 1.0 },
  Inglaterra: { curve: 1.0, power: 1.15, mass: 1.1, speed: 1.0 },
  Holanda: { curve: 1.1, power: 1.1, mass: 1.0, speed: 1.1 },
};

const KEYBOARD_SHOT_THRESHOLD_MS = 220;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const ui = createUI({
  teams: defaultTeams,
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
let camera = { x: 0, y: 0, shake: 0 };

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
let netSwingTimer = 0;
let continueButtonHitbox = null;

function showMenu() {
  state = 'menu';
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

  setupWorld();
  state = 'playing';
  ui.showScreen('game');
  ui.setTopButtons({ back: false, restart: true });

  if (rafId) cancelAnimationFrame(rafId);
  match.lastTimestamp = performance.now();
  rafId = requestAnimationFrame(gameLoop);
}

function restartMatch() {
  if (state === 'menu' || state === 'config') return;
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

  const p1Stats = TEAM_STATS[selections.p1Team] || DEFAULT_STATS;
  const p2Stats = TEAM_STATS[selections.p2Team] || DEFAULT_STATS;

  players = [
    { id: 0, name: 'Jogador 1', team: selections.p1Team, colors: p1Colors, activePower: null, storedPower: null, stats: p1Stats },
    { id: 1, name: 'Jogador 2', team: selections.p2Team, colors: p2Colors, activePower: null, storedPower: null, stats: p2Stats },
  ];
  currentPlayerIndex = 0;

  match.score = [0, 0];
  match.infinite = gameConfig.matchTime === 'infinite';
  match.timeLeft = match.infinite ? Infinity : Number(gameConfig.matchTime);
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
  return `WASD + E (chutar J1) • Setas + O (chutar J2) • trocar: F / P`;
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
    ui.pop({ title: 'Poder Ativado!', message: `${player.name} ativou ${powerLabel(type)}`, kind: 'success' });
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
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  
  // Mantém a proporção do FIELD: 1000x600 = 5/3
  let w = Math.round(rect.width * dpr);
  let h = Math.round((w / FIELD.width) * FIELD.height);
  
  // Se altura ultrapassar o container, redimensiona pela altura
  if (h > rect.height * dpr) {
    h = Math.round(rect.height * dpr);
    w = Math.round((h / FIELD.height) * FIELD.width);
  }
  
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
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
  const moveCodes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'KeyF', 'KeyP', 'KeyE', 'KeyO']);
  if (moveCodes.has(code)) e.preventDefault();

  if (e.repeat) return;
  
  // Comandos de usar poder (F/P) e chute (E/O)
  if (code === 'KeyF' && state === 'playing') {
    useKeyboardPower(0);
    return;
  }
  if (code === 'KeyP' && state === 'playing') {
    useKeyboardPower(1);
    return;
  }
  if (code === 'KeyE' && state === 'playing') {
    keyboardChargeHeld[0] = true;
    return;
  }
  if (code === 'KeyO' && state === 'playing') {
    keyboardChargeHeld[1] = true;
    return;
  }
  
  // Pass actions: R for P1 (WASD), L for P2 (Arrows)
  if (code === 'KeyR' && state === 'playing') {
    keyboardPassHeld[0] = true;
    return;
  }
  if (code === 'KeyL' && state === 'playing') {
    keyboardPassHeld[1] = true;
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

function update(dt) {
  try {
    if (!world) return;

    const gameSpeed = Number(gameConfig.gameSpeed);
    
    // Apply slow-mo effect (fixed - don't compound multipliers)
    let effectiveDt = dt;
    if (slowMoTimer > 0) {
      slowMoTimer -= dt;
      effectiveDt *= 0.3; // Fixed slow-mo factor
    }
    
    effectiveDt *= gameSpeed;
    dt = effectiveDt;

  if (state === 'goalPause') {
    // decrement and recover from invalid values
    if (typeof goalPauseTimer !== 'number' || !isFinite(goalPauseTimer) || goalPauseTimer <= 0) {
      // safety: if timer is already expired or invalid, resume immediately
      try {
        physics.resetPositions(world);
      } catch (e) {
        console.warn('physics.resetPositions failed during goal recovery', e);
      }
      if (world) {
        world.activeShotPlayerId = null;
        world.extraTurnGranted = false;
        world.extraTurnGrantedPlayerId = null;
        if (world.effects) world.effects.goalCelebration = null;
        world.shotCount = 0;
        world.maxShots = gameConfig.controlMode === 'keyboard' ? Infinity : 3;
      }
      turnLock = false;
      state = 'playing';
      goalPauseTimer = 0;
    } else {
      goalPauseTimer -= dt;

      // safety clamp: if timer grows absurdly (bug), force resume
      if (goalPauseTimer > 15) {
        console.warn('goalPauseTimer unusually large, forcing resume', goalPauseTimer);
        goalPauseTimer = 0;
      }

      if (goalPauseTimer <= 0) {
        try {
          physics.resetPositions(world);
        } catch (e) {
          console.warn('physics.resetPositions failed during goal resume', e);
        }
        if (world) {
          world.activeShotPlayerId = null;
          world.extraTurnGranted = false;
          world.extraTurnGrantedPlayerId = null;
          if (world.effects) world.effects.goalCelebration = null;
          world.shotCount = 0;
          world.maxShots = gameConfig.controlMode === 'keyboard' ? Infinity : 3;
        }
        turnLock = false;
        state = 'playing';
        goalPauseTimer = 0;
      }
    }
  }
  } catch (err) {
    console.error('Unexpected error in update loop:', err);
    // Try to recover to a playable state
    try { if (world && physics) physics.resetPositions(world); } catch (e) { console.warn('Recovery resetPositions failed', e); }
    state = 'playing';
    goalPauseTimer = 0;
  }

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
        ui.pop({
          title: 'Power coletado',
          message: `${player.name} pegou ${powerLabel(type)}`,
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

    for (const button of world.buttons) {
      const isKeyboardControlled = gameConfig.controlMode === 'keyboard' && world.keyboardSelectedIndices?.[button.playerId] != null
        && getKeyboardSelection(button.playerId) === button;
      const isDraggedButton = world.controlledButtonId != null && button.id === world.controlledButtonId;
      if (!isKeyboardControlled && !isDraggedButton) {
        button.applyIdleWander(dt);
      }
    }

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

    physics.step(dt, world, gameConfig, (impact) => {
      world.effects.impacts.push(impact);
      camera.shake = Math.min(10, camera.shake + impact.strength * 0.6);
      if (impact.strength > 0.18) audio.hit(impact.strength);
    });

    try {
      const goal = physics.checkGoal(world);
      if (goal) {
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


    function toggleFullscreen() {
      const target = document.documentElement;
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
        return;
      }

      target.requestFullscreen?.().catch(() => {});
    }
    const winner = checkWinner();
    if (winner != null) {
      finishWithWinner(winner);
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
  }

  // efeitos visuais
  camera.shake = Math.max(0, camera.shake - dt * 20);
  world.effects.impacts = world.effects.impacts.filter((i) => {
    if (i.vx) i.x += i.vx * dt;
    if (i.vy) i.y += i.vy * dt;
    return (i.life -= dt) > 0;
  });
}

function updateKeyboardControls(dt) {
  const controls = [
    { playerId: 0, up: 'KeyW', left: 'KeyA', down: 'KeyS', right: 'KeyD' },
    { playerId: 1, up: 'ArrowUp', left: 'ArrowLeft', down: 'ArrowDown', right: 'ArrowRight' },
  ];

  for (const control of controls) {
    const button = getKeyboardSelection(control.playerId);
    if (!button) continue;

    const up = keyboardInput.keysDown.has(control.up) ? 1 : 0;
    const left = keyboardInput.keysDown.has(control.left) ? 1 : 0;
    const down = keyboardInput.keysDown.has(control.down) ? 1 : 0;
    const right = keyboardInput.keysDown.has(control.right) ? 1 : 0;

    const hasReverse = players[control.playerId]?.activePower?.type === 'reverse';
    const mult = hasReverse ? -1 : 1;

    let accelMult = 1;
    let speedMult = 1;
    const power = players[control.playerId]?.activePower;
    if (power?.type === 'boost') { accelMult = 1.6; speedMult = 1.5; }
    if (power?.type === 'webSlowdown') { accelMult = 0.6; speedMult = 0.6; }
    if (power?.type === 'swamp') { accelMult = 0.7; speedMult = 0.7; }
    if (power?.type === 'stun' || power?.type === 'freeze') { accelMult = 0; speedMult = 0; }

    const dx = (right - left) * mult;
    const dy = (down - up) * mult;
    if (dx === 0 && dy === 0) continue;

    const accel = 1080 * accelMult;
    button.vx += dx * accel * dt;
    button.vy += dy * accel * dt;

    const maxSpeed = 260 * speedMult;
    const clamped = clampMagnitude(button.vx, button.vy, maxSpeed);
    button.vx = clamped.vx;
    button.vy = clamped.vy;

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
  }
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
    
    // Tactical decision: pass or shoot?
    let shouldPass = false;
    const passRoll = Math.random();
    if (target && passRoll < settings.passChance) {
      shouldPass = true;
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
    const distanceToGoal = Math.hypot(goalX - button.x, goalY - button.y);
    const aim = button.applyAimAssist({ x: shotDx, y: shotDy }, player.activePower, distanceToGoal, gentlePower);

    ball.vx += aim.x * gentlePower;
    ball.vy += aim.y * gentlePower;
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

function hasMovementKeysForPlayer(playerId) {
  if (playerId === 0) {
    return keyboardInput.keysDown.has('KeyW') || keyboardInput.keysDown.has('KeyA') || keyboardInput.keysDown.has('KeyS') || keyboardInput.keysDown.has('KeyD');
  }
  return keyboardInput.keysDown.has('ArrowUp') || keyboardInput.keysDown.has('ArrowLeft') || keyboardInput.keysDown.has('ArrowDown') || keyboardInput.keysDown.has('ArrowRight');
}

function stabilizeControlledButtons(dt) {
  if (!world) return;

  const brakePerSecond = 0.60; // multiplier per 1 second (0.6 => stronger, quicker stop)
  const mul = Math.pow(brakePerSecond, dt * 60);

  for (const b of world.buttons) {
    // skip AI-controlled or frozen
    if (b.vx === 0 && b.vy === 0) continue;

    const isDragged = drag.active && drag.buttonId === b.id;
    const isExplicitControlled = world.controlledButtonId === b.id;
    const isKeyboardSelected = gameConfig.controlMode === 'keyboard' && getKeyboardSelection(b.playerId) === b;

    let shouldBrake = false;
    if (isDragged || isExplicitControlled) {
      // if the player isn't actively dragging (or drag finished), brake
      shouldBrake = !isDragged;
    }

    if (isKeyboardSelected) {
      // brake when no movement keys are pressed for this player
      if (!hasMovementKeysForPlayer(b.playerId)) shouldBrake = true;
    }

    if (shouldBrake) {
      b.vx *= mul;
      b.vy *= mul;
      // clamp tiny velocities to zero
      if (Math.hypot(b.vx, b.vy) < 6) { b.vx = 0; b.vy = 0; }
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

function checkWinner() {
  const maxGoals = Number(gameConfig.maxGoals);
  if (match.score[0] >= maxGoals) return 0;
  if (match.score[1] >= maxGoals) return 1;
  return null;
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
    world.effects.goalCelebration = {
      scorerIndex: winnerIndex,
      startAt: performance.now(),
      duration: 600,
      color: players[winnerIndex]?.colors?.[0] ?? '#ffffff',
      scoreText: `${match.score[0]} - ${match.score[1]}`,
    };
  }
  state = 'finished';
  audio.goal();
  ui.toast(`${players[winnerIndex].name} venceu!`, 1600);
}

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

  if (world?.effects) {
    world.effects.goalCelebration = {
      scorerIndex,
      startAt: performance.now(),
      duration: 600,
      color: players[scorerIndex]?.colors?.[0] ?? '#ffffff',
      scoreText: `${match.score[0]} - ${match.score[1]}`,
    };
  }
  
  // Slow-mo replay effect
  slowMoTimer = 0.3;
  slowMoSpeed = 0.3;
  netSwingTimer = 1.0;

  // Efeito de partículas de gol - mais partículas e impacto
  if (world) {
    const scorerColor = players[scorerIndex].colors[0];
    const goalX = scorerIndex === 0 ? FIELD.width - 20 : 20;
    const goalY = FIELD.height / 2;
    
    // Burst effect with more particles
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
  }

  goalPauseTimer = 0.4;
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

  drawGoalCelebrationOverlay();
}

function renderTopDown(ox, oy) {
  const sx = canvas.width / FIELD.width;
  const sy = canvas.height / FIELD.height;
  ctx.setTransform(sx, 0, 0, sy, ox, oy);

  drawField(ctx, FIELD);
  powerUps.render(ctx, world);
  
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
      if (button) drawPowerBar(ctx, button, keyboardCharge[playerId]);
    }
  }
  
  world.ball.render(ctx);

  for (const i of world.effects.impacts) {
    ctx.globalAlpha = Math.max(0, i.life / i.maxLife);
    ctx.beginPath();
    ctx.arc(i.x, i.y, i.radius * (1 + (1 - i.life / i.maxLife) * 0.35), 0, Math.PI * 2);
    ctx.fillStyle = i.color;
    ctx.fill();
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
  const selected = world.buttons.find((x) => x.id === drag.buttonId);
  const focusX = selected?.x ?? FIELD.width / 2;
  const focusShift = (focusX - FIELD.width / 2) * 0.08;
  const horizon = canvas.height * 0.15;
  const vanishingX = canvas.width * 0.5 - focusShift;

  return (x, y) => {
    const depth = y / FIELD.height;
    const scale = 0.28 + depth * 1.02;
    const spread = 0.30 + depth * 0.92;
    const px = vanishingX + (x - focusX) * spread * (canvas.width / FIELD.width);
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

function drawField(ctx2d, field) {
  const { width: w, height: h, wall, goalWidth, goalDepth } = field;

  // grama
  ctx2d.fillStyle = '#137a3f';
  ctx2d.fillRect(0, 0, w, h);

  // listras
  ctx2d.globalAlpha = 0.12;
  ctx2d.fillStyle = '#ffffff';
  for (let x = 0; x < w; x += 90) ctx2d.fillRect(x, 0, 45, h);
  ctx2d.globalAlpha = 1;

  // linhas
  ctx2d.strokeStyle = 'rgba(255,255,255,.70)';
  ctx2d.lineWidth = 3;
  ctx2d.strokeRect(wall, wall, w - wall * 2, h - wall * 2);

  // meio
  ctx2d.beginPath();
  ctx2d.moveTo(w / 2, wall);
  ctx2d.lineTo(w / 2, h - wall);
  ctx2d.stroke();

  ctx2d.beginPath();
  ctx2d.arc(w / 2, h / 2, 80, 0, Math.PI * 2);
  ctx2d.stroke();

  // gols (abertura)
  const gy0 = (h - goalWidth) / 2;
  const gy1 = gy0 + goalWidth;
  ctx2d.fillStyle = 'rgba(255,255,255,.10)';
  ctx2d.fillRect(0, gy0, goalDepth, goalWidth);
  ctx2d.fillRect(w - goalDepth, gy0, goalDepth, goalWidth);

  // marcações do gol
  ctx2d.strokeStyle = 'rgba(255,255,255,.45)';
  ctx2d.strokeRect(0, gy0, goalDepth, goalWidth);
  ctx2d.strokeRect(w - goalDepth, gy0, goalDepth, goalWidth);
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
  const scorerName = (players?.[celebration.scorerIndex]?.name) ?? 'Jogador';
  ctx.fillText(`${scorerName} marcou`, 0, 58);

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

function gameLoop(ts) {
  if (state === 'menu' || state === 'config') return;

  const dt = Math.min(0.033, (ts - match.lastTimestamp) / 1000);
  match.lastTimestamp = ts;

  update(dt);
  render();

  rafId = requestAnimationFrame(gameLoop);
}

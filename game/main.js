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
let drag = {
  active: false,
  playerIndex: 0,
  buttonId: null,
  start: { x: 0, y: 0 },
  now: { x: 0, y: 0 },
};

let turnLock = false;
let lastKeyboardShotTime = [0, 0]; // Rastreia último chute de cada jogador em modo teclado

let match = {
  timeLeft: 60,
  infinite: false,
  score: [0, 0],
  lastTimestamp: performance.now(),
};

let rafId = 0;
let timeWarningMarks = new Set();
let goldenGoalMode = false;

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
  selections = sel;
  setConfig(config);
  audio.setEnabled(!!config.soundEnabled);

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
  ui.toast('Reiniciado', 600);

  if (rafId) cancelAnimationFrame(rafId);
  match.lastTimestamp = performance.now();
  rafId = requestAnimationFrame(gameLoop);
}

function setupWorld() {
  const p1Colors = TEAM_COLORS[selections.p1Team] ?? ['#2e6cff', '#ffffff'];
  const p2Colors = TEAM_COLORS[selections.p2Team] ?? ['#ff3b30', '#ffffff'];

  players = [
    { id: 0, name: 'Jogador 1', team: selections.p1Team, colors: p1Colors, activePower: null },
    { id: 1, name: 'Jogador 2', team: selections.p2Team, colors: p2Colors, activePower: null },
  ];
  currentPlayerIndex = 0;

  match.score = [0, 0];
  match.infinite = gameConfig.matchTime === 'infinite';
  match.timeLeft = match.infinite ? Infinity : Number(gameConfig.matchTime);
  match.lastTimestamp = performance.now();
  timeWarningMarks = new Set();
  goldenGoalMode = false;

  world = {
    field: FIELD,
    ball: new Ball({ x: FIELD.width / 2, y: FIELD.height / 2 }),
    buttons: [],
    goalies: [],
    effects: { impacts: [], goalText: null },
    activeShotPlayerId: null,
    extraTurnGranted: false,
    extraTurnGrantedPlayerId: null,
    keyboardSelectedIndices: [0, 0],
  };

  world.goalies.push(new Goalie({ side: 'left', auto: gameConfig.goalieAuto }));
  world.goalies.push(new Goalie({ side: 'right', auto: gameConfig.goalieAuto }));

  const formations = createFormation();
  for (const b of formations.p1) world.buttons.push(new Button({ ...b, playerId: 0, colors: p1Colors, team: TEAM_FLAGS[selections.p1Team] }));
  for (const b of formations.p2) world.buttons.push(new Button({ ...b, playerId: 1, colors: p2Colors, team: TEAM_FLAGS[selections.p2Team] }));

  physics = new WorldPhysics({ field: FIELD });
  powerUps = new PowerUpSystem({ field: FIELD });
  audio.setEnabled(!!gameConfig.soundEnabled);

  drag.active = false;
  turnLock = false;
  keyboardInput.keysDown.clear();
  ui.syncHUD({
    players,
    currentPlayerIndex,
    match,
    config: gameConfig,
    state,
    canShoot: allStopped() && !drag.active,
    controlMode: gameConfig.controlMode,
    keyboardSelectionText: getKeyboardSelectionText(),
  });
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
  if (!player?.activePower) {
    // Sem poder: troca de jogador em vez disso
    cycleKeyboardSelection(playerId);
    return;
  }
  // Tem poder: usa imediatamente
  consumeKeyboardPower(player);
  audio.power(player.activePower.type);
}

function kickBallKeyboard(playerId) {
  if (state !== 'playing') return;
  if (turnLock) return; // Evita chutes simultâneos
  
  // Cooldown de 600ms entre chutes (para evitar spam)
  const now = performance.now();
  if (now - lastKeyboardShotTime[playerId] < 600) return;
  
  const button = getKeyboardSelection(playerId);
  if (!button) return;
  
  // Calcula direção aproximada em relação à bola
  const dx = world.ball.x - button.x;
  const dy = world.ball.y - button.y;
  const dist = Math.hypot(dx, dy);
  
  if (dist < 1) return; // evita divisão por zero
  
  let dirx = dx / dist;
  let diry = dy / dist;
  
  // Aplica força do chute com power-up
  const basePower = 800; // força base para toque
  const power = button.computeShotPower(basePower, players[playerId]?.activePower);
  const aim = button.applyAimAssist({ x: dirx, y: diry }, players[playerId]?.activePower);
  dirx = aim.x;
  diry = aim.y;
  button.ownerPower = players[playerId]?.activePower ?? null;
  
  button.vx += dirx * power;
  button.vy += diry * power;
  button.lastShotAt = performance.now();
  turnLock = true;
  world.activeShotPlayerId = playerId;
  world.extraTurnGranted = false;
  world.extraTurnGrantedPlayerId = null;
  
  if (players[playerId]?.activePower) {
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
  const threshold = 0.025;
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
    return;
  }

  const dx = drag.start.x - drag.now.x;
  const dy = drag.start.y - drag.now.y;
  const dist = Math.hypot(dx, dy);

  const pull = Math.min(290, dist);
  if (pull < 8) {
    drag.active = false;
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

  if (gameConfig.controlMode === 'keyboard' && players[currentPlayerIndex]?.activePower) {
    consumeKeyboardPower(players[currentPlayerIndex]);
  }

  audio.kick(power / 1300);

  drag.active = false;
});

canvas.addEventListener('pointercancel', () => {
  drag.active = false;
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
    kickBallKeyboard(0);
    return;
  }
  if (code === 'KeyO' && state === 'playing') {
    kickBallKeyboard(1);
    return;
  }
  
  keyboardInput.keysDown.add(code);

  if (state !== 'playing') return;
});

window.addEventListener('keyup', (e) => {
  keyboardInput.keysDown.delete(e.code);
});

document.addEventListener('game:toggle-fullscreen', toggleFullscreen);

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
  if (!world) return;

  const speed = Number(gameConfig.gameSpeed);
  dt *= speed;

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

    for (const g of world.goalies) g.update(dt, world, gameConfig);

    physics.step(dt, world, gameConfig, (impact) => {
      world.effects.impacts.push(impact);
      camera.shake = Math.min(10, camera.shake + impact.strength * 0.6);
      if (impact.strength > 0.18) audio.hit(impact.strength);
    });

    const goal = physics.checkGoal(world);
    if (goal) {
      handleGoal(goal.scorer);
    }

    if (gameConfig.controlMode !== 'keyboard' && turnLock && allStopped() && !drag.active && state === 'playing') {
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
      } else {
        // alterna turno automaticamente quando tudo para
        currentPlayerIndex = 1 - currentPlayerIndex;
        world.activeShotPlayerId = null;
        turnLock = false;
      }
    }

    // Em modo teclado, reseta turnLock quando tudo parou
    if (gameConfig.controlMode === 'keyboard' && turnLock && allStopped() && state === 'playing') {
      turnLock = false;
      world.activeShotPlayerId = null;
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
    });
  }

  // efeitos visuais
  camera.shake = Math.max(0, camera.shake - dt * 20);
  world.effects.impacts = world.effects.impacts.filter((i) => (i.life -= dt) > 0);
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

    const dx = right - left;
    const dy = down - up;
    if (dx === 0 && dy === 0) continue;

    const accel = 920;
    button.vx += dx * accel * dt;
    button.vy += dy * accel * dt;

    const clamped = clampMagnitude(button.vx, button.vy, 240);
    button.vx = clamped.vx;
    button.vy = clamped.vy;
  }
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
    freeze: 'congelamento',
    teleport: 'teletransporte',
    split: 'divisão',
    block: 'bloqueio',
    spinner: 'rotação',
    smoke: 'fumaça',
    lightning: 'raio',
    void: 'vazio',
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
  state = 'goalPause';
  ui.toast('GOL!', 900);

  // pausa curta + reset
  setTimeout(() => {
    if (!world) return;
    physics.resetPositions(world);
    world.activeShotPlayerId = null;
    world.extraTurnGranted = false;
    world.extraTurnGrantedPlayerId = null;
    turnLock = false;
    state = 'playing';
  }, 900);
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
}

function renderTopDown(ox, oy) {
  const sx = canvas.width / FIELD.width;
  const sy = canvas.height / FIELD.height;
  ctx.setTransform(sx, 0, 0, sy, ox, oy);

  drawField(ctx, FIELD);
  powerUps.render(ctx, world);

  for (const g of world.goalies) g.render(ctx);
  for (const b of world.buttons) b.render(ctx);
  drawCurrentTurnGlow(ctx, world.buttons);
  drawKeyboardSelectionGlow(ctx, world.buttons, null);
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

  for (const g of world.goalies) drawProjectedEntity(ctx, g, project, { fill: 'rgba(245,245,245,.86)', outline: 'rgba(10,16,30,.40)' });
  for (const b of world.buttons) {
    drawProjectedButton(ctx, b, project, b.id === drag.buttonId);
  }
  drawProjectedGlow(ctx, world.buttons, project);
  drawKeyboardSelectionGlow(ctx, world.buttons, project);
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

function drawProjectedButton(ctx2d, button, project, selected) {
  const p = project(button.x, button.y);
  const radius = button.radius * p.scale;
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

  ctx2d.lineWidth = 5;
  ctx2d.lineCap = 'round';
  ctx2d.strokeStyle = 'rgba(255,255,255,.85)';
  ctx2d.beginPath();
  ctx2d.moveTo(button.x, button.y);
  ctx2d.lineTo(endX, endY);
  ctx2d.stroke();

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

function gameLoop(ts) {
  if (state === 'menu' || state === 'config') return;

  const dt = Math.min(0.033, (ts - match.lastTimestamp) / 1000);
  match.lastTimestamp = ts;

  update(dt);
  render();

  rafId = requestAnimationFrame(gameLoop);
}

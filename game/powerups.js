import { clamp, rand, randInt } from './utils.js';

const POWER_TYPES = [
  // Poderes do jogador (melhoram seu desempenho)
  'superShot', 'curve', 'magnet', 'slow', 'precision',
  'shield', 'boost', 'freeze', 'teleport', 'split',
  'block', 'spinner', 'smoke', 'lightning', 'void',
  // Poderes adversários (prejudicam o adversário)
  'webSlowdown', 'reverse', 'blur', 'stun', 'drain',
  'swamp', 'zap', 'confuse'
];

const POWER_COLORS = {
  // Poderes de benefício próprio
  superShot: '#ff3b30',
  curve: '#b86bff',
  magnet: '#2ee0ff',
  slow: '#ffd200',
  precision: '#37d67a',
  shield: '#ff9500',
  boost: '#00ff00',
  freeze: '#00ccff',
  teleport: '#ff00ff',
  split: '#ffff00',
  block: '#ff6600',
  spinner: '#ff3399',
  smoke: '#999999',
  lightning: '#ffcc00',
  void: '#6600ff',
  // Poderes adversários
  webSlowdown: '#cc00cc',  // roxo escuro - rede de aranha
  reverse: '#ff6644',       // laranja queimado - inverte controles
  blur: '#aaaaaa',          // cinza - visão turva
  stun: '#ffff00',          // amarelo brilhante - atordoado
  drain: '#ff0000',         // vermelho - drenar energia
  swamp: '#884422',         // marrom - pântano (movimento lento)
  zap: '#00ffff',           // ciano - choque elétrico
  confuse: '#ff00ff'        // magenta - confundido
};

export class PowerUpSystem {
  constructor({ field }) {
    this.field = field;
    this.active = [];
    this.spawnTimer = 0;
    this.maxSimultaneous = 2;
  }

  update(dt, world, players, currentPlayerIndex, config, callbacks = {}) {
    // anexar players no world (pra física enxergar slow)
    world.players = players;

    // atualizar poderes ativos (em players)
    for (const p of players) {
      if (!p.activePower) continue;
      if (config.controlMode === 'keyboard') continue;
      p.activePower.timeLeft -= dt;
      if (p.activePower.timeLeft <= 0) {
        const expiredType = p.activePower.type;
        p.activePower = null;
        callbacks.onExpire?.(expiredType, p);
      }
    }

    if (!config.powerUpsEnabled) {
      this.active = [];
      return;
    }

    // update powerups no campo
    for (const pu of this.active) pu.life -= dt;
    this.active = this.active.filter((pu) => pu.life > 0);

    // spawn
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = Math.max(2, Number(config.powerSpawnInterval));
      if (this.active.length < this.maxSimultaneous) {
        const pu = this.trySpawn(world);
        if (pu) this.active.push(pu);
      }
    }

    // coleta por botão
    for (const b of world.buttons) {
      for (const pu of this.active) {
        if (pu.collected) continue;
        const d = Math.hypot(b.x - pu.x, b.y - pu.y);
        if (d <= b.radius + pu.radius) {
          pu.collected = true;
          this.applyPower(players[b.playerId], pu.type, config);
          callbacks.onCollect?.(pu.type, players[b.playerId]);
        }
      }
    }
    this.active = this.active.filter((pu) => !pu.collected);

    // magnet: puxa a bola
    for (const p of players) {
      if (p.activePower?.type !== 'magnet') continue;
      this.applyMagnet(dt, world, p.id);
    }
  }

  applyPower(player, type, config) {
    player.activePower = {
      type,
      timeLeft: config.controlMode === 'keyboard' ? null : Number(config.powerDuration),
      total: config.controlMode === 'keyboard' ? null : Number(config.powerDuration),
      usesLeft: config.controlMode === 'keyboard' ? 1 : null,
    };
  }

  applyMagnet(dt, world, playerId) {
    const ball = world.ball;
    const buttons = world.buttons.filter((b) => b.playerId === playerId);
    if (buttons.length === 0) return;

    // puxa para o botão mais próximo
    let target = buttons[0];
    let best = Infinity;
    for (const b of buttons) {
      const d = Math.hypot(ball.x - b.x, ball.y - b.y);
      if (d < best) {
        best = d;
        target = b;
      }
    }

    const range = 260;
    if (best > range) return;

    const dx = target.x - ball.x;
    const dy = target.y - ball.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / d;
    const ny = dy / d;

    const strength = 220; // aceleração
    ball.vx += nx * strength * dt;
    ball.vy += ny * strength * dt;
  }

  trySpawn(world) {
    const { width: w, height: h, wall, goalWidth } = this.field;
    const gy0 = (h - goalWidth) / 2;
    const gy1 = gy0 + goalWidth;

    const type = POWER_TYPES[randInt(0, POWER_TYPES.length - 1)];
    const radius = 14;

    // região segura: evita perto do gol (margem grande em X) e paredes
    const safeX0 = wall + 130;
    const safeX1 = w - wall - 130;
    const safeY0 = wall + 50;
    const safeY1 = h - wall - 50;

    for (let attempt = 0; attempt < 30; attempt++) {
      const x = rand(safeX0, safeX1);
      const y = rand(safeY0, safeY1);

      // não spawnar na boca do gol (mesmo com margem em X, reforça)
      if ((x < 160 || x > w - 160) && y > gy0 - 30 && y < gy1 + 30) continue;

      let ok = true;
      if (Math.hypot(x - world.ball.x, y - world.ball.y) < radius + world.ball.radius + 30) ok = false;
      for (const b of world.buttons) {
        if (Math.hypot(x - b.x, y - b.y) < radius + b.radius + 26) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      return {
        id: crypto?.randomUUID?.() ?? String(Math.random()),
        type,
        x,
        y,
        radius,
        life: 10,
        maxLife: 10,
        bob: rand(0, Math.PI * 2),
        color: POWER_COLORS[type] ?? '#ffffff',
        collected: false,
      };
    }

    return null;
  }

  render(ctx, world, options = {}) {
    if (!world) return;
    const project = options.project;

    for (const pu of this.active) {
      const t = performance.now() / 1000;
      const bob = Math.sin(t * 3 + pu.bob) * 4;
      const pulse = 1 + Math.sin(t * 4 + pu.bob) * 0.06;

      if (project) {
        const p = project(pu.x, pu.y);
        const radius = pu.radius * p.scale * pulse;

        ctx.save();
        ctx.translate(p.x, p.y + bob * p.scale);
        ctx.globalAlpha = 0.95;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius, radius * 0.9, 0, 0, Math.PI * 2);
        ctx.fillStyle = pu.color;
        ctx.fill();

        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius + 5, (radius + 5) * 0.9, 0, 0, Math.PI * 2);
        ctx.strokeStyle = pu.color;
        ctx.lineWidth = Math.max(2, radius * 0.18);
        ctx.stroke();

        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(10,16,30,.55)';
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 0.45, radius * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }

      ctx.save();
      ctx.translate(pu.x, pu.y + bob);
      ctx.scale(pulse, pulse);

      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.arc(0, 0, pu.radius, 0, Math.PI * 2);
      ctx.fillStyle = pu.color;
      ctx.fill();

      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(0, 0, pu.radius + 6, 0, Math.PI * 2);
      ctx.strokeStyle = pu.color;
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(10,16,30,.55)';
      ctx.beginPath();
      ctx.arc(0, 0, pu.radius * 0.45, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }
}

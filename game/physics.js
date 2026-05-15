import { clamp } from './utils.js';

export class WorldPhysics {
  constructor({ field }) {
    this.field = field;
    this.restitution = 0.78; // Reduzido levemente para evitar quiques exagerados
    this.frictionBall = 0.988;
    this.frictionButton = 0.92;
    this.contactFriction = 0.12; // Aumentado para dar mais "grip" nos raspões
    this.airResistance = 0.0005; // Novo: resistência do ar proporcional ao quadrado da velocidade

    this.spinDamping = 0.95;
    this.spinCurveStrength = 18; 
  }

  step(dt, world, config, onImpact) {
    const slowFactor = this.getGlobalSlowFactor(world);
    const scaledDt = dt * slowFactor;
    // Mais sub-steps para maior precisão na física
    const steps = Math.max(1, Math.min(5, Math.ceil(scaledDt / 0.008)));
    const stepDt = scaledDt / steps;

    for (let s = 0; s < steps; s++) {
      this.stepSingle(stepDt, world, config, onImpact);
    }
  }

  stepSingle(dt, world, config, onImpact) {
    // integra
    world.ball.integrate(dt, this.frictionBall, this.spinDamping, this.spinCurveStrength, config, this.airResistance);
    
    // PowerShot Homing
    if (world.ball.isPowerShot) {
      const targetGoalX = world.ball.vx > 0 ? this.field.width : 0;
      const targetGoalY = this.field.height / 2;
      const dx = targetGoalX - world.ball.x;
      const dy = targetGoalY - world.ball.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 5) {
        const force = 1200; // For\u00e7a de atra\u00e7\u00e3o magn\u00e9tica
        world.ball.vx += (dx / dist) * force * dt;
        world.ball.vy += (dy / dist) * force * dt;
      }
    }

    for (const b of world.buttons) {
      const player = world.players?.[b.playerId];
      b.integrate(dt, this.frictionButton, player?.activePower, this.airResistance);
    }
    for (const g of world.goalies) g.integrate(dt);

    // paredes
    this.resolveWalls(world.ball, true, onImpact);
    for (const b of world.buttons) this.resolveWalls(b, false, onImpact);
    for (const g of world.goalies) this.resolveWalls(g, false, onImpact);

    // colisões: button-button
    for (let i = 0; i < world.buttons.length; i++) {
      for (let j = i + 1; j < world.buttons.length; j++) {
        this.resolveCircleCollision(world.buttons[i], world.buttons[j], { allowSpin: false }, onImpact);
      }
    }

    // ball-button
    for (const b of world.buttons) {
      this.resolveCircleCollision(world.ball, b, { allowSpin: true, world, config }, onImpact);
    }

    // ball-goalie + button-goalie
    for (const g of world.goalies) {
      if (!this.shouldSkipGoalieCollision(world.ball, g)) {
        this.resolveCircleCollision(world.ball, g, { allowSpin: true, world }, onImpact);
      }
      for (const b of world.buttons) this.resolveCircleCollision(b, g, { allowSpin: false }, onImpact);
    }

    // clamp final e Trava de Velocidade Global (IGUAL PARA TODOS)
    const MAX_SPEED = 580;
    for (const b of world.buttons) {
      const s = Math.hypot(b.vx, b.vy);
      if (s > MAX_SPEED) {
        b.vx = (b.vx / s) * MAX_SPEED;
        b.vy = (b.vy / s) * MAX_SPEED;
      }
    }

    world.ball.x = clamp(world.ball.x, 0, this.field.width);
    world.ball.y = clamp(world.ball.y, 0, this.field.height);
  }

  getGlobalSlowFactor(world) {
    const slow = world?.players?.some?.((p) => p.activePower?.type === 'slow' && !p.activePower.isDebuff);
    return slow ? 0.65 : 1;
  }

  resolveWalls(body, isBall, onImpact) {
    const { width: w, height: h, wall, goalWidth } = this.field;

    const gy0 = (h - goalWidth) / 2;
    const gy1 = gy0 + goalWidth;

    // paredes verticais
    if (body.x - body.radius < wall) {
      const inGoalOpening = isBall && body.y > gy0 && body.y < gy1;
      if (!inGoalOpening) {
        body.x = wall + body.radius;
        body.vx = Math.abs(body.vx) * this.restitution;
        // perde um pouco de velocidade vertical no impacto com a parede
        body.vy *= 0.95;
        if (onImpact) onImpact(this.impactAt(body.x, body.y, Math.abs(body.vx) + Math.abs(body.vy)));
      }
    }
    if (body.x + body.radius > w - wall) {
      const inGoalOpening = isBall && body.y > gy0 && body.y < gy1;
      if (!inGoalOpening) {
        body.x = w - wall - body.radius;
        body.vx = -Math.abs(body.vx) * this.restitution;
        body.vy *= 0.95;
        if (onImpact) onImpact(this.impactAt(body.x, body.y, Math.abs(body.vx) + Math.abs(body.vy)));
      }
    }

    // paredes horizontais
    if (body.y - body.radius < wall) {
      body.y = wall + body.radius;
      body.vy = Math.abs(body.vy) * this.restitution;
      body.vx *= 0.95;
      if (onImpact) onImpact(this.impactAt(body.x, body.y, Math.abs(body.vx) + Math.abs(body.vy)));
    }
    if (body.y + body.radius > h - wall) {
      body.y = h - wall - body.radius;
      body.vy = -Math.abs(body.vy) * this.restitution;
      body.vx *= 0.95;
      if (onImpact) onImpact(this.impactAt(body.x, body.y, Math.abs(body.vx) + Math.abs(body.vy)));
    }
  }

  resolveCircleCollision(a, b, { allowSpin, world, config }, onImpact) {
    // PowerShot: Atravessa advers\u00e1rios
    if (a?.type === 'ball' && a.isPowerShot && b?.type === 'button') {
      const shooterPlayerId = a.lastShooterPlayerId;
      if (b.playerId !== shooterPlayerId) return; // Ignora se for inimigo
    }
    if (b?.type === 'ball' && b.isPowerShot && a?.type === 'button') {
      const shooterPlayerId = b.lastShooterPlayerId;
      if (a.playerId !== shooterPlayerId) return; // Ignora se for inimigo
    }

    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dist = Math.hypot(dx, dy);
    const minDist = a.radius + b.radius;
    if (dist <= 0 || dist >= minDist) return;

    // Trigger goalie save animation on ball collision
    if (a?.type === 'ball' && b?.type === 'goalie' && b.saveAnimationTimer <= 0) {
      b.saveAnimationTimer = 0.2;
      b.lastSaveAngle = Math.atan2(dy, dx);
    }

    const nx = dx / dist;
    const ny = dy / dist;

    const overlap = minDist - dist;
    const totalInvMass = a.invMass + b.invMass;
    if (totalInvMass <= 0) return;

    // Separação proporcional à massa
    const sepA = overlap * (a.invMass / totalInvMass);
    const sepB = overlap * (b.invMass / totalInvMass);
    a.x += nx * sepA;
    a.y += ny * sepA;
    b.x -= nx * sepB;
    b.y -= ny * sepB;

    const rvx = a.vx - b.vx;
    const rvy = a.vy - b.vy;
    const velAlongNormal = rvx * nx + rvy * ny;

    if (velAlongNormal > 0) return;

    const isBallButton = allowSpin && a?.type === 'ball' && b?.type === 'button';
    const normalSpeed = Math.abs(velAlongNormal);

    // Restituição variável: impactos lentos têm menos restituição (mais realista)
    let e = Math.min(this.restitution, 0.4 + normalSpeed / 1000);
    let mu = this.contactFriction;

    // Mini condução (grip leve): em toques suaves bola↔botão, reduz quique e aumenta atrito
    const dribbleAssist = !!config?.dribbleAssist;
    if (isBallButton && normalSpeed < 180) {
      const gripBoost = dribbleAssist ? 2.5 : 1;
      e = Math.min(e, 0.22 + normalSpeed / 1100);
      mu *= 2.2 * gripBoost;
    }
    const j = (-(1 + e) * velAlongNormal) / totalInvMass;
    const ix = j * nx;
    const iy = j * ny;

    a.vx += ix * a.invMass;
    a.vy += iy * a.invMass;
    b.vx -= ix * b.invMass;
    b.vy -= iy * b.invMass;

    // Atrito tangencial (fricção de contato)
    const tx = -ny;
    const ty = nx;
    const rvx2 = a.vx - b.vx;
    const rvy2 = a.vy - b.vy;
    const vt = rvx2 * tx + rvy2 * ty;
    
    // Fricção de Coulomb simplificada: jt não pode exceder j * mu
    let jt = (-vt) / totalInvMass;
    const maxJt = Math.abs(j * mu);
    jt = clamp(jt, -maxJt, maxJt);

    const tix = jt * tx;
    const tiy = jt * ty;

    a.vx += tix * a.invMass;
    a.vy += tiy * a.invMass;
    b.vx -= tix * b.invMass;
    b.vy -= tiy * b.invMass;

    // Leve "follow" da bola no botão em contato suave (sensação de condução)
    if (isBallButton && normalSpeed < 180) {
      const grip = clamp((220 - normalSpeed) / 220, 0, 1);
      const blend = (dribbleAssist ? 0.24 : 0.08) * grip;
      a.vx += (b.vx - a.vx) * blend;
      a.vy += (b.vy - a.vy) * blend;
    }

    // Em combate forte, a bola deve escapar do botão em vez de colar.
    if (isBallButton && normalSpeed > 260) {
      const breakup = clamp((normalSpeed - 260) / 320, 0, 1);
      a.vx += nx * j * 0.16 * breakup;
      a.vy += ny * j * 0.16 * breakup;
      b.vx -= nx * j * 0.08 * breakup;
      b.vy -= ny * j * 0.08 * breakup;
    }

    if (onImpact) onImpact(this.impactAt((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(j)));

    // Bomb / Explosion logic
    if (world?.players) {
      const pA = world.players[a.playerId];
      const pB = world.players[b.playerId];
      if (pA?.activePower?.type === 'bomb' && pA.activePower.armed) {
        pA.activePower = null;
        window.dispatchEvent(new CustomEvent('game:explosion', { detail: { x: (a.x + b.x)/2, y: (a.y + b.y)/2 } }));
      } else if (pB?.activePower?.type === 'bomb' && pB.activePower.armed) {
        pB.activePower = null;
        window.dispatchEvent(new CustomEvent('game:explosion', { detail: { x: (a.x + b.x)/2, y: (a.y + b.y)/2 } }));
      }
    }

    if (allowSpin && a.type === 'ball') {
      const tangential = rvx * tx + rvy * ty;
      const impactOffset = clamp(tangential / 15, -0.85, 0.85);

      let curveMult = a.powerMods?.curveSpinMult ?? 1;
      if (b?.type === 'button' && b?.ownerPower?.type === 'curve') curveMult *= 3.5;
      
      // Transferência de spin baseada na fricção tangencial
      a.spin += impactOffset * 6.5 * curveMult;

      // Powers de impacto
      if (b?.type === 'button' && b?.ownerPower) {
        const type = b.ownerPower.type;
        if (type === 'superShot') {
          const boost = 1.35;
          a.vx += nx * Math.abs(j) * a.invMass * boost;
          a.vy += ny * Math.abs(j) * a.invMass * boost;
        }
        if (type === 'teleport') {
          const side = Math.random() > 0.5 ? 1 : -1;
          const px = -ny * side;
          const py = nx * side;
          a.x += nx * 200 + px * 25;
          a.y += ny * 200 + py * 25;
        }
        if (type === 'lightning') {
          const boost = 1.85;
          a.vx += nx * Math.abs(j) * a.invMass * boost;
          a.vy += ny * Math.abs(j) * a.invMass * boost;
          a.x += nx * 45;
        }
      }

      if (world?.activeShotPlayerId != null && b?.type === 'button' && b.playerId === world.activeShotPlayerId) {
        world.extraTurnGranted = true;
        world.extraTurnGrantedPlayerId = b.playerId;
      }

      // Perda de energia no impacto tangencial
      const loss = 0.05 * Math.abs(impactOffset);
      a.vx *= 1 - loss;
      a.vy *= 1 - loss;
    }
  }

  checkGoal(world) {
    const { width: w, height: h, goalWidth, goalDepth } = this.field;
    const gy0 = (h - goalWidth) / 2;
    const gy1 = gy0 + goalWidth;

    const ball = world.ball;
    const inY = ball.y > gy0 && ball.y < gy1;

    if (inY && ball.x - ball.radius <= 0 + goalDepth * 0.5) return { scorer: 1 };
    if (inY && ball.x + ball.radius >= w - goalDepth * 0.5) return { scorer: 0 };
    return null;
  }

  resetPositions(world) {
    const { width: w, height: h } = this.field;
    world.ball.reset({ x: w / 2, y: h / 2 });
    for (const b of world.buttons) b.reset();
    for (const g of world.goalies) g.reset();
  }

  impactAt(x, y, strength) {
    const s = clamp(strength / 14, 0, 1);
    return {
      x, y,
      strength: s,
      radius: 12 + s * 22,
      life: 0.2 + s * 0.12,
      maxLife: 0.2 + s * 0.12,
      color: `rgba(255,255,255,${0.35 + s * 0.4})`,
    };
  }

  shouldSkipGoalieCollision(ball, goalie) {
    const { width: w, height: h, goalWidth, goalDepth } = this.field;
    const gy0 = (h - goalWidth) / 2;
    const gy1 = gy0 + goalWidth;

    const inGoalMouth = ball.y > gy0 && ball.y < gy1;
    if (!inGoalMouth) return false;

    if (goalie.side === 'left') {
      const nearGoalLine = ball.x - ball.radius <= goalDepth * 0.7;
      const movingToGoal = ball.vx < -6;
      return nearGoalLine && movingToGoal;
    }

    const nearGoalLine = ball.x + ball.radius >= w - goalDepth * 0.7;
    const movingToGoal = ball.vx > 6;
    return nearGoalLine && movingToGoal;
  }
}

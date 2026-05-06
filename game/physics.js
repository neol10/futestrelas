import { clamp } from './utils.js';

export class WorldPhysics {
  constructor({ field }) {
    this.field = field;
    this.restitution = 0.82;
    this.frictionBall = 0.986;
    this.frictionButton = 0.93;
    this.contactFriction = 0.035;

    this.spinDamping = 0.93;
    this.spinCurveStrength = 16; // magnus-like
  }

  step(dt, world, config, onImpact) {
    const slowFactor = this.getGlobalSlowFactor(world);
    const scaledDt = dt * slowFactor;
    const steps = Math.max(1, Math.min(3, Math.ceil(scaledDt / 0.012)));
    const stepDt = scaledDt / steps;

    for (let s = 0; s < steps; s++) {
      this.stepSingle(stepDt, world, config, onImpact);
    }
  }

  stepSingle(dt, world, config, onImpact) {

    // integra
    world.ball.integrate(dt, this.frictionBall, this.spinDamping, this.spinCurveStrength, config);
    for (const b of world.buttons) b.integrate(dt, this.frictionButton);
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
      this.resolveCircleCollision(world.ball, b, { allowSpin: true, world }, onImpact);
    }

    // ball-goalie + button-goalie
    for (const g of world.goalies) {
      this.resolveCircleCollision(world.ball, g, { allowSpin: true, world }, onImpact);
      for (const b of world.buttons) this.resolveCircleCollision(b, g, { allowSpin: false }, onImpact);
    }

    // clamp final
    world.ball.x = clamp(world.ball.x, 0, this.field.width);
    world.ball.y = clamp(world.ball.y, 0, this.field.height);
  }

  getGlobalSlowFactor(world) {
    // se qualquer jogador estiver com 'slow' ativo, reduz tudo
    const slow = world?.players?.some?.((p) => p.activePower?.type === 'slow');
    return slow ? 0.72 : 1;
  }

  resolveWalls(body, isBall, onImpact) {
    const { width: w, height: h, wall, goalWidth } = this.field;

    // abre espaço no gol: na linha externa, bola pode "passar" na abertura
    const gy0 = (h - goalWidth) / 2;
    const gy1 = gy0 + goalWidth;

    // paredes verticais
    if (body.x - body.radius < wall) {
      const inGoalOpening = isBall && body.y > gy0 && body.y < gy1;
      if (!inGoalOpening) {
        body.x = wall + body.radius;
        body.vx = Math.abs(body.vx) * this.restitution;
        if (onImpact) onImpact(this.impactAt(body.x, body.y, Math.abs(body.vx) + Math.abs(body.vy)));
      }
    }
    if (body.x + body.radius > w - wall) {
      const inGoalOpening = isBall && body.y > gy0 && body.y < gy1;
      if (!inGoalOpening) {
        body.x = w - wall - body.radius;
        body.vx = -Math.abs(body.vx) * this.restitution;
        if (onImpact) onImpact(this.impactAt(body.x, body.y, Math.abs(body.vx) + Math.abs(body.vy)));
      }
    }

    // paredes horizontais
    if (body.y - body.radius < wall) {
      body.y = wall + body.radius;
      body.vy = Math.abs(body.vy) * this.restitution;
      if (onImpact) onImpact(this.impactAt(body.x, body.y, Math.abs(body.vx) + Math.abs(body.vy)));
    }
    if (body.y + body.radius > h - wall) {
      body.y = h - wall - body.radius;
      body.vy = -Math.abs(body.vy) * this.restitution;
      if (onImpact) onImpact(this.impactAt(body.x, body.y, Math.abs(body.vx) + Math.abs(body.vy)));
    }
  }

  resolveCircleCollision(a, b, { allowSpin, world }, onImpact) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dist = Math.hypot(dx, dy);
    const minDist = a.radius + b.radius;
    if (dist <= 0 || dist >= minDist) return;

    // normal
    const nx = dx / dist;
    const ny = dy / dist;

    // separação
    const overlap = minDist - dist;
    const totalInvMass = a.invMass + b.invMass;
    if (totalInvMass <= 0) return;

    const sepA = overlap * (a.invMass / totalInvMass);
    const sepB = overlap * (b.invMass / totalInvMass);
    a.x += nx * sepA;
    a.y += ny * sepA;
    b.x -= nx * sepB;
    b.y -= ny * sepB;

    // velocidade relativa
    const rvx = a.vx - b.vx;
    const rvy = a.vy - b.vy;
    const velAlongNormal = rvx * nx + rvy * ny;

    if (velAlongNormal > 0) return;

    // impulso normal (com restituição)
    const e = this.restitution;
    const j = (-(1 + e) * velAlongNormal) / totalInvMass;
    const ix = j * nx;
    const iy = j * ny;

    a.vx += ix * a.invMass;
    a.vy += iy * a.invMass;
    b.vx -= ix * b.invMass;
    b.vy -= iy * b.invMass;

    // atrito tangencial no contato para dar mais realismo no "raspão"
    const rvx2 = a.vx - b.vx;
    const rvy2 = a.vy - b.vy;
    const tx = -ny;
    const ty = nx;
    const vt = rvx2 * tx + rvy2 * ty;
    const jt = (-vt * this.contactFriction) / totalInvMass;
    const tix = jt * tx;
    const tiy = jt * ty;

    a.vx += tix * a.invMass;
    a.vy += tiy * a.invMass;
    b.vx -= tix * b.invMass;
    b.vy -= tiy * b.invMass;

    // impacto visual
    if (onImpact) onImpact(this.impactAt((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(j)));

    // sistema de impacto avançado: spin baseado no offset do contato
    if (allowSpin && a.type === 'ball') {
      const tx = -ny;
      const ty = nx;
      const tangential = rvx * tx + rvy * ty;

      // "impactOffset" aproximado: quão lateral foi o contato
      // quanto mais tangencial o impacto, mais spin.
      const impactOffset = clamp(tangential / 10, -0.75, 0.75);

      let curveMult = a.powerMods?.curveSpinMult ?? 1;
      if (b?.type === 'button' && b?.ownerPower?.type === 'curve') curveMult *= 3;
      a.spin += impactOffset * 5.2 * curveMult;

      // superShot transfere mais energia para a bola no instante do contato.
      if (b?.type === 'button' && b?.ownerPower?.type === 'superShot') {
        const boost = 1.25;
        a.vx += nx * Math.abs(j) * a.invMass * boost;
        a.vy += ny * Math.abs(j) * a.invMass * boost;
      }

      if (world?.activeShotPlayerId != null && b?.type === 'button' && b.playerId === world.activeShotPlayerId) {
        world.extraTurnGranted = true;
        world.extraTurnGrantedPlayerId = b.playerId;
      }

      // pequena transferência de energia: lateral reduz um pouco o impulso normal efetivo
      const loss = 0.04 * Math.abs(impactOffset);
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

    // esquerda: ponto do gol é do jogador 2
    if (inY && ball.x - ball.radius <= 0 + goalDepth * 0.45) {
      return { scorer: 1 };
    }
    // direita: ponto do gol é do jogador 1
    if (inY && ball.x + ball.radius >= w - goalDepth * 0.45) {
      return { scorer: 0 };
    }

    return null;
  }

  resetPositions(world) {
    const { width: w, height: h } = this.field;

    world.ball.reset({ x: w / 2, y: h / 2 });

    // volta botões para o "home"
    for (const b of world.buttons) b.reset();
    for (const g of world.goalies) g.reset();
  }

  impactAt(x, y, strength) {
    const s = clamp(strength / 12, 0, 1);
    return {
      x,
      y,
      strength: s,
      radius: 10 + s * 18,
      life: 0.18 + s * 0.10,
      maxLife: 0.18 + s * 0.10,
      color: `rgba(255,255,255,${0.30 + s * 0.35})`,
    };
  }
}

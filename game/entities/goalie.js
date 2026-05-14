import { clamp } from '../utils.js';

export class Goalie {
  constructor({ side, auto }) {
    this.type = 'goalie';
    this.side = side; // left | right
    this.auto = !!auto;

    this.radius = 15;
    this.mass = Infinity;
    this.invMass = 0;

    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.reactionTimer = 0;
    this.saveAnimationTimer = 0; // Animation on save
    this.lastSaveAngle = 0;

    this._home = { x: 0, y: 0 };
  }

  update(dt, world, config) {
    // Decrement animation timer
    if (this.saveAnimationTimer > 0) {
      this.saveAnimationTimer -= dt;
    }
    
    this.auto = !!config.goalieAuto;
    const { width: w, height: h, wall, goalWidth, goalDepth } = world.field;

    const goalX = this.side === 'left' ? goalDepth + wall + 12 : w - goalDepth - wall - 12;
    const gy0 = (h - goalWidth) / 2;
    const gy1 = gy0 + goalWidth;

    if (this._home.x === 0) {
      this._home.x = goalX;
      this._home.y = h / 2;
    }

    this.x = goalX;

    if (this.auto) {
      const ball = world.ball;
      const ballSpeed = Math.hypot(ball.vx, ball.vy);
      const distanceToGoal = Math.abs(goalX - ball.x);

      let targetY = ball.y;

      // Não reage o tempo todo; isso deixa o goleiro menos perfeito.
      this.reactionTimer -= dt;
      const shouldReact = this.reactionTimer <= 0;
      if (shouldReact) {
        this.reactionTimer = 0.05 + Math.random() * 0.1;

        // IA mais humana: só tenta antecipar quando a bola realmente vem em direção ao gol
        const isMovingTowards = (this.side === 'left' && ball.vx < -22) || (this.side === 'right' && ball.vx > 22);

        if (isMovingTowards && distanceToGoal < 360 && ballSpeed > 16) {
          const timeToReach = distanceToGoal / Math.max(1, Math.abs(ball.vx));
          if (timeToReach > 0 && timeToReach < 1.05) {
            targetY = ball.y + (ball.vy * timeToReach * 0.55);

            if (targetY < wall) targetY = wall + Math.abs(targetY - wall);
            if (targetY > h - wall) targetY = (h - wall) - Math.abs(targetY - (h - wall));
          }
        }

        // Pequena imprecisão para não parecer um imã perfeito
        targetY += (Math.random() - 0.5) * 14;
      }

      // Restringe o alvo para dentro da área do gol
      targetY = clamp(targetY, gy0 + 18, gy1 - 18);
      
      // Ajuste de velocidade do goleiro: acompanha sem fechar o gol o tempo todo
      const difficulty = config.goalieDifficulty || config.aiDifficulty || config.difficulty || 'medium';
      const speedMul = difficulty === 'easy' ? 0.82 : difficulty === 'hard' ? 1.08 : 1.0;
      const speed = 240 * speedMul;
      const tracking = clamp(1 - distanceToGoal / 460, 0.25, 1);
      const dy = targetY - this.y;
      
      // Move com atraso leve e resposta mais suave para não travar a boca do gol
      const deadZone = 4;
      const desiredVy = Math.abs(dy) <= deadZone ? 0 : dy * (3.1 + tracking * 2.2);
      this.vy += clamp(desiredVy - this.vy, -speed * dt * 10, speed * dt * 10);
      this.vy = clamp(this.vy, -speed, speed);
      this.y += this.vy * dt;
    } else {
      this.y = h / 2;
      this.vy = 0;
      this.reactionTimer = 0;
    }

    this.y = clamp(this.y, gy0 + 18, gy1 - 18);
  }

  integrate() {
    // goalie é controlado por update()
  }

  reset() {
    this.x = this._home.x;
    this.y = this._home.y;
    this.vx = 0;
    this.vy = 0;
  }

  render(ctx) {
    // sombra
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.arc(this.x + 2.5, this.y + 3, this.radius + 2, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(245,245,245,.85)';
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(10,16,30,.35)';
    ctx.stroke();

    // luvas (indicador)
    ctx.beginPath();
    ctx.arc(this.x + (this.side === 'left' ? 6 : -6), this.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(46,108,255,.55)';
    ctx.fill();
    
    // Save animation: arm swing
    if (this.saveAnimationTimer > 0) {
      ctx.save();
      ctx.translate(this.x, this.y);
      const progress = 1 - (this.saveAnimationTimer / 0.2);
      const armAngle = Math.sin(progress * Math.PI) * 0.6;
      const armX = Math.cos(armAngle) * 8;
      const armY = Math.sin(armAngle) * 8;
      
      ctx.strokeStyle = 'rgba(46,108,255,.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(armX, armY);
      ctx.stroke();
      ctx.restore();
    }
  }
}

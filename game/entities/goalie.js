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

    this._home = { x: 0, y: 0 };
  }

  update(dt, world, config) {
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
      const targetY = clamp(world.ball.y, gy0 + 18, gy1 - 18);
      const speed = 360;
      const dy = targetY - this.y;
      this.vy = clamp(dy * 8, -speed, speed);
      this.y += this.vy * dt;
    } else {
      this.y = h / 2;
      this.vy = 0;
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
  }
}

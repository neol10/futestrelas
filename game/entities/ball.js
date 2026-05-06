import { clamp } from '../utils.js';

export class Ball {
  constructor({ x, y }) {
    this.type = 'ball';
    this.radius = 9;
    this.mass = 0.5;
    this.invMass = 1 / this.mass;

    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;

    this.spin = 0; // positivo/negativo dá curva
    this.powerMods = {
      curveSpinMult: 1,
    };

    this._home = { x, y };
  }

  integrate(dt, friction, spinDamping, curveStrength, config) {
    // curva (Magnus-like): aceleração perpendicular à velocidade proporcional ao spin
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > 0.001 && Math.abs(this.spin) > 0.001) {
      const px = -this.vy / speed;
      const py = this.vx / speed;

      const speedFactor = clamp(speed / 240, 0.15, 1);
      const curve = clamp(this.spin, -4.5, 4.5) * curveStrength * speedFactor;
      this.vx += px * curve * dt;
      this.vy += py * curve * dt;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // atrito + damping
    const f = Math.pow(friction, dt * 60);
    this.vx *= f;
    this.vy *= f;
    this.spin *= Math.pow(spinDamping, dt * 60);

    // corta micro-movimentos
    if (Math.abs(this.vx) < 0.001) this.vx = 0;
    if (Math.abs(this.vy) < 0.001) this.vy = 0;
    if (Math.abs(this.spin) < 0.001) this.spin = 0;

    // mods de power: atualizados externamente no momento do chute
    this.powerMods.curveSpinMult = 1;
  }

  reset({ x, y }) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.spin = 0;
  }

  render(ctx) {
    // sombra
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(this.x + 2.5, this.y + 3, this.radius + 2, 0, Math.PI * 2);
    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.globalAlpha = 1;

    // bola
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#f5f5f5';
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(10,16,30,.35)';
    ctx.stroke();

    // indicador sutil de spin
    if (Math.abs(this.spin) > 0.2) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(performance.now() / 300 * (this.spin > 0 ? 1 : -1));
      ctx.beginPath();
      ctx.arc(0, 0, this.radius - 2, 0.2, 2.5);
      ctx.strokeStyle = 'rgba(46,108,255,.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }
}

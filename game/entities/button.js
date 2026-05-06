import { clamp, rand } from '../utils.js';

let nextId = 1;

export class Button {
  constructor({ x, y, playerId, colors }) {
    this.type = 'button';
    this.id = nextId++;

    this.playerId = playerId;
    this.radius = 18;
    this.mass = 2.4;
    this.invMass = 1 / this.mass;

    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;

    this.colors = colors;
    this.lastShotAt = 0;
    this.ownerPower = null;

    this._home = { x, y };
  }

  integrate(dt, friction) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const f = Math.pow(friction, dt * 60);
    this.vx *= f;
    this.vy *= f;

    if (Math.abs(this.vx) < 0.001) this.vx = 0;
    if (Math.abs(this.vy) < 0.001) this.vy = 0;

    if (this.vx === 0 && this.vy === 0) {
      this.ownerPower = null;
    }
  }

  computeShotPower(pull, activePower) {
    // força base proporcional ao pull
    let mult = 1;
    if (activePower?.type === 'superShot') mult *= 2.0;
    if (activePower?.type === 'slow') mult *= 0.9;

    // limite de velocidade de botão
    const base = pull * 5.2;
    return clamp(base * mult, 0, 1300);
  }

  applyAimAssist(dir, activePower) {
    // pequena "imprecisão" base (simula dedo/mouse), reduzida por precision
    let error = 0.020;
    if (activePower?.type === 'precision') error *= 0.25;

    const angle = Math.atan2(dir.y, dir.x);
    const jitter = (rand(-1, 1) * error);
    const a = angle + jitter;
    return { x: Math.cos(a), y: Math.sin(a) };
  }

  reset() {
    this.x = this._home.x;
    this.y = this._home.y;
    this.vx = 0;
    this.vy = 0;
    this.ownerPower = null;
  }

  render(ctx) {
    // sombra
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.arc(this.x + 3, this.y + 3.5, this.radius + 2, 0, Math.PI * 2);
    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.globalAlpha = 1;

    // corpo
    const [c1, c2] = this.colors;
    const grad = ctx.createRadialGradient(this.x - 6, this.y - 6, 4, this.x, this.y, this.radius);
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.stroke();

    // marca central
    ctx.beginPath();
    ctx.arc(this.x, this.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10,16,30,.55)';
    ctx.fill();
  }
}

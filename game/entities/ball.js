import { clamp } from '../utils.js';

export class Ball {
  constructor({ x, y }) {
    this.type = 'ball';
    this.radius = 16; // Increased for 3D effect
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
    
    // Rastreamento de efeitos de poder
    this.frozenTime = 0; // Tempo congelado (freeze)
    this.activeEffects = {}; // { freeze: true, spinner: true, etc }

    this.trail = [];
    this.trailTimer = 0;

    this._home = { x, y };
  }

  integrate(dt, friction, spinDamping, curveStrength, config, airResistance = 0.0005) {
    // Aplica efeito de freeze (congelamento)
    if (this.activeEffects?.freeze) {
      this.frozenTime -= dt;
      if (this.frozenTime <= 0) {
        this.activeEffects.freeze = false;
      } else {
        // Bola congelada não se move
        return;
      }
    }

    // movimento
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // atrito linear + resistência do ar quadrática (mais realista)
    const speed = Math.hypot(this.vx, this.vy);
    const f = Math.pow(friction, dt * 60);
    const drag = 1 - (airResistance * speed * dt);
    
    this.vx *= f * Math.max(0.7, drag);
    this.vy *= f * Math.max(0.7, drag);

    // curva (Magnus-like)
    if (speed > 10 && Math.abs(this.spin) > 0.01) {
      const px = -this.vy / speed;
      const py = this.vx / speed;

      const speedFactor = clamp(speed / 300, 0.2, 1.2);
      let curve = clamp(this.spin, -6, 6) * curveStrength * speedFactor;
      
      if (this.activeEffects?.spinner) curve *= 4.0;
      
      this.vx += px * curve * dt;
      this.vy += py * curve * dt;
    }

    this.spin *= Math.pow(spinDamping, dt * 60);

    const currentSpeed = Math.hypot(this.vx, this.vy);
    
    // Atualização da trilha
    this.trailTimer += dt;
    if (this.trailTimer > 0.025 && currentSpeed > 180) {
      this.trail.push({ x: this.x, y: this.y, life: 1.0 });
      this.trailTimer = 0;
    }
    this.trail = this.trail.filter(t => (t.life -= dt * 3) > 0);

    const maxSpeed = 1100;
    if (currentSpeed > maxSpeed) {
      const scale = maxSpeed / currentSpeed;
      this.vx *= scale;
      this.vy *= scale;
    }

    // corta micro-movimentos
    if (Math.abs(this.vx) < 0.1) this.vx = 0;
    if (Math.abs(this.vy) < 0.1) this.vy = 0;
    if (Math.abs(this.spin) < 0.01) this.spin = 0;

    this.powerMods.curveSpinMult = 1;
  }

  reset({ x, y }) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.spin = 0;
    this.frozenTime = 0;
    this.activeEffects = {};
    this.trail = [];
  }

  render(ctx) {
    // trail
    if (this.trail.length > 0) {
      ctx.beginPath();
      ctx.moveTo(this.trail[0].x, this.trail[0].y);
      for (let i = 1; i < this.trail.length; i++) {
        ctx.lineTo(this.trail[i].x, this.trail[i].y);
      }
      ctx.lineTo(this.x, this.y);
      ctx.strokeStyle = 'rgba(245, 245, 245, 0.25)';
      ctx.lineWidth = this.radius * 1.6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    // Enhanced 3D shadow
    ctx.globalAlpha = 0.32;
    ctx.beginPath();
    ctx.ellipse(this.x + this.radius * 0.15, this.y + this.radius * 0.45, this.radius * 1.2, this.radius * 0.85, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.globalAlpha = 1;

    // 3D ball with radial gradient
    const grad = ctx.createRadialGradient(
      this.x - this.radius * 0.3, this.y - this.radius * 0.3, this.radius * 0.1,
      this.x, this.y, this.radius
    );
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.6, '#f5f5f5');
    grad.addColorStop(1, '#d0d0d0');
    
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Outer rim for depth
    ctx.lineWidth = Math.max(2, this.radius * 0.15);
    ctx.strokeStyle = 'rgba(10,16,30,.5)';
    ctx.stroke();
    
    // Inner highlight for glossiness
    ctx.beginPath();
    ctx.arc(this.x - this.radius * 0.25, this.y - this.radius * 0.25, this.radius * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.fill();

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

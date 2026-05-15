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

    this.isPowerShot = false;
    this.lastShooterPlayerId = null;
    this.carriedByButtonId = null;
    this.carryOffsetX = 0;
    this.carryOffsetY = 0;

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
    this.isPowerShot = false;
    this.lastShooterPlayerId = null;
    this.carriedByButtonId = null;
    this.carryOffsetX = 0;
    this.carryOffsetY = 0;
  }

  render(ctx) {
    // Trail (Rastro neon/dinâmico de alta velocidade)
    if (this.trail.length > 1) {
      ctx.save();
      for (let i = 0; i < this.trail.length - 1; i++) {
        const t1 = this.trail[i];
        const t2 = this.trail[i + 1];
        const alpha = t1.life * 0.6;
        
        ctx.beginPath();
        ctx.moveTo(t1.x, t1.y);
        ctx.lineTo(t2.x, t2.y);
        
        // Efeito de fogo/energia
        const speed = Math.hypot(this.vx, this.vy);
        let trailColor = speed > 600 ? 'rgba(255, 215, 0, ' : 'rgba(255, 255, 255, ';
        if (this.isPowerShot) trailColor = 'rgba(191, 0, 255, '; // Roxo para PowerShot
        
        ctx.strokeStyle = trailColor + alpha + ')';
        ctx.lineWidth = this.radius * (this.isPowerShot ? 2.5 : 1.6) * t1.life;
        ctx.lineCap = 'round';
        ctx.shadowBlur = this.isPowerShot ? 25 : (speed > 600 ? 15 : 0);
        ctx.shadowColor = this.isPowerShot ? '#bf00ff' : '#ffd700';
        ctx.stroke();
      }
      ctx.restore();
    }

    // Dynamic 3D shadow (Moves with velocity)
    ctx.save();
    ctx.globalAlpha = 0.4;
    const shadowOffX = this.vx * 0.012;
    const shadowOffY = this.vy * 0.012 + (this.radius * 0.35);
    ctx.beginPath();
    ctx.ellipse(this.x + shadowOffX, this.y + shadowOffY, this.radius * 1.1, this.radius * 0.7, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.restore();

    // 3D ball with radial gradient (Better contrast)
    const grad = ctx.createRadialGradient(
      this.x - this.radius * 0.4, this.y - this.radius * 0.4, this.radius * 0.1,
      this.x, this.y, this.radius
    );
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.3, '#f9f9f9');
    grad.addColorStop(0.7, '#cccccc');
    grad.addColorStop(1, '#999999');
    
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Adicional: Brilho de reflexão na base (Ambience)
    ctx.beginPath();
    ctx.arc(this.x + this.radius * 0.3, this.y + this.radius * 0.3, this.radius * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
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

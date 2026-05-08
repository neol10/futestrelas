import { clamp, rand } from '../utils.js';

let nextId = 1;

export class Button {
  constructor({ x, y, playerId, colors, team, stats }) {
    this.type = 'button';
    this.id = nextId++;

    this.playerId = playerId;
    this.radius = 18;
    this.stats = stats || { curve: 1, power: 1, mass: 1, speed: 1 };
    this.mass = 2.4 * this.stats.mass;
    this.invMass = 1 / this.mass;

    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;

    this.colors = colors;
    this.team = team; // Armazena o time para mostrar a bandeira
    this.lastShotAt = 0;
    this.botActionAt = 0;
    this.ownerPower = null;
    this.wanderTimer = rand(0.08, 0.6);
    this.wanderDrift = rand(0, Math.PI * 2);
    this.wanderBurstTimer = rand(0.9, 3.4);
    
    this.trail = [];
    this.trailTimer = 0;

    this._home = { x, y };
  }

  applyIdleWander(dt) {
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > 240) {
      this.wanderTimer = Math.min(this.wanderTimer, 0.16);
      return;
    }

    this.wanderBurstTimer -= dt;
    const burstActive = this.wanderBurstTimer <= 0;

    this.wanderTimer -= dt;
    if (this.wanderTimer > 0) return;

    if (burstActive) {
      this.wanderBurstTimer = rand(1.4, 4.2);
      this.wanderTimer = rand(0.05, 0.16);
      this.wanderDrift += rand(-2.8, 2.8);

      const impulse = rand(170, 290) * this.stats.speed;
      this.vx += Math.cos(this.wanderDrift) * impulse;
      this.vy += Math.sin(this.wanderDrift) * impulse;
      return;
    }

    this.wanderTimer = rand(0.12, 0.5);
    this.wanderDrift += rand(-1.35, 1.35);

    const impulse = rand(72, 150) * this.stats.speed;
    this.vx += Math.cos(this.wanderDrift) * impulse;
    this.vy += Math.sin(this.wanderDrift) * impulse;

    const homeDx = this._home.x - this.x;
    const homeDy = this._home.y - this.y;
    const homeDist = Math.hypot(homeDx, homeDy);
    if (homeDist > 18) {
      const homePull = clamp((homeDist - 18) * 0.28, 0, 32) * dt;
      this.vx += (homeDx / homeDist) * homePull;
      this.vy += (homeDy / homeDist) * homePull;
    }
  }

  integrate(dt, friction, activePower, airResistance = 0.0005) {
    // Se estiver atordoado ou congelado, não move
    if (activePower?.type === 'stun' || activePower?.type === 'freeze') {
      this.vx *= 0.8;
      this.vy *= 0.8;
      if (Math.hypot(this.vx, this.vy) < 5) {
        this.vx = 0;
        this.vy = 0;
      }
      return;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const speed = Math.hypot(this.vx, this.vy);
    let f = Math.pow(friction, dt * 60);
    const drag = 1 - (airResistance * 0.5 * speed * dt); // botões têm menos drag que a bola
    
    // Efeito de teia ou pântano (mais atrito)
    if (activePower?.type === 'webSlowdown') f *= 0.82;
    if (activePower?.type === 'swamp') f *= 0.88;

    this.vx *= f * Math.max(0.75, drag);
    this.vy *= f * Math.max(0.75, drag);

    // Atualização da trilha
    this.trailTimer += dt;
    if (this.trailTimer > 0.025 && speed > 220) {
      this.trail.push({ x: this.x, y: this.y, life: 1.0 });
      this.trailTimer = 0;
    }
    this.trail = this.trail.filter(t => (t.life -= dt * 3.5) > 0);

    const maxSpeed = (activePower?.type === 'boost' ? 700 : 500) * this.stats.speed;
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      this.vx *= scale;
      this.vy *= scale;
    }

    // clamp tiny velocities to avoid perpetual micro-sliding
    const microThreshold = 8; // px/s (aumentado para reduzir deslize residual)
    if (Math.hypot(this.vx, this.vy) < microThreshold) {
      this.vx = 0;
      this.vy = 0;
    }
    if (this.vx === 0 && this.vy === 0) {
      this.ownerPower = null;
    }

    // Shield: aumenta massa temporariamente se for o dono do poder
    if (activePower?.type === 'shield' && !activePower.isDebuff) {
      this.mass = 20 * this.stats.mass;
      this.invMass = 1 / this.mass;
    } else if (activePower?.type === 'block' && !activePower.isDebuff) {
      this.mass = 8 * this.stats.mass;
      this.invMass = 1 / this.mass;
    } else {
      this.mass = 2.4 * this.stats.mass;
      this.invMass = 1 / this.mass;
    }
  }

  computeShotPower(pull, activePower) {
    let mult = 1;
    
    if (activePower?.type === 'superShot') mult *= 2.5;      
    if (activePower?.type === 'dash') mult *= 1.45;
    if (activePower?.type === 'slow') mult *= 0.7;           
    if (activePower?.type === 'boost') mult *= 1.4;          
    if (activePower?.type === 'lightning') mult *= 1.6;      
    if (activePower?.type === 'zap') mult *= 0.45;            
    
    if (activePower?.type === 'drain') mult *= 0.6;          
    if (activePower?.type === 'swamp') mult *= 0.8;         
    if (activePower?.type === 'webSlowdown') mult *= 0.7;   
    if (activePower?.type === 'gravity') mult *= 0.92;

    const base = pull * 5.5 * this.stats.power;
    return clamp(base * mult, 0, 1600);
  }

  applyAimAssist(dir, activePower, distanceToGoal = 500, shotPower = 0.5) {
    let error = 0.015;
    if (activePower?.type === 'precision') error = 0;    
    if (activePower?.type === 'blur') error *= 4.0;          
    if (activePower?.type === 'confuse') error *= 3.5;       
    if (activePower?.type === 'reverse') error *= 2.0;       
    if (activePower?.type === 'smoke') error *= 5.0; 
    
    // Distance-aware: closer to goal = higher precision
    const distanceFactor = Math.max(0.5, 1 - distanceToGoal / 700);
    error *= distanceFactor;
    
    // Power-scaled: higher power = lower precision (harder to control)
    const powerFactor = 0.7 + Math.min(1, shotPower) * 0.3;
    error *= powerFactor;

    const angle = Math.atan2(dir.y, dir.x);
    
    let jitter = (Math.random() * 2 - 1) * error;
    if (activePower?.type === 'curve') jitter += (Math.random() > 0.5 ? 0.15 : -0.15);
    if (activePower?.type === 'spinner') jitter += (Math.random() > 0.5 ? 0.25 : -0.25);
    
    const a = angle + jitter;
    return { x: Math.cos(a), y: Math.sin(a) };
  }

  reset() {
    this.x = this._home.x;
    this.y = this._home.y;
    this.vx = 0;
    this.vy = 0;
    this.ownerPower = null;
    this.botActionAt = 0;
    this.trail = [];
  }

  render(ctx, activePower) {
    const auraColorMap = {
      boost: 'rgba(0,255,128,0.38)',
      dash: 'rgba(255,140,0,0.38)',
      gravity: 'rgba(122,92,255,0.38)',
      shockwave: 'rgba(0,212,255,0.3)',
      magnet: 'rgba(46,224,255,0.34)',
      freeze: 'rgba(0,204,255,0.34)',
      smoke: 'rgba(160,160,160,0.25)',
      lightning: 'rgba(255,204,0,0.34)',
      bomb: 'rgba(255,80,30,0.34)',
      repulsor: 'rgba(0,255,255,0.24)',
    };
    const auraColor = activePower ? auraColorMap[activePower.type] : null;
    const auraPulse = 1 + Math.sin(performance.now() / 220) * 0.08;

    if (auraColor) {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 9 * auraPulse, 0, Math.PI * 2);
      ctx.strokeStyle = auraColor;
      ctx.lineWidth = 4;
      ctx.stroke();

      if (activePower.type === 'shockwave') {
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + 16 * auraPulse, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,212,255,0.65)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (activePower.type === 'gravity') {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + 2 + Math.sin(performance.now() / 180) * 2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(122,92,255,0.78)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      ctx.restore();
    }

    // trail
    if (this.trail.length > 0) {
      ctx.beginPath();
      ctx.moveTo(this.trail[0].x, this.trail[0].y);
      for (let i = 1; i < this.trail.length; i++) {
        ctx.lineTo(this.trail[i].x, this.trail[i].y);
      }
      ctx.lineTo(this.x, this.y);
      
      // Usa a cor principal do time pro rastro
      ctx.strokeStyle = this.colors[0]; 
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = this.radius * 1.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }

    // Brilho de poder ativo
    if (activePower?.type === 'bomb' || activePower?.type === 'repulsor') {
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 10, 0, Math.PI * 2);
      ctx.fillStyle = activePower.type === 'bomb' ? 'rgba(255, 0, 0, 0.4)' : 'rgba(0, 255, 255, 0.3)';
      ctx.fill();
      ctx.restore();
    }

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

    // Desenha a bandeira do time no topo do botão
    if (this.team) {
      ctx.save();
      ctx.font = 'bold 16px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.95;
      // Renderiza a bandeira como emoji
      ctx.fillText(this.team, this.x, this.y - 3);
      ctx.restore();
    }
  }
}

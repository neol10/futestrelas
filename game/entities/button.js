import { clamp, rand } from '../utils.js';

let nextId = 1;

function createPlayerSprite(colors, playerId) {
  const frames = 3;
  const fw = 64;
  const fh = 64;
  const canvas = document.createElement('canvas');
  canvas.width = fw * frames;
  canvas.height = fh;
  const ctx = canvas.getContext('2d');

  const shirt = colors?.[0] || '#999999';
  const trim = colors?.[1] || '#555555';

  for (let f = 0; f < frames; f++) {
    const ox = f * fw;

    // background (transparent)
    // head
    ctx.fillStyle = '#f2c9a3';
    ctx.beginPath();
    ctx.ellipse(ox + fw/2, 14, 12, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // hair (simple)
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(ox + fw/2 - 12, 6, 24, 8);

    // body (shirt)
    ctx.fillStyle = shirt;
    ctx.fillRect(ox + fw/2 - 16, 26, 32, 20);
    // trim
    ctx.fillStyle = trim;
    ctx.fillRect(ox + fw/2 - 16, 26, 32, 4);

    // legs (animated slight offset)
    const step = (f === 0 ? -4 : f === 1 ? 0 : 4);
    ctx.fillStyle = '#2a3c9f';
    ctx.fillRect(ox + fw/2 - 10 + step, 46, 8, 14);
    ctx.fillRect(ox + fw/2 + 2 - step, 46, 8, 14);

    // socks
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox + fw/2 - 10 + step, 58, 8, 4);
    ctx.fillRect(ox + fw/2 + 2 - step, 58, 8, 4);

    // number on shirt
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(playerId % 99), ox + fw/2, 36);
  }

  return canvas;
}

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
    this.botDribbleAt = 0;
    this.ownerPower = null;
    this.wanderTimer = rand(0.08, 0.6);
    this.wanderDrift = rand(0, Math.PI * 2);
    this.wanderBurstTimer = rand(0.9, 3.4);
    
    this.trail = [];
    this.trailTimer = 0;

    // Mecânicas estilo Mamoball
    this.stamina = 100;
    this.maxStamina = 100;
    this.staminaRegen = 25; // por segundo
    this.dashCost = 45;
    this.isDashing = false;
    this.dashTimer = 0;

    this._home = { x, y };
    // Tenta carregar sprite externo por time (game/assets/players/<team>.png)
    this.playerSprite = null;
    this.spriteFrameW = 0;
    this.spriteFrameH = 0;
    this.spriteFrames = 3;
    if (this.teamName) {
      try {
        const slug = String(this.teamName).toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const img = new Image();
        // Prioridade para a pasta de fotos do usuário
        img.src = `game/fotos/${slug}.png`;
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          // assume sprite-sheet horizontal with `spriteFrames` frames
          this.playerSprite = img;
          this.spriteFrameW = Math.floor(img.naturalWidth / this.spriteFrames);
          this.spriteFrameH = img.naturalHeight;
        };
        img.onerror = () => {
          // Segundo fallback: pasta antiga /assets/players
          const legacy = new Image();
          legacy.src = `game/assets/players/${slug}.png`;
          legacy.crossOrigin = 'anonymous';
          legacy.onload = () => {
            this.playerSprite = legacy;
            this.spriteFrameW = Math.floor(legacy.naturalWidth / this.spriteFrames);
            this.spriteFrameH = legacy.naturalHeight;
          };
          legacy.onerror = () => {
            // fallback procedural
            try {
              this.playerSprite = createPlayerSprite(this.colors, this.id);
              this.spriteFrameW = this.playerSprite.width / 3;
              this.spriteFrameH = this.playerSprite.height;
            } catch (e) {
              this.playerSprite = null;
            }
          };
        };
      } catch (e) {
        try {
          this.playerSprite = createPlayerSprite(this.colors, this.id);
          this.spriteFrameW = this.playerSprite.width / 3;
          this.spriteFrameH = this.playerSprite.height;
        } catch (ex) {
          this.playerSprite = null;
        }
      }
    } else {
      try {
        this.playerSprite = createPlayerSprite(this.colors, this.id);
        this.spriteFrameW = this.playerSprite.width / 3;
        this.spriteFrameH = this.playerSprite.height;
      } catch (e) {
        this.playerSprite = null;
      }
    }
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

      // Impulso fixo para TODOS os botões — sem vantagem por time
      const impulse = rand(170, 290);
      this.vx += Math.cos(this.wanderDrift) * impulse;
      this.vy += Math.sin(this.wanderDrift) * impulse;
      return;
    }

    this.wanderTimer = rand(0.12, 0.5);
    this.wanderDrift += rand(-1.35, 1.35);

    // Impulso fixo para TODOS os botões — sem vantagem por time
    const impulse = rand(72, 150);
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

    // Regeneração de stamina
    this.dashCost = activePower?.type === 'drain' ? 65 : 45;
    if (this.stamina < this.maxStamina) {
      const regen = activePower?.type === 'drain' ? this.staminaRegen * 0.35 : this.staminaRegen;
      this.stamina = Math.min(this.maxStamina, this.stamina + regen * dt);
    }

    if (activePower?.type === 'drain') {
      this.stamina = Math.max(0, this.stamina - 18 * dt);
    }

    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      if (this.dashTimer <= 0) this.isDashing = false;
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

    const maxSpeed = activePower?.type === 'boost' ? 520 : 380;
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
    
    if (activePower?.type === 'drain') mult *= 0.5;          
    if (activePower?.type === 'swamp') mult *= 0.75;        
    if (activePower?.type === 'webSlowdown') mult *= 0.65;  
    if (activePower?.type === 'smoke') mult *= 0.85;
    if (activePower?.type === 'blur') mult *= 0.8;
    if (activePower?.type === 'confuse') mult *= 0.85;
    if (activePower?.type === 'gravity') mult *= 0.92;

    const base = pull * 5.5 * this.stats.power;
    return clamp(base * mult, 0, 1600);
  }

  applyAimAssist(dir, activePower, distanceToGoal = 500, shotPower = 0.5) {
    let error = 0.015;
    if (activePower?.type === 'precision') error = 0;    
    if (activePower?.type === 'blur') error *= 5.0;          
    if (activePower?.type === 'confuse') error *= 4.5;       
    if (activePower?.type === 'reverse') error *= 2.0;       
    if (activePower?.type === 'smoke') error *= 6.0; 
    
    // Distance-aware: closer to goal = higher precision
    const distanceFactor = Math.max(0.5, 1 - distanceToGoal / 700);
    error *= distanceFactor;
    
    // Power-scaled: higher power = lower precision (harder to control)
    const powerFactor = 0.7 + Math.min(1, shotPower) * 0.3;
    error *= powerFactor;

    const angle = Math.atan2(dir.y, dir.x);
    
    let jitter = (Math.random() * 2 - 1) * error;
    if (activePower?.type === 'curve') jitter += (Math.random() > 0.5 ? 0.15 : -0.15);
    if (activePower?.type === 'spinner') jitter += (Math.random() > 0.5 ? 0.32 : -0.32);
    if (activePower?.type === 'confuse' && Math.random() < 0.35) {
      jitter += (Math.random() > 0.5 ? 0.22 : -0.22);
    }
    
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
    this.botDribbleAt = 0;
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
      powershot: 'rgba(191,0,255,0.45)',
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

    // 2. Desenha sprite do jogador (se disponível) ao invés do corpo circular
    if (this.playerSprite) {
      const speed = Math.hypot(this.vx, this.vy);
      const t = performance.now();
      const frames = 3;
      const base = (t / 180) + (speed / 120);
      const fi = Math.floor(base) % frames;
      const sx = fi * this.spriteFrameW;
      const sy = 0;
      const dw = this.spriteFrameW * 0.78;
      const dh = this.spriteFrameH * 0.78;
      ctx.drawImage(this.playerSprite, sx, sy, this.spriteFrameW, this.spriteFrameH, this.x - dw / 2, this.y - dh / 2 - 6, dw, dh);
    } else {
      // Fallback para desenho circular existente
      const [c1, c2] = this.colors;
      ctx.save();
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowOffsetX = this.vx * 0.01;
      ctx.shadowOffsetY = this.vy * 0.01 + 6;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(this.x, this.y + 2, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();

      const isPowerShot = activePower?.type === 'powershot';
      const grad = ctx.createRadialGradient(
        this.x - this.radius * 0.4, this.y - this.radius * 0.4, 2,
        this.x, this.y, this.radius
      );
      if (isPowerShot) {
        grad.addColorStop(0, '#efc9ff');
        grad.addColorStop(0.5, '#bf00ff');
        grad.addColorStop(1, '#660088');
      } else {
        grad.addColorStop(0, this.colors[0]);
        grad.addColorStop(1, this.colors[1]);
      }
      grad.addColorStop(1, 'rgba(0,0,0,0.2)');

      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.ellipse(this.x - this.radius * 0.35, this.y - this.radius * 0.35, this.radius * 0.45, this.radius * 0.25, Math.PI * 0.25, 0, Math.PI * 2);
      const gloss = ctx.createLinearGradient(this.x - this.radius, this.y - this.radius, this.x, this.y);
      gloss.addColorStop(0, 'rgba(255,255,255,0.45)');
      gloss.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gloss;
      ctx.fill();
      ctx.restore();

      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(10,16,30,0.6)';
      ctx.fill();
    }

    // Desenha a bandeira do time no topo do botão
    if (this.team) {
      ctx.save();
      ctx.font = 'bold 16px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.95;
      ctx.fillText(this.team, this.x, this.y - 1);
      ctx.restore();
    }

    // Indicador de Jogador (J1/J2) e Barra de Stamina
    this.renderPlayerInfo(ctx);
  }

  renderPlayerInfo(ctx) {
    const t = performance.now() / 1000;
    
    ctx.save();

    // Label J1/J2
    ctx.font = 'bold 12px "Outfit", "Inter", sans-serif';
    ctx.textAlign = 'center';
    
    // Sombra do texto
    ctx.shadowBlur = 4;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    
    const label = this.playerId === 0 ? 'J1' : 'J2';
    const labelColor = this.playerId === 0 ? '#00a8ff' : '#ff3b30';
    
    ctx.fillStyle = labelColor;
    ctx.fillText(label, this.x, this.y - this.radius - 15);
    
    // Nome do time (Bandeira já está no centro, mas vamos reforçar a identidade)
    ctx.font = '900 8px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    // ctx.fillText(this.team, this.x, this.y + this.radius + 20);

    // Barra de Stamina (Fôlego) - Estilo Mamoball
    const barW = 32;
    const barH = 4;
    const bx = this.x - barW / 2;
    const by = this.y - this.radius - 10;

    // Fundo da barra
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, barW, barH, 2);
    else ctx.rect(bx, by, barW, barH);
    ctx.fill();

    // Progresso da stamina
    if (this.stamina > 0) {
      const pct = this.stamina / this.maxStamina;
      const grad = ctx.createLinearGradient(bx, by, bx + barW, by);
      
      if (pct < 0.3) {
        grad.addColorStop(0, '#ff3b30');
        grad.addColorStop(1, '#ff7a18');
      } else {
        grad.addColorStop(0, '#00ff88');
        grad.addColorStop(1, '#00a8ff');
      }
      
      ctx.fillStyle = grad;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, by, barW * pct, barH, 2);
      else ctx.rect(bx, by, barW * pct, barH);
      ctx.fill();
    }

    ctx.restore();
  }
}

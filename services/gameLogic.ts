

import { EntityType, PowerupType, Stats } from '../types';
import { ASSETS, GAME_CONFIG, COLORS } from '../constants';
import { audioService } from './audioService';

// --- Helper Classes ---

export class Entity {
  id: string;
  type: EntityType;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  markedForDeletion: boolean = false;
  color: string;
  
  // Specific props
  hp: number = 1;
  maxHp: number = 1;
  text?: string; 
  angle: number = 0;
  
  // Lifecycle props
  life: number = 0;
  maxLife: number = 0;

  // Boss Props
  attackTimer: number = 0;
  isCharging: boolean = false;
  isBeam: boolean = false; 
  beamAnchorOffsetX: number | null = null;

  // Missile Props
  isMissile: boolean = false;

  // Projectile Ownership
  isPlayerShot: boolean = false;
  variant: number = 0;
  
  constructor(type: EntityType, x: number, y: number) {
    this.id = Math.random().toString(36).substr(2, 9);
    this.type = type;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.color = '#FFF';
    this.width = 30;
    this.height = 30;
  }
}

export class Particle extends Entity {
  constructor(x: number, y: number, color: string, speed: number) {
    super(EntityType.PARTICLE, x, y);
    this.width = 4;
    this.height = 4;
    this.color = color;
    const angle = Math.random() * Math.PI * 2;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = 40 + Math.random() * 20;
    this.maxLife = this.life;
  }
}

export class VisualEffect extends Entity {
  effectType: 'text' | 'ring';
  constructor(x: number, y: number, type: 'text' | 'ring', content: string = '', color: string = '#FFF') {
    super(EntityType.EFFECT, x, y);
    this.effectType = type;
    this.text = content;
    this.color = color;
    this.life = 60;
    this.maxLife = 60;
    
    if (type === 'text') {
        this.vy = -0.5;
        this.life = 120;
        this.maxLife = 120;
    }
  }
}

class Star {
  x: number;
  y: number;
  size: number;
  speed: number;
  alpha: number;
  twinkleDir: number;
  drift: number;

  constructor(width: number, height: number) {
    const depth = Math.random();
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    this.size = 0.6 + (depth * 2.4);
    this.speed = 0.08 + (depth * 1.35);
    this.alpha = 0.2 + (depth * 0.7);
    this.twinkleDir = (Math.random() > 0.5 ? 1 : -1) * (0.003 + (depth * 0.01));
    this.drift = -0.02 - (depth * 0.12);
  }

  update(width: number, height: number) {
    this.y += this.speed;
    this.x += this.drift;

    // Twinkle effect
    this.alpha += this.twinkleDir;
    if (this.alpha > 1) {
       this.alpha = 1;
       this.twinkleDir *= -1;
    } else if (this.alpha < 0.2) {
       this.alpha = 0.2;
       this.twinkleDir *= -1;
    }

    if (this.y > height) {
      this.y = 0;
      this.x = Math.random() * width;
    }
    if (this.x < 0) {
      this.x = width;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = `rgba(226, 244, 255, ${this.alpha})`;
    ctx.fillRect(this.x, this.y, this.size, this.size);
  }
}

class BackgroundEntity {
  x: number;
  y: number;
  size: number;
  color: string;
  speed: number;
  type: 'planet' | 'nebula';

  constructor(width: number, height: number) {
    this.type = Math.random() > 0.3 ? 'planet' : 'nebula';
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    
    if (this.type === 'planet') {
      this.size = 50 + Math.random() * 100;
      this.speed = 0.2 + Math.random() * 0.3; 
      const hues = [240, 260, 280, 200];
      const hue = hues[Math.floor(Math.random() * hues.length)];
      this.color = `hsl(${hue}, 40%, 20%)`; 
    } else {
      this.size = 200 + Math.random() * 300;
      this.speed = 0.1;
      this.color = `rgba(${Math.floor(Math.random()*50)}, ${Math.floor(Math.random()*20)}, ${Math.floor(Math.random()*80) + 50}, 0.1)`;
    }
  }

  update(height: number) {
    this.y += this.speed;
    if (this.y > height + this.size) {
      this.y = -this.size * 2;
      this.x = Math.random() * 1000;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalAlpha = 0.2; 

    if (this.type === 'planet') {
      const gradient = ctx.createRadialGradient(this.x, this.y, this.size * 0.2, this.x, this.y, this.size);
      gradient.addColorStop(0, this.color);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.arc(this.x - this.size*0.3, this.y - this.size*0.3, this.size, 0, Math.PI * 2);
      ctx.fill();

    } else {
      const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size);
      gradient.addColorStop(0, this.color);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(this.x - this.size, this.y - this.size, this.size*2, this.size*2);
    }
    ctx.restore();
  }
}

const imageCache: Record<string, HTMLImageElement> = {};
const loadImage = (url: string) => {
  if (imageCache[url]) return imageCache[url];
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  imageCache[url] = img;
  return img;
};

const getReadyImage = (url: string) => {
  const img = imageCache[url];
  if (!img || !img.complete || img.naturalWidth <= 0) {
    return null;
  }
  return img;
};

type BossWarningType = 'mini1' | 'wall' | 'asteroid' | 'gatekeeper';

export class GameEngine {
  width: number = 0;
  height: number = 0;
  player: Entity;
  entities: Entity[] = [];
  bgEntities: BackgroundEntity[] = [];
  stars: Star[] = [];
  stats: Stats;
  keys: Record<string, boolean> = {};
  touchPos: { x: number, y: number } | null = null;
  wave: number = 1;
  frameCount: number = 0;
  bgY: number = 0;
  gameActive: boolean = false;
  lives: number = GAME_CONFIG.PLAYER_LIVES;
  invincibleTimer: number = 0;
  activePowerups: Map<PowerupType, number> = new Map();
  bossRef: Entity | null = null;
  miniBossRef: Entity | null = null;
  spawnedMiniBoss1: boolean = false;
  spawnedWallBoss: boolean = false;
  mainBossDefeated: boolean = false;
  asteroidBeltMaxCount: number = 0;
  invaderDirection: number = 1;
  invaderMoveTimer: number = 0;
  waveProgressFrames: number = 0;
  inBossWarningSequence: boolean = false;
  bossWarningFrame: number = 0;
  bossWarningDuration: number = 0;
  pendingBossType: BossWarningType | null = null;
  missileTimer: number = 0;
  
  constructor(stats: Stats) {
    this.stats = stats;
    this.player = new Entity(EntityType.PLAYER, 0, 0);
    this.player.width = 100;
    this.player.height = 100; 
    
    [
      ASSETS.PLAYER_SHIP,
      ASSETS.FOUNDER_BRIAN,
      ASSETS.FOUNDER_PATRICK,
      ASSETS.FOUNDER_JEFFREY,
      ASSETS.FOUNDER_4,
      ASSETS.FOUNDER_ARSHIA,
      ASSETS.RSC_TOKEN,
      ASSETS.GAME_BG_BACK,
      ASSETS.GAME_BG_STARS,
      ASSETS.GAME_BG_PLANET,
      ASSETS.GAME_PARALLAX_BACK,
      ASSETS.GAME_PARALLAX_STARS,
      ASSETS.GAME_PARALLAX_FAR_PLANETS,
      ASSETS.GAME_PARALLAX_BIG_PLANET,
      ASSETS.GAME_PARALLAX_RING_PLANET,
      ASSETS.ENEMY_JOURNAL,
      ASSETS.MINI_BOSS,
      ASSETS.WALL_BOSS_SEGMENT,
      ASSETS.FINAL_BOSS,
      ...ASSETS.ENEMY_DRONE_FRAMES,
      ...ASSETS.ENEMY_SWARM_FRAMES,
      ...ASSETS.ENEMY_BRICK_FRAMES
    ].forEach(loadImage);
  }

  getAnimatedFrame(frames: string[], entity: Entity, speed: number) {
    const index = (Math.floor(this.frameCount / speed) + entity.variant) % frames.length;
    return frames[index];
  }

  drawSprite(
    ctx: CanvasRenderingContext2D,
    url: string,
    width: number,
    height: number,
    options: {
      shadowColor?: string;
      shadowBlur?: number;
      rotation?: number;
      alpha?: number;
      yOffset?: number;
    } = {}
  ) {
    const img = getReadyImage(url);
    if (!img) {
      return false;
    }

    ctx.save();
    ctx.globalAlpha = options.alpha ?? 1;
    if (options.shadowColor) ctx.shadowColor = options.shadowColor;
    if (options.shadowBlur) ctx.shadowBlur = options.shadowBlur;
    if (options.rotation) ctx.rotate(options.rotation);
    const yOffset = options.yOffset ?? 0;
    ctx.drawImage(img, -width / 2, -height / 2 + yOffset, width, height);
    ctx.restore();
    return true;
  }

  drawTiledLayer(
    ctx: CanvasRenderingContext2D,
    url: string,
    scale: number,
    speedY: number,
    speedX: number,
    alpha: number
  ) {
    const img = getReadyImage(url);
    if (!img) {
      return;
    }

    const tileW = img.width * scale;
    const tileH = img.height * scale;
    const offsetY = -((this.frameCount * speedY) % tileH);
    const offsetX = -((this.frameCount * speedX) % tileW);

    ctx.save();
    ctx.globalAlpha = alpha;
    for (let x = offsetX - tileW; x < this.width + tileW; x += tileW) {
      for (let y = offsetY - tileH; y < this.height + tileH; y += tileH) {
        ctx.drawImage(img, x, y, tileW, tileH);
      }
    }
    ctx.restore();
  }

  drawBackgroundLayers(ctx: CanvasRenderingContext2D) {
    this.drawTiledLayer(ctx, ASSETS.GAME_PARALLAX_BACK, 5, 0.06, 0.015, 0.6);
    this.drawTiledLayer(ctx, ASSETS.GAME_PARALLAX_STARS, 5, 0.1, 0.02, 0.45);
    this.drawTiledLayer(ctx, ASSETS.GAME_BG_BACK, 5, 0.16, 0.03, 0.35);
    this.drawTiledLayer(ctx, ASSETS.GAME_BG_STARS, 5, 0.22, 0.035, 0.5);
    this.drawTiledLayer(ctx, ASSETS.GAME_PARALLAX_FAR_PLANETS, 5, 0.12, 0.02, 0.35);

    ctx.save();
    ctx.globalAlpha = 0.9;
    const horizon = getReadyImage(ASSETS.GAME_BG_PLANET);
    if (horizon) {
      const planetHeight = Math.max(220, this.height * 0.3);
      ctx.drawImage(horizon, 0, this.height - planetHeight, this.width, planetHeight);
    }
    ctx.restore();

    const planetDrift = (this.frameCount * 0.2) % (this.width + 200);
    ctx.save();
    ctx.translate(this.width - 130, 110 + Math.sin(this.frameCount * 0.01) * 10);
    this.drawSprite(ctx, ASSETS.GAME_PARALLAX_BIG_PLANET, 170, 170, { alpha: 0.55 });
    ctx.restore();

    ctx.save();
    ctx.translate((this.width + 100) - planetDrift, 180 + Math.sin(this.frameCount * 0.015) * 12);
    this.drawSprite(ctx, ASSETS.GAME_PARALLAX_RING_PLANET, 90, 180, { alpha: 0.75 });
    ctx.restore();
  }

  init(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.player.x = width / 2 - 50;
    this.player.y = height - 150;
    this.entities = [];
    this.bgEntities = [];
    this.stars = [];

    for (let i = 0; i < 4; i++) {
        this.bgEntities.push(new BackgroundEntity(width, height));
    }
    for (let i = 0; i < 180; i++) {
      this.stars.push(new Star(width, height));
    }

    this.gameActive = true;
    this.lives = GAME_CONFIG.PLAYER_LIVES;
    this.stats.lives = this.lives;
    this.wave = 1;
    this.stats.score = 0;
    this.stats.coins = 0;
    this.stats.totalCoins = 0;
    this.stats.wave = 1;
    this.resetWaveProgress();
    this.spawnFloatingText(this.width/2, this.height/2, "WAVE 1", "#FFF");
    this.bossRef = null;
    this.miniBossRef = null;
    this.activePowerups.clear();
    this.frameCount = 0;
    this.missileTimer = 0;
    
    // START MUSIC
    audioService.startMusic();
  }
  
  resetWaveProgress() {
    this.stats.bossProgress = 0;
    this.stats.isBossActive = false;
    this.stats.bossHp = 0;
    this.stats.bossMaxHp = 100;
    this.waveProgressFrames = 0;
    this.bossRef = null;
    this.miniBossRef = null;
    this.spawnedMiniBoss1 = false;
    this.spawnedWallBoss = false;
    this.mainBossDefeated = false;
    this.asteroidBeltMaxCount = 0;
    this.inBossWarningSequence = false;
    this.bossWarningDuration = 0;
    this.pendingBossType = null;
  }

  getPlayerMovementBounds() {
    return {
      minX: -this.player.width / 2,
      maxX: this.width - (this.player.width / 2),
      minY: -this.player.height / 2,
      maxY: this.height - (this.player.height / 2)
    };
  }

  startNextWave() {
    this.wave++;
    this.stats.wave++;
    this.resetWaveProgress();
    this.entities = this.entities.filter(e => e.type === EntityType.PLAYER || e.type === EntityType.PARTICLE || e.type === EntityType.POWERUP || e.type === EntityType.COIN);
    this.spawnFloatingText(this.width/2, this.height/2, `WAVE ${this.wave}`, "#FFF");
    audioService.playSound('powerup');
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.entities.forEach(e => {
        if (e.type === EntityType.PLAYER) {
            const bounds = this.getPlayerMovementBounds();
            e.x = Math.max(bounds.minX, Math.min(bounds.maxX, e.x));
            e.y = Math.max(bounds.minY, Math.min(bounds.maxY, e.y));
        }
    });
  }

  handleInput(keys: Record<string, boolean>, touchPos: { x: number, y: number } | null) {
    this.keys = keys;
    if (touchPos !== undefined) {
        this.touchPos = touchPos;
    }
  }

  startBossWarning(type: BossWarningType) {
    this.inBossWarningSequence = true;
    this.bossWarningDuration = type === 'gatekeeper' ? 300 : 40;
    this.bossWarningFrame = this.bossWarningDuration;
    this.pendingBossType = type;
    if (type === 'gatekeeper') {
      this.clearThreatsForMainBoss();
    }
    audioService.playSound('boss_roar');
  }

  clearThreatsForMainBoss() {
    this.entities = this.entities.filter((entity) => (
      entity.type === EntityType.COIN
      || entity.type === EntityType.POWERUP
      || entity.type === EntityType.PARTICLE
      || entity.type === EntityType.EFFECT
    ));
  }

  getSecondSubBossType(): BossWarningType {
    return this.wave % 2 === 0 ? 'asteroid' : 'wall';
  }

  getAsteroidBeltCount() {
    return this.entities.filter((entity) => (
      entity.type === EntityType.ENEMY_BRICK && entity.variant >= 900
    )).length;
  }

  update() {
    if (!this.gameActive) return;
    this.frameCount++;
    this.stats.lives = this.lives;
    
    const invaderCount = this.entities.filter(e => e.type === EntityType.ENEMY_INVADER).length;
    const asteroidBeltCount = this.getAsteroidBeltCount();
    const isBossAlive = !!this.bossRef || !!this.miniBossRef || invaderCount > 0 || asteroidBeltCount > 0;
    
    if (isBossAlive) {
        this.stats.isBossActive = true;
        let hp = 0;
        let maxHp = 100;

        if (this.bossRef) {
            hp = this.bossRef.hp;
            maxHp = this.bossRef.maxHp;
        } else if (this.miniBossRef) {
            hp = this.miniBossRef.hp;
            maxHp = this.miniBossRef.maxHp;
        } else if (invaderCount > 0) {
            hp = invaderCount; 
            maxHp = 12; // 2 rows * 6 cols = 12
        } else if (asteroidBeltCount > 0) {
            hp = asteroidBeltCount;
            maxHp = this.asteroidBeltMaxCount || asteroidBeltCount;
        }
        
        this.stats.bossHp = hp;
        this.stats.bossMaxHp = maxHp;
        if (invaderCount > 0) this.updateWallBoss();

    } else {
        this.stats.isBossActive = false;

        // Progress bar logic
        if (!this.inBossWarningSequence) {
             this.waveProgressFrames++;
             const totalDuration = GAME_CONFIG.WAVE_DURATION_FRAMES;
             this.stats.bossProgress = Math.min(1, this.waveProgressFrames / totalDuration);
        }
        
        // CHECKPOINT 1: 33% (Mini Boss 1 - Bottleneck)
        if (this.stats.bossProgress >= 0.33 && !this.spawnedMiniBoss1) {
             if (!this.inBossWarningSequence) {
                 this.startBossWarning('mini1');
             }
        }
        // CHECKPOINT 2: 66% (Mini Boss 2 - The Wall)
        else if (this.stats.bossProgress >= 0.66 && !this.spawnedWallBoss) {
             if (!this.inBossWarningSequence) {
                 this.startBossWarning(this.getSecondSubBossType());
             }
        }
        // CHECKPOINT 3: 100% (Final Boss)
        else if (this.stats.bossProgress >= 1 && !this.bossRef && !this.mainBossDefeated) {
             if (!this.inBossWarningSequence) {
                 this.startBossWarning('gatekeeper');
             }
        }
    }
    
    if (this.inBossWarningSequence) {
        this.bossWarningFrame--;
        if (this.bossWarningFrame <= 0) {
            this.inBossWarningSequence = false;
            
            if (this.pendingBossType === 'mini1') {
                this.spawnMiniBoss(1);
                this.spawnedMiniBoss1 = true;
            } else if (this.pendingBossType === 'wall') {
                this.spawnWallBoss();
                this.spawnedWallBoss = true;
            } else if (this.pendingBossType === 'asteroid') {
                this.spawnAsteroidBelt();
                this.spawnedWallBoss = true;
            } else if (this.pendingBossType === 'gatekeeper') {
                this.spawnBoss();
            }
            this.pendingBossType = null;
        }
    }

    this.stars.forEach(star => star.update(this.width, this.height));
    this.bgEntities.forEach(bg => bg.update(this.height));

    const speed = GAME_CONFIG.BASE_PLAYER_SPEED + (this.stats.upgrades.speed * 1.5);
    
    if (this.touchPos) {
      // SMOOTHING FOR MOBILE: 
      // Base: 0.04 (Heavy/Slow)
      // Per Level: +0.025
      // Level 5: 0.165 (Snappy but controlled)
      const smoothing = 0.04 + (this.stats.upgrades.speed * 0.025);
      
      const dx = this.touchPos.x - (this.player.x + this.player.width/2);
      const dy = this.touchPos.y - 80 - (this.player.y + this.player.height/2);
      this.player.x += dx * smoothing;
      this.player.y += dy * smoothing;
    } else {
      if (this.keys['ArrowLeft'] || this.keys['a'] || this.keys['A']) this.player.x -= speed;
      if (this.keys['ArrowRight'] || this.keys['d'] || this.keys['D']) this.player.x += speed;
      if (this.keys['ArrowUp'] || this.keys['w'] || this.keys['W']) this.player.y -= speed;
      if (this.keys['ArrowDown'] || this.keys['s'] || this.keys['S']) this.player.y += speed;
    }

    const bounds = this.getPlayerMovementBounds();
    this.player.x = Math.max(bounds.minX, Math.min(bounds.maxX, this.player.x));
    this.player.y = Math.max(bounds.minY, Math.min(bounds.maxY, this.player.y));

    // FIRE RATE PROGRESSION: Spaced out for distinct feeling
    // Level 0: 15 (4 shots/sec)
    // Level 1: 12 (5 shots/sec)
    // Level 2: 10 (6 shots/sec)
    // Level 3: 8 (7.5 shots/sec)
    // Level 4: 6 (10 shots/sec)
    // Level 5: 5 (12 shots/sec)
    const fireRates = [15, 12, 10, 8, 6, 5];
    const level = Math.min(this.stats.upgrades.fireRate, 5);
    const fireInterval = fireRates[level] || 5;
    
    if ((this.keys[' '] || this.touchPos || this.keys['Enter']) && this.frameCount % fireInterval === 0) {
      this.fireBullet();
    }
    
    // Missile Logic
    if (this.stats.upgrades.missile > 0) {
        this.missileTimer--;
        const cooldown = 180 - (this.stats.upgrades.missile * 20); // 3s down to ~1.3s
        if (this.missileTimer <= 0) {
            this.fireMissile();
            this.missileTimer = cooldown;
        }
    }

    for (const [type, timer] of this.activePowerups) {
        if (timer > 0) this.activePowerups.set(type, timer - 1);
        else this.activePowerups.delete(type);
    }
    
    if (this.invincibleTimer > 0) this.invincibleTimer--;

    this.spawnEnemies();

    this.entities.forEach(e => {
      if (e.isBeam) {
          e.life--;
          if (e.life <= 0) e.markedForDeletion = true;
          if (this.bossRef) {
              const anchorX = e.beamAnchorOffsetX ?? (this.bossRef.width / 2 - e.width / 2);
              e.x = Math.max(0, Math.min(this.width - e.width, this.bossRef.x + anchorX));
              e.y = this.bossRef.y + this.bossRef.height - 20;
          } else {
              e.markedForDeletion = true;
          }
          return;
      }

      e.x += e.vx;
      e.y += e.vy;
      
      if (e.type === EntityType.MISSILE) {
          // Homing Logic
          // Find nearest enemy
          let nearest: Entity | null = null;
          let minDist = 1000;
          
          this.entities.forEach(target => {
              if (target.type === EntityType.ENEMY_DRONE || target.type === EntityType.ENEMY_BRICK || target.type === EntityType.ENEMY_JOURNAL || target.type === EntityType.ENEMY_SWARM || target.type === EntityType.MINI_BOSS || target.type === EntityType.BOSS || target.type === EntityType.ENEMY_INVADER) {
                  const dx = target.x - e.x;
                  const dy = target.y - e.y;
                  const dist = Math.sqrt(dx*dx + dy*dy);
                  if (dist < minDist && target.y > 0) {
                      minDist = dist;
                      nearest = target;
                  }
              }
          });
          
          if (nearest) {
              const target = nearest as Entity;
              const dx = (target.x + target.width/2) - (e.x + e.width/2);
              const dy = (target.y + target.height/2) - (e.y + e.height/2);
              const angle = Math.atan2(dy, dx);
              
              // Homing steering
              const isMaxLevel = e.color === '#ff0055';
              const speed = isMaxLevel ? 14 : 9; // Faster if max (was 12)
              const turnRate = isMaxLevel ? 3.5 : 1.5; // Very aggressive if max (was 2.5), better base (was 1.2)

              e.vx += Math.cos(angle) * turnRate;
              e.vy += Math.sin(angle) * turnRate;
              
              // Normalize velocity
              const vel = Math.sqrt(e.vx*e.vx + e.vy*e.vy);
              if (vel > speed) {
                  e.vx = (e.vx/vel) * speed;
                  e.vy = (e.vy/vel) * speed;
              }
          }
          
          // Spawn trail - Use missile color
          if (this.frameCount % 4 === 0) {
              this.entities.push(new Particle(e.x + e.width/2, e.y + e.height, e.color, 1));
          }
          
          if (e.y < -50 || e.y > this.height + 50 || e.x < -50 || e.x > this.width + 50) e.markedForDeletion = true;
      }

      if (e.type === EntityType.ENEMY_DRONE || e.type === EntityType.ENEMY_JOURNAL || e.type === EntityType.ENEMY_SWARM || e.type === EntityType.ENEMY_BRICK) {
        if (e.type === EntityType.ENEMY_SWARM) {
          const dx = this.player.x - e.x;
          e.vx += dx * 0.002;
          e.vx *= 0.95; 
        }
        if (e.type === EntityType.ENEMY_BRICK && e.variant >= 900) {
          e.x += Math.sin((this.frameCount + e.variant) * 0.025) * (0.55 + (this.wave * 0.12));
        }
        if (e.y > this.height) e.markedForDeletion = true;
      }
      
      if (e.type === EntityType.PROJECTILE) {
        if (e.y < -50 || e.y > this.height + 50) e.markedForDeletion = true;
      }

      if (e.type === EntityType.PARTICLE) {
        (e as Particle).life--;
        if ((e as Particle).life <= 0) e.markedForDeletion = true;
      }
      
      if (e.type === EntityType.EFFECT) {
          (e as VisualEffect).life--;
          if ((e as VisualEffect).life <= 0) e.markedForDeletion = true;
      }
      
      if (e.type === EntityType.COIN) {
        if (this.activePowerups.has(PowerupType.MAGNET)) {
           const dx = this.player.x - e.x;
           const dy = this.player.y - e.y;
           const dist = Math.sqrt(dx*dx + dy*dy);
           if (dist < 400) {
             e.x += dx * 0.08;
             e.y += dy * 0.08;
           }
        }
        if (e.y > this.height) e.markedForDeletion = true;
      }
      
      if (e.type === EntityType.POWERUP) {
          e.y += Math.sin(this.frameCount * 0.05) * 0.5;
          if (e.y > this.height) e.markedForDeletion = true;
      }

      if (e.type === EntityType.BOSS) {
        this.updateBoss(e);
      }
      if (e.type === EntityType.MINI_BOSS) {
        this.updateMiniBoss(e);
      }
    });

    this.checkCollisions();
    this.entities = this.entities.filter(e => !e.markedForDeletion);
    this.bgY = (this.bgY + 1) % this.height;
  }

  fireBullet() {
    audioService.playSound('shoot');
    const isMaxFire = this.stats.upgrades.fireRate >= 5;
    const bulletColor = isMaxFire ? '#00FFFF' : '#6c63ff'; // Cyan glow for max

    const spawnBullet = (vx: number, vy: number, offsetX: number = 0) => {
      const b = new Entity(EntityType.PROJECTILE, this.player.x + this.player.width / 2 - 5 + offsetX, this.player.y);
      b.width = 12;
      b.height = 12;
      b.vx = vx;
      b.vy = vy;
      b.color = bulletColor;
      b.isPlayerShot = true; // Mark as player shot so it doesn't hurt self
      this.entities.push(b);
    };

    let shotFired = false;
    if (this.activePowerups.has(PowerupType.TRIPLE_SHOT)) {
      spawnBullet(0, -10);      
      spawnBullet(-4, -9, -15);      
      spawnBullet(4, -9, 15);       
      shotFired = true;
    } 
    
    if (this.activePowerups.has(PowerupType.DOUBLE_SHOT)) {
      spawnBullet(0, -10, -20); 
      spawnBullet(0, -10, 20);  
      shotFired = true;
    }
    
    if (!shotFired) {
      spawnBullet(0, -10);
    }
  }
  
  fireMissile() {
      // Check if max level (5)
      const isMaxLevel = this.stats.upgrades.missile >= 5;
      
      const m = new Entity(EntityType.MISSILE, this.player.x + this.player.width/2 - 5, this.player.y);
      m.width = 10;
      m.height = 20;
      m.isMissile = true;
      m.vy = -4; // Initial velocity up
      
      // Max level is Neon Pink/Red, Standard is Cyan
      m.color = isMaxLevel ? '#ff0055' : '#00ffff'; 
      
      m.isPlayerShot = true; // Mark as player shot
      this.entities.push(m);
      audioService.playSound('shoot'); // Ideally a missile sound
  }

  spawnEnemies() {
    const invaderCount = this.entities.filter(e => e.type === EntityType.ENEMY_INVADER).length;
    const asteroidBeltCount = this.getAsteroidBeltCount();
    if (this.bossRef || this.miniBossRef || invaderCount > 0 || asteroidBeltCount > 0 || this.inBossWarningSequence) return;

    // Make rarer: 1800 -> 2400
    if (this.frameCount % 2400 === 0) {
        this.spawnPowerup(Math.random() * (this.width - 40), -40);
    }

    const currentRate = Math.max(25, GAME_CONFIG.BASE_SPAWN_RATE - ((this.wave - 1) * 10));

    if (this.frameCount % currentRate === 0) {
      const typeRoll = Math.random();
      const x = Math.random() * (this.width - 40);
      let enemyType = EntityType.ENEMY_DRONE;
      
      if (this.stats.bossProgress < 0.3) {
        if (typeRoll > 0.7) enemyType = EntityType.ENEMY_SWARM;
      } else if (this.stats.bossProgress < 0.7) {
        if (typeRoll > 0.8) enemyType = EntityType.ENEMY_SWARM;
        else if (typeRoll > 0.5) enemyType = EntityType.ENEMY_BRICK;
      } else {
        if (typeRoll > 0.85) enemyType = EntityType.ENEMY_SWARM;
        else if (typeRoll > 0.6) enemyType = EntityType.ENEMY_BRICK;
        else if (typeRoll > 0.3) enemyType = EntityType.ENEMY_JOURNAL;
      }

      this.createEnemy(enemyType, x, -50);
    }
  }

  createEnemy(type: EntityType, x: number, y: number) {
    const e = new Entity(type, x, y);
    const hpMult = 1 + (this.wave * 0.3);
    const speedBoost = 1 + (this.wave * 0.1);
    e.variant = Math.floor(Math.random() * 100);
    
    if (type === EntityType.ENEMY_DRONE) {
      e.vy = 2.5 * speedBoost; 
      e.hp = 2 * hpMult;
      e.width = 44;
      e.height = 44;
      e.color = '#7dd3fc'; 
      e.text = "🔒"; 
    } else if (type === EntityType.ENEMY_JOURNAL) {
      e.vy = 4.4 * speedBoost; 
      e.vx = Math.sin((this.frameCount + e.variant) * 0.2) * 4; 
      e.hp = 3 * hpMult;
      e.color = '#fb7185'; 
      e.text = "📕"; 
      e.width = 56;
      e.height = 66;
    } else if (type === EntityType.ENEMY_BRICK) {
      e.vy = 1.5 * speedBoost;
      e.hp = 8 * hpMult;
      e.width = 54;
      e.height = 54;
      e.color = '#f59e0b'; 
      e.text = "📰";
    } else if (type === EntityType.ENEMY_SWARM) {
      e.vy = 3.5 * speedBoost;
      e.hp = 1 * hpMult;
      e.width = 34;
      e.height = 28;
      e.color = '#34d399'; 
      e.text = "🪰";
    } 

    e.maxHp = e.hp;
    this.entities.push(e);
  }

  spawnMiniBoss(num: number) {
    const mb = new Entity(EntityType.MINI_BOSS, this.width/2 - 50, -100);
    mb.width = 140;
    mb.height = 160;
    mb.hp = 45 + (this.wave * 25);
    mb.maxHp = mb.hp;
    mb.vy = 2;
    mb.color = '#fb7185';
    this.miniBossRef = mb;
    this.entities.push(mb);
  }
  
  spawnWallBoss() {
    const rows = 2; // UPDATED to 2 rows
    const cols = 6; 
    const isMobile = this.width < 600;
    const blockW = isMobile ? 42 : 52;
    const blockH = isMobile ? 50 : 60;
    const gap = 4;
    const startX = (this.width - ((blockW+gap)*cols))/2;
    
    for (let r=0; r<rows; r++) {
        for (let c=0; c<cols; c++) {
            const e = new Entity(EntityType.ENEMY_INVADER, startX + c*(blockW+gap), -200 + r*(blockH+gap));
            e.width = blockW;
            e.height = blockH;
            e.hp = Math.round(5 + (this.wave * 3.25));
            e.maxHp = e.hp;
            e.color = '#fb7185'; 
            e.text = "🧱"; // UPDATED to Brick Emoji
            e.variant = (r * cols) + c;
            e.vx = 0;
            this.entities.push(e);
        }
    }
    this.invaderDirection = 1; 
  }

  spawnAsteroidBelt() {
    const count = Math.min(18, 10 + (this.wave * 2));
    const lanes = Math.max(4, Math.min(7, Math.floor(this.width / 88)));
    const laneWidth = this.width / lanes;
    this.asteroidBeltMaxCount = count;

    for (let i = 0; i < count; i++) {
      const lane = i % lanes;
      const jitter = (Math.random() - 0.5) * laneWidth * 0.5;
      const size = 42 + Math.random() * 28 + (this.wave * 2);
      const asteroid = new Entity(
        EntityType.ENEMY_BRICK,
        Math.max(8, Math.min(this.width - size - 8, (lane * laneWidth) + (laneWidth / 2) - (size / 2) + jitter)),
        -140 - (Math.floor(i / lanes) * 72) - (Math.random() * 45)
      );

      asteroid.width = size;
      asteroid.height = size;
      asteroid.vy = 1.8 + (this.wave * 0.32) + (Math.random() * 0.45);
      asteroid.vx = (Math.random() - 0.5) * (0.45 + (this.wave * 0.08));
      asteroid.hp = Math.round(4 + (this.wave * 1.9));
      asteroid.maxHp = asteroid.hp;
      asteroid.variant = 900 + i;
      asteroid.color = '#f59e0b';
      this.entities.push(asteroid);
    }

    this.spawnFloatingText(this.width / 2, this.height * 0.24, 'ASTEROID BELT', '#fbbf24');
  }
  
  updateWallBoss() {
      const invaders = this.entities.filter(e => e.type === EntityType.ENEMY_INVADER);
      if (invaders.length === 0) return;
      
      let minY = 10000;
      invaders.forEach(inv => { if (inv.y < minY) minY = inv.y; });

      const isEntering = minY < 50;
      // SLOWER ENTRY FOR WAVE 1: 1.5 speed base
      const verticalSpeed = isEntering ? (1.5 + (this.wave - 1)) : 0; 
      
      let hitEdge = false;
      invaders.forEach(inv => {
          if (inv.x + inv.width > this.width - 10 && this.invaderDirection > 0) hitEdge = true;
          if (inv.x < 10 && this.invaderDirection < 0) hitEdge = true;
      });
      
      let moveX = this.invaderDirection * (2 + (this.wave * 0.3));
      let moveY = verticalSpeed;

      if (hitEdge && !isEntering) {
          this.invaderDirection *= -1;
          moveX = 0; 
          moveY += 15; 
      }
      
      invaders.forEach(inv => {
          inv.x += moveX;
          inv.y += moveY;
      });
      
      const shootRate = Math.max(8, 20 - this.wave);
      if (this.frameCount % shootRate === 0) { 
          const shooter = invaders[Math.floor(Math.random() * invaders.length)];
          const b = new Entity(EntityType.PROJECTILE, shooter.x + shooter.width/2, shooter.y + shooter.height);
          b.vx = 0;
          b.vy = 7 + (this.wave * 0.5);
          b.width = 14; 
          b.height = 14; 
          b.color = '#ff4444';
          // Solid projectile
          this.entities.push(b);
      }
  }

  updateMiniBoss(boss: Entity) {
     boss.attackTimer++;
     const targetX = this.player.x + this.player.width/2 - boss.width/2;
     const dx = targetX - boss.x;
     if (boss.y > 0) boss.x += dx * (0.03 + (this.wave * 0.005));

     if (boss.y < 100) boss.vy = 2;
     else {
        boss.vy = 0;
        boss.x += Math.sin(boss.attackTimer * 0.05) * 3;
     }
     
     boss.x = Math.max(0, Math.min(this.width - boss.width, boss.x));
     
     const shootRate = Math.max(30, 60 - (this.wave * 5));
     if (boss.attackTimer % shootRate === 0) {
        const b = new Entity(EntityType.PROJECTILE, boss.x + boss.width/2, boss.y + boss.height);
        b.vx = 0;
        b.vy = 5 + (this.wave * 0.5);
        b.width = 16; 
        b.height = 16; 
        b.color = '#ff0000';
        this.entities.push(b);
     }
  }

  spawnBoss() {
    const boss = new Entity(EntityType.BOSS, this.width / 2 - 100, -200);
    boss.width = 220;
    boss.height = 200;
    boss.hp = 220 + (this.stats.wave * 100);
    boss.maxHp = boss.hp;
    boss.variant = (this.stats.wave - 1) % 3;
    boss.color = '#990000';
    boss.text = "GATEKEEPER";
    boss.vy = 2;
    this.bossRef = boss;
    this.entities.push(boss);
  }

  getBossPulseCount(phase: number) {
    if (phase <= 1) return 1;
    if (phase === 2) return 2;
    if (phase === 3) return 3;
    return 4;
  }

  spawnBossBurst(boss: Entity, phase: number) {
    const cx = boss.x + boss.width / 2;
    const cy = boss.y + boss.height - 20;
    const px = this.player.x + this.player.width / 2;
    const py = this.player.y + this.player.height / 2;
    const angle = Math.atan2(py - cy, px - cx);
    const shotCount = phase <= 1 ? 3 : phase === 2 ? 5 : 7;
    const spread = phase <= 1 ? 0.2 : phase === 2 ? 0.18 : 0.16;
    const speed = Math.min(10.5, 6 + phase * 0.55);

    for (let i = 0; i < shotCount; i++) {
      const offset = i - ((shotCount - 1) / 2);
      const b = new Entity(EntityType.PROJECTILE, cx, cy);
      b.vx = Math.cos(angle + (offset * spread)) * speed;
      b.vy = Math.sin(angle + (offset * spread)) * speed;
      b.width = 15;
      b.height = 15;
      b.color = phase >= 3 ? '#ff7a18' : '#ff0000';
      b.text = "";
      this.entities.push(b);
    }

    if (phase >= 4) {
      [-0.32, 0.32].forEach(offset => {
        const b = new Entity(EntityType.PROJECTILE, cx + boss.width * offset, cy - 8);
        b.vx = offset * 2.2;
        b.vy = speed * 0.95;
        b.width = 13;
        b.height = 18;
        b.color = '#f97316';
        this.entities.push(b);
      });
    }
  }

  spawnBossBeam(boss: Entity, phase: number, pulseIndex: number) {
    const beamWidth = Math.min(118, 76 + (phase * 8));
    const bossCenterX = boss.x + boss.width / 2;
    const playerCenterX = this.player.x + this.player.width / 2;
    const playerNearEdge = playerCenterX < this.width * 0.18 || playerCenterX > this.width * 0.82;
    const aimStrength = Math.min(0.98, (phase <= 1 ? 0.5 : 0.66 + phase * 0.08) + (playerNearEdge ? 0.2 : 0));
    const baseAimX = bossCenterX + ((playerCenterX - bossCenterX) * aimStrength);
    const sweep = phase >= 3 && pulseIndex > 0
      ? (pulseIndex % 2 === 0 ? -1 : 1) * Math.min(56, phase * 16)
      : 0;
    const beamCenterX = Math.max(beamWidth / 2, Math.min(this.width - beamWidth / 2, baseAimX + sweep));
    const beam = new Entity(EntityType.PROJECTILE, beamCenterX - beamWidth / 2, boss.y + boss.height - 20);
    beam.isBeam = true;
    beam.width = beamWidth;
    beam.height = this.height;
    beam.life = phase <= 1 ? 68 : Math.max(18, 32 - phase * 3);
    beam.maxLife = beam.life;
    beam.color = phase >= 3 ? '#ff7a18' : '#ff0000';
    beam.beamAnchorOffsetX = beam.x - boss.x;
    this.entities.push(beam);

    audioService.playSound(pulseIndex === 0 ? 'boss_roar' : 'electricity');
  }

  updateBoss(boss: Entity) {
    boss.attackTimer++;
    const phase = Math.max(1, this.stats.wave);
    const speedMult = 1 + (phase * 0.1);
    const playerCenterX = this.player.x + this.player.width / 2;
    const playerNearEdge = playerCenterX < this.width * 0.18 || playerCenterX > this.width * 0.82;
    if (boss.y < 80) boss.vy = 2;
    else {
      boss.vy = 0;
      if (!boss.isCharging) {
          const hoverOffset = Math.sin(boss.attackTimer * 0.03) * (playerNearEdge ? 1.4 : 3);
          const edgeLead = playerNearEdge
            ? (playerCenterX < this.width / 2 ? -boss.width * 0.24 : boss.width * 0.24)
            : 0;
          const targetX = playerCenterX - boss.width / 2 + edgeLead;
          const dx = targetX - boss.x;
          const followRate = (playerNearEdge ? 0.026 : 0.015) + Math.min(0.014, (phase - 1) * 0.003);
          if (Math.abs(dx) > 6) boss.x += (dx * followRate) * speedMult;
          boss.x += hoverOffset;
      }
    }
    
    boss.x = Math.max(0, Math.min(this.width - boss.width, boss.x));
    const cycleLength = Math.max(320, 410 - Math.min(4, phase - 1) * 18);
    const burstEnd = Math.max(210, 250 - Math.min(4, phase - 1) * 8);
    const chargeEnd = burstEnd + 70;
    const attackCycle = boss.attackTimer % cycleLength;
    
    if (attackCycle < burstEnd) {
        boss.isCharging = false;
        const fireRate = Math.max(20, 60 - (phase * 7));
        if (boss.attackTimer % fireRate === 0) { 
          this.spawnBossBurst(boss, phase);
        }
    } else if (attackCycle >= burstEnd && attackCycle < chargeEnd) {
        boss.isCharging = true;
        boss.x += (Math.random() - 0.5) * 5; 
        if (boss.attackTimer % 15 === 0) {
             this.spawnFloatingText(boss.x + boss.width/2, boss.y, phase >= 2 ? "LOCKING PULSE!" : "CHARGING BEAM!", "#ff0000");
        }
    } else {
        const pulseIndex = Math.floor((attackCycle - chargeEnd) / Math.max(18, 26 - phase * 2));
        const pulseFrame = (attackCycle - chargeEnd) % Math.max(18, 26 - phase * 2);
        const pulseCount = this.getBossPulseCount(phase);
        if (pulseIndex >= 0 && pulseIndex < pulseCount && pulseFrame === 0) {
          this.spawnBossBeam(boss, phase, pulseIndex);
        }
        boss.isCharging = pulseIndex >= 0 && pulseIndex < pulseCount;
    }
  }

  spawnPowerup(x: number, y: number) {
    const r = Math.random();
    let type: PowerupType = PowerupType.DOUBLE_SHOT;
    if (r < 0.25) type = PowerupType.DOUBLE_SHOT;
    else if (r < 0.5) type = PowerupType.TRIPLE_SHOT;
    else if (r < 0.75) type = PowerupType.MAGNET;
    else type = PowerupType.SHIELD;

    const p = new Entity(EntityType.POWERUP, x, y);
    p.text = type; 
    p.width = 36;
    p.height = 36;
    p.vy = 2.0;
    this.entities.push(p);
  }

  spawnCoin(x: number, y: number) {
    const c = new Entity(EntityType.COIN, x, y);
    c.width = 24; 
    c.height = 24;
    c.vy = 2.0;
    this.entities.push(c);
  }

  spawnExplosion(x: number, y: number, color: string) {
    audioService.playSound('explode');
    for (let i = 0; i < 8; i++) {
      this.entities.push(new Particle(x, y, color, 4));
    }
  }

  spawnFloatingText(x: number, y: number, text: string, color: string) {
    this.entities.push(new VisualEffect(x, y, 'text', text, color));
  }

  spawnRingEffect(x: number, y: number, color: string) {
    this.entities.push(new VisualEffect(x, y, 'ring', '', color));
  }

  activatePowerup(type: PowerupType, countUse: boolean = true) {
    if (countUse) {
      this.stats.powerupUses = {
        ...this.stats.powerupUses,
        [type]: (this.stats.powerupUses?.[type] || 0) + 1
      };
    }

    if (type !== PowerupType.EXTRA_LIFE) {
      const currentDuration = this.activePowerups.get(type) || 0;
      this.activePowerups.set(type, currentDuration + GAME_CONFIG.POWERUP_DURATION);
    }

    audioService.playSound('powerup');
    const cx = this.player.x + this.player.width / 2;
    const cy = this.player.y + this.player.height / 2;

    if (type === PowerupType.SHIELD) {
      this.invincibleTimer += GAME_CONFIG.SHIELD_DURATION;
      this.spawnFloatingText(cx, cy - 20, "SHIELD!", "#00C851");
      this.spawnRingEffect(cx, cy, "#00C851");
    } else if (type === PowerupType.MAGNET) {
      this.spawnFloatingText(cx, cy - 20, "MAGNET!", "#FFD700");
      this.spawnRingEffect(cx, cy, "#FFD700");
    } else if (type === PowerupType.TRIPLE_SHOT) {
      this.spawnFloatingText(cx, cy - 20, "TRIPLE SHOT!", "#6c63ff");
      this.spawnRingEffect(cx, cy, "#6c63ff");
    } else if (type === PowerupType.DOUBLE_SHOT) {
      this.spawnFloatingText(cx, cy - 20, "DOUBLE SHOT!", "#ffbb33");
      this.spawnRingEffect(cx, cy, "#ffbb33");
    } else if (type === PowerupType.EXTRA_LIFE) {
      this.lives = Math.min(this.lives + 1, GAME_CONFIG.MAX_LIVES);
      this.stats.lives = this.lives;
      this.spawnFloatingText(cx, cy - 20, "+1 LIFE!", "#ff4444");
      this.spawnRingEffect(cx, cy, "#ff4444");
    }
  }

  getCollisionBox(entity: Entity) {
    let insetX = 0;
    let insetY = 0;

    switch (entity.type) {
      case EntityType.PLAYER:
        insetX = entity.width * 0.29;
        insetY = entity.height * 0.24;
        break;
      case EntityType.PROJECTILE:
      case EntityType.MISSILE:
        insetX = entity.width * 0.2;
        insetY = entity.isBeam ? entity.height * 0.04 : entity.height * 0.2;
        break;
      case EntityType.ENEMY_SWARM:
        insetX = entity.width * 0.24;
        insetY = entity.height * 0.24;
        break;
      case EntityType.ENEMY_DRONE:
      case EntityType.ENEMY_JOURNAL:
        insetX = entity.width * 0.16;
        insetY = entity.height * 0.16;
        break;
      case EntityType.ENEMY_BRICK:
      case EntityType.ENEMY_INVADER:
        insetX = entity.width * 0.1;
        insetY = entity.height * 0.1;
        break;
      case EntityType.MINI_BOSS:
      case EntityType.BOSS:
        insetX = entity.width * 0.08;
        insetY = entity.height * 0.08;
        break;
      default:
        insetX = entity.width * 0.08;
        insetY = entity.height * 0.08;
    }

    return {
      x: entity.x + insetX,
      y: entity.y + insetY,
      width: Math.max(4, entity.width - insetX * 2),
      height: Math.max(4, entity.height - insetY * 2)
    };
  }

  checkCollisions() {
    const intersect = (r1: Entity, r2: Entity) => {
      const a = this.getCollisionBox(r1);
      const b = this.getCollisionBox(r2);
      return !(b.x > a.x + a.width || b.x + b.width < a.x || b.y > a.y + a.height || b.y + b.height < a.y);
    };

    this.entities.forEach(e => {
      if (e.markedForDeletion) return;

      if (e.type === EntityType.POWERUP && intersect(this.player, e)) {
        e.markedForDeletion = true;
        const type = e.text as PowerupType;
        this.activatePowerup(type);
      }

      if (e.type === EntityType.COIN && intersect(this.player, e)) {
        e.markedForDeletion = true;
        audioService.playSound('coin');
        this.stats.coins++;
        this.stats.totalCoins++; 
        this.stats.score += (this.activePowerups.has(PowerupType.MAGNET) ? 2 : 1);
        
        // REMOVED AUTOMATIC LIFE GAIN
      }

      const isEnemy = e.type === EntityType.ENEMY_DRONE || e.type === EntityType.ENEMY_BRICK || e.type === EntityType.ENEMY_JOURNAL || e.type === EntityType.ENEMY_SWARM || e.type === EntityType.BOSS || e.type === EntityType.MINI_BOSS || e.type === EntityType.ENEMY_INVADER;
      
      // Determine if this entity hurts the player
      let hurtsPlayer = false;

      // 1. Enemies always hurt
      if (isEnemy) {
          hurtsPlayer = true;
      }

      // 2. Projectiles hurt ONLY if they are NOT player shots
      if (e.type === EntityType.PROJECTILE) {
          // If it's a beam, it hurts (Boss weapon)
          if (e.isBeam) {
              hurtsPlayer = true;
          }
          // If it's NOT a player shot, it hurts
          else if (!e.isPlayerShot) {
               // EXTRA FAILSAFE: If it's Cyan or Purple, assume it's player ammo (glitch protection)
               if (e.color !== '#00FFFF' && e.color !== '#00ffff' && e.color !== '#6c63ff') {
                   hurtsPlayer = true;
               }
          }
      }
      
      const isInvincible = this.invincibleTimer > 0 || this.activePowerups.has(PowerupType.SHIELD);

      if (hurtsPlayer && intersect(this.player, e)) {
        if (isInvincible) {
           e.hp -= 5; 
           
           // SHIELD DEGRADATION LOGIC
           // Hitting enemies reduces shield duration to prevent boss cheese
           if (this.activePowerups.has(PowerupType.SHIELD)) {
               const currentShieldTime = this.activePowerups.get(PowerupType.SHIELD) || 0;
               // Heavy penalty for ramming bosses
               const penalty = (e.type === EntityType.BOSS || e.type === EntityType.MINI_BOSS) ? 150 : 30; 
               this.activePowerups.set(PowerupType.SHIELD, Math.max(0, currentShieldTime - penalty));
               
               // Also reduce base Invincible timer if active (e.g. from pickup)
               if (this.invincibleTimer > 0) {
                   this.invincibleTimer = Math.max(0, this.invincibleTimer - penalty);
               }
           }

           if (e.hp <= 0 && !e.isBeam) { 
             e.markedForDeletion = true;
             this.spawnExplosion(e.x, e.y, e.color);
           }
        } else {
          this.lives--;
          this.invincibleTimer = 60; 
          audioService.playSound('hit');
          this.spawnExplosion(this.player.x, this.player.y, '#ffffff');
          // Only delete bullet if it isn't a beam
          if (e.type === EntityType.PROJECTILE && !e.isBeam) e.markedForDeletion = true;
          if (this.lives <= 0) this.gameActive = false;
        }
      }

      // Projectiles (Bullets & Missiles) vs Enemies
      // Only process if it IS a player shot (or explicit missile)
      if ((e.type === EntityType.PROJECTILE && e.isPlayerShot) || e.type === EntityType.MISSILE) {
         this.entities.forEach(target => {
            const isTargetEnemy = target.type === EntityType.ENEMY_DRONE || target.type === EntityType.ENEMY_BRICK || target.type === EntityType.ENEMY_JOURNAL || target.type === EntityType.ENEMY_SWARM || target.type === EntityType.BOSS || target.type === EntityType.MINI_BOSS || target.type === EntityType.ENEMY_INVADER;
            if (isTargetEnemy && intersect(e, target)) {
               e.markedForDeletion = true;
               
               // Missiles do more damage
               const dmg = e.type === EntityType.MISSILE ? 5 : 1;
               target.hp -= dmg;
               
               if (target.hp <= 0) {
                 target.markedForDeletion = true;
                 this.spawnExplosion(target.x, target.y, target.color);
                 this.stats.enemiesDefeated++;
                 const waveMult = Math.pow(2, this.stats.wave - 1);
                 let basePoints = 10;
                 if (target.type === EntityType.ENEMY_DRONE) basePoints = 10;
                 if (target.type === EntityType.ENEMY_SWARM) basePoints = 12;
                 if (target.type === EntityType.ENEMY_BRICK || target.type === EntityType.ENEMY_INVADER) basePoints = 20; 
                 if (target.type === EntityType.ENEMY_JOURNAL) basePoints = 30; 
                 
                 this.stats.score += basePoints * waveMult;
                 this.spawnCoin(target.x + target.width/2, target.y + target.height/2);
                 const isElite = target.type === EntityType.ENEMY_JOURNAL || target.type === EntityType.ENEMY_BRICK || target.type === EntityType.MINI_BOSS || target.type === EntityType.ENEMY_INVADER;
                 // Make rarer: 0.85 -> 0.92
                 if (isElite && Math.random() > 0.92) this.spawnPowerup(target.x, target.y);

                 if (target.type === EntityType.MINI_BOSS) {
                     this.stats.score += 500 * waveMult;
                     this.spawnPowerup(target.x, target.y);
                     // Removed second powerup
                     this.miniBossRef = null; 
                     this.waveProgressFrames += 120; 
                 }

                 if (target.type === EntityType.BOSS) {
                    this.stats.score += 1000 * waveMult; 
                    this.bossRef = null;
                    this.mainBossDefeated = true;
                    this.inBossWarningSequence = false;
                    this.pendingBossType = null;
                    this.bossWarningFrame = 0;
                    for(let i=0; i<8; i++) {
                        this.spawnCoin(target.x + Math.random()*target.width, target.y + Math.random()*target.height);
                    }
                    this.spawnPowerup(target.x + 50, target.y + 50);
                    this.spawnPowerup(target.x + 100, target.y + 100);
                    
                    // TRIGGER ELECTRICITY SOUND
                    audioService.playSound('electricity');
                    
                    this.spawnFloatingText(this.width/2, this.height/2, "WAVE COMPLETE!", "#00FF00");
                    setTimeout(() => {
                        this.startNextWave();
                    }, 2000);
                 }
               }
            }
         });
      }
    });
  }

  getBossWarningComms(type: BossWarningType) {
    const phase = this.stats.wave;
    const phaseComms = [
      {
        speaker: 'Brian Armstrong',
        role: 'Clarity Relay',
        image: ASSETS.FOUNDER_BRIAN,
        color: '#67e8f9',
        text: 'Instability ahead. The main bottleneck is forming. Clear runway, charge the lab, and get ready.'
      },
      {
        speaker: 'Jeffrey',
        role: 'Peer Review Scout',
        image: ASSETS.FOUNDER_JEFFREY,
        color: '#a7f3d0',
        text: 'Heavy signal ahead. This core moves differently. Watch the lanes before you commit.'
      },
      {
        speaker: 'Patrick',
        role: 'Funding Signal',
        image: ASSETS.FOUNDER_PATRICK,
        color: '#fde68a',
        text: 'Main boss incoming. If you have credits, stack a founder powerup before the gate closes.'
      },
      {
        speaker: 'Arshia',
        role: 'Life Support',
        image: ASSETS.FOUNDER_ARSHIA,
        color: '#fda4af',
        text: 'Unstable field ahead. Save your shield, keep your last life clean, and fly through the opening.'
      },
      {
        speaker: 'ResearchHub',
        role: 'Open Science Relay',
        image: ASSETS.FOUNDER_4,
        color: '#c4b5fd',
        text: 'Final bottleneck ahead. No noise in the lane now. Break the core and open the Galaxy.'
      }
    ];

    return phaseComms[Math.min(phaseComms.length - 1, Math.max(0, phase - 1))];
  }

  getBossSkin(e: Entity) {
    const skins = [
      {
        sprite: ASSETS.FINAL_BOSS,
        label: 'GATEKEEPER PRIME',
        accent: '#fb7185',
        shadow: '#ef4444'
      },
      {
        sprite: ASSETS.MINI_BOSS,
        label: 'REVIEW SENTINEL',
        accent: '#67e8f9',
        shadow: '#38bdf8'
      },
      {
        sprite: ASSETS.WALL_BOSS_SEGMENT,
        label: 'PAYWALL CORE',
        accent: '#fde047',
        shadow: '#facc15'
      }
    ];

    return skins[Math.abs(e.variant || 0) % skins.length];
  }

  wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number = 2) {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    words.forEach((word) => {
      const nextLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(nextLine).width <= maxWidth) {
        currentLine = nextLine;
        return;
      }

      if (currentLine) lines.push(currentLine);
      currentLine = word;
    });

    if (currentLine) lines.push(currentLine);

    if (lines.length > maxLines) {
      const clipped = lines.slice(0, maxLines);
      clipped[maxLines - 1] = `${clipped[maxLines - 1].replace(/\.+$/, '')}...`;
      return clipped;
    }

    return lines;
  }

  drawBossWarningComms(ctx: CanvasRenderingContext2D) {
    if (!this.pendingBossType) return;

    const comms = this.getBossWarningComms(this.pendingBossType);
    const duration = this.bossWarningDuration || 150;
    const age = duration - this.bossWarningFrame;
    const alpha = Math.max(0, Math.min(1, age / 18, this.bossWarningFrame / 24));
    const panelWidth = Math.min(this.width - 24, 520);
    const panelHeight = this.width < 520 ? 104 : 92;
    const x = Math.max(12, (this.width - panelWidth) / 2);
    const y = Math.max(118, Math.min(this.height - panelHeight - 150, this.height * 0.18));
    const portraitSize = this.width < 520 ? 48 : 56;
    const portraitX = x + 14;
    const portraitY = y + (panelHeight - portraitSize) / 2;
    const textX = portraitX + portraitSize + 14;
    const textWidth = panelWidth - (textX - x) - 16;
    const pulse = 0.75 + Math.sin(this.frameCount * 0.22) * 0.25;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(3, 7, 18, 0.86)';
    ctx.strokeStyle = comms.color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = comms.color;
    ctx.shadowBlur = 16 * pulse;
    ctx.beginPath();
    ctx.roundRect(x, y, panelWidth, panelHeight, 22);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = comms.color;
    ctx.globalAlpha = alpha * 0.16;
    ctx.fillRect(x + 1, y + 1, 5, panelHeight - 2);
    ctx.globalAlpha = alpha;

    const portrait = getReadyImage(comms.image);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(portraitX, portraitY, portraitSize, portraitSize, 14);
    ctx.clip();
    if (portrait) {
      ctx.drawImage(portrait, portraitX, portraitY, portraitSize, portraitSize);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(portraitX, portraitY, portraitSize, portraitSize);
    }
    ctx.restore();

    ctx.strokeStyle = comms.color;
    ctx.lineWidth = 1;
    ctx.strokeRect(portraitX + 0.5, portraitY + 0.5, portraitSize - 1, portraitSize - 1);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px Orbitron';
    ctx.fillText(comms.speaker.toUpperCase(), textX, y + 24);

    ctx.fillStyle = comms.color;
    ctx.font = 'bold 9px Orbitron';
    ctx.fillText(comms.role.toUpperCase(), textX, y + 39);

    ctx.fillStyle = 'rgba(226, 232, 240, 0.96)';
    ctx.font = `${this.width < 520 ? 11 : 12}px monospace`;
    this.wrapCanvasText(ctx, comms.text, textWidth, this.width < 520 ? 3 : 2).forEach((line, index) => {
      ctx.fillText(line, textX, y + 59 + (index * 15));
    });

    ctx.fillStyle = comms.color;
    ctx.font = 'bold 9px Orbitron';
    ctx.textAlign = 'right';
    ctx.fillText('BOSS SIGNAL', x + panelWidth - 14, y + panelHeight - 14);
    ctx.restore();
  }

  // ... draw methods remain the same ...
  // (Included to prevent file truncation issues, though only collision logic changed significantly)
  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.width, this.height);
    this.drawBackgroundLayers(ctx);
    this.stars.forEach(star => star.draw(ctx));
    this.bgEntities.forEach(bg => bg.draw(ctx));
    
    if (this.inBossWarningSequence && this.pendingBossType === 'gatekeeper') {
        this.drawBossWarningComms(ctx);
    }
    
    ctx.save();
    ctx.globalAlpha = 1.0;
    ctx.filter = "none";
    ctx.shadowBlur = 0;
    this.entities.forEach(e => this.drawEntity(ctx, e));
    if (this.lives > 0) this.drawEntity(ctx, this.player);
    
    const invaders = this.entities.filter(e => e.type === EntityType.ENEMY_INVADER);
    if (invaders.length > 0) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity;
        invaders.forEach(inv => {
            if (inv.x < minX) minX = inv.x;
            if (inv.x + inv.width > maxX) maxX = inv.x + inv.width;
            if (inv.y < minY) minY = inv.y;
        });
        
        if (minY < Infinity) {
            const centerX = (minX + maxX) / 2;
            const topY = minY;
            
            ctx.save();
            ctx.font = 'bold 16px Orbitron';
            ctx.fillStyle = '#ff4444';
            ctx.textAlign = 'center';
            ctx.fillText("PAYWALL", centerX, topY - 35);
            
            const barWidth = 100;
            const barHeight = 8;
            const barY = topY - 20;
            
            ctx.fillStyle = 'rgba(0,0,0,0.9)';
            ctx.fillRect(centerX - barWidth/2, barY, barWidth, barHeight);
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = 1;
            ctx.strokeRect(centerX - barWidth/2, barY, barWidth, barHeight);
            
            const pct = Math.max(0, this.stats.bossHp / this.stats.bossMaxHp);
            
            ctx.fillStyle = pct > 0.5 ? '#00FF00' : '#FF0000';
            ctx.fillRect(centerX - barWidth/2 + 1, barY + 1, (barWidth-2) * pct, barHeight - 2);
            ctx.restore();
        }
    }
    
    ctx.restore();
  }
  
  drawMiniBoss(ctx: CanvasRenderingContext2D, e: Entity) {
      this.drawHealthBar(ctx, e, 12);
      ctx.globalAlpha = 1.0;
      const bob = Math.sin(this.frameCount * 0.08) * 4;
      const drewSprite = this.drawSprite(ctx, ASSETS.MINI_BOSS, e.width, e.height, {
        shadowColor: '#fb7185',
        shadowBlur: 22,
        yOffset: bob
      });

      if (!drewSprite) {
        ctx.save();
        ctx.fillStyle = '#fb7185';
        ctx.beginPath();
        ctx.roundRect(-e.width / 2, -e.height / 2, e.width, e.height, 18);
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.font = 'bold 12px Orbitron';
      ctx.fillStyle = '#fb7185';
      ctx.textAlign = 'center';
      ctx.fillText("BOTTLENECK DRONE", 0, -e.height/2 - 35);
      ctx.restore();
  }

  drawBoss(ctx: CanvasRenderingContext2D, e: Entity) {
      this.drawHealthBar(ctx, e, 12);
      ctx.globalAlpha = 1.0;
      const skin = this.getBossSkin(e);
      const pulse = e.isCharging ? 42 : 24;
      const bob = Math.sin(this.frameCount * 0.04) * 5;
      const drewSprite = this.drawSprite(ctx, skin.sprite, e.width, e.height, {
        shadowColor: e.isCharging ? '#ffffff' : skin.shadow,
        shadowBlur: pulse,
        yOffset: bob
      });

      if (!drewSprite) {
        ctx.save();
        ctx.fillStyle = '#7f1d1d';
        ctx.fillRect(-e.width / 2, -e.height / 2, e.width, e.height);
        ctx.restore();
      }

      ctx.save();
      ctx.strokeStyle = e.isCharging ? '#f8fafc' : skin.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 20, e.width * 0.34, 16, this.frameCount * 0.04, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 20, e.width * 0.24, 8, -this.frameCount * 0.04, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.font = 'bold 16px Orbitron';
      ctx.fillStyle = skin.accent;
      ctx.textAlign = 'center';
      ctx.fillText(skin.label, 0, -e.height/2 - 35);
      ctx.restore();
  }

  drawHealthBar(ctx: CanvasRenderingContext2D, e: Entity, height: number = 8) {
      ctx.save();
      const barWidth = e.width;
      const barHeight = height;
      const yOffset = -e.height/2 - 20; 
      ctx.fillStyle = 'rgba(0,0,0,0.9)';
      ctx.fillRect(-barWidth/2, yOffset, barWidth, barHeight);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-barWidth/2, yOffset, barWidth, barHeight);
      const pct = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = pct > 0.5 ? '#00FF00' : '#FF0000';
      ctx.fillRect(-barWidth/2 + 1, yOffset + 1, (barWidth-2) * pct, barHeight - 2);
      ctx.restore();
  }
  
  drawLaser(ctx: CanvasRenderingContext2D, e: Entity) {
      const flicker = Math.random() * 10;
      const glowColor = e.color || '#ff0000';
      ctx.save();
      ctx.fillStyle = '#FFF';
      ctx.fillRect(e.x + 10, e.y, e.width - 20, e.height);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = glowColor;
      ctx.fillRect(e.x - flicker, e.y, e.width + flicker*2, e.height);
      ctx.globalAlpha = 1;
      for(let i=0; i<5; i++) {
         ctx.fillStyle = '#FFDD00';
         const px = e.x + Math.random() * e.width;
         const py = e.y + Math.random() * e.height;
         ctx.fillRect(px, py, 4, 20);
      }
      ctx.restore();
  }

  drawEntity(ctx: CanvasRenderingContext2D, e: Entity) {
    if (e.isBeam) {
        this.drawLaser(ctx, e);
        return;
    }
    ctx.save();
    ctx.translate(e.x + e.width / 2, e.y + e.height / 2);
    ctx.globalAlpha = 1.0;
    
    if (e.type === EntityType.PLAYER) {
       const img = imageCache[ASSETS.PLAYER_SHIP];
       if (this.activePowerups.has(PowerupType.MAGNET)) {
           const pulse = Math.sin(this.frameCount * 0.1) * 5;
           ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)'; 
           ctx.lineWidth = 2;
           ctx.beginPath();
           ctx.arc(0, 0, e.width/2 + 10 + pulse, 0, Math.PI * 2);
           ctx.stroke();
           ctx.beginPath();
           ctx.strokeStyle = 'rgba(255, 215, 0, 0.2)';
           ctx.arc(0, 0, e.width/2 + pulse, 0, Math.PI * 2);
           ctx.stroke();
       }
       if (this.activePowerups.has(PowerupType.TRIPLE_SHOT)) {
           const offset = 55;
           ctx.fillStyle = '#6c63ff';
           ctx.fillRect(-offset, 0, 10, 20);
           ctx.fillRect(offset - 10, 0, 10, 20);
           ctx.strokeStyle = '#6c63ff';
           ctx.lineWidth = 1;
           ctx.beginPath();
           ctx.moveTo(-offset + 5, 10);
           ctx.lineTo(0, 0);
           ctx.moveTo(offset - 5, 10);
           ctx.lineTo(0, 0);
           ctx.stroke();
       }
       if (this.activePowerups.has(PowerupType.DOUBLE_SHOT)) {
           const offset = 40;
           ctx.fillStyle = '#ffbb33';
           ctx.fillRect(-offset, 0, 5, 15);
           ctx.fillRect(offset - 5, 0, 5, 15);
       }
       if (this.activePowerups.has(PowerupType.SHIELD) || this.invincibleTimer > 60) {
         ctx.save();
         ctx.rotate(this.frameCount * 0.05);
         ctx.strokeStyle = '#00C851';
         ctx.lineWidth = 3;
         ctx.setLineDash([15, 10]); 
         ctx.beginPath();
         ctx.arc(0, 0, e.width/2 + 15, 0, Math.PI * 2);
         ctx.stroke();
         ctx.restore();
       }
       if (img && img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, -e.width / 2, -e.height / 2, e.width, e.height);
       } else {
         ctx.fillStyle = '#6c63ff';
         ctx.fillRect(-20, -20, 40, 40);
       }

    } else if (e.type === EntityType.ENEMY_DRONE) {
        const frame = this.getAnimatedFrame(ASSETS.ENEMY_DRONE_FRAMES, e, 6);
        const drewSprite = this.drawSprite(ctx, frame, e.width, e.height, {
            shadowColor: '#38bdf8',
            shadowBlur: 10
        });
        if (!drewSprite) {
            ctx.fillStyle = e.color;
            ctx.fillRect(-e.width / 2, -e.height / 2, e.width, e.height);
        }

    } else if (e.type === EntityType.ENEMY_SWARM) {
        const frame = this.getAnimatedFrame(ASSETS.ENEMY_SWARM_FRAMES, e, 5);
        const rotation = Math.sin((this.frameCount + e.variant) * 0.08) * 0.12;
        const drewSprite = this.drawSprite(ctx, frame, e.width, e.height, {
            rotation,
            shadowColor: '#34d399',
            shadowBlur: 8
        });
        if (!drewSprite) {
            ctx.fillStyle = e.color;
            ctx.fillRect(-e.width / 2, -e.height / 2, e.width, e.height);
        }

    } else if (e.type === EntityType.ENEMY_BRICK) {
        const frame = ASSETS.ENEMY_BRICK_FRAMES[e.variant % ASSETS.ENEMY_BRICK_FRAMES.length];
        const rotation = Math.sin((this.frameCount + e.variant) * 0.03) * 0.2;
        const drewSprite = this.drawSprite(ctx, frame, e.width, e.height, {
            rotation,
            shadowColor: '#f59e0b',
            shadowBlur: 6
        });
        if (!drewSprite) {
            ctx.fillStyle = e.color;
            ctx.fillRect(-e.width / 2, -e.height / 2, e.width, e.height);
        }

    } else if (e.type === EntityType.ENEMY_JOURNAL) {
        const sway = Math.sin((this.frameCount + e.variant) * 0.04) * 0.12;
        const drewSprite = this.drawSprite(ctx, ASSETS.ENEMY_JOURNAL, e.width, e.height, {
            rotation: sway,
            shadowColor: '#fb7185',
            shadowBlur: 14
        });
        if (!drewSprite) {
            ctx.fillStyle = e.color;
            ctx.fillRect(-e.width / 2, -e.height / 2, e.width, e.height);
        }

    } else if (e.type === EntityType.POWERUP) {
        const type = e.text as PowerupType;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#fff';
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.clip();
        
        let imgUrl = ASSETS.FOUNDER_4; 
        if (type === PowerupType.TRIPLE_SHOT) imgUrl = ASSETS.FOUNDER_BRIAN;
        if (type === PowerupType.MAGNET) imgUrl = ASSETS.FOUNDER_PATRICK;
        if (type === PowerupType.SHIELD) imgUrl = ASSETS.FOUNDER_JEFFREY;
        if (type === PowerupType.DOUBLE_SHOT) imgUrl = ASSETS.FOUNDER_4;
        if (type === PowerupType.EXTRA_LIFE) imgUrl = ASSETS.FOUNDER_ARSHIA; // Arshia
        
        const img = imageCache[imgUrl];
        if (img && img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, -18, -18, 36, 36);
        } else {
            ctx.fillStyle = '#fff';
            ctx.fillRect(-18, -18, 36, 36);
        }
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

    } else if (e.type === EntityType.MINI_BOSS) {
        this.drawMiniBoss(ctx, e);
    } else if (e.type === EntityType.BOSS) {
        this.drawBoss(ctx, e);
    } else if (e.type === EntityType.ENEMY_INVADER) {
        const sway = Math.sin((this.frameCount + e.variant) * 0.05) * 0.08;
        const drewSprite = this.drawSprite(ctx, ASSETS.WALL_BOSS_SEGMENT, e.width, e.height, {
            rotation: sway,
            shadowColor: '#fb7185',
            shadowBlur: 8
        });
        if (drewSprite) {
            ctx.restore();
            return;
        }
        // DRAW AS BRICK EMOJI
        // INCREASE FONT SIZE FOR BIGGER BRICKS
        ctx.font = `${e.height}px Arial`; 
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#B22222'; // fallback color if text fails
        ctx.fillText("🧱", 0, 2);

    } else if (e.type === EntityType.COIN) {
        const img = imageCache[ASSETS.RSC_TOKEN];
        if (img && img.complete && img.naturalWidth > 0) {
            ctx.save();
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#FFD700'; 
            ctx.beginPath();
            ctx.arc(0, 0, e.width/2, 0, Math.PI*2);
            ctx.clip();
            ctx.drawImage(img, -e.width/2, -e.height/2, e.width, e.height);
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
        } else {
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.arc(0, 0, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.font = '8px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText("RSC", 0, 0);
        }

    } else if (e.type === EntityType.PARTICLE) {
        ctx.fillStyle = e.color;
        ctx.fillRect(-2, -2, 4, 4);
    } else if (e.type === EntityType.EFFECT) {
        const eff = e as VisualEffect;
        if (eff.effectType === 'text') {
            ctx.font = 'bold 32px Orbitron';
            ctx.textAlign = 'center';
            ctx.globalAlpha = eff.life / eff.maxLife;

            if (eff.text?.startsWith("WAVE")) {
                const jitterX = (Math.random() - 0.5) * 4;
                const jitterY = (Math.random() - 0.5) * 4;
                ctx.shadowBlur = 20;
                ctx.shadowColor = '#00FFFF'; 
                ctx.fillStyle = this.frameCount % 10 < 5 ? '#FFF' : '#00FFFF';
                ctx.fillText(eff.text || "", jitterX, jitterY);
                if (Math.random() > 0.7) {
                    ctx.strokeStyle = '#FFF';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(-50, 0);
                    ctx.lineTo(50, (Math.random()-0.5)*20);
                    ctx.stroke();
                }
                ctx.shadowBlur = 0;
            } else if (eff.text?.startsWith("WARNING")) {
                 const pulse = Math.abs(Math.sin(this.frameCount * 0.2)) * 0.5 + 0.5;
                 ctx.fillStyle = `rgba(255, 0, 0, ${pulse})`;
                 ctx.shadowBlur = 10;
                 ctx.shadowColor = '#ff0000';
                 ctx.fillText(eff.text || "", 0, 0);
                 ctx.shadowBlur = 0;
            } else if (eff.text?.startsWith("GATEKEEPER")) {
                 ctx.fillStyle = '#ff4444';
                 ctx.font = 'bold 20px Orbitron';
                 ctx.fillText(eff.text || "", 0, 0);
            } else {
                ctx.fillStyle = eff.color;
                ctx.fillText(eff.text || "", 0, 0);
            }
            ctx.globalAlpha = 1;
        } else if (eff.effectType === 'ring') {
            const progress = 1 - (eff.life / eff.maxLife);
            ctx.strokeStyle = eff.color;
            ctx.lineWidth = 3 * (1-progress);
            ctx.globalAlpha = 1 - progress;
            ctx.beginPath();
            ctx.arc(0, 0, 10 + (progress * 80), 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    } else if (e.type === EntityType.MISSILE) {
        // Draw Missile
        const isMaxLevel = e.color === '#ff0055';
        
        ctx.save();
        if (isMaxLevel) {
             // COOL EFFECT: Pulsing aura
             const pulse = 10 + Math.sin(this.frameCount * 0.5) * 5;
             ctx.shadowBlur = pulse;
             ctx.shadowColor = '#ff0055';
             ctx.fillStyle = '#ff0055';
        } else {
             ctx.fillStyle = '#00ffff';
             ctx.shadowBlur = 10;
             ctx.shadowColor = '#00ffff';
        }
        
        ctx.rotate(Math.atan2(e.vy, e.vx) + Math.PI/2);
        
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(5, 5);
        ctx.lineTo(-5, 5);
        ctx.closePath();
        ctx.fill();
        
        // Engine glow
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, 5, isMaxLevel ? 4 : 2, 0, Math.PI*2);
        ctx.fill();
        
        ctx.shadowBlur = 0;
        ctx.restore();

    } else if (e.type === EntityType.PROJECTILE) {
        // FORCE OPAQUE FOR PROJECTILES
        ctx.save();
        ctx.globalAlpha = 1.0; 
        ctx.filter = "none";
        
        // Add glow if cyan (max level)
        if (e.color === '#00FFFF') {
             ctx.shadowBlur = 10;
             ctx.shadowColor = '#00FFFF';
        } else {
             ctx.shadowBlur = 0;
        }

        if (e.text) { 
           ctx.font = '24px serif';
           ctx.textAlign = 'center';
           ctx.textBaseline = 'middle';
           ctx.fillText(e.text, 0, 0);
        } else {
            ctx.fillStyle = e.color;
            ctx.beginPath();
            ctx.arc(0, 0, e.width/2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    } else {
        ctx.fillStyle = e.color; 
        if (e.text) {
          ctx.font = '24px Arial'; 
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(e.text, 0, 0);
        } else {
          ctx.fillRect(-e.width/2, -e.height/2, e.width, e.height);
        }
    }
    
    ctx.restore();
  }
}

//////////////////////////////
//CONFIGURACIÓN Y UTILIDADES//
//////////////////////////////

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

//Estado de juego
const STATES = { TITLE: 0, PLAYING: 1, GAMEOVER: 2, PAUSED: 3 };
let gameState = STATES.TITLE;

///////////
//SPRITES//
///////////

const spriteSheet = new Image();
spriteSheet.src = "img/sprites.png";
let spritesLoaded = false;
spriteSheet.onload = () => spritesLoaded = true;

const logoImage = new Image();
logoImage.src = "img/logo.png";

const SPRITES = {
    INVADER_1: { x: 0, y: 0, w: 16, h: 16 }, INVADER_1B: { x: 16, y: 0, w: 16, h: 16 },
    INVADER_2: { x: 32, y: 0, w: 22, h: 16 }, INVADER_2B: { x: 54, y: 0, w: 22, h: 16 },
    INVADER_3: { x: 76, y: 0, w: 24, h: 16 }, INVADER_3B: { x: 100, y: 0, w: 24, h: 16 },
    EXPLOSION: { x: 126, y: 0, w: 24, h: 16 },
    DEADPLAYER: { x: 176, y: 0, w: 26, h: 16 },
    PLAYER: { x: 150, y: 0, w: 26, h: 16 },
    NODRIZA: { x: 0, y: 16, w: 52, h: 24 },
    BUNKER: [
        { x: 0, y: 80, w: 44, h: 32 }, { x: 44, y: 80, w: 44, h: 32 },
        { x: 88, y: 80, w: 44, h: 32 }, { x: 132, y: 80, w: 44, h: 32 },
        { x: 176, y: 80, w: 44, h: 32 }
    ],
    SCORE: { x: 150, y: 42, w: 80, h: 16 },
    SYMBOL_1: { x: 138, y: 42, w: 12, h: 16 },
    NUMBERS: Array.from({ length: 10 }, (_, i) => ({ x: i * 10, y: 42, w: 10, h: 16 }))
};

/////////
//AUDIO//
/////////

const sounds = {
    shoot: new Audio("audio/shoot.wav"),
    invaderKill: new Audio("audio/invaderkilled.wav"),
    playerKill: new Audio("audio/explosion.wav"),
    ufo: new Audio("audio/ufo_highpitch.wav"),
    gameOver: new Audio("audio/game-over.mp3"),
    createInvaders: new Audio("audio/create_invaders.mp3"),
    title: new Audio("audio/title.mp3"),
    move: ["fastinvader1", "fastinvader2", "fastinvader3", "fastinvader4"].map(f => new Audio(`audio/${f}.wav`))
};

let muted = false;
Object.values(sounds).flat().forEach(s => s.volume = 0.4);
sounds.ufo.volume = 1.0;

function playSound(sound, loop = false) {
    if (muted) return;
    sound.loop = loop;
    sound.currentTime = 0;
    sound.play().catch(() => {});
}

function stopSound(sound) {
    sound.pause();
    sound.currentTime = 0;
}

function togglePause() {
    if (gameState === STATES.PLAYING) {
        gameState = STATES.PAUSED;
        Object.values(sounds).flat().forEach(s => s.pause());
    } else if (gameState === STATES.PAUSED) {
        gameState = STATES.PLAYING;
        if (nodriza && nodriza.active && !muted) sounds.ufo.play().catch(()=>{});
    }
}

/////////
//INPUT//
/////////

const keys = {};
window.addEventListener("keydown", e => {
    keys[e.code] = true;
    if (e.code === "KeyM") {
        muted = !muted;
        Object.values(sounds).flat().forEach(s => { s.muted = muted; if (muted) stopSound(s); });
    }
    if (e.code === "Enter") {
        if (gameState === STATES.TITLE || gameState === STATES.GAMEOVER) startGame();
        else if (gameState === STATES.PAUSED) goToTitle();
    }
    if (e.code === "Escape") {
        if (gameState === STATES.PLAYING || gameState === STATES.PAUSED) togglePause();
    }
});
window.addEventListener("keyup", e => keys[e.code] = false);
window.addEventListener("blur", () => { if (gameState === STATES.PLAYING) togglePause(); });

///////////////
//CLASES BASE//
///////////////

class Entity {
    constructor(x, y, w, h) {
        this.x = x; this.y = y; this.width = w; this.height = h;
        this.active = true;
    }

    drawSprite(s, x = this.x, y = this.y) {
        if (spritesLoaded) ctx.drawImage(spriteSheet, s.x, s.y, s.w, s.h, x, y, s.w, s.h);
    }

    checkCollision(other) {
        return this.active && other.active &&
               this.x < other.x + other.width && this.x + this.width > other.x &&
               this.y < other.y + other.height && this.y + this.height > other.y;
    }
}

class Explodable extends Entity {
    constructor(x, y, w, h) {
        super(x, y, w, h);
        this.exploding = false;
        this.explosionTimer = 0;
    }

    update(dt) {
        if (this.exploding) {
            this.explosionTimer -= dt;
            if (this.explosionTimer <= 0) {
                this.active = false;
                this.exploding = false;
            }
            return true;
        }
        return false;
    }

    explode(time = 200) {
        this.exploding = true;
        this.explosionTimer = time;
    }

    draw() {
        if (this.exploding) this.drawSprite(SPRITES.EXPLOSION);
    }
}

////////////////////
//CLASES DEL JUEGO//
////////////////////

class Player extends Entity {
    constructor() {
        super(canvas.width / 2 - 13, canvas.height - 90, 26, 16);
        this.speed = 150;
        this.lives = 3;
        this.shootCooldown = 0;
        this.dead = false;
        this.deathTimer = 0;
    }

    update(dt) {
        if (this.dead) {
            this.deathTimer -= dt;
            if (this.deathTimer <= 0) this.dead = false;
            return;
        }

        if (keys["ArrowLeft"]) this.x = Math.max(0, this.x - this.speed * dt / 1000);
        if (keys["ArrowRight"]) this.x = Math.min(canvas.width - this.width, this.x + this.speed * dt / 1000);
        
        if (keys["Space"] && this.shootCooldown <= 0) {
            bullets.push(new Bullet(this.x + 11, this.y - 4, -400, "green"));
            this.shootCooldown = 500;
            playSound(sounds.shoot);
        }
        this.shootCooldown -= dt;
    }

    kill() {
        this.dead = true;
        this.deathTimer = 1000;
        this.x = canvas.width / 2 - this.width / 2;
        this.lives--;
        playSound(sounds.playerKill);
    }

    draw() {
        this.drawSprite(this.dead ? SPRITES.DEADPLAYER : SPRITES.PLAYER);
        // Vidas
        if (this.lives > 0) {
            const num = SPRITES.NUMBERS[this.lives];
            this.drawSprite(num, 10, canvas.height - 35);
            for (let i = 0; i < this.lives; i++) this.drawSprite(SPRITES.PLAYER, 30 + i * 30, canvas.height - 35);
        }
    }
}

class Invader extends Explodable {
    constructor(x, y, type, points) {
        const s = SPRITES[`INVADER_${type}`];
        super(x, y, s.w, s.h);
        this.spriteA = s;
        this.spriteB = SPRITES[`INVADER_${type}B`];
        this.points = points;
    }

    draw(animFrame) {
        if (this.exploding) super.draw();
        else if (this.active) this.drawSprite(animFrame === 0 ? this.spriteA : this.spriteB);
    }
}

class Bullet extends Explodable {
    constructor(x, y, speed, color) {
        super(x, y, 2, 12);
        this.speed = speed;
        this.color = color;
        this.bunkerHit = false;
    }

    update(dt) {
        if (super.update(dt)) return;
        this.y += this.speed * dt / 1000;
        if (this.y <= 50 || this.y >= canvas.height - 60) this.explode(150);
        
        //Colisión suelo
        if (this.y >= canvas.height - 60 && this.speed > 0) {
            const gx = Math.floor(this.x);
            if (ground[gx]) {
                ground[gx] = ground[gx-1] = ground[gx+1] = false;
                this.active = false;
            }
        }
    }

    draw() {
        if (this.exploding) {
            this.drawSprite(SPRITES.EXPLOSION, this.x - 10, this.y - 8);
        } else {
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }
}

class Nodriza extends Explodable {
    constructor() {
        super(0, 70, SPRITES.NODRIZA.w, SPRITES.NODRIZA.h);
        this.speed = 200;
        this.timeAlive = 10000;
        this.direction = Math.random() < 0.5 ? 1 : -1;
        this.x = this.direction === 1 ? -this.width : canvas.width;
        this.entered = false;
    }

    update(dt) {
        if (super.update(dt)) return;
        this.x += this.direction * this.speed * dt / 1000;
        this.timeAlive -= dt;

        if (!this.entered) {
            if (this.x > 0 && this.x < canvas.width - this.width) this.entered = true;
        } else {
            if (this.x <= 0) { this.x = 0; this.direction = 1; }
            else if (this.x >= canvas.width - this.width) { this.x = canvas.width - this.width; this.direction = -1; }
        }

        if (this.timeAlive <= 0) this.active = false;
    }

    draw() {
        if (this.exploding) super.draw();
        else if (this.active) this.drawSprite(SPRITES.NODRIZA);
    }
}

class Bunker extends Entity {
    constructor(x, y) {
        super(x, y, 44, 32);
        this.stage = 0;
        this.hp = 1;
    }

    hit() {
        if (this.stage >= 4) {
            if (Math.random() < 0.35) this.active = false;
            return;
        }
        this.hp--;
        if (this.hp <= 0) {
            this.stage++;
            this.hp = [1, 3, 2, 1, 1][this.stage] || 1;
        }
    }

    draw() {
        if (this.active) this.drawSprite(SPRITES.BUNKER[Math.min(this.stage, 4)]);
    }
}

////////////////////
//LOGICA PRINCIPAL//
////////////////////

let player, bullets = [], invaders = [], bunkers = [], nodriza = null;
let score = 0, gameOverPlayed = false;
let invaderDir = 1, invaderSpeed = 5, invaderAnimTimer = 0, invaderAnimFrame = 0;
let invaderShootTimer = 0, invaderShootDelay = 1500, nodrizaTimer = 0, moveSoundIdx = 0;
let aliensKilled = 0, speedBoost = 0;
const ground = new Array(canvas.width).fill(true);

function createInvaders() {
    invaders = [];
    const startX = (canvas.width - (10 * 40)) / 2;
    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 11; c++) {
            const type = r === 0 ? "1" : r < 3 ? "2" : "3";
            const pts = r === 0 ? 50 : r < 3 ? 25 : 10;
            invaders.push(new Invader(startX + c * 32, 100 + r * 40, type, pts));
        }
    }
    playSound(sounds.createInvaders);
}

function startGame() {
    score = 0;
    gameOverPlayed = false;
    gameState = STATES.PLAYING;
    stopSound(sounds.title);
    
    player = new Player();
    bullets = [];
    bunkers = [];
    ground.fill(true);
    nodriza = null;
    
    invaderSpeed = 5;
    invaderDir = 1;
    speedBoost = 0;
    
    createInvaders();
    const spacing = canvas.width / 5;
    for (let i = 1; i <= 4; i++) bunkers.push(new Bunker(spacing * i - 24, player.y - 60));
}

function goToTitle() {
    gameState = STATES.TITLE;
    stopSound(sounds.ufo);
    playSound(sounds.title, true);
}

function update(dt) {
    if (gameState !== STATES.PLAYING && gameState !== STATES.GAMEOVER) return;
    if (gameState === STATES.GAMEOVER) {
        if (!gameOverPlayed) {
            stopSound(sounds.ufo);
            playSound(sounds.gameOver);
            gameOverPlayed = true;
        }
        return;
    }

    player.update(dt);

    // Nodriza
    nodrizaTimer += dt;
    if (!nodriza && nodrizaTimer > 16000 && Math.random() < 0.05) {
        nodriza = new Nodriza();
        nodrizaTimer = 0;
        playSound(sounds.ufo, true);
    }
    if (nodriza) {
        nodriza.update(dt);
        if (!nodriza.active) { nodriza = null; stopSound(sounds.ufo); }
    }

    // Invasores
    invaderAnimTimer += dt;
    if (invaderAnimTimer >= 1000) {
        invaderAnimFrame = 1 - invaderAnimFrame;
        invaderAnimTimer = 0;
        playSound(sounds.move[moveSoundIdx]);
        moveSoundIdx = (moveSoundIdx + 1) % 4;
    }

    let moveDown = false;
    const currentSpeed = (invaderSpeed + speedBoost) * dt / 1000;
    
    invaders.forEach(inv => {
        if (!inv.active) return;
        inv.update(dt);
        if (inv.exploding) return;
        
        inv.x += invaderDir * currentSpeed;
        if ((invaderDir === 1 && inv.x + inv.width > canvas.width - 22) || 
            (invaderDir === -1 && inv.x < 22)) moveDown = true;
        
        if (inv.checkCollision(player) || inv.y + inv.height >= canvas.height - 60) gameState = STATES.GAMEOVER;
        bunkers.forEach(b => { if (b.active && inv.checkCollision(b)) b.active = false; });
    });

    if (moveDown) {
        invaderDir *= -1;
        invaders.forEach(i => i.y += 16);
    }

    // Disparo Invasores
    invaderShootTimer += dt;
    const activeInvaders = invaders.filter(i => i.active && !i.exploding);
    if (invaderShootTimer > Math.max(1000, invaderShootDelay) && activeInvaders.length) {
        const shooter = activeInvaders[Math.floor(Math.random() * activeInvaders.length)];
        bullets.push(new Bullet(shooter.x + shooter.width/2, shooter.y + shooter.height, 250, "white"));
        invaderShootTimer = 0;
    }

    if (activeInvaders.length === 0) {
        invaderSpeed += 10;
        score += 200;
        speedBoost = 0;
        aliensKilled = 0;
        createInvaders();
    }

    //Colisiones de balas
    bullets.forEach(b => {
        b.update(dt);
        if (!b.active) return;

        //Contra Jugador
        if (b.speed > 0 && !player.dead && b.checkCollision(player)) {
            player.kill();
            b.active = false;
            if (player.lives <= 0) gameState = STATES.GAMEOVER;
        }

        //Contra Invasores/Nodriza
        if (b.speed < 0) {
            if (nodriza && nodriza.active && !nodriza.exploding && b.checkCollision(nodriza)) {
                nodriza.explode();
                score += 100;
                b.active = false;
                stopSound(sounds.ufo);
            }
            for (const inv of activeInvaders) {
                if (b.checkCollision(inv)) {
                    inv.explode();
                    playSound(sounds.invaderKill);
                    score += inv.points;
                    b.active = false;
                    aliensKilled++;
                    if (aliensKilled % 5 === 0) speedBoost += 1.5;
                    break;
                }
            }
        }

        //Contra Bunkers
        if (!b.bunkerHit) {
            for (const bunker of bunkers) {
                if (bunker.active && b.checkCollision(bunker)) {
                    bunker.hit();
                    b.bunkerHit = true;
                    b.active = bunker.stage > 2; //Atraviesa si está muy dañado
                    break;
                }
            }
        }
        
        //Contra otras balas
        bullets.forEach(other => {
            if (b !== other && b.active && other.active && b.speed * other.speed < 0 && b.checkCollision(other)) {
                b.active = other.active = false;
            }
        });
    });

    bullets = bullets.filter(b => b.active);
}

function render() {
    if (gameState === STATES.TITLE) {
        ctx.fillStyle = "black"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "white"; ctx.textAlign = "center";
        
        if (logoImage.complete && logoImage.naturalWidth !== 0) {
            //Dibujar logo centrado, ajustando escala si es muy grande
            const scale = Math.min(1, (canvas.width - 40) / logoImage.width);
            const w = logoImage.width * scale;
            const h = logoImage.height * scale;
            ctx.drawImage(logoImage, canvas.width/2 - w/2, canvas.height/2 - h/2 - 40, w, h);
        } else {
            ctx.font = "32px monospace"; ctx.fillText("SPACE INVADERS", canvas.width/2, canvas.height/2 - 40); //por si no carga
        }

        ctx.font = "24px monospace"; ctx.fillText("PRESS ENTER", canvas.width/2, canvas.height/2 + 110);
        ctx.font = "12px monospace"; ctx.fillText("Realizado por Diego Palencia Martinez", canvas.width/2, canvas.height - 20);
        return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Suelo
    ctx.fillStyle = "green";
    ground.forEach((g, x) => { if(g) ctx.fillRect(x, canvas.height - 60, 1, 6); });

    // Entidades
    if (player) player.draw();
    if (nodriza) nodriza.draw();
    bunkers.forEach(b => b.draw());
    invaders.forEach(i => i.draw(invaderAnimFrame));
    bullets.forEach(b => b.draw());

    // UI
    const scoreStr = score.toString().padStart(5, "0");
    player.drawSprite(SPRITES.SCORE, 10, 10);
    player.drawSprite(SPRITES.SYMBOL_1, SPRITES.SCORE.w + 8, 10);
    [...scoreStr].forEach((c, i) => player.drawSprite(SPRITES.NUMBERS[c], 100 + i * 14, 10));

    if (gameState === STATES.GAMEOVER) {
        ctx.textAlign = "center";
        ctx.fillStyle = "red"; ctx.font = "50px monospace";
        ctx.fillText("GAME OVER", canvas.width/2, canvas.height/2 - 20);
        ctx.fillStyle = "white"; ctx.font = "20px monospace";
        ctx.fillText("PRESS ENTER TO RESTART", canvas.width/2, canvas.height/2 + 30);
    } else if (gameState === STATES.PAUSED) {
        if (Math.floor(Date.now() / 500) % 2 === 0) {
            ctx.fillStyle = "red"; ctx.textAlign = "center"; ctx.font = "32px monospace";
            ctx.fillText("PAUSE", canvas.width/2, canvas.height/2 - 20);
        }
        ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.font = "16px monospace";
        ctx.fillText("PULSE ESC PARA CONTINUAR", canvas.width/2, canvas.height/2 + 20);
        ctx.fillText("PULSE ENTER PARA VOLVER AL TITULO", canvas.width/2, canvas.height/2 + 50);
    }
    if (muted) {
        ctx.fillStyle = "white"; ctx.font = "16px monospace"; ctx.textAlign = "left";
        ctx.fillText("MUTE", canvas.width - 50, 20);
    }
    ctx.textAlign = "left";
}

let lastTime = 0;

function gameLoop(timestamp) {
    const dt = timestamp - lastTime;
    lastTime = timestamp;
    update(dt);
    render();
    requestAnimationFrame(loop);
}

createInvaders();
playSound(sounds.title, true);
requestAnimationFrame(gameLoop);
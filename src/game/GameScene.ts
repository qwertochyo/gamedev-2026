import Phaser from 'phaser';
import {
  COLS,
  DROP_STEP_MS,
  LINES_PER_LEVEL,
  LOCK_DELAY_MS,
  MAX_LENGTH,
  PIPE_STEP_MS,
  SPAWN_COL,
  clearFullRows,
  columnTop,
  countTurns,
  createGrid,
  findFullRows,
  isFree,
  isOpposite,
  levelForLines,
  move,
  scoreForLines,
  shapeMultiplier,
  snakeLengthForLevel,
  stepMsForLevel,
  type Cell,
  type Dir,
  type Grid,
} from './logic';
import {
  CELL,
  DEAD_COLOR,
  DEAD_HEAD_COLOR,
  FIELD_H,
  FIELD_W,
  FIELD_X,
  FIELD_Y,
  GAME_HEIGHT,
  GAME_WIDTH,
  HEAD_COLOR,
  RENDER_SCALE,
  SNAKE_COLOR,
  drawBackground,
  drawBeam,
  drawBlocks,
  drawCellsFlash,
  drawPipe,
  drawSnake,
  lerpColor,
  pieceColor,
  type SnakeLook,
} from './draw';
import {
  ACCENT_COLOR,
  DEPTH,
  MUTED_COLOR,
  TEXT_COLOR,
  addText,
  floatText,
  showBanner,
  showGameOverCard,
  showStartScreen,
} from './ui';

// ввод
const SWIPE_MIN_PX = 30;
const INPUT_BUFFER_SIZE = 2;
const MAX_FRAME_DELTA_MS = 100; // защита от рывка после переключения вкладки
const SIDE_DIRS: Dir[] = ['left', 'right'];
const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches; // телефон или планшет

// анимации и отклик
const SLIDE_MS = 90; // за сколько змейка переползает в новую клетку
const PIPE_SLIDE_MS = 160; // за сколько труба переезжает на соседний столбец
const HARDEN_MAX = 0.75; // насколько змейка перекрашивается, пока стоит на опоре
const DANGER_PULSE_MS = 140; // скорость мигания трубы, когда под ней мало места
const GAME_OVER_DELAY_MS = 800; // пауза перед карточкой конца: видно, где застряла змейка
const BIG_CLEAR_LINES = 3; // со стольких линий сразу трясём экран
const VIBRATE_LINE_MS = 30;
const VIBRATE_BIG_MS = 80;
const VIBRATE_GAME_OVER_MS = 150;
const HINT_ALPHA = 0.55;
const POPUP_BOTTOM_MARGIN = 100; // «+600 ×3 за изгибы» не вылезает за дно стакана
const BADGE_OFFSET_PX = 6; // значок «×3» сдвинут от головы наружу

// верхняя панель
const HUD_LABEL_Y = 12;
const HUD_VALUE_Y = 48;
const HUD_ROW2_Y = 84;
const LEVEL_BAR_W = 80;
const LEVEL_BAR_COLOR = 0xfde047;
const HUD_EMPTY_COLOR = 0x1e293b;
const LENGTH_DOT = 9;
const LENGTH_DOT_STEP = 12;

const BEST_SCORE_KEY = 'zmeytris-best-score';

const KEY_DIRS: Partial<Record<string, Dir>> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowDown: 'down',
  KeyS: 'down',
};
const RESTART_KEYS = ['KeyR', 'Enter', 'Space'];

interface SceneData {
  skipIntro?: boolean; // при «Ещё раз» стартовый экран не показываем
}

/**
 * Змейтрис: змейка падает в стакан тетриса, застывает и заполняет линии.
 *
 * Правила поля — в logic.ts, рисование — в draw.ts, экраны и надписи — в ui.ts.
 * Здесь состояние партии, ввод и связь всего вместе.
 */
export class GameScene extends Phaser.Scene {
  private board!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private linesText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private multiplierText!: Phaser.GameObjects.Text;
  private closeStartScreen: (() => void) | null = null;

  // Состояние партии. Phaser не пересоздаёт сцену при restart(),
  // поэтому всё это сбрасывается в resetState(), а не при объявлении.
  private grid: Grid = [];
  private snake: Cell[] = [];
  private prevSnake: Cell[] = []; // где змейка была до последнего шага — для плавного движения
  private dir: Dir = 'down';
  private dirQueue: Dir[] = [];
  private pieceCount = 0; // сколько змеек застыло; это же номер (и цвет) следующей
  private score = 0;
  private lines = 0;
  private level = 1;
  private stepMs = 0;
  private stepTimer = 0;
  private isResting = false; // змейка упёрлась и ждёт: вдруг игрок повернёт
  private restMs = 0; // сколько змейка уже стоит на опоре
  private isDropping = false; // ускоренное падение
  private pipeCol = SPAWN_COL;
  private prevPipeCol = SPAWN_COL;
  private pipeDir = 1; // 1 — труба едет вправо, -1 — влево
  private pipeTimer = 0;
  private bestScore = 0;
  private isStarted = false;
  private isGameOver = false;
  private canRestart = false;
  private swipeStart: { x: number; y: number } | null = null;

  constructor() {
    super('GameScene');
  }

  create(data: SceneData = {}): void {
    this.resetState();
    // Игра рисуется в координатах 540×960, камера растягивает её на увеличенный canvas
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    drawBackground(this.add.graphics());
    this.board = this.add.graphics();
    this.multiplierText = addText(this, 0, 0, '', 24, ACCENT_COLOR, true)
      .setOrigin(0.5)
      .setStroke('#020617', 6)
      .setDepth(DEPTH.fx);
    this.createHud();
    this.createHint();
    this.setupKeyboard();
    this.setupPointer();
    this.spawnSnake();

    if (data.skipIntro) {
      this.isStarted = true;
    } else {
      this.hintText.setAlpha(0); // подсказка появится, когда уберём стартовый экран
      this.closeStartScreen = showStartScreen(this, this.bestScore, IS_TOUCH, () => this.startGame());
    }
  }

  update(_time: number, delta: number): void {
    if (this.isStarted && !this.isGameOver) this.tick(Math.min(delta, MAX_FRAME_DELTA_MS));
    this.render();
  }

  private tick(dt: number): void {
    this.updatePipe(dt);

    this.stepTimer += dt;
    while (this.stepTimer >= this.currentStepMs() && !this.isGameOver) {
      this.stepTimer -= this.currentStepMs();
      this.step();
    }

    if (this.isResting && !this.isGameOver) {
      this.restMs += dt;
      if (this.restMs >= LOCK_DELAY_MS) this.freeze();
    }
  }

  private currentStepMs(): number {
    return this.isDropping ? DROP_STEP_MS : this.stepMs;
  }

  private resetState(): void {
    this.grid = createGrid();
    this.snake = [];
    this.prevSnake = [];
    this.dir = 'down';
    this.dirQueue = [];
    this.pieceCount = 0;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.stepMs = stepMsForLevel(this.level);
    this.stepTimer = 0;
    this.isResting = false;
    this.restMs = 0;
    this.isDropping = false;
    this.pipeCol = SPAWN_COL;
    this.prevPipeCol = SPAWN_COL;
    this.pipeDir = 1;
    this.pipeTimer = 0;
    this.bestScore = loadBestScore();
    this.isStarted = false;
    this.isGameOver = false;
    this.canRestart = false;
    this.swipeStart = null;
    this.closeStartScreen = null;
  }

  private startGame(): void {
    if (this.isStarted) return;
    this.isStarted = true;
    this.closeStartScreen?.();
    this.closeStartScreen = null;
    this.tweens.add({ targets: this.hintText, alpha: HINT_ALPHA, duration: 300 });
  }

  // ---------- правила ----------

  /** Один шаг змейки (вызывается каждые stepMs). */
  private step(): void {
    this.prevSnake = this.snake.map((cell) => ({ ...cell }));
    const queued = this.dirQueue.shift();
    if (queued) this.isDropping = false;

    const moveDir = this.resolveMove(queued ?? this.dir);
    if (moveDir === null) {
      this.rest(queued);
      return;
    }

    this.dir = moveDir;
    this.isResting = false;
    this.restMs = 0;
    this.snake.unshift(move(this.snake[0], moveDir)); // голова шагает вперёд,
    this.snake.pop(); // хвост подтягивается
  }

  /** Куда на самом деле шагнёт голова, если ползти в сторону dir. null — некуда. */
  private resolveMove(dir: Dir): Dir | null {
    const head = this.snake[0];
    if (isFree(this.grid, move(head, dir))) return dir;
    // Упёрлась сбоку — сползает вниз вдоль препятствия
    if (dir !== 'down' && isFree(this.grid, move(head, 'down'))) return 'down';
    return null;
  }

  /**
   * Змейка упёрлась. Застывает не сразу: LOCK_DELAY_MS даём на поворот вбок (таймер — в tick()).
   * Сразу застывает, если игрок сам направил её вниз или повернуть некуда.
   */
  private rest(queued: Dir | undefined): void {
    this.isDropping = false;
    if (queued === 'down' || !this.canTurnAside()) {
      this.freeze();
      return;
    }
    this.isResting = true;
  }

  /** Есть ли свободная клетка слева или справа от головы (разворот назад не считается). */
  private canTurnAside(): boolean {
    const head = this.snake[0];
    return SIDE_DIRS.some((dir) => !isOpposite(dir, this.dir) && isFree(this.grid, move(head, dir)));
  }

  private isSnakeInPipe(): boolean {
    return this.snake.some((cell) => cell.row < 0);
  }

  private freeze(): void {
    this.isResting = false;
    this.restMs = 0;
    // Часть змейки осталась в трубе — стакан переполнен
    if (this.isSnakeInPipe()) {
      this.gameOver('Змейка не вылезла из трубы');
      return;
    }

    const multiplier = shapeMultiplier(countTurns(this.snake));
    const pieceId = this.pieceCount++;
    for (const cell of this.snake) {
      this.grid[cell.row][cell.col] = pieceId;
    }
    this.flashCells(this.snake);
    this.hideHint();
    this.clearLines(multiplier);
    this.spawnSnake();
  }

  /** multiplier — множитель за изгибы змейки, которая закрыла линии. */
  private clearLines(multiplier: number): void {
    const rows = findFullRows(this.grid);
    if (rows.length === 0) return;
    clearFullRows(this.grid);

    const oldLevel = this.level;
    const points = scoreForLines(rows.length, multiplier);
    this.score += points;
    this.lines += rows.length;
    this.level = levelForLines(this.lines);

    this.flashRows(rows);
    this.showLinePoints(rows, points, multiplier);
    const isBigClear = rows.length >= BIG_CLEAR_LINES;
    if (isBigClear) this.cameras.main.shake(250, 0.006);
    vibrate(isBigClear ? VIBRATE_BIG_MS : VIBRATE_LINE_MS);
    if (this.level > oldLevel) this.showLevelUp(oldLevel);
    this.updateHud(true);
  }

  private spawnSnake(): void {
    this.dir = 'down';
    this.dirQueue = [];
    this.stepTimer = 0;
    this.isResting = false;
    this.restMs = 0;
    this.isDropping = false;
    this.pipeTimer = 0;
    this.prevPipeCol = this.pipeCol; // труба встаёт ровно над своим столбцом
    this.stepMs = stepMsForLevel(this.level);

    // Клетка под трубой занята — новой змейке некуда выползти
    if (!isFree(this.grid, { col: this.pipeCol, row: 0 })) {
      this.snake = [];
      this.prevSnake = [];
      this.gameOver('Под трубой не осталось места');
      return;
    }

    // Голова в верхней клетке поля, тело выше — внутри трубы
    const length = snakeLengthForLevel(this.level);
    this.snake = Array.from({ length }, (_, i) => ({ col: this.pipeCol, row: -i }));
    this.prevSnake = this.snake.map((cell) => ({ ...cell }));
  }

  /** Труба ездит над стаканом туда-обратно, но стоит, пока из неё вылезает змейка. */
  private updatePipe(dt: number): void {
    if (this.isSnakeInPipe()) return;

    this.pipeTimer += dt;
    if (this.pipeTimer < PIPE_STEP_MS) return;
    this.pipeTimer -= PIPE_STEP_MS;

    const next = this.pipeCol + this.pipeDir;
    if (next < 0 || next >= COLS) this.pipeDir = -this.pipeDir; // у стенки разворачивается
    this.prevPipeCol = this.pipeCol;
    this.pipeCol += this.pipeDir;
  }

  private gameOver(reason: string): void {
    this.isGameOver = true;
    this.isResting = false;
    const isNewBest = this.score > this.bestScore;
    if (isNewBest) {
      this.bestScore = this.score;
      saveBestScore(this.score);
    }
    this.updateHud(false);
    this.cameras.main.shake(300, 0.008);
    vibrate(VIBRATE_GAME_OVER_MS);

    const info = {
      reason,
      score: this.score,
      lines: this.lines,
      level: this.level,
      bestScore: this.bestScore,
      isNewBest,
    };
    // Небольшая пауза: игрок успевает увидеть, где застряла змейка
    this.time.delayedCall(GAME_OVER_DELAY_MS, () => {
      showGameOverCard(this, info, IS_TOUCH, () => this.restart());
      this.canRestart = true;
    });
  }

  private restart(): void {
    if (!this.canRestart) return;
    this.canRestart = false;
    this.scene.restart({ skipIntro: true });
  }

  // ---------- ввод ----------

  /** Кладёт команду в буфер. Повтор и разворот назад игнорируются. */
  private queueDir(dir: Dir): void {
    if (!this.isStarted || this.isGameOver) return;
    if (dir === 'down' && this.dir === 'down' && this.dirQueue.length === 0) {
      this.pressDownWhileFalling();
      return;
    }
    if (this.dirQueue.length >= INPUT_BUFFER_SIZE) return;

    const last = this.dirQueue[this.dirQueue.length - 1] ?? this.dir;
    if (dir === last || isOpposite(dir, last)) return;
    this.dirQueue.push(dir);
    // Змейка стоит на опоре — поворачиваем сразу, не дожидаясь следующего шага
    if (this.isResting) this.stepTimer = this.currentStepMs();
  }

  /** ↓, когда змейка и так ползёт вниз: в воздухе — ускорить падение, на опоре — застыть сразу. */
  private pressDownWhileFalling(): void {
    if (isFree(this.grid, move(this.snake[0], 'down'))) {
      this.isDropping = true;
      this.stepTimer = Math.min(this.stepTimer, DROP_STEP_MS); // следующий шаг — уже быстрый
      return;
    }
    this.freeze();
  }

  private setupKeyboard(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    keyboard.addCapture('LEFT,RIGHT,DOWN,SPACE');
    keyboard.on('keydown', (event: KeyboardEvent) => this.handleKey(event.code));
  }

  private handleKey(code: string): void {
    if (!this.isStarted) {
      this.startGame(); // на стартовом экране — любая клавиша
      return;
    }
    if (this.isGameOver) {
      if (RESTART_KEYS.includes(code)) this.restart();
      return;
    }
    const dir = KEY_DIRS[code];
    if (dir) this.queueDir(dir);
  }

  private setupPointer(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.swipeStart = this.toWorld(pointer);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.handleSwipe(pointer));
    this.input.on('pointerup', () => {
      this.swipeStart = null;
      if (!this.isStarted) this.startGame(); // на стартовом экране — касание в любом месте
    });
  }

  /** Координаты пальца в игровых пикселях 540×960 (canvas увеличен камерой). */
  private toWorld(pointer: Phaser.Input.Pointer): { x: number; y: number } {
    const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    return { x: point.x, y: point.y };
  }

  /** Каждые SWIPE_MIN_PX движения пальца — новая команда, палец можно не отрывать. */
  private handleSwipe(pointer: Phaser.Input.Pointer): void {
    if (!this.swipeStart || !pointer.isDown) return;

    const current = this.toWorld(pointer);
    const dx = current.x - this.swipeStart.x;
    const dy = current.y - this.swipeStart.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN_PX) return;

    this.swipeStart = current;
    if (Math.abs(dx) > Math.abs(dy)) this.queueDir(dx < 0 ? 'left' : 'right');
    else if (dy > 0) this.queueDir('down'); // свайп вверх ничего не делает
  }

  // ---------- отрисовка ----------

  /** Каждый кадр перерисовывает стакан: так змейка и труба двигаются плавно. */
  private render(): void {
    const g = this.board;
    g.clear();
    const pipeX = this.pipeVisualCol();
    const danger = this.dangerLevel();
    drawBeam(g, pipeX, columnTop(this.grid, this.pipeCol), danger);
    drawBlocks(g, this.grid);
    const snakeCells = this.snakeVisualCells();
    drawSnake(g, snakeCells, this.snakeLook());
    drawPipe(g, pipeX, danger);
    this.updateMultiplierBadge(snakeCells);
  }

  /** Змейка между прошлой и текущей клетками: доезжает за SLIDE_MS после шага. */
  private snakeVisualCells(): Cell[] {
    const t = easeOut(Math.min(1, this.stepTimer / Math.min(SLIDE_MS, this.currentStepMs())));
    return this.snake.map((cell, i) => {
      const from = this.prevSnake[i] ?? cell;
      return { col: from.col + (cell.col - from.col) * t, row: from.row + (cell.row - from.row) * t };
    });
  }

  private pipeVisualCol(): number {
    const t = easeOut(Math.min(1, this.pipeTimer / PIPE_SLIDE_MS));
    return this.prevPipeCol + (this.pipeCol - this.prevPipeCol) * t;
  }

  /** 0…1 — насколько красной рисовать трубу. Мигает, если змейка не вылезет из неё прямо вниз. */
  private dangerLevel(): number {
    if (this.isGameOver) return 1;
    const isDanger = columnTop(this.grid, this.pipeCol) < snakeLengthForLevel(this.level);
    return isDanger ? 0.5 + 0.5 * Math.sin(this.time.now / DANGER_PULSE_MS) : 0;
  }

  private snakeLook(): SnakeLook {
    const lookDir = this.dirQueue[0] ?? this.dir; // глаза сразу смотрят туда, куда нажал игрок
    if (this.isGameOver) return { body: DEAD_COLOR, head: DEAD_HEAD_COLOR, lookDir, isDead: true };

    // Пока змейка стоит на опоре, она «твердеет» — перекрашивается в цвет будущих блоков
    const hardness = this.isResting ? (this.restMs / LOCK_DELAY_MS) * HARDEN_MAX : 0;
    const target = pieceColor(this.pieceCount);
    return {
      body: lerpColor(SNAKE_COLOR, target, hardness),
      head: lerpColor(HEAD_COLOR, target, hardness),
      lookDir,
      isDead: false,
    };
  }

  // ---------- верхняя панель ----------

  private createHud(): void {
    const center = GAME_WIDTH / 2;
    const right = FIELD_X + FIELD_W;
    const label = (x: number, text: string): Phaser.GameObjects.Text =>
      addText(this, x, HUD_LABEL_Y, text, 13, MUTED_COLOR, true).setLetterSpacing(2);

    label(FIELD_X, 'ОЧКИ');
    label(center, 'УРОВЕНЬ').setOrigin(0.5, 0);
    label(right, 'РЕКОРД').setOrigin(1, 0);
    this.scoreText = addText(this, FIELD_X, HUD_VALUE_Y, '', 34, TEXT_COLOR, true).setOrigin(0, 0.5);
    this.levelText = addText(this, center, HUD_VALUE_Y, '', 34, TEXT_COLOR, true).setOrigin(0.5);
    this.bestText = addText(this, right, HUD_VALUE_Y, '', 34, TEXT_COLOR, true).setOrigin(1, 0.5);
    this.linesText = addText(this, FIELD_X, HUD_ROW2_Y, '', 15, MUTED_COLOR).setOrigin(0, 0.5);
    addText(this, right - MAX_LENGTH * LENGTH_DOT_STEP - 6, HUD_ROW2_Y, 'ДЛИНА', 13, MUTED_COLOR, true)
      .setOrigin(1, 0.5)
      .setLetterSpacing(2);

    this.hud = this.add.graphics();
    this.updateHud(false);
  }

  private updateHud(bumpScore: boolean): void {
    this.scoreText.setText(String(this.score));
    this.levelText.setText(String(this.level));
    this.bestText.setText(String(Math.max(this.bestScore, this.score)));
    this.bestText.setColor(this.score > this.bestScore ? ACCENT_COLOR : TEXT_COLOR); // рекорд бьётся прямо сейчас
    this.linesText.setText(`Линии: ${this.lines}`);
    this.drawHudBars();
    if (bumpScore) bump(this, this.scoreText);
  }

  /** Полоска до следующего уровня и квадратики длины змейки. */
  private drawHudBars(): void {
    const g = this.hud;
    g.clear();

    const barX = GAME_WIDTH / 2 - LEVEL_BAR_W / 2;
    const progress = (this.lines % LINES_PER_LEVEL) / LINES_PER_LEVEL;
    g.fillStyle(HUD_EMPTY_COLOR);
    g.fillRoundedRect(barX, HUD_ROW2_Y - 3, LEVEL_BAR_W, 6, 3);
    if (progress > 0) {
      g.fillStyle(LEVEL_BAR_COLOR);
      g.fillRoundedRect(barX, HUD_ROW2_Y - 3, LEVEL_BAR_W * progress, 6, 3);
    }

    const length = snakeLengthForLevel(this.level);
    const dotsX = FIELD_X + FIELD_W - MAX_LENGTH * LENGTH_DOT_STEP + (LENGTH_DOT_STEP - LENGTH_DOT);
    for (let i = 0; i < MAX_LENGTH; i++) {
      g.fillStyle(i < length ? SNAKE_COLOR : HUD_EMPTY_COLOR);
      g.fillRoundedRect(dotsX + i * LENGTH_DOT_STEP, HUD_ROW2_Y - LENGTH_DOT / 2, LENGTH_DOT, LENGTH_DOT, 2);
    }
  }

  // ---------- подсказки и эффекты ----------

  /** Подсказка видна, пока не застыла первая змейка. */
  private createHint(): void {
    const controls = IS_TOUCH ? 'Свайпай ← → ↓' : 'Жми ← → ↓';
    const text = `${controls}\n↓ ещё раз — быстрее\n\nЗмейка застынет,\nкогда упрётся вниз`;
    this.hintText = addText(this, FIELD_X + FIELD_W / 2, FIELD_Y + FIELD_H / 2, text, 24)
      .setAlign('center')
      .setLineSpacing(6)
      .setOrigin(0.5)
      .setAlpha(HINT_ALPHA)
      .setDepth(DEPTH.hint);
  }

  private hideHint(): void {
    if (!this.hintText.visible || this.tweens.isTweening(this.hintText)) return;
    this.tweens.add({
      targets: this.hintText,
      alpha: 0,
      duration: 300,
      onComplete: () => this.hintText.setVisible(false),
    });
  }

  /** Белая вспышка на застывших клетках. */
  private flashCells(cells: Cell[]): void {
    const flash = this.add.graphics().setDepth(DEPTH.fx).setAlpha(0.7);
    drawCellsFlash(flash, cells);
    this.tweens.add({ targets: flash, alpha: 0, duration: 250, onComplete: () => flash.destroy() });
  }

  /** Вспышка на месте исчезнувших строк. */
  private flashRows(rows: number[]): void {
    for (const row of rows) {
      const flash = this.add
        .rectangle(FIELD_X + FIELD_W / 2, FIELD_Y + (row + 0.5) * CELL, FIELD_W, CELL, 0xffffff)
        .setDepth(DEPTH.fx);
      this.tweens.add({
        targets: flash,
        alpha: 0,
        scaleY: 0.2,
        duration: 400,
        ease: 'Cubic.easeOut',
        onComplete: () => flash.destroy(),
      });
    }
  }

  /** «+600» и «×3 за изгибы» на высоте исчезнувших строк. */
  private showLinePoints(rows: number[], points: number, multiplier: number): void {
    const middleRow = rows.reduce((sum, row) => sum + row, 0) / rows.length;
    const x = FIELD_X + FIELD_W / 2;
    const y = Math.min(FIELD_Y + (middleRow + 0.5) * CELL, FIELD_Y + FIELD_H - POPUP_BOTTOM_MARGIN);
    floatText(this, x, y, `+${points}`, 52, ACCENT_COLOR);
    if (multiplier > 1) floatText(this, x, y + 50, `×${multiplier} за изгибы`, 30, TEXT_COLOR, 120);
  }

  /** «×3» у головы: во столько раз больше очков принесёт змейка, если застынет такой. */
  private updateMultiplierBadge(cells: Cell[]): void {
    const head = cells[0];
    const multiplier = shapeMultiplier(countTurns(this.snake));
    const isVisible = !this.isGameOver && head !== undefined && head.row >= 0 && multiplier > 1;
    if (!isVisible) {
      this.multiplierText.setVisible(false).setText('');
      return;
    }

    const label = `×${multiplier}`;
    if (this.multiplierText.text !== label) bump(this, this.multiplierText.setText(label));
    // чуть правее и выше клетки головы, чтобы не закрывать глаза
    const x = FIELD_X + (head.col + 1) * CELL + BADGE_OFFSET_PX;
    const y = FIELD_Y + head.row * CELL - BADGE_OFFSET_PX;
    this.multiplierText.setVisible(true).setPosition(x, y);
  }

  private showLevelUp(oldLevel: number): void {
    const longer = snakeLengthForLevel(this.level) > snakeLengthForLevel(oldLevel);
    const faster = stepMsForLevel(this.level) < stepMsForLevel(oldLevel);
    const changes = [longer && 'длиннее', faster && 'быстрее'].filter(Boolean).join(' и ');
    showBanner(this, `Уровень ${this.level}`, changes ? `Змейка ${changes}` : 'Так держать!');
    bump(this, this.levelText);
  }
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** Число на панели на миг увеличивается — видно, что оно изменилось. */
function bump(scene: Phaser.Scene, text: Phaser.GameObjects.Text): void {
  scene.tweens.add({ targets: text, scale: { from: 1.3, to: 1 }, duration: 300, ease: 'Back.easeOut' });
}

function vibrate(ms: number): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // вибрации нет — не страшно
  }
}

// ---------- рекорд ----------

// На игровых порталах и в приватном режиме localStorage бывает недоступен
function loadBestScore(): number {
  try {
    return Number(localStorage.getItem(BEST_SCORE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBestScore(score: number): void {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch {
    // рекорд просто не сохранится
  }
}

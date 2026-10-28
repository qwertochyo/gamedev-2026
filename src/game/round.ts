// Одна партия: стакан, змейка, труба, очки, уровень, фаза и правила хода. Без Phaser — только данные и правила.
// Наружу партия сообщает событиями (RoundEvents): сцена по ним показывает эффекты, панель и экраны.

import {
  COLS,
  DROP_STEP_MS,
  SPAWN_COL,
  clearFullRows,
  countTurns,
  createGrid,
  findFullRows,
  isFree,
  isOpposite,
  levelForLines,
  move,
  phaseForScore,
  phaseParams,
  scoreForLines,
  shapeMultiplier,
  snakeLengthForLevel,
  stepMsForLevel,
  type Cell,
  type Dir,
  type Grid,
  type PhaseParams,
} from './logic';

const INPUT_BUFFER_SIZE = 2; // сколько команд копится, чтобы быстрые «вправо, вниз» не терялись
const SIDE_DIRS: Dir[] = ['left', 'right'];

/** Что происходит в партии. Сцена подписывается и показывает эффекты, панель и экраны. */
export interface RoundEvents {
  onFreeze(cells: Cell[]): void; // змейка застыла блоками
  onLinesCleared(rows: number[], points: number, multiplier: number): void;
  onLevelUp(oldLevel: number, newLevel: number): void;
  onPhaseChange(phase: number): void;
  onScoreChange(): void; // выросли очки и линии
  onGameOver(reason: string): void;
}

/**
 * Состояние одной партии. Поля открыты для чтения (отрисовка, панель),
 * а меняют их только методы этого класса. Новая партия — новый объект Round.
 */
export class Round {
  grid: Grid = createGrid();
  snake: Cell[] = [];
  prevSnake: Cell[] = []; // где змейка была до последнего шага — для плавного движения
  dir: Dir = 'down';
  dirQueue: Dir[] = [];
  pieceCount = 0; // сколько змеек застыло; это же номер (и цвет) следующей
  score = 0;
  lines = 0;
  level = 1;
  phase = 1;
  stepMs = stepMsForLevel(1);
  stepTimer = 0;
  isResting = false; // змейка упёрлась и ждёт: вдруг игрок повернёт
  restMs = 0; // сколько змейка уже стоит на опоре
  isDropping = false; // ускоренное падение
  pipeCol = SPAWN_COL;
  prevPipeCol = SPAWN_COL;
  pipeDir = 1; // 1 — труба едет вправо, -1 — влево
  pipeTimer = 0;
  isOver = false;

  private readonly events: RoundEvents;

  constructor(events: RoundEvents) {
    this.events = events;
    this.spawnSnake();
  }

  /** Игровое время: сцена зовёт каждый кадр, пока идёт игра. На паузе не зовёт — и всё стоит. */
  tick(dt: number): void {
    this.updatePipe(dt);

    this.stepTimer += dt;
    while (this.stepTimer >= this.currentStepMs() && !this.isOver) {
      this.stepTimer -= this.currentStepMs();
      this.step();
    }

    if (this.isResting && !this.isOver) {
      this.restMs += dt;
      if (this.restMs >= this.params().lockDelayMs) this.freeze();
    }
  }

  currentStepMs(): number {
    return this.isDropping ? DROP_STEP_MS : this.stepMs;
  }

  /** Параметры текущей фазы: скорость трубы и пауза перед застыванием. */
  params(): PhaseParams {
    return phaseParams(this.phase);
  }

  /** Во сколько раз умножатся очки, если змейка застынет такой формы. */
  multiplier(): number {
    return shapeMultiplier(countTurns(this.snake));
  }

  /** Кладёт команду в буфер. Повтор и разворот назад игнорируются. */
  queueDir(dir: Dir): void {
    if (this.isOver) return;
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
   * Змейка упёрлась. Застывает не сразу: lockDelayMs текущей фазы даём на поворот вбок (таймер — в tick()).
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

    const multiplier = this.multiplier();
    const pieceId = this.pieceCount++;
    for (const cell of this.snake) {
      this.grid[cell.row][cell.col] = pieceId;
    }
    this.events.onFreeze(this.snake);
    this.clearLines(multiplier);
    this.spawnSnake();
  }

  /** Убирает заполненные строки. multiplier — множитель за изгибы змейки, которая их закрыла. */
  private clearLines(multiplier: number): void {
    const rows = findFullRows(this.grid);
    if (rows.length === 0) return;
    clearFullRows(this.grid);

    const points = scoreForLines(rows.length, multiplier);
    this.events.onLinesCleared(rows, points, multiplier);
    this.addProgress(rows.length, points);
  }

  /**
   * Единственное место, где растут очки и линии. Здесь же переходы уровня и фазы,
   * поэтому любой новый источник очков сам двигает прогресс — достаточно вызвать этот метод.
   */
  private addProgress(lines: number, points: number): void {
    const oldLevel = this.level;
    this.score += points;
    this.lines += lines;
    this.level = levelForLines(this.lines);

    if (this.level > oldLevel) this.events.onLevelUp(oldLevel, this.level);
    const phase = phaseForScore(this.score);
    if (phase !== this.phase) this.enterPhase(phase);
    this.events.onScoreChange();
  }

  /** Переход в новую фазу: правила те же, меняются только параметры из phaseParams(). */
  private enterPhase(phase: number): void {
    this.phase = phase;
    this.events.onPhaseChange(phase);
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
    const pipeStepMs = this.params().pipeStepMs;
    if (this.pipeTimer < pipeStepMs) return;
    this.pipeTimer -= pipeStepMs;

    const next = this.pipeCol + this.pipeDir;
    if (next < 0 || next >= COLS) this.pipeDir = -this.pipeDir; // у стенки разворачивается
    this.prevPipeCol = this.pipeCol;
    this.pipeCol += this.pipeDir;
  }

  private gameOver(reason: string): void {
    this.isOver = true;
    this.isResting = false;
    this.events.onGameOver(reason);
  }
}

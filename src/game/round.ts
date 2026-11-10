// Одна партия: стакан, змейка, заказы фигур, труба, очки, уровень, фаза и правила хода. Без Phaser — только данные и правила.
// Наружу партия сообщает событиями (RoundEvents): сцена по ним показывает эффекты, панель и экраны.

import {
  COLS,
  DROP_STEP_MS,
  ORDER_BONUS,
  SNAKE_LENGTH,
  SPAWN_COL,
  clearFullRows,
  createGrid,
  fallMsForLevel,
  findFullRows,
  isFree,
  isOpposite,
  levelForLines,
  move,
  phaseForScore,
  phaseParams,
  scoreForLines,
  shapeOf,
  shuffledBag,
  type Cell,
  type Dir,
  type Grid,
  type PhaseParams,
  type ShapeId,
} from './logic';

/** Почему партия закончилась — для карточки конца игры. */
export interface GameOverReason {
  title: string;
  text: string;
  ordered?: ShapeId; // какую фигуру заказали
  drawn?: ShapeId | null; // какую нарисовал игрок
}

/** Что происходит в партии. Сцена подписывается и показывает эффекты, панель и экраны. */
export interface RoundEvents {
  onFreeze(cells: Cell[]): void; // змейка застыла блоками — фигура совпала с заказом
  onLinesCleared(rows: number[], points: number): void;
  onLevelUp(oldLevel: number, newLevel: number): void;
  onPhaseChange(phase: number): void;
  onScoreChange(): void; // выросли очки, сменился заказ
  onNewOrder(shape: ShapeId): void; // заказ выполнен, новая змейка получила следующий
  onGameOver(reason: GameOverReason): void;
}

/**
 * Состояние одной партии. Поля открыты для чтения (отрисовка, панель),
 * а меняют их только методы этого класса. Новая партия — новый объект Round.
 */
export class Round {
  grid: Grid = createGrid();
  snake: Cell[] = [];
  prevSnake: Cell[] = []; // где змейка была до последнего движения — для плавной отрисовки
  moveAge = 0; // сколько мс прошло с последнего движения змейки
  dir: Dir = 'down'; // куда последний раз шагнула голова
  orders: ShapeId[] = []; // очередь заказов: [0] — текущий, [1] — следующий
  pieceCount = 0; // сколько змеек застыло; это же номер (и цвет) следующей
  score = 0;
  lines = 0;
  level = 1;
  phase = 1;
  fallMs = fallMsForLevel(1);
  fallTimer = 0;
  isResting = false; // змейка легла на опору и ждёт: можно ещё дорисовать
  restMs = 0; // сколько змейка уже лежит на опоре
  isDropping = false; // брошена пробелом: падает до опоры и сразу застывает
  // «Потолок»: выше этой строки змейка подняться не может. Голова поднимается не больше чем на длину змейки
  // над строкой, куда её опустила гравитация (у новой змейки это строка 0), и потолок опускается при каждом падении.
  // Так ↑ можно жать сколько угодно, но уползти от гравитации и висеть на поле нельзя
  upLimitRow = -SNAKE_LENGTH;
  pipeCol = SPAWN_COL;
  prevPipeCol = SPAWN_COL;
  pipeDir = 1; // 1 — труба едет вправо, -1 — влево
  pipeTimer = 0;
  isOver = false;

  private readonly events: RoundEvents;

  constructor(events: RoundEvents) {
    this.events = events;
    this.fillOrders();
    this.spawnSnake();
  }

  /** Заказанная фигура — её нужно нарисовать текущей змейкой. */
  order(): ShapeId {
    return this.orders[0];
  }

  /** Следующий заказ — показываем заранее, как «следующую фигуру» в тетрисе. */
  nextOrder(): ShapeId {
    return this.orders[1];
  }

  /** Совпадает ли змейка с заказом прямо сейчас. */
  matchesOrder(): boolean {
    return this.snake.length > 0 && shapeOf(this.snake) === this.order();
  }

  /** Игровое время: сцена зовёт каждый кадр, пока идёт игра. На паузе не зовёт — и всё стоит. */
  tick(dt: number): void {
    this.moveAge += dt;
    this.updatePipe(dt);

    this.fallTimer += dt;
    while (this.fallTimer >= this.currentFallMs() && !this.isOver) {
      this.fallTimer -= this.currentFallMs();
      this.fall();
    }

    if (this.isResting && !this.isOver) {
      this.restMs += dt;
      if (this.restMs >= this.params().lockDelayMs) this.freeze();
    }
  }

  currentFallMs(): number {
    return this.isDropping ? DROP_STEP_MS : this.fallMs;
  }

  /** Параметры текущей фазы: скорость трубы и пауза перед застыванием. */
  params(): PhaseParams {
    return phaseParams(this.phase);
  }

  /** Рисование: голова шагает в сторону dir, тело тянется следом. Срабатывает сразу. */
  moveHead(dir: Dir): void {
    if (this.isOver || this.isDropping) return;
    if (isOpposite(dir, this.dir)) return; // назад, в шею, нельзя
    const next = move(this.snake[0], dir);
    if (next.row < 0) return; // выше стакана, обратно в трубу, ползти нельзя
    if (next.row < this.upLimitRow) return; // выше потолка — не пускает гравитация
    if (!isFree(this.grid, next) || this.isOwnCell(next)) return;

    this.remember();
    this.snake.unshift(next); // голова шагает,
    this.snake.pop(); // хвост подтягивается
    this.dir = dir;
  }

  /** Пробел: фигура падает до опоры в том виде, в каком её оставил игрок, и сразу застывает. */
  drop(): void {
    if (this.isOver || this.isDropping) return;
    this.isDropping = true;
    this.fallTimer = this.currentFallMs(); // первый шаг броска — в ближайшем кадре
  }

  /** Гравитация: вся змейка опускается на клетку, сохраняя форму. */
  private fall(): void {
    if (this.canFall()) {
      this.remember();
      this.snake = this.snake.map((cell) => ({ col: cell.col, row: cell.row + 1 }));
      this.upLimitRow++; // потолок опускается вместе со змейкой
      this.isResting = false;
      this.restMs = 0;
      return;
    }
    // Легла на опору: после броска застывает сразу, иначе — пауза, чтобы дорисовать (таймер — в tick())
    if (this.isDropping) this.freeze();
    else this.isResting = true;
  }

  private canFall(): boolean {
    return this.snake.every((cell) => isFree(this.grid, { col: cell.col, row: cell.row + 1 }));
  }

  private isOwnCell(target: Cell): boolean {
    // хвост в этот же момент уходит, поэтому его клетку не считаем
    return this.snake.slice(0, -1).some((cell) => cell.col === target.col && cell.row === target.row);
  }

  /** Запоминает позицию до движения — отрисовка плавно доведёт змейку до новой. */
  private remember(): void {
    this.prevSnake = this.snake.map((cell) => ({ ...cell }));
    this.moveAge = 0;
  }

  private isSnakeInPipe(): boolean {
    return this.snake.some((cell) => cell.row < 0);
  }

  private freeze(): void {
    this.isResting = false;
    this.restMs = 0;
    this.isDropping = false;
    // Часть змейки осталась в трубе — стакан переполнен
    if (this.isSnakeInPipe()) {
      this.gameOver({ title: 'Стакан полон!', text: 'Змейка не вылезла из трубы' });
      return;
    }
    // Нарисована не та фигура — поражение
    const ordered = this.order();
    const drawn = shapeOf(this.snake);
    if (drawn !== ordered) {
      this.gameOver({ title: 'Не та фигура!', text: 'Змейка застыла не той фигурой', ordered, drawn });
      return;
    }

    const pieceId = this.pieceCount++;
    for (const cell of this.snake) {
      this.grid[cell.row][cell.col] = pieceId;
    }
    this.events.onFreeze(this.snake);
    this.orders.shift();
    this.fillOrders();
    const lines = this.clearLines();
    this.addProgress(lines, ORDER_BONUS + scoreForLines(lines));
    this.spawnSnake();
    if (!this.isOver) this.events.onNewOrder(this.order());
  }

  /** Убирает заполненные строки и возвращает, сколько их было. */
  private clearLines(): number {
    const rows = findFullRows(this.grid);
    if (rows.length === 0) return 0;
    clearFullRows(this.grid);
    this.events.onLinesCleared(rows, scoreForLines(rows.length));
    return rows.length;
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

  /** В очереди всегда есть текущий и следующий заказ. */
  private fillOrders(): void {
    while (this.orders.length < 2) this.orders.push(...shuffledBag());
  }

  private spawnSnake(): void {
    this.dir = 'down';
    this.fallTimer = 0;
    this.isResting = false;
    this.restMs = 0;
    this.isDropping = false;
    this.upLimitRow = -SNAKE_LENGTH;
    this.pipeTimer = 0;
    this.prevPipeCol = this.pipeCol; // труба встаёт ровно над своим столбцом
    this.fallMs = fallMsForLevel(this.level);

    // Клетка под трубой занята — новой змейке некуда выползти
    if (!isFree(this.grid, { col: this.pipeCol, row: 0 })) {
      this.snake = [];
      this.prevSnake = [];
      this.gameOver({ title: 'Стакан полон!', text: 'Под трубой не осталось места' });
      return;
    }

    // Голова в верхней клетке поля, тело выше — внутри трубы
    this.snake = Array.from({ length: SNAKE_LENGTH }, (_, i) => ({ col: this.pipeCol, row: -i }));
    this.prevSnake = this.snake.map((cell) => ({ ...cell }));
    this.moveAge = 0;
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

  private gameOver(reason: GameOverReason): void {
    this.isOver = true;
    this.isResting = false;
    this.events.onGameOver(reason);
  }
}

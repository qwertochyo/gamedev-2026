// Одна партия: стакан, мастерская, змейка, заказы фигур, очки, уровень, фаза и правила хода.
// Без Phaser — только данные и правила. Наружу партия сообщает событиями (RoundEvents).
//
// Каждая фигура проходит три этапа:
// 1) 'draw'  — мастерская 5×5: змейка ползает без гравитации и собирает заказ, пока идёт таймер;
// 2) 'morph' — змейка превращается в фигуру и опускается в стакан (MORPH_MS, игра ждёт);
// 3) 'place' — фигура падает в стакане сверху по центру; её двигают, крутят и роняют.

import {
  DROP_STEP_MS,
  MORPH_MS,
  ORDER_BONUS,
  ROTATE_KICKS,
  ROTATE_PIVOT_INDEX,
  SNAKE_LENGTH,
  WORKSHOP_ENTRY_COL,
  clearFullRows,
  createGrid,
  drawMsForLevel,
  fallMsForLevel,
  findFullRows,
  isFree,
  isInWorkshop,
  isOpposite,
  levelForLines,
  move,
  phaseForScore,
  phaseParams,
  rotateAround,
  scoreForLines,
  shapeOf,
  shuffledBag,
  spawnLeft,
  turnClockwise,
  type Cell,
  type Dir,
  type Grid,
  type PhaseParams,
  type ShapeId,
} from './logic';

/** Этап текущей фигуры: собрать в мастерской, превратиться в фигуру, поставить в стакан. */
export type Stage = 'draw' | 'morph' | 'place';

/** Почему партия закончилась — для карточки конца игры. */
export interface GameOverReason {
  title: string;
  text: string;
}

/** Что происходит в партии. Сцена подписывается и показывает эффекты, панель и экраны. */
export interface RoundEvents {
  onOrderDone(points: number): void; // змейка собрала заказ — фигура уходит в стакан
  onFreeze(cells: Cell[]): void; // фигура застыла блоками
  onLinesCleared(rows: number[], points: number): void;
  onLevelUp(oldLevel: number, newLevel: number): void;
  onPhaseChange(phase: number): void;
  onScoreChange(): void; // выросли очки или сменился заказ
  onGameOver(reason: GameOverReason): void;
}

/**
 * Состояние одной партии. Поля открыты для чтения (отрисовка, панель),
 * а меняют их только методы этого класса. Новая партия — новый объект Round.
 */
export class Round {
  grid: Grid = createGrid();
  stage: Stage = 'draw';
  // Клетки змейки: на этапах 'draw' и 'morph' — в координатах мастерской, на этапе 'place' — в координатах стакана
  snake: Cell[] = [];
  prevSnake: Cell[] = []; // где змейка была до последнего движения — для плавной отрисовки
  moveAge = 0; // сколько мс прошло с последнего движения змейки
  dir: Dir = 'down'; // куда последний раз шагнула голова
  orders: ShapeId[] = []; // очередь заказов: [0] — текущий, [1] — следующий
  pieceCount = 0; // сколько фигур застыло; это же номер (и цвет) следующей
  score = 0;
  lines = 0;
  level = 1;
  phase = 1;
  drawMs = 0; // сколько всего времени на текущий заказ
  drawMsLeft = 0; // сколько из него осталось
  morphMs = 0; // сколько мс идёт превращение
  spawnCells: Cell[] = []; // где собранная фигура появится в стакане
  fallMs = fallMsForLevel(1);
  fallTimer = 0;
  isResting = false; // фигура легла на опору и ждёт: её ещё можно сдвинуть или повернуть
  restMs = 0; // сколько фигура уже лежит на опоре
  isDropping = false; // брошена пробелом: падает до опоры и сразу застывает
  isOver = false;

  private readonly events: RoundEvents;

  constructor(events: RoundEvents) {
    this.events = events;
    this.fillOrders();
    this.startDrawing();
  }

  /** Заказанная фигура — её нужно собрать текущей змейкой. */
  order(): ShapeId {
    return this.orders[0];
  }

  /** Следующий заказ — показываем заранее, как «следующую фигуру» в тетрисе. */
  nextOrder(): ShapeId {
    return this.orders[1];
  }

  /** Игровое время: сцена зовёт каждый кадр, пока идёт игра. На паузе не зовёт — и всё стоит. */
  tick(dt: number): void {
    this.moveAge += dt;
    // пока собирают заказ и пока змейка превращается, стакан стоит
    if (this.stage === 'draw') return this.tickDrawing(dt);
    if (this.stage === 'morph') return this.tickMorph(dt);

    this.fallTimer += dt;
    while (this.fallTimer >= this.currentFallMs() && !this.isOver) {
      this.fallTimer -= this.currentFallMs();
      this.fall();
    }

    if (this.isResting && !this.isOver) {
      if (this.canFall()) {
        // её сдвинули с опоры — падает дальше, а не застывает в воздухе
        this.isResting = false;
        this.restMs = 0;
      } else {
        this.restMs += dt;
        if (this.restMs >= this.params().lockDelayMs) this.freeze();
      }
    }
  }

  currentFallMs(): number {
    return this.isDropping ? DROP_STEP_MS : this.fallMs;
  }

  /** Параметры текущей фазы: пауза перед застыванием и время на заказ. */
  params(): PhaseParams {
    return phaseParams(this.phase);
  }

  /**
   * Стрелка или свайп. В мастерской — шагает голова змейки.
   * В стакане — ← → ↓ двигают фигуру целиком, ↑ поворачивает.
   */
  steer(dir: Dir): void {
    if (this.isOver || this.isDropping || this.stage === 'morph') return;
    if (this.stage === 'draw') this.moveHead(dir);
    else if (dir === 'up') this.rotatePiece();
    else this.shiftPiece(dir);
  }

  /** Пробел: фигура в стакане падает до опоры и сразу застывает. В мастерской не действует. */
  drop(): void {
    if (this.isOver || this.isDropping || this.stage !== 'place') return;
    this.isDropping = true;
    this.fallTimer = this.currentFallMs(); // первый шаг броска — в ближайшем кадре
  }

  /** Куда упадёт фигура, если уронить её сейчас, — для контура в стакане. */
  landingCells(): Cell[] {
    let cells = this.snake;
    while (cells.every((cell) => isFree(this.grid, { col: cell.col, row: cell.row + 1 }))) {
      cells = cells.map((cell) => ({ col: cell.col, row: cell.row + 1 }));
    }
    return cells;
  }

  // ---------- этап 1: мастерская ----------

  /** Новая змейка выползает в мастерскую сверху, запускается таймер заказа. */
  private startDrawing(): void {
    this.stage = 'draw';
    this.dir = 'down';
    this.isResting = false;
    this.restMs = 0;
    this.isDropping = false;
    this.drawMs = drawMsForLevel(this.level) * this.params().drawTimeFactor;
    this.drawMsLeft = this.drawMs;
    // Голова в верхней клетке мастерской, тело выше — ещё во входе
    this.snake = Array.from({ length: SNAKE_LENGTH }, (_, i) => ({ col: WORKSHOP_ENTRY_COL, row: -i }));
    this.prevSnake = this.snake.map((cell) => ({ ...cell }));
    this.moveAge = 0;
  }

  private tickDrawing(dt: number): void {
    this.drawMsLeft = Math.max(0, this.drawMsLeft - dt);
    if (this.drawMsLeft === 0) this.gameOver({ title: 'Время вышло!', text: 'Змейка не успела собрать заказ' });
  }

  /** Голова шагает в сторону dir, тело тянется следом. Собрала заказ — фигура уходит в стакан. */
  private moveHead(dir: Dir): void {
    if (isOpposite(dir, this.dir)) return; // назад, в шею, нельзя
    const next = move(this.snake[0], dir);
    if (!isInWorkshop(next) || this.isOwnCell(next)) return;

    this.remember();
    this.snake.unshift(next); // голова шагает,
    this.snake.pop(); // хвост подтягивается
    this.dir = dir;
    if (this.isOrderReady()) this.finishDrawing();
  }

  /** Змейка целиком в мастерской и совпала с заказом (в любом повороте). */
  private isOrderReady(): boolean {
    return this.snake.every(isInWorkshop) && shapeOf(this.snake) === this.order();
  }

  private isOwnCell(target: Cell): boolean {
    // хвост в этот же момент уходит, поэтому его клетку не считаем
    return this.snake.slice(0, -1).some((cell) => cell.col === target.col && cell.row === target.row);
  }

  /** Заказ собран: +очки, змейка начинает превращаться в фигуру. Места в стакане нет — конец. */
  private finishDrawing(): void {
    this.events.onOrderDone(ORDER_BONUS);
    this.addProgress(0, ORDER_BONUS);

    this.spawnCells = this.pieceAtTop(this.snake);
    if (!this.canPlace(this.spawnCells)) {
      this.gameOver({ title: 'Стакан полон!', text: 'Фигуре негде появиться' });
      return;
    }
    this.stage = 'morph';
    this.morphMs = 0;
  }

  /** Собранная фигура в стакане: в том же виде, верхним краем у верха стакана, по центру. */
  private pieceAtTop(cells: Cell[]): Cell[] {
    const minCol = Math.min(...cells.map((cell) => cell.col));
    const maxCol = Math.max(...cells.map((cell) => cell.col));
    const minRow = Math.min(...cells.map((cell) => cell.row));
    const left = spawnLeft(maxCol - minCol + 1);
    return cells.map((cell) => ({ col: cell.col - minCol + left, row: cell.row - minRow }));
  }

  // ---------- переход: превращение ----------

  private tickMorph(dt: number): void {
    this.morphMs += dt;
    if (this.morphMs >= MORPH_MS) this.startPlacing();
  }

  /** Фигура опустилась в стакан — дальше она падает, её двигают и крутят. */
  private startPlacing(): void {
    this.stage = 'place';
    this.snake = this.spawnCells.map((cell) => ({ ...cell }));
    this.prevSnake = this.spawnCells.map((cell) => ({ ...cell }));
    this.fallMs = fallMsForLevel(this.level);
    this.fallTimer = 0;
  }

  // ---------- этап 2: стакан ----------

  /** Фигура сдвигается на клетку целиком. */
  private shiftPiece(dir: Dir): void {
    const moved = this.snake.map((cell) => move(cell, dir));
    if (!this.canPlace(moved)) return;
    this.remember();
    this.snake = moved;
  }

  /** ↑: поворот по часовой. Упёрлась — пробуем сдвинуть вбок или вниз, иначе не крутится. */
  private rotatePiece(): void {
    if (this.order() === 'O') return; // квадрат при повороте не меняется
    const rotated = rotateAround(this.snake, this.snake[ROTATE_PIVOT_INDEX]);
    for (const kick of ROTATE_KICKS) {
      const placed = rotated.map((cell) => ({ col: cell.col + kick.col, row: cell.row + kick.row }));
      if (!this.canPlace(placed)) continue;
      this.remember();
      this.snake = placed;
      this.dir = turnClockwise(this.dir); // глаза поворачиваются вместе с фигурой
      return;
    }
  }

  /** Можно ли поставить фигуру сюда: внутри стакана и на свободные клетки. */
  private canPlace(cells: Cell[]): boolean {
    return cells.every((cell) => cell.row >= 0 && isFree(this.grid, cell));
  }

  /** Гравитация: фигура опускается на клетку. */
  private fall(): void {
    if (this.canFall()) {
      this.remember();
      this.snake = this.snake.map((cell) => ({ col: cell.col, row: cell.row + 1 }));
      this.isResting = false;
      this.restMs = 0;
      return;
    }
    // Легла на опору: после броска застывает сразу, иначе — пауза, чтобы успеть сдвинуть (таймер — в tick())
    if (this.isDropping) this.freeze();
    else this.isResting = true;
  }

  private canFall(): boolean {
    return this.snake.every((cell) => isFree(this.grid, { col: cell.col, row: cell.row + 1 }));
  }

  /** Запоминает позицию до движения — отрисовка плавно доведёт змейку до новой. */
  private remember(): void {
    this.prevSnake = this.snake.map((cell) => ({ ...cell }));
    this.moveAge = 0;
  }

  private freeze(): void {
    this.isResting = false;
    this.restMs = 0;
    this.isDropping = false;

    const pieceId = this.pieceCount++;
    for (const cell of this.snake) {
      this.grid[cell.row][cell.col] = pieceId;
    }
    this.events.onFreeze(this.snake);
    this.orders.shift();
    this.fillOrders();
    const lines = this.clearLines();
    this.addProgress(lines, scoreForLines(lines));
    this.startDrawing();
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

  private gameOver(reason: GameOverReason): void {
    this.isOver = true;
    this.isResting = false;
    this.events.onGameOver(reason);
  }
}

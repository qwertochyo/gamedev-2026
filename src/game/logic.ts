// Чистая логика Змейтриса: поле, правила и сложность. Без Phaser.

export type Dir = 'left' | 'right' | 'up' | 'down';

export interface Cell {
  col: number;
  row: number;
}

/** Клетка поля: EMPTY или номер застывшей змейки (по нему выбирается цвет). */
export type Grid = number[][];

// поле
export const COLS = 10;
export const ROWS = 18;
export const EMPTY = -1;

// змейка и сложность
export const SNAKE_LENGTH = 4; // змейка из 4 клеток — как фигуры тетриса
export const FALL_MS_START = 500; // за сколько змейка падает на клетку на 1-м уровне
export const FALL_MS_MIN = 120;
export const FALL_MS_PER_LEVEL = 30; // на столько быстрее с каждым уровнем
export const LINES_PER_LEVEL = 5;
export const LINE_SCORE_BASE = 100; // очки за линию
export const ORDER_BONUS = 20; // очки за каждый собранный заказ
export const DROP_STEP_MS = 20; // шаг броска (пробел): фигура падает до опоры почти мгновенно

// Этап 1 — мастерская: змейка ползает по полю 5×5 без гравитации и собирает заказ, пока идёт таймер
export const WORKSHOP_SIZE = 5;
export const WORKSHOP_ENTRY_COL = 2; // змейка выползает в мастерскую сверху, посередине
export const DRAW_MS_START = 8000; // время на заказ на 1-м уровне
export const DRAW_MS_PER_LEVEL = 500; // на столько меньше с каждым уровнем
export const DRAW_MS_MIN = 4000;
// Переход между этапами: змейка превращается в фигуру и опускается в стакан. Игра в это время ждёт
export const MORPH_MS = 700;

// Фазы по очкам. Фаза 2 меняет только параметры. Фаза 3 добавляет одно новое правило — камни в мастерской.
// Уровни (по линиям) меняют скорость падения и время на заказ.
// Пороги низкие, чтобы за обычный плейтест (3–5 минут) игрок увидел все фазы. Оценка: за фигуру ~20 очков
// за заказ и ~30 за линии, фигура — ~10 с
export const PHASE_2_AT_SCORE = 250; // фаза 2 — примерно через 1–1,5 минуты
export const PHASE_3_AT_SCORE = 450; // фаза 3 — примерно через 2–3 минуты
export const MAX_BUILD_STEPS = 10; // камни ставятся только так, чтобы заказ собирался не больше чем за 10 шагов

export interface PhaseParams {
  lockDelayMs: number; // сколько фигура стоит на опоре, прежде чем застыть
  drawTimeFactor: number; // во сколько раз меньше времени на заказ, чем по уровню
  workshopRocks: number; // сколько камней в мастерской: змейка их обползает
}

const PHASE_1: PhaseParams = { lockDelayMs: 600, drawTimeFactor: 1, workshopRocks: 0 };
const PHASE_2: PhaseParams = { lockDelayMs: 350, drawTimeFactor: 0.75, workshopRocks: 0 };
const PHASE_3: PhaseParams = { lockDelayMs: 350, drawTimeFactor: 0.75, workshopRocks: 3 };

export function createGrid(): Grid {
  return Array.from({ length: ROWS }, () => createEmptyRow());
}

function createEmptyRow(): number[] {
  return new Array<number>(COLS).fill(EMPTY);
}

export function move(cell: Cell, dir: Dir): Cell {
  if (dir === 'left') return { col: cell.col - 1, row: cell.row };
  if (dir === 'right') return { col: cell.col + 1, row: cell.row };
  if (dir === 'up') return { col: cell.col, row: cell.row - 1 };
  return { col: cell.col, row: cell.row + 1 };
}

/** Стенки и дно заняты, клетки над полем свободны. */
export function isFree(grid: Grid, cell: Cell): boolean {
  if (cell.col < 0 || cell.col >= COLS) return false; // стенка
  if (cell.row >= ROWS) return false; // дно
  if (cell.row < 0) return true; // над полем
  return grid[cell.row][cell.col] === EMPTY;
}

/** Противоположные направления: голова не может развернуться назад, в шею. */
export function isOpposite(a: Dir, b: Dir): boolean {
  return (
    (a === 'left' && b === 'right') ||
    (a === 'right' && b === 'left') ||
    (a === 'up' && b === 'down') ||
    (a === 'down' && b === 'up')
  );
}

/** Номера заполненных строк. */
export function findFullRows(grid: Grid): number[] {
  return grid.flatMap((row, index) => (row.includes(EMPTY) ? [] : [index]));
}

/** Верхняя занятая клетка столбца; ROWS, если столбец пуст. */
export function columnTop(grid: Grid, col: number): number {
  const row = grid.findIndex((cells) => cells[col] !== EMPTY);
  return row === -1 ? ROWS : row;
}

/** Удаляет заполненные строки, сдвигает верхние вниз и возвращает число удалённых. */
export function clearFullRows(grid: Grid): number {
  const remaining = grid.filter((row) => row.includes(EMPTY));
  const cleared = ROWS - remaining.length;
  const newRows = Array.from({ length: cleared }, () => createEmptyRow());
  grid.splice(0, ROWS, ...newRows, ...remaining);
  return cleared;
}

export function scoreForLines(lines: number): number {
  return LINE_SCORE_BASE * lines;
}

export function levelForLines(lines: number): number {
  return 1 + Math.floor(lines / LINES_PER_LEVEL);
}

/** Номер фазы по очкам: 1, 2 или 3. */
export function phaseForScore(score: number): number {
  if (score >= PHASE_3_AT_SCORE) return 3;
  return score >= PHASE_2_AT_SCORE ? 2 : 1;
}

export function phaseParams(phase: number): PhaseParams {
  if (phase === 3) return PHASE_3;
  return phase === 2 ? PHASE_2 : PHASE_1;
}

export function fallMsForLevel(level: number): number {
  return Math.max(FALL_MS_MIN, FALL_MS_START - (level - 1) * FALL_MS_PER_LEVEL);
}

/** Сколько мс на заказ на этом уровне (до поправки фазы). */
export function drawMsForLevel(level: number): number {
  return Math.max(DRAW_MS_MIN, DRAW_MS_START - (level - 1) * DRAW_MS_PER_LEVEL);
}

/** Левый столбец, с которого фигура шириной width появляется в стакане: вверху по центру. */
export function spawnLeft(width: number): number {
  return Math.floor((COLS - width) / 2);
}

/** Клетка внутри мастерской 5×5. */
export function isInWorkshop(cell: Cell): boolean {
  return cell.col >= 0 && cell.col < WORKSHOP_SIZE && cell.row >= 0 && cell.row < WORKSHOP_SIZE;
}

// ---------- фигуры и заказы ----------

/** Фигуры тетриса, которые можно нарисовать змейкой. Т нельзя: у змейки нет развилок. */
export type ShapeId = 'I' | 'O' | 'L' | 'J' | 'S' | 'Z';
export const SHAPE_IDS: ShapeId[] = ['I', 'O', 'L', 'J', 'S', 'Z'];

/** Клетки фигур в «лежачем» виде — так их удобно показывать на панели. */
export const SHAPES: Record<ShapeId, Cell[]> = {
  I: cells([0, 0], [1, 0], [2, 0], [3, 0]),
  O: cells([0, 0], [1, 0], [0, 1], [1, 1]),
  L: cells([2, 0], [0, 1], [1, 1], [2, 1]),
  J: cells([0, 0], [0, 1], [1, 1], [2, 1]),
  S: cells([1, 0], [2, 0], [0, 1], [1, 1]),
  Z: cells([0, 0], [1, 0], [1, 1], [2, 1]),
};

function cells(...pairs: [number, number][]): Cell[] {
  return pairs.map(([col, row]) => ({ col, row }));
}

/** Форма без привязки к месту: клетки сдвинуты к нулю и отсортированы. */
function shapeKey(shape: Cell[]): string {
  const minCol = Math.min(...shape.map((c) => c.col));
  const minRow = Math.min(...shape.map((c) => c.row));
  return shape
    .map((c) => `${c.col - minCol},${c.row - minRow}`)
    .sort()
    .join(' ');
}

/** Поворот на 90°: (col, row) → (−row, col). */
function rotate(shape: Cell[]): Cell[] {
  return shape.map((c) => ({ col: -c.row, row: c.col }));
}

/** Все 4 поворота каждой фигуры. Зеркальные L/J и S/Z — разные фигуры, как в тетрисе. */
const SHAPE_KEYS: Record<ShapeId, string[]> = Object.fromEntries(
  SHAPE_IDS.map((id) => {
    let shape = SHAPES[id];
    const keys: string[] = [];
    for (let i = 0; i < 4; i++) {
      keys.push(shapeKey(shape));
      shape = rotate(shape);
    }
    return [id, keys];
  }),
) as Record<ShapeId, string[]>;

/** Какую фигуру образуют клетки змейки (с учётом поворота). null — не фигура тетриса. */
export function shapeOf(snake: Cell[]): ShapeId | null {
  const key = shapeKey(snake);
  return SHAPE_IDS.find((id) => SHAPE_KEYS[id].includes(key)) ?? null;
}

// Поворот фигуры в стакане (↑): вокруг второй клетки змейки — шеи, она всегда внутри фигуры.
// Вокруг одной и той же клетки четыре поворота возвращают фигуру ровно на место, она не «уползает»
export const ROTATE_PIVOT_INDEX = 1;
// Поворот упёрся в стенку, блоки или верх стакана — пробуем сдвинуть фигуру на клетку-две вбок или вниз.
// Вверх не сдвигаем никогда: так поворотом нельзя «подпрыгнуть» и висеть в воздухе
export const ROTATE_KICKS: Cell[] = cells([0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, 1], [0, 2]);

/** Поворот клеток на 90° по часовой вокруг клетки pivot. Порядок клеток (голова первая) не меняется. */
export function rotateAround(cells: Cell[], pivot: Cell): Cell[] {
  return cells.map((c) => ({ col: pivot.col - (c.row - pivot.row), row: pivot.row + (c.col - pivot.col) }));
}

const CLOCKWISE: Record<Dir, Dir> = { up: 'right', right: 'down', down: 'left', left: 'up' };

/** Куда смотрит голова, когда фигуру повернули по часовой. */
export function turnClockwise(dir: Dir): Dir {
  return CLOCKWISE[dir];
}

/** «Мешок» заказов, как в тетрисе: все фигуры по разу в случайном порядке. */
export function shuffledBag(): ShapeId[] {
  return shuffled(SHAPE_IDS);
}

// ---------- мастерская: шаг змейки и камни ----------
// Правило шага общее для игры (Round.moveHead) и для проверки, можно ли собрать заказ при этих камнях.

/** Новая змейка: голова в верхней клетке мастерской, тело выше — ещё в норе. */
export function startSnake(): Cell[] {
  return Array.from({ length: SNAKE_LENGTH }, (_, i) => ({ col: WORKSHOP_ENTRY_COL, row: -i }));
}

/** Может ли голова шагнуть в сторону dir: не назад в шею, не за край, не в камень, не в себя (хвост уходит). */
export function canStep(snake: Cell[], dir: Dir, lastDir: Dir, rocks: Cell[]): boolean {
  if (isOpposite(dir, lastDir)) return false;
  const next = move(snake[0], dir);
  const isTaken = (cells: Cell[]): boolean => cells.some((cell) => cell.col === next.col && cell.row === next.row);
  return isInWorkshop(next) && !isTaken(rocks) && !isTaken(snake.slice(0, -1));
}

/** Шаг: голова в соседнюю клетку, тело тянется следом. */
export function stepSnake(snake: Cell[], dir: Dir): Cell[] {
  return [move(snake[0], dir), ...snake.slice(0, -1)];
}

/** Заказ собран: змейка целиком в мастерской и совпала с заказом (в любом повороте). */
export function isOrderBuilt(snake: Cell[], order: ShapeId): boolean {
  return snake.every(isInWorkshop) && shapeOf(snake) === order;
}

const ALL_DIRS: Dir[] = ['left', 'right', 'up', 'down'];

/** Можно ли собрать заказ из новой змейки при этих камнях не больше чем за MAX_BUILD_STEPS шагов (перебор в ширину). */
export function canBuild(order: ShapeId, rocks: Cell[]): boolean {
  const key = (snake: Cell[], dir: Dir): string => snake.map((c) => `${c.col},${c.row}`).join(' ') + dir;
  let layer: { snake: Cell[]; dir: Dir }[] = [{ snake: startSnake(), dir: 'down' }];
  const seen = new Set([key(layer[0].snake, 'down')]);
  for (let steps = 0; steps < MAX_BUILD_STEPS; steps++) {
    const next: { snake: Cell[]; dir: Dir }[] = [];
    for (const { snake, dir } of layer) {
      for (const d of ALL_DIRS) {
        if (!canStep(snake, d, dir, rocks)) continue;
        const moved = stepSnake(snake, d);
        if (isOrderBuilt(moved, order)) return true;
        if (seen.has(key(moved, d))) continue;
        seen.add(key(moved, d));
        next.push({ snake: moved, dir: d });
      }
    }
    layer = next;
  }
  return false;
}

const ROCK_TRIES = 50; // столько раз пробуем расставить камни, прежде чем сдаться и обойтись без них
const ROCK_ROWS = 3; // камни — в верхних рядах мастерской, где начинается любой путь змейки

/**
 * Камни для заказа. Один всегда рядом с головой новой змейки — первый шаг уже не сделать «на автомате»,
 * остальные — в верхних рядах. Случайные камни по всему полю почти никогда не мешали (замер: путь
 * длиннее лишь на 0–0,4 шага), а так они перекрывают в среднем ~60% коротких путей к заказу.
 * Расстановку, при которой заказ не собрать за MAX_BUILD_STEPS шагов, отбрасываем и пробуем другую.
 */
export function placeRocks(order: ShapeId, count: number): Cell[] {
  if (count === 0) return [];
  const head = startSnake()[0];
  const nearHead = ALL_DIRS.map((dir) => move(head, dir)).filter(isInWorkshop);
  const top: Cell[] = [];
  for (let row = 0; row < ROCK_ROWS; row++) {
    for (let col = 0; col < WORKSHOP_SIZE; col++) {
      if (col !== head.col || row !== head.row) top.push({ col, row });
    }
  }
  for (let attempt = 0; attempt < ROCK_TRIES; attempt++) {
    const first = shuffled(nearHead)[0];
    const rest = shuffled(top.filter((cell) => cell.col !== first.col || cell.row !== first.row)).slice(0, count - 1);
    const rocks = [first, ...rest];
    if (canBuild(order, rocks)) return rocks;
  }
  return [];
}

/** Те же элементы в случайном порядке (тасование Фишера — Йетса). */
function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

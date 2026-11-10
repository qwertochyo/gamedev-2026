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
export const SPAWN_COL = 4; // столбец трубы в начале партии
export const EMPTY = -1;

// змейка и сложность
export const SNAKE_LENGTH = 4; // змейка из 4 клеток — как фигуры тетриса
export const FALL_MS_START = 500; // за сколько змейка падает на клетку на 1-м уровне
export const FALL_MS_MIN = 120;
export const FALL_MS_PER_LEVEL = 30; // на столько быстрее с каждым уровнем
export const LINES_PER_LEVEL = 5;
export const LINE_SCORE_BASE = 100; // очки за линию
export const ORDER_BONUS = 20; // очки за каждую фигуру, совпавшую с заказом
export const DROP_STEP_MS = 20; // шаг броска (пробел): фигура падает до опоры почти мгновенно

// Фазы. Правила в обеих одинаковые — с ростом очков меняются только параметры.
// Уровни (по линиям) меняют скорость падения, фазы (по очкам) — трубу и застывание.
export const PHASE_2_AT_SCORE = 1000; // фаза 2 с 1000 очков (примерно 5–10 линий)

export interface PhaseParams {
  pipeStepMs: number; // за сколько труба сдвигается на столбец
  lockDelayMs: number; // сколько змейка стоит на опоре, прежде чем застыть
}

const PHASE_1: PhaseParams = { pipeStepMs: 450, lockDelayMs: 600 };
const PHASE_2: PhaseParams = { pipeStepMs: 280, lockDelayMs: 350 };

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

/** Стенки и дно заняты, клетки над полем (труба) свободны. */
export function isFree(grid: Grid, cell: Cell): boolean {
  if (cell.col < 0 || cell.col >= COLS) return false; // стенка
  if (cell.row >= ROWS) return false; // дно
  if (cell.row < 0) return true; // труба над полем
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

/** Номер фазы по очкам: 1 или 2. */
export function phaseForScore(score: number): number {
  return score < PHASE_2_AT_SCORE ? 1 : 2;
}

export function phaseParams(phase: number): PhaseParams {
  return phase === 1 ? PHASE_1 : PHASE_2;
}

export function fallMsForLevel(level: number): number {
  return Math.max(FALL_MS_MIN, FALL_MS_START - (level - 1) * FALL_MS_PER_LEVEL);
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

/** «Мешок» заказов, как в тетрисе: все фигуры по разу в случайном порядке. */
export function shuffledBag(): ShapeId[] {
  const bag = [...SHAPE_IDS];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

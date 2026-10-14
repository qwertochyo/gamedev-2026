// Чистая логика Змейтриса: поле, правила и сложность. Без Phaser.

export type Dir = 'left' | 'right' | 'down';

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
export const START_LENGTH = 4;
export const MAX_LENGTH = 8;
export const STEP_MS_START = 350;
export const STEP_MS_MIN = 140;
export const STEP_MS_PER_LEVEL = 20;
export const LINES_PER_LEVEL = 5;
export const LINE_SCORE_BASE = 100; // очки = база × линии × множитель за изгибы
export const MULTIPLIER_PER_TURN = 1; // каждый изгиб змейки добавляет к множителю: прямая ×1, Г ×2, Z ×3
export const LOCK_DELAY_MS = 600; // сколько змейка стоит на опоре, прежде чем застыть
export const DROP_STEP_MS = 40; // шаг ускоренного падения (↓, когда змейка и так ползёт вниз)

// труба
export const PIPE_STEP_MS = 450; // труба сдвигается на столбец за это время

export function createGrid(): Grid {
  return Array.from({ length: ROWS }, () => createEmptyRow());
}

function createEmptyRow(): number[] {
  return new Array<number>(COLS).fill(EMPTY);
}

export function move(cell: Cell, dir: Dir): Cell {
  if (dir === 'left') return { col: cell.col - 1, row: cell.row };
  if (dir === 'right') return { col: cell.col + 1, row: cell.row };
  return { col: cell.col, row: cell.row + 1 };
}

/** Стенки и дно заняты, клетки над полем (труба) свободны. */
export function isFree(grid: Grid, cell: Cell): boolean {
  if (cell.col < 0 || cell.col >= COLS) return false; // стенка
  if (cell.row >= ROWS) return false; // дно
  if (cell.row < 0) return true; // труба над полем
  return grid[cell.row][cell.col] === EMPTY;
}

/** Вверх двигаться нельзя, поэтому противоположны только «влево» и «вправо». */
export function isOpposite(a: Dir, b: Dir): boolean {
  return (a === 'left' && b === 'right') || (a === 'right' && b === 'left');
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

/** Сколько раз тело змейки меняет направление: прямая — 0, Г — 1, Z — 2. */
export function countTurns(snake: Cell[]): number {
  let turns = 0;
  for (let i = 2; i < snake.length; i++) {
    const [a, b, c] = [snake[i - 2], snake[i - 1], snake[i]];
    const isStraight = b.col - a.col === c.col - b.col && b.row - a.row === c.row - b.row;
    if (!isStraight) turns++;
  }
  return turns;
}

/**
 * Множитель очков за форму змейки. Прямую ставить проще всего и безопаснее всего,
 * поэтому она приносит меньше: изогнутые фигуры — риск, но и награда больше.
 */
export function shapeMultiplier(turns: number): number {
  return 1 + turns * MULTIPLIER_PER_TURN;
}

export function scoreForLines(lines: number, multiplier: number): number {
  return LINE_SCORE_BASE * lines * multiplier;
}

export function levelForLines(lines: number): number {
  return 1 + Math.floor(lines / LINES_PER_LEVEL);
}

export function snakeLengthForLevel(level: number): number {
  return Math.min(START_LENGTH + level - 1, MAX_LENGTH);
}

export function stepMsForLevel(level: number): number {
  return Math.max(STEP_MS_MIN, STEP_MS_START - (level - 1) * STEP_MS_PER_LEVEL);
}

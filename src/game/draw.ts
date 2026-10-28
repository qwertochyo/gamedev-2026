// Отрисовка стакана, блоков, змейки и трубы. Только рисование — правила в logic.ts и round.ts.

import Phaser from 'phaser';
import { COLS, EMPTY, ROWS, columnTop, move, snakeLengthForLevel, type Cell, type Dir, type Grid } from './logic';
import type { Round } from './round';

// экран: игра живёт в координатах 540×960, а canvas в RENDER_SCALE раз больше,
// чтобы на телефонах и Retina-экранах картинка и текст были чёткими
export const GAME_WIDTH = 540;
export const GAME_HEIGHT = 960;
export const RENDER_SCALE = 2;

// стакан
export const CELL = 44;
export const FIELD_X = 50;
export const FIELD_Y = 140;
export const FIELD_W = COLS * CELL;
export const FIELD_H = ROWS * CELL;
const CELL_GAP = 2; // зазор между соседними клетками
const CELL_SIZE = CELL - CELL_GAP * 2;
const CELL_RADIUS = 8;
const FIELD_PADDING = 3;

// труба
const PIPE_TOP = 102;
const PIPE_WALL = 6;
const PIPE_LIP = 5; // насколько край трубы шире стенок
const PIPE_LIP_HEIGHT = 12;

// глаза
const EYE_FORWARD_PX = 7; // насколько глаза сдвинуты в сторону взгляда
const EYE_SPREAD_PX = 9; // насколько глаза разнесены поперёк взгляда
const EYE_RADIUS = 6;
const PUPIL_RADIUS = 3;

// цвета
export const PALETTE = [0xf97316, 0xeab308, 0x06b6d4, 0x3b82f6, 0xa855f7, 0xec4899, 0xef4444];
export const SNAKE_COLOR = 0x22c55e; // живая змейка всегда зелёная
const HEAD_COLOR = 0x86efac;
const DEAD_COLOR = 0xef4444;
const DEAD_HEAD_COLOR = 0xfca5a5;
const TAIL_DARKEN = 0.3; // хвост темнее головы
const BG_TOP = 0x131c3a;
const BG_BOTTOM = 0x070b18;
const FIELD_COLOR = 0x050914;
const FIELD_GLOW = 0x3b82f6;
const GRID_DOT_COLOR = 0x1e293b;
const FRAME_COLOR = 0x334155;
const PIPE_COLOR = 0x64748b;
const PIPE_SHINE = 0xcbd5e1;
const DANGER_COLOR = 0xef4444;
const BEAM_ALPHA = 0.05;
const BEAM_DANGER_ALPHA = 0.14;
const SHINE_ALPHA = 0.25; // блик на верхнем крае клетки
const EYE_WHITE = 0xffffff;
const PUPIL_COLOR = 0x0f172a;

// плавность и мигание
const SLIDE_MS = 90; // за сколько змейка переползает в новую клетку
const PIPE_SLIDE_MS = 160; // за сколько труба переезжает на соседний столбец
const HARDEN_MAX = 0.75; // насколько змейка перекрашивается, пока стоит на опоре
const DANGER_PULSE_MS = 140; // скорость мигания трубы, когда под ней мало места

type Graphics = Phaser.GameObjects.Graphics;

function pieceColor(pieceId: number): number {
  return PALETTE[pieceId % PALETTE.length];
}

/** Смешивает два цвета: t = 0 — первый, t = 1 — второй. */
function lerpColor(from: number, to: number, t: number): number {
  const channel = (shift: number): number => {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;
    return Math.round(a + (b - a) * t) << shift;
  };
  return channel(16) | channel(8) | channel(0);
}

/** Центр клетки в пикселях. Клетка может быть дробной — во время плавного движения. */
function cellCenter(cell: Cell): { x: number; y: number } {
  return { x: FIELD_X + (cell.col + 0.5) * CELL, y: FIELD_Y + (cell.row + 0.5) * CELL };
}

/** Фон, стакан, точки сетки и рамка. Не меняется, рисуется один раз. */
export function drawBackground(g: Graphics): void {
  g.fillGradientStyle(BG_TOP, BG_TOP, BG_BOTTOM, BG_BOTTOM, 1);
  g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  const x = FIELD_X - FIELD_PADDING;
  const y = FIELD_Y - FIELD_PADDING;
  const w = FIELD_W + FIELD_PADDING * 2;
  const h = FIELD_H + FIELD_PADDING * 2;
  g.fillStyle(FIELD_GLOW, 0.06);
  g.fillRoundedRect(x - 8, y - 8, w + 16, h + 16, 16);
  g.fillStyle(FIELD_COLOR);
  g.fillRoundedRect(x, y, w, h, 8);

  g.fillStyle(GRID_DOT_COLOR);
  for (let row = 1; row < ROWS; row++) {
    for (let col = 1; col < COLS; col++) {
      g.fillCircle(FIELD_X + col * CELL, FIELD_Y + row * CELL, 1.5);
    }
  }

  g.lineStyle(2, FRAME_COLOR);
  g.strokeRoundedRect(x, y, w, h, 8);
}

/** Одна клетка: скруглённый квадрат с бликом сверху. */
function drawBlock(g: Graphics, cell: Cell, color: number): void {
  const { x, y } = cellCenter(cell);
  g.fillStyle(color);
  g.fillRoundedRect(x - CELL_SIZE / 2, y - CELL_SIZE / 2, CELL_SIZE, CELL_SIZE, CELL_RADIUS);
  g.fillStyle(0xffffff, SHINE_ALPHA);
  g.fillRoundedRect(x - CELL_SIZE / 2 + 6, y - CELL_SIZE / 2 + 4, CELL_SIZE - 12, 5, 2.5);
}

/** Перемычка между соседними клетками одной змейки: так она выглядит цельной. */
function drawLink(g: Graphics, a: Cell, b: Cell, color: number): void {
  const from = cellCenter(a);
  const to = cellCenter(b);
  g.lineStyle(CELL_SIZE, color);
  g.lineBetween(from.x, from.y, to.x, to.y);
}

/** Застывшие змейки. Клетки одной змейки соединены перемычками. */
function drawBlocks(g: Graphics, grid: Grid): void {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const id = grid[row][col];
      if (id === EMPTY) continue;
      const color = pieceColor(id);
      if (col + 1 < COLS && grid[row][col + 1] === id) drawLink(g, { col, row }, { col: col + 1, row }, color);
      if (row + 1 < ROWS && grid[row + 1][col] === id) drawLink(g, { col, row }, { col, row: row + 1 }, color);
    }
  }
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const id = grid[row][col];
      if (id !== EMPTY) drawBlock(g, { col, row }, pieceColor(id));
    }
  }
}

interface SnakeLook {
  body: number;
  head: number;
  lookDir: Dir; // куда смотрят глаза
  isDead: boolean;
}

/**
 * Живая змейка. Клетки могут быть дробными — змейка плавно переползает.
 * Клетки целиком в трубе (выше поля) не рисуются; то, что чуть выше поля, закроет труба.
 */
function drawSnake(g: Graphics, cells: Cell[], look: SnakeLook): void {
  if (cells.length === 0) return;

  const colorAt = (i: number): number =>
    i === 0 ? look.head : lerpColor(look.body, 0x000000, (TAIL_DARKEN * i) / cells.length);
  const isVisible = (cell: Cell): boolean => cell.row > -1;

  for (let i = cells.length - 1; i > 0; i--) {
    // Перемычку рисуем, только если видны обе клетки: иначе она торчит из трубы вверх
    if (isVisible(cells[i]) && isVisible(cells[i - 1])) drawLink(g, cells[i], cells[i - 1], colorAt(i));
  }
  for (let i = cells.length - 1; i >= 0; i--) {
    if (isVisible(cells[i])) drawBlock(g, cells[i], colorAt(i));
  }
  if (isVisible(cells[0])) drawEyes(g, cells[0], look);
}

function drawEyes(g: Graphics, head: Cell, look: SnakeLook): void {
  const forward = move({ col: 0, row: 0 }, look.lookDir); // единичный вектор взгляда
  const center = cellCenter(head);

  for (const side of [-1, 1]) {
    const x = center.x + forward.col * EYE_FORWARD_PX + forward.row * EYE_SPREAD_PX * side;
    const y = center.y + forward.row * EYE_FORWARD_PX + forward.col * EYE_SPREAD_PX * side;
    if (look.isDead) {
      // глаза-крестики
      g.lineStyle(3, PUPIL_COLOR);
      g.lineBetween(x - 4, y - 4, x + 4, y + 4);
      g.lineBetween(x - 4, y + 4, x + 4, y - 4);
      continue;
    }
    g.fillStyle(EYE_WHITE);
    g.fillCircle(x, y, EYE_RADIUS);
    g.fillStyle(PUPIL_COLOR);
    g.fillCircle(x + forward.col * 2, y + forward.row * 2, PUPIL_RADIUS);
  }
}

/** Луч под трубой: показывает, куда выползет змейка. Красный — там почти нет места. */
function drawBeam(g: Graphics, col: number, topRow: number, danger: number): void {
  if (topRow <= 0) return;
  g.fillStyle(lerpColor(0xffffff, DANGER_COLOR, danger), BEAM_ALPHA + (BEAM_DANGER_ALPHA - BEAM_ALPHA) * danger);
  g.fillRect(FIELD_X + col * CELL, FIELD_Y, CELL, topRow * CELL);
}

/** Труба над стаканом. col может быть дробным — труба плавно едет. danger 0…1 краснит её. */
function drawPipe(g: Graphics, col: number, danger: number): void {
  const x = FIELD_X + col * CELL;
  const height = FIELD_Y - PIPE_TOP;
  const color = lerpColor(PIPE_COLOR, DANGER_COLOR, danger);

  g.fillStyle(color);
  g.fillRect(x - PIPE_WALL, PIPE_TOP, CELL + PIPE_WALL * 2, height);
  g.fillRoundedRect(x - PIPE_WALL - PIPE_LIP, PIPE_TOP - 4, CELL + (PIPE_WALL + PIPE_LIP) * 2, PIPE_LIP_HEIGHT, 4);
  g.fillStyle(PIPE_SHINE, 0.5);
  g.fillRect(x - PIPE_WALL + 1, PIPE_TOP + PIPE_LIP_HEIGHT - 4, 2, height - PIPE_LIP_HEIGHT + 4);
  // Внутренность трубы прячет змейку над полем и прорезает верхнюю рамку стакана
  g.fillStyle(FIELD_COLOR);
  g.fillRect(x, PIPE_TOP + PIPE_LIP_HEIGHT - 4, CELL, height - PIPE_LIP_HEIGHT + 4);
}

/** Белая вспышка поверх клеток (для эффекта застывания). */
export function drawCellsFlash(g: Graphics, cells: Cell[]): void {
  g.fillStyle(0xffffff);
  for (const cell of cells) {
    const { x, y } = cellCenter(cell);
    g.fillRoundedRect(x - CELL_SIZE / 2, y - CELL_SIZE / 2, CELL_SIZE, CELL_SIZE, CELL_RADIUS);
  }
}

// ---------- партия целиком ----------

/**
 * Рисует стакан, змейку и трубу партии заново — каждый кадр, поэтому движение плавное.
 * Возвращает, где змейка сейчас на экране (клетки могут быть дробными).
 */
export function drawRound(g: Graphics, round: Round, timeMs: number): Cell[] {
  g.clear();
  const pipeX = pipeVisualCol(round);
  const danger = dangerLevel(round, timeMs);
  drawBeam(g, pipeX, columnTop(round.grid, round.pipeCol), danger);
  drawBlocks(g, round.grid);
  const snakeCells = snakeVisualCells(round);
  drawSnake(g, snakeCells, snakeLook(round));
  drawPipe(g, pipeX, danger);
  return snakeCells;
}

/** Змейка между прошлой и текущей клетками: доезжает за SLIDE_MS после шага. */
function snakeVisualCells(round: Round): Cell[] {
  const t = easeOut(Math.min(1, round.stepTimer / Math.min(SLIDE_MS, round.currentStepMs())));
  return round.snake.map((cell, i) => {
    const from = round.prevSnake[i] ?? cell;
    return { col: from.col + (cell.col - from.col) * t, row: from.row + (cell.row - from.row) * t };
  });
}

function pipeVisualCol(round: Round): number {
  const t = easeOut(Math.min(1, round.pipeTimer / PIPE_SLIDE_MS));
  return round.prevPipeCol + (round.pipeCol - round.prevPipeCol) * t;
}

/** 0…1 — насколько красной рисовать трубу. Мигает, если змейка не вылезет из неё прямо вниз. */
function dangerLevel(round: Round, timeMs: number): number {
  if (round.isOver) return 1;
  const isDanger = columnTop(round.grid, round.pipeCol) < snakeLengthForLevel(round.level);
  return isDanger ? 0.5 + 0.5 * Math.sin(timeMs / DANGER_PULSE_MS) : 0;
}

function snakeLook(round: Round): SnakeLook {
  const lookDir = round.dirQueue[0] ?? round.dir; // глаза сразу смотрят туда, куда нажал игрок
  if (round.isOver) return { body: DEAD_COLOR, head: DEAD_HEAD_COLOR, lookDir, isDead: true };

  // Пока змейка стоит на опоре, она «твердеет» — перекрашивается в цвет будущих блоков
  const hardness = round.isResting ? (round.restMs / round.params().lockDelayMs) * HARDEN_MAX : 0;
  const target = pieceColor(round.pieceCount);
  return {
    body: lerpColor(SNAKE_COLOR, target, hardness),
    head: lerpColor(HEAD_COLOR, target, hardness),
    lookDir,
    isDead: false,
  };
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

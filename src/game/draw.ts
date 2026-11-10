// Отрисовка стакана, блоков, змейки, трубы и мастерской. Только рисование — правила в logic.ts и round.ts.

import Phaser from 'phaser';
import {
  COLS,
  DROP_STEP_MS,
  EMPTY,
  ROWS,
  SHAPES,
  SNAKE_LENGTH,
  WORKSHOP_ENTRY_COL,
  WORKSHOP_SIZE,
  columnTop,
  move,
  type Cell,
  type Dir,
  type Grid,
} from './logic';
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

// мастерская (этап 1): карточка поверх верхней части стакана; клетки того же размера, что в стакане
const WORKSHOP_COL0 = 0.5; // левый край поля мастерской — в клетках стакана
const WORKSHOP_ROW0 = 1.25; // верхний край
const WORKSHOP_X = FIELD_X + WORKSHOP_COL0 * CELL;
export const WORKSHOP_Y = FIELD_Y + WORKSHOP_ROW0 * CELL;
const WORKSHOP_PX = WORKSHOP_SIZE * CELL;
const WORKSHOP_CARD_MARGIN = 10; // карточка чуть уже стакана
const WORKSHOP_CARD_PADDING = 24;
export const WORKSHOP_CENTER_X = WORKSHOP_X + WORKSHOP_PX / 2;
export const WORKSHOP_CENTER_Y = WORKSHOP_Y + WORKSHOP_PX / 2;
// справа от поля мастерской — заказ и полоска времени
export const ORDER_INFO_X = (WORKSHOP_X + WORKSHOP_PX + FIELD_X + FIELD_W) / 2;
const ORDER_INFO_Y = WORKSHOP_Y + 80;
const ORDER_INFO_CELL = 30;
export const TIMER_Y = WORKSHOP_Y + 170;
const TIMER_W = 140;
const TIMER_H = 12;

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
export const ORDER_COLOR = 0xfde047; // заказанная фигура — жёлтая везде: в панели и в мастерской
const DIM_COLOR = 0x020617; // стакан затемнён, пока собирают заказ
const DIM_ALPHA = 0.6; // блоки видно: пока рисуешь, можно прикинуть, куда ставить
const CARD_COLOR = 0x0f172a;
const TIMER_COLOR = 0x22c55e; // полоска времени: зелёная, к концу краснеет

// плавность и мигание
const SLIDE_MS = 90; // за сколько змейка доезжает до новой клетки после шага или падения
const PIPE_SLIDE_MS = 160; // за сколько труба переезжает на соседний столбец
const HARDEN_MAX = 0.75; // насколько фигура перекрашивается, пока стоит на опоре
const PIECE_TINT = 0.5; // фигура в стакане сразу наполовину в цвете будущего блока — видно, что это уже не змейка
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
 * Клетки, где isVisible = false (ещё во входе), не рисуются; то, что чуть выглядывает, закроет труба.
 */
function drawSnake(g: Graphics, cells: Cell[], look: SnakeLook, isVisible: (cell: Cell) => boolean): void {
  if (cells.length === 0) return;

  const colorAt = (i: number): number =>
    i === 0 ? look.head : lerpColor(look.body, 0x000000, (TAIL_DARKEN * i) / cells.length);

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

/** Маленькая фигура для панели (заказ, следующий заказ, карточка конца игры), по центру в точке (x, y). */
export function drawShape(g: Graphics, shape: Cell[], x: number, y: number, size: number, color: number): void {
  const cols = Math.max(...shape.map((c) => c.col)) + 1;
  const rows = Math.max(...shape.map((c) => c.row)) + 1;
  const left = x - (cols * size) / 2;
  const top = y - (rows * size) / 2;
  const gap = Math.max(1, size * 0.08);
  g.fillStyle(color);
  for (const cell of shape) {
    g.fillRoundedRect(left + cell.col * size + gap, top + cell.row * size + gap, size - gap * 2, size - gap * 2, size * 0.2);
  }
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

/** Рисует партию заново — каждый кадр, поэтому движение плавное. */
export function drawRound(g: Graphics, round: Round, timeMs: number): void {
  g.clear();
  const pipeX = pipeVisualCol(round);
  const danger = dangerLevel(round, timeMs);
  drawBeam(g, pipeX, columnTop(round.grid, round.pipeCol), danger);
  drawBlocks(g, round.grid);
  if (round.stage === 'place') drawSnake(g, snakeVisualCells(round), pieceLook(round), () => true);
  drawPipe(g, pipeX, danger);
  if (round.stage === 'draw') drawWorkshop(g, round);
}

/** Этап 1: стакан затемнён, сверху карточка — поле мастерской со змейкой, заказ и полоска времени. */
function drawWorkshop(g: Graphics, round: Round): void {
  g.fillStyle(DIM_COLOR, DIM_ALPHA);
  g.fillRect(FIELD_X, FIELD_Y, FIELD_W, FIELD_H);

  const cardX = FIELD_X + WORKSHOP_CARD_MARGIN;
  const cardY = WORKSHOP_Y - WORKSHOP_CARD_PADDING;
  const cardW = FIELD_W - WORKSHOP_CARD_MARGIN * 2;
  const cardH = WORKSHOP_PX + WORKSHOP_CARD_PADDING * 2;
  g.fillStyle(CARD_COLOR);
  g.fillRoundedRect(cardX, cardY, cardW, cardH, 16);
  g.lineStyle(2, FRAME_COLOR);
  g.strokeRoundedRect(cardX, cardY, cardW, cardH, 16);

  g.fillStyle(FIELD_COLOR);
  g.fillRoundedRect(WORKSHOP_X - 4, WORKSHOP_Y - 4, WORKSHOP_PX + 8, WORKSHOP_PX + 8, 8);
  g.fillStyle(GRID_DOT_COLOR);
  for (let row = 1; row < WORKSHOP_SIZE; row++) {
    for (let col = 1; col < WORKSHOP_SIZE; col++) {
      g.fillCircle(WORKSHOP_X + col * CELL, WORKSHOP_Y + row * CELL, 1.5);
    }
  }

  drawShape(g, SHAPES[round.order()], ORDER_INFO_X, ORDER_INFO_Y, ORDER_INFO_CELL, ORDER_COLOR);
  drawTimer(g, round.drawMs > 0 ? round.drawMsLeft / round.drawMs : 0);

  // Змейка в координатах мастерской → в координатах стакана (клетки того же размера)
  const cells = snakeVisualCells(round).map((cell) => ({ col: cell.col + WORKSHOP_COL0, row: cell.row + WORKSHOP_ROW0 }));
  drawSnake(g, cells, workshopLook(round), (cell) => cell.row - WORKSHOP_ROW0 > -1);
  drawWorkshopEntry(g);
}

/** Полоска оставшегося времени: left = 1 — время только пошло, 0 — вышло. */
function drawTimer(g: Graphics, left: number): void {
  const x = ORDER_INFO_X - TIMER_W / 2;
  g.fillStyle(GRID_DOT_COLOR);
  g.fillRoundedRect(x, TIMER_Y, TIMER_W, TIMER_H, TIMER_H / 2);
  if (left <= 0) return;
  g.fillStyle(lerpColor(DANGER_COLOR, TIMER_COLOR, left));
  g.fillRoundedRect(x, TIMER_Y, Math.max(TIMER_H, TIMER_W * left), TIMER_H, TIMER_H / 2);
}

/** Короткая труба над мастерской: из неё выползает змейка и прячет хвост, который ещё не вылез. */
function drawWorkshopEntry(g: Graphics): void {
  const x = WORKSHOP_X + WORKSHOP_ENTRY_COL * CELL;
  const top = WORKSHOP_Y - CELL;
  g.fillStyle(PIPE_COLOR);
  g.fillRect(x - PIPE_WALL, top, CELL + PIPE_WALL * 2, CELL - 4);
  g.fillStyle(FIELD_COLOR);
  g.fillRect(x, top, CELL, CELL);
}

/** Змейка между прошлой и текущей клетками: доезжает за SLIDE_MS после движения (при броске — быстрее). */
function snakeVisualCells(round: Round): Cell[] {
  const slideMs = round.isDropping ? DROP_STEP_MS : SLIDE_MS;
  const t = easeOut(Math.min(1, round.moveAge / slideMs));
  return round.snake.map((cell, i) => {
    const from = round.prevSnake[i] ?? cell;
    return { col: from.col + (cell.col - from.col) * t, row: from.row + (cell.row - from.row) * t };
  });
}

function pipeVisualCol(round: Round): number {
  const t = easeOut(Math.min(1, round.pipeTimer / PIPE_SLIDE_MS));
  return round.prevPipeCol + (round.pipeCol - round.prevPipeCol) * t;
}

/** 0…1 — насколько красной рисовать трубу. Мигает, если под ней почти нет места для новой фигуры. */
function dangerLevel(round: Round, timeMs: number): number {
  if (round.isOver) return 1;
  const isDanger = columnTop(round.grid, round.pipeCol) < SNAKE_LENGTH;
  return isDanger ? 0.5 + 0.5 * Math.sin(timeMs / DANGER_PULSE_MS) : 0;
}

/** Змейка в мастерской — зелёная, глаза смотрят туда, куда последний раз шагнула голова. */
function workshopLook(round: Round): SnakeLook {
  if (round.isOver) return { body: DEAD_COLOR, head: DEAD_HEAD_COLOR, lookDir: round.dir, isDead: true };
  return { body: SNAKE_COLOR, head: HEAD_COLOR, lookDir: round.dir, isDead: false };
}

/** Фигура в стакане — наполовину в цвете будущего блока и «твердеет», пока лежит на опоре. */
function pieceLook(round: Round): SnakeLook {
  const lookDir = round.dir;
  if (round.isOver) return { body: DEAD_COLOR, head: DEAD_HEAD_COLOR, lookDir, isDead: true };

  const restHardness = round.isResting ? (round.restMs / round.params().lockDelayMs) * HARDEN_MAX : 0;
  const hardness = Math.max(PIECE_TINT, restHardness);
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

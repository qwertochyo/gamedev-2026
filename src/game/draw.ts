// Отрисовка стакана, блоков, змейки, мастерской и превращения змейки в фигуру.
// Только рисование — правила в logic.ts и round.ts.
//
// Визуальный язык: жёлтый контур — «чертёж» (заказ и место, куда упадёт фигура), зелёное — живая змейка,
// цветное с глазами — фигура, в которую она превратилась, цветное без глаз — застывшие блоки.

import Phaser from 'phaser';
import {
  COLS,
  DROP_STEP_MS,
  EMPTY,
  MORPH_MS,
  ROWS,
  SHAPES,
  SNAKE_LENGTH,
  WORKSHOP_ENTRY_COL,
  WORKSHOP_SIZE,
  columnTop,
  move,
  spawnLeft,
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
const CENTER_X = GAME_WIDTH / 2;

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

// мастерская (этап 1): большая карточка поверх стакана — сверху чертёж заказа и время, ниже поле 5×5
const CARD_X = FIELD_X + 10;
const CARD_Y = FIELD_Y + 14;
const CARD_W = FIELD_W - 20;
const CARD_PADDING = 24;
export const CARD_LEFT = CARD_X + CARD_PADDING; // левый край надписей в карточке
export const CARD_RIGHT = CARD_X + CARD_W - CARD_PADDING;
export const CARD_TITLE_Y = CARD_Y + 22; // строка «СОБЕРИ ЗАКАЗ · 8 с»
export const BLUEPRINT_Y = CARD_Y + 86; // центр чертежа заказа
const BLUEPRINT_CELL = 34;
const TIMER_Y = CARD_Y + 140;
const TIMER_H = 10;
const WS_CELL = 68; // клетка мастерской — крупнее, чем в стакане (44)
const WS_PX = WORKSHOP_SIZE * WS_CELL;
const WS_X = CENTER_X - WS_PX / 2;
const WS_Y = CARD_Y + 176;
export const CARD_HINT_Y = WS_Y + WS_PX + 30; // подсказка под полем мастерской
const CARD_H = CARD_HINT_Y + 28 - CARD_Y;
const CARD_FADE_MS = 200; // карточка мастерской появляется плавно
const ENTRY_SHOW_FROM = -0.35; // хвост, выползающий из норы, виден, когда вылез на две трети клетки

// превращение (этап 'morph'): сначала змейка меняется на месте, потом летит в стакан
const MORPH_CHANGE_PART = 0.4; // первые 40% перехода — превращение на месте
const MORPH_POP = 0.08; // фигура на миг «вздувается»
const MORPH_FLASH = 0.7; // насколько белая вспышка

// глаза (размеры — для клетки стакана, в мастерской крупнее)
const EYE_FORWARD_PX = 7; // насколько глаза сдвинуты в сторону взгляда
const EYE_SPREAD_PX = 9; // насколько глаза разнесены поперёк взгляда
const EYE_RADIUS = 6;
const PUPIL_RADIUS = 3;

// цвета
export const PALETTE = [0xf97316, 0xeab308, 0x06b6d4, 0x3b82f6, 0xa855f7, 0xec4899, 0xef4444];
const SNAKE_COLOR = 0x22c55e; // живая змейка всегда зелёная
const HEAD_COLOR = 0x86efac;
const DEAD_COLOR = 0xef4444;
const DEAD_HEAD_COLOR = 0xfca5a5;
const TAIL_DARKEN = 0.3; // хвост темнее головы
export const ORDER_COLOR = 0xfde047; // жёлтый «чертёж»: заказ и место падения
const BLUEPRINT_FILL_ALPHA = 0.14;
const GHOST_ALPHA = 0.55; // контур места падения — бледнее заказа
const BG_TOP = 0x131c3a;
const BG_BOTTOM = 0x070b18;
const FIELD_COLOR = 0x050914;
const FIELD_GLOW = 0x3b82f6;
const GRID_DOT_COLOR = 0x1e293b;
const FRAME_COLOR = 0x334155;
const CARD_COLOR = 0x0f172a;
const HOLE_COLOR = 0x000000; // нора, из которой выползает змейка
const ROCK_COLOR = 0x64748b; // камни в мастерской (фаза 3)
const ROCK_SHADE = 0x334155;
const ROCK_SHINE = 0xcbd5e1;
const ROCK_SIZE = 0.82; // камень чуть меньше клетки мастерской
const DIM_COLOR = 0x020617; // стакан затемнён, пока собирают заказ
const DIM_ALPHA = 0.6; // блоки видно: пока рисуешь, можно прикинуть, куда ставить
const TIMER_COLOR = 0x22c55e; // полоска времени: зелёная, к концу краснеет
const DANGER_COLOR = 0xef4444;
const DANGER_ALPHA = 0.35;
const DANGER_ROWS = 3; // высота красного свечения у верха стакана
const SHINE_ALPHA = 0.25; // блик на верхнем крае клетки
const EYE_WHITE = 0xffffff;
const PUPIL_COLOR = 0x0f172a;

// плавность и мигание
const SLIDE_MS = 90; // за сколько змейка доезжает до новой клетки после шага или падения
const PIECE_TINT = 0.8; // фигура в стакане почти целиком в цвете будущего блока
const DANGER_PULSE_MS = 140; // скорость мигания, когда вверху почти нет места

type Graphics = Phaser.GameObjects.Graphics;
interface Point {
  x: number;
  y: number;
}

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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

/** Центр клетки стакана в пикселях. Клетка может быть дробной — во время плавного движения. */
function cellCenter(cell: Cell): Point {
  return { x: FIELD_X + (cell.col + 0.5) * CELL, y: FIELD_Y + (cell.row + 0.5) * CELL };
}

/** Центр клетки мастерской в пикселях. */
function workshopCenter(cell: Cell): Point {
  return { x: WS_X + (cell.col + 0.5) * WS_CELL, y: WS_Y + (cell.row + 0.5) * WS_CELL };
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

/** Одна клетка размера size: скруглённый квадрат с бликом сверху. */
function drawBlockAt(g: Graphics, p: Point, size: number, color: number): void {
  const k = size / CELL_SIZE;
  g.fillStyle(color);
  g.fillRoundedRect(p.x - size / 2, p.y - size / 2, size, size, CELL_RADIUS * k);
  g.fillStyle(0xffffff, SHINE_ALPHA);
  g.fillRoundedRect(p.x - size / 2 + 6 * k, p.y - size / 2 + 4 * k, size - 12 * k, 5 * k, 2.5 * k);
}

function drawBlock(g: Graphics, cell: Cell, color: number): void {
  drawBlockAt(g, cellCenter(cell), CELL_SIZE, color);
}

/** Перемычка между соседними клетками одной фигуры: так она выглядит цельной. */
function drawLinkAt(g: Graphics, a: Point, b: Point, size: number, color: number): void {
  g.lineStyle(size, color);
  g.lineBetween(a.x, a.y, b.x, b.y);
}

/** Клетка «чертежа»: жёлтый контур с лёгкой заливкой. */
function drawBlueprintAt(g: Graphics, p: Point, size: number, alpha: number): void {
  const radius = size * 0.2;
  g.fillStyle(ORDER_COLOR, BLUEPRINT_FILL_ALPHA * alpha);
  g.fillRoundedRect(p.x - size / 2, p.y - size / 2, size, size, radius);
  g.lineStyle(2, ORDER_COLOR, alpha);
  g.strokeRoundedRect(p.x - size / 2 + 1, p.y - size / 2 + 1, size - 2, size - 2, radius);
}

/** Застывшие блоки. Клетки одной фигуры соединены перемычками. */
function drawBlocks(g: Graphics, grid: Grid): void {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const id = grid[row][col];
      if (id === EMPTY) continue;
      const color = pieceColor(id);
      const here = cellCenter({ col, row });
      if (col + 1 < COLS && grid[row][col + 1] === id) drawLinkAt(g, here, cellCenter({ col: col + 1, row }), CELL_SIZE, color);
      if (row + 1 < ROWS && grid[row + 1][col] === id) drawLinkAt(g, here, cellCenter({ col, row: row + 1 }), CELL_SIZE, color);
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
 * Змейка или фигура с глазами. centers — центры клеток в пикселях (голова первая), cell — размер клетки:
 * в мастерской крупнее, в стакане меньше, во время превращения — между ними. Невидимые клетки (ещё в норе) пропускаем.
 */
function drawSnake(g: Graphics, centers: Point[], cell: number, look: SnakeLook, isVisible: (i: number) => boolean): void {
  if (centers.length === 0) return;
  const size = cell * (CELL_SIZE / CELL);
  const colorAt = (i: number): number =>
    i === 0 ? look.head : lerpColor(look.body, 0x000000, (TAIL_DARKEN * i) / centers.length);

  for (let i = centers.length - 1; i > 0; i--) {
    if (isVisible(i) && isVisible(i - 1)) drawLinkAt(g, centers[i], centers[i - 1], size, colorAt(i));
  }
  for (let i = centers.length - 1; i >= 0; i--) {
    if (isVisible(i)) drawBlockAt(g, centers[i], size, colorAt(i));
  }
  if (isVisible(0)) drawEyes(g, centers[0], look, cell / CELL);
}

function drawEyes(g: Graphics, center: Point, look: SnakeLook, scale: number): void {
  const forward = move({ col: 0, row: 0 }, look.lookDir); // единичный вектор взгляда
  const ahead = EYE_FORWARD_PX * scale;
  const spread = EYE_SPREAD_PX * scale;

  for (const side of [-1, 1]) {
    const x = center.x + forward.col * ahead + forward.row * spread * side;
    const y = center.y + forward.row * ahead + forward.col * spread * side;
    if (look.isDead) {
      // глаза-крестики
      const r = 4 * scale;
      g.lineStyle(3 * scale, PUPIL_COLOR);
      g.lineBetween(x - r, y - r, x + r, y + r);
      g.lineBetween(x - r, y + r, x + r, y - r);
      continue;
    }
    g.fillStyle(EYE_WHITE);
    g.fillCircle(x, y, EYE_RADIUS * scale);
    g.fillStyle(PUPIL_COLOR);
    g.fillCircle(x + forward.col * 2 * scale, y + forward.row * 2 * scale, PUPIL_RADIUS * scale);
  }
}

/**
 * Маленькая фигура по центру в точке (x, y): заказ, следующий заказ.
 * 'blueprint' — жёлтый контур-«чертёж», 'solid' — залитая цветом color.
 */
export function drawShape(
  g: Graphics,
  shape: Cell[],
  x: number,
  y: number,
  size: number,
  color: number,
  style: 'solid' | 'blueprint' = 'solid',
  alpha = 1,
): void {
  const cols = Math.max(...shape.map((c) => c.col)) + 1;
  const rows = Math.max(...shape.map((c) => c.row)) + 1;
  const left = x - (cols * size) / 2;
  const top = y - (rows * size) / 2;
  const gap = Math.max(1, size * 0.08);
  for (const cell of shape) {
    const p = { x: left + (cell.col + 0.5) * size, y: top + (cell.row + 0.5) * size };
    if (style === 'blueprint') {
      drawBlueprintAt(g, p, size - gap * 2, alpha);
      continue;
    }
    g.fillStyle(color, alpha);
    g.fillRoundedRect(p.x - size / 2 + gap, p.y - size / 2 + gap, size - gap * 2, size - gap * 2, size * 0.2);
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
  drawDanger(g, dangerLevel(round, timeMs));
  drawBlocks(g, round.grid);
  if (round.stage === 'place') {
    if (!round.isOver) drawGhost(g, round.landingCells());
    drawSnake(g, snakeVisualCells(round).map(cellCenter), CELL, pieceLook(round), () => true);
  }
  const hatch = hatchAlpha(round);
  if (hatch > 0) drawHatch(g, round.spawnCells, hatch);
  const card = workshopAlpha(round);
  if (card > 0) drawWorkshop(g, round, card);
  if (round.stage === 'morph') drawMorph(g, round);
}

/** Насколько видна карточка мастерской: плавно появляется, пока идёт рисование, и тает, пока фигура летит в стакан. */
export function workshopAlpha(round: Round): number {
  if (round.stage === 'draw') return clamp01((round.drawMs - round.drawMsLeft) / CARD_FADE_MS);
  if (round.stage === 'morph') return 1 - morphFlight(round);
  return 0;
}

/** 0…1 — первая часть перехода: змейка превращается в фигуру на месте. */
function morphChange(round: Round): number {
  return clamp01(round.morphMs / (MORPH_MS * MORPH_CHANGE_PART));
}

/** 0…1 — вторая часть перехода: фигура летит из мастерской в стакан. */
function morphFlight(round: Round): number {
  return clamp01((round.morphMs - MORPH_MS * MORPH_CHANGE_PART) / (MORPH_MS * (1 - MORPH_CHANGE_PART)));
}

/** Этап 1: стакан затемнён, сверху карточка — чертёж заказа, полоска времени, поле с норой, камнями и змейкой. */
function drawWorkshop(g: Graphics, round: Round, alpha: number): void {
  g.fillStyle(DIM_COLOR, DIM_ALPHA * alpha);
  g.fillRect(FIELD_X, FIELD_Y, FIELD_W, FIELD_H);

  g.fillStyle(CARD_COLOR, alpha);
  g.fillRoundedRect(CARD_X, CARD_Y, CARD_W, CARD_H, 16);
  g.lineStyle(2, FRAME_COLOR, alpha);
  g.strokeRoundedRect(CARD_X, CARD_Y, CARD_W, CARD_H, 16);

  drawShape(g, SHAPES[round.order()], CENTER_X, BLUEPRINT_Y, BLUEPRINT_CELL, ORDER_COLOR, 'blueprint', alpha);
  drawTimer(g, round.drawMs > 0 ? round.drawMsLeft / round.drawMs : 0, alpha);

  g.fillStyle(FIELD_COLOR, alpha);
  g.fillRoundedRect(WS_X - 6, WS_Y - 6, WS_PX + 12, WS_PX + 12, 10);
  g.fillStyle(GRID_DOT_COLOR, alpha);
  for (let row = 1; row < WORKSHOP_SIZE; row++) {
    for (let col = 1; col < WORKSHOP_SIZE; col++) {
      g.fillCircle(WS_X + col * WS_CELL, WS_Y + row * WS_CELL, 2);
    }
  }
  // нора у верхнего края: отсюда выползает змейка
  g.fillStyle(HOLE_COLOR, alpha);
  g.fillEllipse(WS_X + (WORKSHOP_ENTRY_COL + 0.5) * WS_CELL, WS_Y - 2, WS_CELL * 0.8, 20);
  for (const rock of round.rocks) drawRock(g, workshopCenter(rock), alpha);

  if (round.stage !== 'draw') return; // во время превращения змейку рисует drawMorph
  const cells = snakeVisualCells(round);
  drawSnake(g, cells.map(workshopCenter), WS_CELL, workshopLook(round), (i) => cells[i].row > ENTRY_SHOW_FROM);
}

/** Камень: серый, с бликом сверху и тенью снизу — сразу видно, что через него не проползти. */
function drawRock(g: Graphics, p: Point, alpha: number): void {
  const size = WS_CELL * ROCK_SIZE;
  const radius = size * 0.3;
  g.fillStyle(ROCK_SHADE, alpha);
  g.fillRoundedRect(p.x - size / 2, p.y - size / 2 + 4, size, size - 4, radius);
  g.fillStyle(ROCK_COLOR, alpha);
  g.fillRoundedRect(p.x - size / 2, p.y - size / 2, size, size - 6, radius);
  g.fillStyle(ROCK_SHINE, 0.35 * alpha);
  g.fillEllipse(p.x - size * 0.16, p.y - size * 0.22, size * 0.34, size * 0.16);
}

/** Полоска оставшегося времени: left = 1 — время только пошло, 0 — вышло. */
function drawTimer(g: Graphics, left: number, alpha: number): void {
  const w = CARD_RIGHT - CARD_LEFT;
  g.fillStyle(GRID_DOT_COLOR, alpha);
  g.fillRoundedRect(CARD_LEFT, TIMER_Y, w, TIMER_H, TIMER_H / 2);
  if (left <= 0) return;
  g.fillStyle(lerpColor(DANGER_COLOR, TIMER_COLOR, left), alpha);
  g.fillRoundedRect(CARD_LEFT, TIMER_Y, Math.max(TIMER_H, w * left), TIMER_H, TIMER_H / 2);
}

/**
 * Превращение: змейка вспыхивает и перекрашивается в цвет фигуры, на миг «вздувается»,
 * потом уменьшается до клеток стакана и летит на своё место вверху стакана.
 */
function drawMorph(g: Graphics, round: Round): void {
  const change = morphChange(round);
  const flight = easeInOut(morphFlight(round));
  const from = snakeVisualCells(round).map(workshopCenter);
  const to = round.spawnCells.map(cellCenter);
  const centers = from.map((p, i) => ({ x: lerp(p.x, to[i].x, flight), y: lerp(p.y, to[i].y, flight) }));
  const pulse = Math.sin(Math.PI * change); // 0 → 1 → 0
  const cell = lerp(WS_CELL, CELL, flight) * (1 + MORPH_POP * pulse);

  drawSnake(g, centers, cell, pieceColors(round, PIECE_TINT * change), () => true);
  const flash = MORPH_FLASH * pulse;
  if (flash <= 0) return;
  g.fillStyle(0xffffff, flash);
  const size = cell * (CELL_SIZE / CELL);
  for (const p of centers) g.fillRoundedRect(p.x - size / 2, p.y - size / 2, size, size, CELL_RADIUS * (size / CELL_SIZE));
}

/** Люк в верхней кромке стакана шириной с фигуру: через него она входит в стакан. */
function hatchAlpha(round: Round): number {
  if (round.isOver) return 0;
  if (round.stage === 'morph') return clamp01(morphFlight(round) * 3);
  // пока фигура ещё в самом верху — люк открыт, опустилась — исчез
  if (round.stage === 'place') return Math.min(...round.snake.map((cell) => cell.row)) === 0 ? 1 : 0;
  return 0;
}

function drawHatch(g: Graphics, cells: Cell[], alpha: number): void {
  const left = Math.min(...cells.map((cell) => cell.col));
  const right = Math.max(...cells.map((cell) => cell.col)) + 1;
  const x = FIELD_X + left * CELL;
  const w = (right - left) * CELL;
  g.fillStyle(FIELD_COLOR, alpha); // проём в рамке стакана
  g.fillRect(x, FIELD_Y - FIELD_PADDING - 2, w, FIELD_PADDING + 4);
  g.lineStyle(3, ORDER_COLOR, alpha);
  g.strokeRoundedRect(x - 4, FIELD_Y - 18, w + 8, 14, 5);
}

/** Жёлтый контур там, куда упадёт фигура, если уронить её сейчас. */
function drawGhost(g: Graphics, cells: Cell[]): void {
  for (const cell of cells) drawBlueprintAt(g, cellCenter(cell), CELL_SIZE, GHOST_ALPHA);
}

/** Верх стакана краснеет и мигает, когда там, где появляются фигуры, почти нет места. */
function drawDanger(g: Graphics, danger: number): void {
  if (danger <= 0) return;
  const a = DANGER_ALPHA * danger;
  g.fillGradientStyle(DANGER_COLOR, DANGER_COLOR, DANGER_COLOR, DANGER_COLOR, a, a, 0, 0);
  g.fillRect(FIELD_X, FIELD_Y, FIELD_W, DANGER_ROWS * CELL);
}

/** 0…1 — насколько сильно краснеть. Опасно, если над столбцами появления фигур меньше 4 свободных строк. */
function dangerLevel(round: Round, timeMs: number): number {
  const left = spawnLeft(SNAKE_LENGTH);
  let top = ROWS;
  for (let col = left; col < left + SNAKE_LENGTH; col++) top = Math.min(top, columnTop(round.grid, col));
  if (top >= SNAKE_LENGTH) return 0;
  return 0.5 + 0.5 * Math.sin(timeMs / DANGER_PULSE_MS);
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

/** Змейка в мастерской — зелёная, глаза смотрят туда, куда последний раз шагнула голова. */
function workshopLook(round: Round): SnakeLook {
  if (round.isOver) return { body: DEAD_COLOR, head: DEAD_HEAD_COLOR, lookDir: round.dir, isDead: true };
  return { body: SNAKE_COLOR, head: HEAD_COLOR, lookDir: round.dir, isDead: false };
}

/** Фигура в стакане почти в цвете будущего блока и окончательно «твердеет», пока лежит на опоре. */
function pieceLook(round: Round): SnakeLook {
  if (round.isOver) return { body: DEAD_COLOR, head: DEAD_HEAD_COLOR, lookDir: round.dir, isDead: true };
  const rest = round.isResting ? round.restMs / round.params().lockDelayMs : 0;
  return pieceColors(round, Math.max(PIECE_TINT, lerp(PIECE_TINT, 1, rest)));
}

/** Цвета от зелёной змейки (hardness = 0) до цвета будущего блока (1). */
function pieceColors(round: Round, hardness: number): SnakeLook {
  const target = pieceColor(round.pieceCount);
  return {
    body: lerpColor(SNAKE_COLOR, target, hardness),
    head: lerpColor(HEAD_COLOR, target, hardness),
    lookDir: round.dir,
    isDead: false,
  };
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
}

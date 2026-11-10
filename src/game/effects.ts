// Обратная связь: вспышки, всплывающие очки, баннеры, тряска и вибрация.
// Только показывает — правила игры отсюда не меняются.

import Phaser from 'phaser';
import { fallMsForLevel, type Cell } from './logic';
import { CELL, FIELD_H, FIELD_W, FIELD_X, FIELD_Y, WORKSHOP_CENTER_X, WORKSHOP_CENTER_Y, drawCellsFlash } from './draw';
import { ACCENT_COLOR, DEPTH, floatText, showBanner } from './ui';

const BIG_CLEAR_LINES = 3; // со стольких линий сразу трясём экран
const VIBRATE_LINE_MS = 30;
const VIBRATE_BIG_MS = 80;
const VIBRATE_GAME_OVER_MS = 150;
const POPUP_BOTTOM_MARGIN = 60; // «+200» не вылезает за дно стакана
const ORDER_DONE_COLOR = '#4ade80';
// Баннеры — ниже мастерской (она вверху стакана) и друг под другом, чтобы не наложились
const LEVEL_BANNER_Y = FIELD_Y + FIELD_H * 0.45;
const PHASE_BANNER_Y = FIELD_Y + FIELD_H * 0.6;

type Scene = Phaser.Scene;

/** Заказ собран: «+20» над мастерской. */
export function celebrateOrder(scene: Scene, points: number): void {
  floatText(scene, WORKSHOP_CENTER_X, WORKSHOP_CENTER_Y, `+${points}`, 44, ORDER_DONE_COLOR);
  vibrate(VIBRATE_LINE_MS);
}

/** Белая вспышка на застывших клетках. */
export function flashCells(scene: Scene, cells: Cell[]): void {
  const flash = scene.add.graphics().setDepth(DEPTH.fx).setAlpha(0.7);
  drawCellsFlash(flash, cells);
  scene.tweens.add({ targets: flash, alpha: 0, duration: 250, onComplete: () => flash.destroy() });
}

/** Очистка линий: вспышка строк, «+200», тряска за 3+ линии, вибрация. */
export function celebrateLines(scene: Scene, rows: number[], points: number): void {
  flashRows(scene, rows);
  showLinePoints(scene, rows, points);
  const isBigClear = rows.length >= BIG_CLEAR_LINES;
  if (isBigClear) scene.cameras.main.shake(250, 0.006);
  vibrate(isBigClear ? VIBRATE_BIG_MS : VIBRATE_LINE_MS);
}

/** Вспышка на месте исчезнувших строк. */
function flashRows(scene: Scene, rows: number[]): void {
  for (const row of rows) {
    const flash = scene.add
      .rectangle(FIELD_X + FIELD_W / 2, FIELD_Y + (row + 0.5) * CELL, FIELD_W, CELL, 0xffffff)
      .setDepth(DEPTH.fx);
    scene.tweens.add({
      targets: flash,
      alpha: 0,
      scaleY: 0.2,
      duration: 400,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });
  }
}

/** «+200» на высоте исчезнувших строк. */
function showLinePoints(scene: Scene, rows: number[], points: number): void {
  const middleRow = rows.reduce((sum, row) => sum + row, 0) / rows.length;
  const x = FIELD_X + FIELD_W / 2;
  const y = Math.min(FIELD_Y + (middleRow + 0.5) * CELL, FIELD_Y + FIELD_H - POPUP_BOTTOM_MARGIN);
  floatText(scene, x, y, `+${points}`, 52, ACCENT_COLOR);
}

/** Баннер «Уровень 2 — Фигуры падают быстрее». */
export function showLevelUpBanner(scene: Scene, oldLevel: number, newLevel: number): void {
  const faster = fallMsForLevel(newLevel) < fallMsForLevel(oldLevel);
  showBanner(scene, `Уровень ${newLevel}`, faster ? 'Фигуры падают быстрее' : 'Так держать!', LEVEL_BANNER_Y);
}

/** Баннер «Фаза 2» — ниже баннера уровня, чтобы они не наложились. */
export function showPhaseBanner(scene: Scene, phase: number): void {
  showBanner(scene, `Фаза ${phase}`, 'Меньше времени на заказ\nТруба ездит быстрее\nФигуры застывают быстрее', PHASE_BANNER_Y);
}

/** Конец игры: экран трясётся, телефон вибрирует. */
export function gameOverFeedback(scene: Scene): void {
  scene.cameras.main.shake(300, 0.008);
  vibrate(VIBRATE_GAME_OVER_MS);
}

/** Число на миг увеличивается — видно, что оно изменилось. */
export function bump(scene: Scene, target: Phaser.GameObjects.Text): void {
  scene.tweens.add({ targets: target, scale: { from: 1.3, to: 1 }, duration: 300, ease: 'Back.easeOut' });
}

function vibrate(ms: number): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // вибрации нет — не страшно
  }
}

// Обратная связь: вспышки, всплывающие очки, баннеры, значок «✓», тряска и вибрация.
// Только показывает — правила игры отсюда не меняются.

import Phaser from 'phaser';
import { fallMsForLevel, type Cell } from './logic';
import { CELL, FIELD_H, FIELD_W, FIELD_X, FIELD_Y, drawCellsFlash } from './draw';
import { ACCENT_COLOR, DEPTH, addText, floatText, showBanner } from './ui';
import type { Round } from './round';

const BIG_CLEAR_LINES = 3; // со стольких линий сразу трясём экран
const VIBRATE_LINE_MS = 30;
const VIBRATE_BIG_MS = 80;
const VIBRATE_GAME_OVER_MS = 150;
const POPUP_BOTTOM_MARGIN = 60; // «+200» не вылезает за дно стакана
const BADGE_OFFSET_PX = 6; // значок «✓» сдвинут от головы наружу
const MATCH_COLOR = '#4ade80';
const PHASE_BANNER_Y = FIELD_Y + FIELD_H * 0.2; // выше баннера уровня и всплывающих очков, чтобы не наложились

type Scene = Phaser.Scene;

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

/** Баннер «Уровень 2 — Змейка падает быстрее». */
export function showLevelUpBanner(scene: Scene, oldLevel: number, newLevel: number): void {
  const faster = fallMsForLevel(newLevel) < fallMsForLevel(oldLevel);
  showBanner(scene, `Уровень ${newLevel}`, faster ? 'Змейка падает быстрее' : 'Так держать!');
}

/** Баннер «Фаза 2» — выше баннера уровня, чтобы они не наложились. */
export function showPhaseBanner(scene: Scene, phase: number): void {
  showBanner(scene, `Фаза ${phase}`, 'Труба ездит быстрее\nЗмейка застывает быстрее', PHASE_BANNER_Y);
}

/** Конец игры: экран трясётся, телефон вибрирует. */
export function gameOverFeedback(scene: Scene): void {
  scene.cameras.main.shake(300, 0.008);
  vibrate(VIBRATE_GAME_OVER_MS);
}

/** Число (или фигура заказа) на миг увеличивается — видно, что оно изменилось. */
export function bump(scene: Scene, target: Phaser.GameObjects.Text | Phaser.GameObjects.Graphics): void {
  scene.tweens.add({ targets: target, scale: { from: 1.3, to: 1 }, duration: 300, ease: 'Back.easeOut' });
}

function vibrate(ms: number): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // вибрации нет — не страшно
  }
}

/** «✓» у головы: змейка уже совпадает с заказом — можно ронять. */
export class MatchBadge {
  readonly label: Phaser.GameObjects.Text;
  private readonly scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
    this.label = addText(scene, 0, 0, '✓', 26, MATCH_COLOR, true)
      .setOrigin(0.5)
      .setStroke('#020617', 6)
      .setDepth(DEPTH.fx)
      .setVisible(false);
  }

  /** cells — где змейка сейчас на экране (с учётом плавного движения). */
  update(cells: Cell[], round: Round): void {
    const isVisible = !round.isOver && cells.length > 0 && round.matchesOrder();
    if (!isVisible) {
      this.label.setVisible(false);
      return;
    }
    if (!this.label.visible) bump(this.scene, this.label); // только что совпала — значок подпрыгивает
    // у правого верхнего угла всей змейки — так значок не закрывает ни голову, ни тело
    const right = Math.max(...cells.map((cell) => cell.col)) + 1;
    const top = Math.min(...cells.map((cell) => cell.row));
    const x = FIELD_X + right * CELL + BADGE_OFFSET_PX;
    const y = FIELD_Y + Math.max(0, top) * CELL - BADGE_OFFSET_PX;
    this.label.setVisible(true).setPosition(x, y);
  }
}

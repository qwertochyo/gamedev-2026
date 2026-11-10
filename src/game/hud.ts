// Верхняя панель: очки, заказанная фигура, рекорд, следующий заказ, линии, уровень и кнопка паузы;
// надписи карточки мастерской (заголовок, секунды, подсказка); строка фазы под стаканом.

import Phaser from 'phaser';
import { PHASE_2_AT_SCORE, SHAPES } from './logic';
import {
  CARD_HINT_Y,
  CARD_LEFT,
  CARD_RIGHT,
  CARD_TITLE_Y,
  FIELD_W,
  FIELD_X,
  GAME_WIDTH,
  ORDER_COLOR,
  drawShape,
  workshopAlpha,
} from './draw';
import { ACCENT_COLOR, MUTED_COLOR, TEXT_COLOR, addText } from './ui';
import { bump } from './effects';
import type { Round } from './round';

const HUD_LABEL_Y = 12;
const HUD_VALUE_Y = 48;
const HUD_ROW2_Y = 84;
const ORDER_CELL = 20; // заказ в панели
const ORDER_Y = HUD_VALUE_Y + 4;
const NEXT_CELL = 8;
const NEXT_COLOR = 0x64748b;
const HUD_EMPTY_COLOR = 0x1e293b;
const PAUSE_BUTTON_SIZE = 40; // кнопка паузы в правом верхнем углу — для телефона и мыши
const PAUSE_HIT_W = 64; // зона нажатия больше самой кнопки, чтобы попадать пальцем
const PAUSE_HIT_H = 72;
const PAUSE_BORDER_COLOR = 0x334155;
const PAUSE_ICON_COLOR = 0xcbd5e1;
const HUD_RIGHT = FIELD_X + FIELD_W - PAUSE_BUTTON_SIZE - 14; // рекорд стоит левее кнопки паузы
const STATUS_Y = 948; // строка «Фаза 1 · фаза 2 с 1000 очков» под стаканом
const LOW_TIME_MS = 2000; // меньше стольких мс — секунды красные

type Text = Phaser.GameObjects.Text;

export class Hud {
  private readonly scene: Phaser.Scene;
  private readonly scoreText: Text;
  private readonly bestText: Text;
  private readonly linesText: Text;
  private readonly levelText: Text;
  private readonly statusText: Text;
  private readonly orderPreview: Phaser.GameObjects.Graphics;
  private readonly nextPreview: Phaser.GameObjects.Graphics;
  private readonly workshopTexts: Text[]; // заголовок, секунды и подсказка карточки мастерской — тают вместе с ней
  private readonly secondsText: Text;
  private shownScore = 0;

  /** isTouch — телефон (подсказки про свайпы); onPause — нажали кнопку паузы. */
  constructor(scene: Phaser.Scene, isTouch: boolean, onPause: () => void) {
    this.scene = scene;
    const center = GAME_WIDTH / 2;
    const right = FIELD_X + FIELD_W;
    const label = (x: number, y: number, text: string): Text =>
      addText(scene, x, y, text, 13, MUTED_COLOR, true).setLetterSpacing(2);

    label(FIELD_X, HUD_LABEL_Y, 'ОЧКИ');
    label(center, HUD_LABEL_Y, 'ЗАКАЗ').setOrigin(0.5, 0);
    label(HUD_RIGHT, HUD_LABEL_Y, 'РЕКОРД').setOrigin(1, 0);
    this.scoreText = addText(scene, FIELD_X, HUD_VALUE_Y, '', 34, TEXT_COLOR, true).setOrigin(0, 0.5);
    this.bestText = addText(scene, HUD_RIGHT, HUD_VALUE_Y, '', 34, TEXT_COLOR, true).setOrigin(1, 0.5);
    this.linesText = addText(scene, FIELD_X, HUD_ROW2_Y, '', 15, MUTED_COLOR).setOrigin(0, 0.5);
    this.levelText = addText(scene, center, HUD_ROW2_Y, '', 15, MUTED_COLOR).setOrigin(0.5);
    label(right - 4 * NEXT_CELL - 8, HUD_ROW2_Y, 'ДАЛЕЕ').setOrigin(1, 0.5);
    this.statusText = addText(scene, center, STATUS_Y, '', 15, MUTED_COLOR).setOrigin(0.5);

    this.orderPreview = scene.add.graphics().setPosition(center, ORDER_Y);
    this.nextPreview = scene.add.graphics();
    const title = label(CARD_LEFT, CARD_TITLE_Y, 'СОБЕРИ ЗАКАЗ').setOrigin(0, 0.5).setFontSize(15);
    this.secondsText = addText(scene, CARD_RIGHT, CARD_TITLE_Y, '', 22, TEXT_COLOR, true).setOrigin(1, 0.5);
    const hintText = isTouch ? 'Свайпы ← ↑ → ↓ — рисуй змейкой' : '← ↑ → ↓ — рисуй змейкой';
    const hint = addText(scene, center, CARD_HINT_Y, hintText, 17, MUTED_COLOR).setOrigin(0.5);
    this.workshopTexts = [title, this.secondsText, hint];
    createPauseButton(scene, onPause);
  }

  /** Обновляет панель после событий партии. Счёт подпрыгивает, только если очки изменились. */
  update(round: Round, bestScore: number): void {
    this.scoreText.setText(String(round.score));
    this.bestText.setText(String(Math.max(bestScore, round.score)));
    this.bestText.setColor(round.score > bestScore ? ACCENT_COLOR : TEXT_COLOR); // рекорд бьётся прямо сейчас
    this.linesText.setText(`Линии: ${round.lines}`);
    this.levelText.setText(`Уровень ${round.level}`);
    this.updateStatus(round.phase);
    this.drawOrders(round);
    if (round.score !== this.shownScore) bump(this.scene, this.scoreText);
    this.shownScore = round.score;
  }

  /** Каждый кадр: надписи карточки видны вместе с ней; секунды тикают. */
  updateWorkshop(round: Round): void {
    const alpha = workshopAlpha(round);
    for (const text of this.workshopTexts) text.setVisible(alpha > 0).setAlpha(alpha);
    if (alpha === 0) return;
    this.secondsText.setText(`${Math.ceil(round.drawMsLeft / 1000)} с`);
    this.secondsText.setColor(round.drawMsLeft < LOW_TIME_MS ? ACCENT_COLOR : TEXT_COLOR);
  }

  /** Номер уровня на миг подпрыгивает — при переходе на новый уровень. */
  bumpLevel(): void {
    bump(this.scene, this.levelText);
  }

  /** «Фаза 1 · фаза 2 с 1000 очков» под стаканом; в фазе 2 — жёлтая «Фаза 2». */
  private updateStatus(phase: number): void {
    const text = phase === 1 ? `Фаза 1 · фаза 2 с ${PHASE_2_AT_SCORE} очков` : `Фаза ${phase}`;
    this.statusText.setText(text).setColor(phase > 1 ? ACCENT_COLOR : MUTED_COLOR);
  }

  /** Заказ — жёлтым чертежом в центре панели, следующий заказ — мелко справа внизу. */
  private drawOrders(round: Round): void {
    this.orderPreview.clear();
    drawShape(this.orderPreview, SHAPES[round.order()], 0, 0, ORDER_CELL, ORDER_COLOR, 'blueprint');
    const right = FIELD_X + FIELD_W;
    this.nextPreview.clear();
    drawShape(this.nextPreview, SHAPES[round.nextOrder()], right - 2 * NEXT_CELL, HUD_ROW2_Y, NEXT_CELL, NEXT_COLOR);
  }
}

/** Кнопка паузы в правом верхнем углу: на телефоне нет Esc. Срабатывает, когда палец отпущен над ней. */
function createPauseButton(scene: Phaser.Scene, onPause: () => void): void {
  const size = PAUSE_BUTTON_SIZE;
  const x = FIELD_X + FIELD_W - size / 2;
  const y = HUD_LABEL_Y + size / 2 + 4;

  const g = scene.add.graphics();
  g.fillStyle(HUD_EMPTY_COLOR);
  g.fillRoundedRect(x - size / 2, y - size / 2, size, size, 10);
  g.lineStyle(2, PAUSE_BORDER_COLOR);
  g.strokeRoundedRect(x - size / 2, y - size / 2, size, size, 10);
  g.fillStyle(PAUSE_ICON_COLOR); // две полоски «II»
  g.fillRoundedRect(x - 8, y - 9, 5, 18, 2);
  g.fillRoundedRect(x + 3, y - 9, 5, 18, 2);

  scene.add
    .zone(x, y, PAUSE_HIT_W, PAUSE_HIT_H)
    .setInteractive({ useHandCursor: true })
    .on('pointerup', onPause);
}

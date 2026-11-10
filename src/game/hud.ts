// Верхняя панель: очки, заказанная фигура, рекорд, следующий заказ, линии, уровень и кнопка паузы;
// всплывающий новый заказ, который улетает в панель; строка фазы под стаканом.

import Phaser from 'phaser';
import { PHASE_2_AT_SCORE, SHAPES, type ShapeId } from './logic';
import { FIELD_H, FIELD_W, FIELD_X, FIELD_Y, GAME_WIDTH, drawShape } from './draw';
import { ACCENT_COLOR, DEPTH, MUTED_COLOR, TEXT_COLOR, addText } from './ui';
import { bump } from './effects';
import type { Round } from './round';

const HUD_LABEL_Y = 12;
const HUD_VALUE_Y = 48;
const HUD_ROW2_Y = 84;
const ORDER_CELL = 20; // заказ — крупно, это главная цель каждой змейки
const ORDER_Y = HUD_VALUE_Y + 4;
const ORDER_COLOR = 0xfde047;
// Новый заказ на миг появляется крупно в стакане и улетает на своё место в панели; игра при этом идёт
const POPUP_CELL = 40;
const POPUP_Y = FIELD_Y + FIELD_H * 0.28; // выше подсказки в середине стакана
const POPUP_PADDING = 18;
const POPUP_LABEL_H = 34; // место под надписью «ЗАКАЗ» над фигурой
const POPUP_BG_COLOR = 0x0f172a;
const POPUP_BORDER_COLOR = 0x334155;
const POPUP_IN_MS = 200;
const POPUP_HOLD_MS = 600;
const POPUP_FLY_MS = 400;
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

type Text = Phaser.GameObjects.Text;

export class Hud {
  private readonly scene: Phaser.Scene;
  private readonly scoreText: Text;
  private readonly bestText: Text;
  private readonly linesText: Text;
  private readonly levelText: Text;
  private readonly statusText: Text;
  private readonly orderPreview: Phaser.GameObjects.Graphics; // стоит в точке заказа — так её можно «подбросить»
  private readonly nextPreview: Phaser.GameObjects.Graphics;
  private orderPopup: Phaser.GameObjects.Container | null = null;

  /** onPause — нажали кнопку паузы. */
  constructor(scene: Phaser.Scene, onPause: () => void) {
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
    createPauseButton(scene, onPause);
  }

  /** Обновляет панель. bumpScore — счёт на миг подпрыгнет: очки только что выросли. */
  update(round: Round, bestScore: number, bumpScore: boolean): void {
    this.scoreText.setText(String(round.score));
    this.bestText.setText(String(Math.max(bestScore, round.score)));
    this.bestText.setColor(round.score > bestScore ? ACCENT_COLOR : TEXT_COLOR); // рекорд бьётся прямо сейчас
    this.linesText.setText(`Линии: ${round.lines}`);
    this.levelText.setText(`Уровень ${round.level}`);
    this.updateStatus(round.phase);
    this.drawOrders(round);
    if (bumpScore) bump(this.scene, this.scoreText);
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

  /** Заказ — крупно в центре, следующий заказ — мелко справа внизу. */
  private drawOrders(round: Round): void {
    this.orderPreview.clear();
    drawShape(this.orderPreview, SHAPES[round.order()], 0, 0, ORDER_CELL, ORDER_COLOR);
    const right = FIELD_X + FIELD_W;
    this.nextPreview.clear();
    drawShape(this.nextPreview, SHAPES[round.nextOrder()], right - 2 * NEXT_CELL, HUD_ROW2_Y, NEXT_CELL, NEXT_COLOR);
  }

  /** Новый заказ: крупная фигура с подписью появляется в стакане и улетает на своё место в панели. */
  showNewOrder(shape: ShapeId): void {
    // предыдущая ещё летит (змейку бросили очень быстро) — убираем, чтобы не мешала
    if (this.orderPopup) {
      this.scene.tweens.killTweensOf([this.orderPopup, ...this.orderPopup.list]);
      this.orderPopup.destroy();
    }
    const popup = createOrderPopup(this.scene, shape);
    this.orderPopup = popup;
    this.orderPreview.setAlpha(0); // в панели заказ появится, когда фигура долетит

    const [card, label] = popup.list;
    this.scene.tweens.add({ targets: popup, alpha: 1, scale: 1, duration: POPUP_IN_MS, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: popup,
      x: GAME_WIDTH / 2,
      y: ORDER_Y,
      scale: ORDER_CELL / POPUP_CELL,
      delay: POPUP_IN_MS + POPUP_HOLD_MS,
      duration: POPUP_FLY_MS,
      ease: 'Cubic.easeIn',
      onComplete: () => this.landOrder(popup),
    });
    // в полёте подложка и надпись тают — в панель прилетает только фигура
    this.scene.tweens.add({ targets: [card, label], alpha: 0, delay: POPUP_IN_MS + POPUP_HOLD_MS, duration: POPUP_FLY_MS });
  }

  private landOrder(popup: Phaser.GameObjects.Container): void {
    popup.destroy();
    if (this.orderPopup === popup) this.orderPopup = null;
    this.orderPreview.setAlpha(1);
    bump(this.scene, this.orderPreview);
  }
}

/** Карточка «ЗАКАЗ» с крупной фигурой посреди стакана. Порядок: подложка, надпись, фигура. */
function createOrderPopup(scene: Phaser.Scene, shape: ShapeId): Phaser.GameObjects.Container {
  const cells = SHAPES[shape];
  const shapeW = (Math.max(...cells.map((c) => c.col)) + 1) * POPUP_CELL;
  const shapeH = (Math.max(...cells.map((c) => c.row)) + 1) * POPUP_CELL;
  const cardW = shapeW + POPUP_PADDING * 2;
  const cardH = shapeH + POPUP_LABEL_H + POPUP_PADDING * 2;
  const cardTop = -shapeH / 2 - POPUP_LABEL_H - POPUP_PADDING; // фигура — в центре контейнера, чтобы прилететь точно в панель

  const card = scene.add
    .rectangle(0, cardTop + cardH / 2, cardW, cardH, POPUP_BG_COLOR, 0.92)
    .setStrokeStyle(2, POPUP_BORDER_COLOR)
    .setRounded(16);
  const label = addText(scene, 0, cardTop + POPUP_PADDING, 'ЗАКАЗ', 18, MUTED_COLOR, true)
    .setOrigin(0.5, 0)
    .setLetterSpacing(2);
  const figure = scene.add.graphics();
  drawShape(figure, cells, 0, 0, POPUP_CELL, ORDER_COLOR);

  return scene.add
    .container(GAME_WIDTH / 2, POPUP_Y, [card, label, figure])
    .setDepth(DEPTH.banner)
    .setAlpha(0)
    .setScale(0.6);
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

// Верхняя панель: очки, уровень, рекорд, линии, длина змейки и кнопка паузы; строка фазы под стаканом.

import Phaser from 'phaser';
import { LINES_PER_LEVEL, MAX_LENGTH, PHASE_2_AT_SCORE, snakeLengthForLevel } from './logic';
import { FIELD_W, FIELD_X, GAME_WIDTH, SNAKE_COLOR } from './draw';
import { ACCENT_COLOR, MUTED_COLOR, TEXT_COLOR, addText } from './ui';
import { bump } from './effects';
import type { Round } from './round';

const HUD_LABEL_Y = 12;
const HUD_VALUE_Y = 48;
const HUD_ROW2_Y = 84;
const LEVEL_BAR_W = 80;
const LEVEL_BAR_COLOR = 0xfde047;
const HUD_EMPTY_COLOR = 0x1e293b;
const LENGTH_DOT = 9;
const LENGTH_DOT_STEP = 12;
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
  private readonly levelText: Text;
  private readonly bestText: Text;
  private readonly linesText: Text;
  private readonly statusText: Text;
  private readonly bars: Phaser.GameObjects.Graphics;

  /** onPause — нажали кнопку паузы. */
  constructor(scene: Phaser.Scene, onPause: () => void) {
    this.scene = scene;
    const center = GAME_WIDTH / 2;
    const right = FIELD_X + FIELD_W;
    const label = (x: number, text: string): Text =>
      addText(scene, x, HUD_LABEL_Y, text, 13, MUTED_COLOR, true).setLetterSpacing(2);

    label(FIELD_X, 'ОЧКИ');
    label(center, 'УРОВЕНЬ').setOrigin(0.5, 0);
    label(HUD_RIGHT, 'РЕКОРД').setOrigin(1, 0);
    this.scoreText = addText(scene, FIELD_X, HUD_VALUE_Y, '', 34, TEXT_COLOR, true).setOrigin(0, 0.5);
    this.levelText = addText(scene, center, HUD_VALUE_Y, '', 34, TEXT_COLOR, true).setOrigin(0.5);
    this.bestText = addText(scene, HUD_RIGHT, HUD_VALUE_Y, '', 34, TEXT_COLOR, true).setOrigin(1, 0.5);
    this.linesText = addText(scene, FIELD_X, HUD_ROW2_Y, '', 15, MUTED_COLOR).setOrigin(0, 0.5);
    addText(scene, right - MAX_LENGTH * LENGTH_DOT_STEP - 6, HUD_ROW2_Y, 'ДЛИНА', 13, MUTED_COLOR, true)
      .setOrigin(1, 0.5)
      .setLetterSpacing(2);
    this.statusText = addText(scene, center, STATUS_Y, '', 15, MUTED_COLOR).setOrigin(0.5);

    this.bars = scene.add.graphics();
    createPauseButton(scene, onPause);
  }

  /** Обновляет числа на панели. bumpScore — счёт на миг подпрыгнет: очки только что выросли. */
  update(round: Round, bestScore: number, bumpScore: boolean): void {
    this.scoreText.setText(String(round.score));
    this.levelText.setText(String(round.level));
    this.bestText.setText(String(Math.max(bestScore, round.score)));
    this.bestText.setColor(round.score > bestScore ? ACCENT_COLOR : TEXT_COLOR); // рекорд бьётся прямо сейчас
    this.linesText.setText(`Линии: ${round.lines}`);
    this.updateStatus(round.phase);
    this.drawBars(round);
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

  /** Полоска до следующего уровня и квадратики длины змейки. */
  private drawBars(round: Round): void {
    const g = this.bars;
    g.clear();

    const barX = GAME_WIDTH / 2 - LEVEL_BAR_W / 2;
    const progress = (round.lines % LINES_PER_LEVEL) / LINES_PER_LEVEL;
    g.fillStyle(HUD_EMPTY_COLOR);
    g.fillRoundedRect(barX, HUD_ROW2_Y - 3, LEVEL_BAR_W, 6, 3);
    if (progress > 0) {
      g.fillStyle(LEVEL_BAR_COLOR);
      g.fillRoundedRect(barX, HUD_ROW2_Y - 3, LEVEL_BAR_W * progress, 6, 3);
    }

    const length = snakeLengthForLevel(round.level);
    const dotsX = FIELD_X + FIELD_W - MAX_LENGTH * LENGTH_DOT_STEP + (LENGTH_DOT_STEP - LENGTH_DOT);
    for (let i = 0; i < MAX_LENGTH; i++) {
      g.fillStyle(i < length ? SNAKE_COLOR : HUD_EMPTY_COLOR);
      g.fillRoundedRect(dotsX + i * LENGTH_DOT_STEP, HUD_ROW2_Y - LENGTH_DOT / 2, LENGTH_DOT, LENGTH_DOT, 2);
    }
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

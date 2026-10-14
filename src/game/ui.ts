// Тексты, кнопки и экраны поверх игры: старт, конец, всплывающие надписи.

import Phaser from 'phaser';
import { FIELD_H, FIELD_Y, GAME_HEIGHT, GAME_WIDTH, PALETTE, RENDER_SCALE } from './draw';

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const TEXT_COLOR = '#f8fafc';
export const MUTED_COLOR = '#94a3b8';
export const ACCENT_COLOR = '#fde047';
const SNAKE_TEXT_COLOR = '#4ade80';
const TETRIS_TEXT_COLOR = '#fb923c';
const DANGER_TEXT_COLOR = '#fca5a5';
const TEXT_STROKE = '#020617';

// слои: что рисуется поверх чего
export const DEPTH = { hint: 1, fx: 2, banner: 3, overlay: 10 };

const OVERLAY_COLOR = 0x020617;
const CARD_COLOR = 0x0f172a;
const CARD_BORDER = 0x334155;
const BUTTON_COLOR = 0x22c55e;
const BUTTON_HOVER = 0x4ade80;
const BUTTON_SHADOW = 0x15803d;
const BUTTON_TEXT = '#052e16';
const BUTTON_W = 260;
const BUTTON_H = 72;

const CENTER_X = GAME_WIDTH / 2;

type Scene = Phaser.Scene;
type Text = Phaser.GameObjects.Text;

export function addText(scene: Scene, x: number, y: number, text: string, size: number, color = TEXT_COLOR, bold = false): Text {
  return scene.add.text(x, y, text, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    fontStyle: bold ? 'bold' : 'normal',
    color,
    resolution: RENDER_SCALE, // текст чёткий при увеличенном canvas
  });
}

/** Кнопка: скруглённый прямоугольник с тенью. Нажатие срабатывает, когда палец отпущен над ней. */
export function addButton(scene: Scene, x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.GameObject[] {
  const shadow = scene.add.rectangle(x, y + 6, BUTTON_W, BUTTON_H, BUTTON_SHADOW).setRounded(20);
  const bg = scene.add.rectangle(x, y, BUTTON_W, BUTTON_H, BUTTON_COLOR).setRounded(20);
  const text = addText(scene, x, y, label, 30, BUTTON_TEXT, true).setOrigin(0.5);

  const press = (isDown: boolean): void => {
    bg.setY(isDown ? y + 4 : y);
    text.setY(isDown ? y + 4 : y);
  };
  bg.setInteractive({ useHandCursor: true })
    .on('pointerover', () => bg.setFillStyle(BUTTON_HOVER))
    .on('pointerout', () => {
      bg.setFillStyle(BUTTON_COLOR);
      press(false);
    })
    .on('pointerdown', () => press(true))
    .on('pointerup', () => {
      press(false);
      onClick();
    });
  return [shadow, bg, text];
}

/** Надпись, которая выскакивает, поднимается и исчезает. */
export function floatText(scene: Scene, x: number, y: number, text: string, size: number, color: string, delay = 0): void {
  const label = addText(scene, x, y, text, size, color, true)
    .setOrigin(0.5)
    .setStroke(TEXT_STROKE, 6)
    .setDepth(DEPTH.fx)
    .setScale(0.5)
    .setAlpha(0);

  scene.tweens.add({ targets: label, scale: 1, alpha: 1, delay, duration: 180, ease: 'Back.easeOut' });
  scene.tweens.add({
    targets: label,
    y: y - 70,
    alpha: 0,
    delay: delay + 450,
    duration: 600,
    ease: 'Cubic.easeIn',
    onComplete: () => label.destroy(),
  });
}

/** Крупная надпись посреди стакана, например «Уровень 2». */
export function showBanner(scene: Scene, title: string, subtitle: string): void {
  const y = FIELD_Y + FIELD_H * 0.38;
  const titleText = addText(scene, CENTER_X, y, title, 48, ACCENT_COLOR, true).setOrigin(0.5).setStroke(TEXT_STROKE, 8);
  const subtitleText = addText(scene, CENTER_X, y + 48, subtitle, 22, TEXT_COLOR, true).setOrigin(0.5).setStroke(TEXT_STROKE, 6);
  const parts = [titleText, subtitleText];
  for (const part of parts) part.setDepth(DEPTH.banner).setAlpha(0).setScale(0.7);

  scene.tweens.add({
    targets: parts,
    alpha: 1,
    scale: 1,
    duration: 250,
    ease: 'Back.easeOut',
    hold: 1100,
    yoyo: true,
    onComplete: () => parts.forEach((part) => part.destroy()),
  });
}

function addOverlay(scene: Scene, alpha: number): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, OVERLAY_COLOR, alpha).setOrigin(0);
}

function addCard(scene: Scene, y: number, width: number, height: number): Phaser.GameObjects.Rectangle {
  return scene.add
    .rectangle(CENTER_X, y, width, height, CARD_COLOR)
    .setRounded(24)
    .setStrokeStyle(2, CARD_BORDER);
}

/** Пульсация, чтобы кнопка звала нажать. */
function pulse(scene: Scene, targets: Phaser.GameObjects.GameObject[]): void {
  scene.tweens.add({ targets, scale: 1.05, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
}

/** Стартовый экран с правилами. Возвращает функцию, которая его убирает. */
export function showStartScreen(scene: Scene, bestScore: number, isTouch: boolean, onStart: () => void): () => void {
  const screen = scene.add.container(0, 0).setDepth(DEPTH.overlay);
  screen.add(addOverlay(scene, 0.88));

  // «ЗМЕЙ» цветом змейки + «ТРИС» цветом блоков
  const left = addText(scene, CENTER_X, 200, 'ЗМЕЙ', 72, SNAKE_TEXT_COLOR, true).setOrigin(1, 0.5);
  const right = addText(scene, CENTER_X, 200, 'ТРИС', 72, TETRIS_TEXT_COLOR, true).setOrigin(0, 0.5);
  const shift = (left.width - right.width) / 2;
  left.x += shift;
  right.x += shift;
  const tagline = addText(scene, CENTER_X, 262, 'Змейка падает в стакан тетриса', 22, MUTED_COLOR).setOrigin(0.5);
  screen.add([left, right, tagline]);

  const rules = [
    isTouch ? 'Свайп ← → ↓ — веди змейку' : '← → ↓ — веди змейку',
    isTouch ? 'Свайп ↓ ещё раз — быстрее' : '↓ ещё раз — быстрее вниз',
    'Упёрлась вниз — застынет',
    'Заполни ряд — он исчезнет',
    'Больше изгибов — больше очков',
    'Труба ездит — следи за ней',
  ];
  const rulesTop = 312;
  const rowHeight = 46;
  const padding = 20;
  const cardHeight = rules.length * rowHeight + padding * 2;
  screen.add(addCard(scene, rulesTop + cardHeight / 2, 440, cardHeight));
  rules.forEach((rule, i) => {
    const y = rulesTop + padding + (i + 0.5) * rowHeight;
    const bullet = scene.add.rectangle(92, y, 16, 16, PALETTE[i]).setRounded(4);
    screen.add([bullet, addText(scene, 116, y, rule, 22).setOrigin(0, 0.5)]);
  });

  const buttonY = rulesTop + cardHeight + 76;
  const button = addButton(scene, CENTER_X, buttonY, 'Играть', onStart);
  screen.add(button);
  pulse(scene, button);

  const footer = [isTouch ? 'или коснись экрана' : 'или нажми любую клавишу'];
  if (bestScore > 0) footer.push(`Рекорд: ${bestScore}`);
  screen.add(addText(scene, CENTER_X, buttonY + 80, footer.join('\n'), 18, MUTED_COLOR).setOrigin(0.5, 0).setAlign('center').setLineSpacing(8));

  return () => {
    scene.tweens.add({ targets: screen, alpha: 0, duration: 200, onComplete: () => screen.destroy() });
  };
}

export interface GameOverInfo {
  reason: string;
  score: number;
  lines: number;
  level: number;
  bestScore: number;
  isNewBest: boolean;
}

/** Карточка конца игры: причина, счёт, рекорд и кнопка «Ещё раз». */
export function showGameOverCard(scene: Scene, info: GameOverInfo, isTouch: boolean, onRestart: () => void): void {
  const overlay = addOverlay(scene, 0.75).setDepth(DEPTH.overlay).setAlpha(0);
  scene.tweens.add({ targets: overlay, alpha: 1, duration: 250 });

  const cardY = 480;
  const card = scene.add.container(0, 0).setDepth(DEPTH.overlay + 1);
  card.add(addCard(scene, cardY, 420, 440));
  card.add(addText(scene, CENTER_X, cardY - 170, 'Стакан полон!', 40, TEXT_COLOR, true).setOrigin(0.5));
  card.add(addText(scene, CENTER_X, cardY - 126, info.reason, 19, DANGER_TEXT_COLOR).setOrigin(0.5));

  const score = addText(scene, CENTER_X, cardY - 52, '0', 68, TEXT_COLOR, true).setOrigin(0.5);
  card.add([score, addText(scene, CENTER_X, cardY - 4, 'очков', 18, MUTED_COLOR).setOrigin(0.5)]);
  card.add(addText(scene, CENTER_X, cardY + 40, `Линии: ${info.lines}   ·   Уровень: ${info.level}`, 21).setOrigin(0.5));

  const record = info.isNewBest
    ? addText(scene, CENTER_X, cardY + 82, '★ Новый рекорд! ★', 24, ACCENT_COLOR, true)
    : addText(scene, CENTER_X, cardY + 82, `Рекорд: ${info.bestScore}`, 21, MUTED_COLOR);
  card.add(record.setOrigin(0.5));
  if (info.isNewBest) pulse(scene, [record]);

  card.add(addButton(scene, CENTER_X, cardY + 160, 'Ещё раз', onRestart));
  if (!isTouch) {
    card.add(addText(scene, CENTER_X, cardY + 250, 'или R, Enter, пробел', 18, MUTED_COLOR).setOrigin(0.5));
  }

  card.setAlpha(0).setY(40);
  scene.tweens.add({ targets: card, alpha: 1, y: 0, duration: 350, ease: 'Back.easeOut' });
  // Счёт «набегает» от нуля
  scene.tweens.addCounter({
    from: 0,
    to: info.score,
    delay: 200,
    duration: 700,
    ease: 'Cubic.easeOut',
    onUpdate: (tween) => score.setText(String(Math.round(tween.getValue() ?? 0))),
  });
}

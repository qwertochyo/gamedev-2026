// Ввод: клавиатура, свайпы и сворачивание вкладки. Переводит события браузера в понятные команды,
// а что с ними делать (старт, пауза, звук, ход), решает сцена.

import Phaser from 'phaser';
import type { Dir } from './logic';

export const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches; // телефон или планшет

const SWIPE_MIN_PX = 30; // каждые столько пикселей движения пальца — новая команда

const KEY_DIRS: Partial<Record<string, Dir>> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
};
const RESTART_KEYS = ['KeyR', 'Enter'];
const DROP_KEY = 'Space'; // уронить фигуру; после конца игры — тоже «Ещё раз»
const PAUSE_KEY = 'Escape';
const MUTE_KEY = 'KeyM'; // звук вкл/выкл

/** Что значит нажатая клавиша — без учёта того, что сейчас на экране. */
export type KeyIntent =
  | { type: 'dir'; dir: Dir }
  | { type: 'drop' }
  | { type: 'pause' }
  | { type: 'mute' }
  | { type: 'restart' }
  | { type: 'other' };

export interface InputHandlers {
  onKey(intent: KeyIntent): void;
  onSwipe(dir: Dir): void; // палец сдвинулся на SWIPE_MIN_PX — можно рисовать, не отрывая
  onTap(): void; // короткое касание или клик без свайпа и не по кнопке
  onHidden(): void; // вкладку или приложение свернули
}

/** Подписывает сцену на ввод. Вызывать в create(): при рестарте сцены слушатели снимаются и ставятся заново. */
export function setupInput(scene: Phaser.Scene, handlers: InputHandlers): void {
  setupKeyboard(scene, handlers);
  setupSwipes(scene, handlers);
  setupHidden(scene, handlers);
}

function keyIntent(code: string): KeyIntent {
  if (code === PAUSE_KEY) return { type: 'pause' };
  if (code === MUTE_KEY) return { type: 'mute' };
  if (code === DROP_KEY) return { type: 'drop' };
  if (RESTART_KEYS.includes(code)) return { type: 'restart' };
  const dir = KEY_DIRS[code];
  return dir ? { type: 'dir', dir } : { type: 'other' };
}

function setupKeyboard(scene: Phaser.Scene, handlers: InputHandlers): void {
  const keyboard = scene.input.keyboard;
  if (!keyboard) return;

  keyboard.addCapture('LEFT,RIGHT,UP,DOWN,SPACE');
  keyboard.on('keydown', (event: KeyboardEvent) => handlers.onKey(keyIntent(event.code)));
}

function setupSwipes(scene: Phaser.Scene, handlers: InputHandlers): void {
  let swipeStart: { x: number; y: number } | null = null;
  let swiped = false; // палец уже рисовал — значит, это не тап

  // Координаты пальца в игровых пикселях 540×960 (canvas увеличен камерой)
  const toWorld = (pointer: Phaser.Input.Pointer): { x: number; y: number } => {
    const point = scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    return { x: point.x, y: point.y };
  };

  scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    swipeStart = toWorld(pointer);
    swiped = false;
  });
  scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
    if (!swipeStart || !pointer.isDown) return;

    const current = toWorld(pointer);
    const dx = current.x - swipeStart.x;
    const dy = current.y - swipeStart.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN_PX) return;

    swipeStart = current;
    swiped = true;
    if (Math.abs(dx) > Math.abs(dy)) handlers.onSwipe(dx < 0 ? 'left' : 'right');
    else handlers.onSwipe(dy < 0 ? 'up' : 'down');
  });
  // Кнопки («Играть», «II», «Продолжить») обрабатывают нажатие сами — это не тап по полю
  scene.input.on('pointerup', (_pointer: Phaser.Input.Pointer, overButtons: Phaser.GameObjects.GameObject[]) => {
    if (!swiped && overButtons.length === 0) handlers.onTap();
    swipeStart = null;
    swiped = false;
  });
}

/** Свернул вкладку или приложение (звонок, другое окно). */
function setupHidden(scene: Phaser.Scene, handlers: InputHandlers): void {
  const onHidden = (): void => handlers.onHidden();
  scene.game.events.on(Phaser.Core.Events.HIDDEN, onHidden);
  // События игры живут дольше сцены: при рестарте снимаем слушателя, иначе они накопятся
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.game.events.off(Phaser.Core.Events.HIDDEN, onHidden));
}

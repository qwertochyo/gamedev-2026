// Ввод: клавиатура, свайпы и сворачивание вкладки. Переводит события браузера в понятные команды,
// а что с ними делать (старт, пауза, поворот), решает сцена.

import Phaser from 'phaser';
import type { Dir } from './logic';

export const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches; // телефон или планшет

const SWIPE_MIN_PX = 30; // каждые столько пикселей движения пальца — новая команда

const KEY_DIRS: Partial<Record<string, Dir>> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowDown: 'down',
  KeyS: 'down',
};
const RESTART_KEYS = ['KeyR', 'Enter', 'Space'];
const PAUSE_KEY = 'Escape';

/** Что значит нажатая клавиша — без учёта того, что сейчас на экране. */
export type KeyIntent = { type: 'dir'; dir: Dir } | { type: 'pause' } | { type: 'restart' } | { type: 'other' };

export interface InputHandlers {
  onKey(intent: KeyIntent): void;
  onSwipe(dir: Dir): void; // палец сдвинулся на SWIPE_MIN_PX — можно вести змейку, не отрывая
  onTap(): void; // палец или кнопка мыши отпущены
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
  if (RESTART_KEYS.includes(code)) return { type: 'restart' };
  const dir = KEY_DIRS[code];
  return dir ? { type: 'dir', dir } : { type: 'other' };
}

function setupKeyboard(scene: Phaser.Scene, handlers: InputHandlers): void {
  const keyboard = scene.input.keyboard;
  if (!keyboard) return;

  keyboard.addCapture('LEFT,RIGHT,DOWN,SPACE');
  keyboard.on('keydown', (event: KeyboardEvent) => handlers.onKey(keyIntent(event.code)));
}

function setupSwipes(scene: Phaser.Scene, handlers: InputHandlers): void {
  let swipeStart: { x: number; y: number } | null = null;

  // Координаты пальца в игровых пикселях 540×960 (canvas увеличен камерой)
  const toWorld = (pointer: Phaser.Input.Pointer): { x: number; y: number } => {
    const point = scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    return { x: point.x, y: point.y };
  };

  scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    swipeStart = toWorld(pointer);
  });
  scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
    if (!swipeStart || !pointer.isDown) return;

    const current = toWorld(pointer);
    const dx = current.x - swipeStart.x;
    const dy = current.y - swipeStart.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN_PX) return;

    swipeStart = current;
    if (Math.abs(dx) > Math.abs(dy)) handlers.onSwipe(dx < 0 ? 'left' : 'right');
    else if (dy > 0) handlers.onSwipe('down'); // свайп вверх ничего не делает
  });
  scene.input.on('pointerup', () => {
    swipeStart = null;
    handlers.onTap();
  });
}

/** Свернул вкладку или приложение (звонок, другое окно). */
function setupHidden(scene: Phaser.Scene, handlers: InputHandlers): void {
  const onHidden = (): void => handlers.onHidden();
  scene.game.events.on(Phaser.Core.Events.HIDDEN, onHidden);
  // События игры живут дольше сцены: при рестарте снимаем слушателя, иначе они накопятся
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.game.events.off(Phaser.Core.Events.HIDDEN, onHidden));
}

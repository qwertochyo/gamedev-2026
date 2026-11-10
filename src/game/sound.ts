// Звук: короткие сигналы, которые браузер синтезирует сам (Web Audio), — без звуковых файлов.
// Второй канал отклика к вспышкам и надписям. Выключается клавишей M или кнопкой на экране паузы.

import { loadMuted, saveMuted } from './storage';

const MASTER_VOLUME = 0.15;
const SILENCE = 0.0001; // громкость «почти ноль»: до нуля плавно затухать нельзя
const BIG_CLEAR_LINES = 3; // со стольких линий сразу — звук длиннее

let context: AudioContext | null = null;
let muted = loadMuted();

/** Браузер разрешает звук только после действия игрока — зовём при старте игры (клик или клавиша). */
export function unlockSound(): void {
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
  } catch {
    context = null; // звука нет — игра работает без него
  }
}

export function isMuted(): boolean {
  return muted;
}

/** Включить или выключить звук. Возвращает, выключен ли он теперь. */
export function toggleMuted(): boolean {
  muted = !muted;
  saveMuted(muted);
  return muted;
}

/** Один тон: частота плавно идёт от from к to за ms и затухает. delayMs — когда начать. */
function tone(from: number, to: number, ms: number, wave: OscillatorType, delayMs = 0, volume = 1): void {
  if (muted || !context) return;
  const start = context.currentTime + delayMs / 1000;
  const end = start + ms / 1000;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(from, start);
  oscillator.frequency.exponentialRampToValueAtTime(to, end);
  gain.gain.setValueAtTime(MASTER_VOLUME * volume, start);
  gain.gain.exponentialRampToValueAtTime(SILENCE, end);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(end);
}

/** Заказ собран, змейка превращается в фигуру: три ноты вверх (до — ми — соль). */
export function playOrderDone(): void {
  tone(523, 523, 90, 'triangle');
  tone(659, 659, 90, 'triangle', 80);
  tone(784, 784, 180, 'triangle', 160);
}

/** Фигура застыла: глухой стук. */
export function playLand(): void {
  tone(170, 60, 120, 'sine', 0, 1.4);
}

/** Линии исчезли: яркий подъём, за 3+ линии — длиннее и выше. */
export function playLines(count: number): void {
  const isBig = count >= BIG_CLEAR_LINES;
  tone(600, isBig ? 1600 : 1200, isBig ? 320 : 200, 'square', 0, 0.6);
}

/** Новый уровень: две ноты. */
export function playLevelUp(): void {
  tone(784, 784, 120, 'triangle');
  tone(1047, 1047, 220, 'triangle', 120);
}

/** Конец игры: звук идёт вниз. */
export function playGameOver(): void {
  tone(392, 98, 600, 'sawtooth', 0, 0.7);
}

// Рекорд и настройка звука в localStorage. На игровых порталах и в приватном режиме хранилище бывает недоступно —
// тогда они просто не сохраняются, а игра работает дальше.

const BEST_SCORE_KEY = 'zmeytris-best-score';

export function loadBestScore(): number {
  try {
    return Number(localStorage.getItem(BEST_SCORE_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function saveBestScore(score: number): void {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch {
    // рекорд просто не сохранится
  }
}

const MUTED_KEY = 'zmeytris-muted';

/** Выключил ли игрок звук в прошлый раз. */
export function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
  } catch {
    // настройка просто не сохранится
  }
}

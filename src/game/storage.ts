// Рекорд в localStorage. На игровых порталах и в приватном режиме хранилище бывает недоступно —
// тогда рекорд просто не сохраняется, а игра работает дальше.

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

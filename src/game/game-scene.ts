import Phaser from 'phaser';
import type { Dir } from './logic';
import { GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE, drawBackground, drawRound } from './draw';
import { MultiplierBadge, celebrateLines, flashCells, gameOverFeedback, showLevelUpBanner, showPhaseBanner } from './effects';
import { Hud } from './hud';
import { IS_TOUCH, setupInput, type KeyIntent } from './input';
import { Round, type RoundEvents } from './round';
import { loadBestScore, saveBestScore } from './storage';
import { createHint, hideHint, showGameOverCard, showHint, showPauseScreen, showStartScreen } from './ui';

const MAX_FRAME_DELTA_MS = 100; // защита от рывка после переключения вкладки
const GAME_OVER_DELAY_MS = 800; // пауза перед карточкой конца: видно, где застряла змейка

interface SceneData {
  skipIntro?: boolean; // при «Ещё раз» стартовый экран не показываем
}

/**
 * Змейтрис. Сцена связывает части игры и ведёт её поток: старт → игра ⇄ пауза → конец → «Ещё раз».
 *
 * Партия и правила — round.ts (+ формулы и настройки в logic.ts), ввод — input.ts,
 * панель — hud.ts, эффекты — effects.ts, рисование — draw.ts, экраны — ui.ts, рекорд — storage.ts.
 */
export class GameScene extends Phaser.Scene {
  private round!: Round;
  private board!: Phaser.GameObjects.Graphics;
  private badge!: MultiplierBadge;
  private hud!: Hud;
  private hint!: Phaser.GameObjects.Text;

  // Состояние сцены. Phaser не пересоздаёт сцену при restart(), поэтому оно сбрасывается в create(),
  // а партия просто создаётся заново — new Round().
  private bestScore = 0;
  private isStarted = false;
  private isPaused = false;
  private canRestart = false;
  private closeStartScreen: (() => void) | null = null;
  private closePauseScreen: (() => void) | null = null;

  constructor() {
    super('GameScene');
  }

  create(data: SceneData = {}): void {
    this.round = new Round(this.roundEvents());
    this.bestScore = loadBestScore();
    this.isStarted = false;
    this.isPaused = false;
    this.canRestart = false;
    this.closeStartScreen = null;
    this.closePauseScreen = null;

    // Игра рисуется в координатах 540×960, камера растягивает её на увеличенный canvas
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    drawBackground(this.add.graphics());
    this.board = this.add.graphics();
    this.badge = new MultiplierBadge(this);
    this.hud = new Hud(this, () => this.pause());
    this.hud.update(this.round, this.bestScore, false);
    this.hint = createHint(this, IS_TOUCH);
    setupInput(this, {
      onKey: (intent) => this.handleKey(intent),
      onSwipe: (dir) => this.handleDir(dir),
      onTap: () => this.startGame(), // на стартовом экране — касание в любом месте
      onHidden: () => this.pause(), // свернули вкладку — игра ждёт на паузе
    });

    if (data.skipIntro) {
      this.isStarted = true;
    } else {
      this.hint.setAlpha(0); // подсказка появится, когда уберём стартовый экран
      this.closeStartScreen = showStartScreen(this, this.bestScore, IS_TOUCH, () => this.startGame());
    }
  }

  update(_time: number, delta: number): void {
    // На паузе правила стоят: змейка, труба и таймер застывания не двигаются
    if (this.isStarted && !this.isPaused && !this.round.isOver) {
      this.round.tick(Math.min(delta, MAX_FRAME_DELTA_MS));
    }
    const snakeCells = drawRound(this.board, this.round, this.time.now);
    this.badge.update(snakeCells[0], this.round);
  }

  /** Как сцена откликается на события партии. */
  private roundEvents(): RoundEvents {
    return {
      onFreeze: (cells) => {
        flashCells(this, cells);
        hideHint(this, this.hint);
      },
      onLinesCleared: (rows, points, multiplier) => celebrateLines(this, rows, points, multiplier),
      onLevelUp: (oldLevel, newLevel) => {
        showLevelUpBanner(this, oldLevel, newLevel);
        this.hud.bumpLevel();
      },
      onPhaseChange: (phase) => showPhaseBanner(this, phase),
      onScoreChange: () => this.hud.update(this.round, this.bestScore, true),
      onGameOver: (reason) => this.gameOver(reason),
    };
  }

  // ---------- поток игры ----------

  private startGame(): void {
    if (this.isStarted) return;
    this.isStarted = true;
    this.closeStartScreen?.();
    this.closeStartScreen = null;
    showHint(this, this.hint);
  }

  /** Esc: поставить на паузу или продолжить. На стартовом экране и после конца игры не действует. */
  private togglePause(): void {
    if (this.isPaused) this.resume();
    else this.pause();
  }

  private pause(): void {
    if (!this.isStarted || this.round.isOver || this.isPaused) return;
    this.isPaused = true;
    this.closePauseScreen = showPauseScreen(this, IS_TOUCH, () => this.resume());
  }

  private resume(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.closePauseScreen?.();
    this.closePauseScreen = null;
  }

  private gameOver(reason: string): void {
    const { score, lines, level } = this.round;
    const isNewBest = score > this.bestScore;
    if (isNewBest) {
      this.bestScore = score;
      saveBestScore(score);
    }
    this.hud.update(this.round, this.bestScore, false);
    gameOverFeedback(this);

    const info = { reason, score, lines, level, bestScore: this.bestScore, isNewBest };
    // Небольшая пауза: игрок успевает увидеть, где застряла змейка
    this.time.delayedCall(GAME_OVER_DELAY_MS, () => {
      showGameOverCard(this, info, IS_TOUCH, () => this.restart());
      this.canRestart = true;
    });
  }

  private restart(): void {
    if (!this.canRestart) return;
    this.canRestart = false;
    this.scene.restart({ skipIntro: true });
  }

  // ---------- ввод ----------

  /** Клавиша: Esc — пауза; на стартовом экране — любая клавиша; после конца — R, Enter, пробел. */
  private handleKey(intent: KeyIntent): void {
    if (intent.type === 'pause') {
      this.togglePause();
      return;
    }
    if (!this.isStarted) {
      this.startGame();
      return;
    }
    if (this.round.isOver) {
      if (intent.type === 'restart') this.restart();
      return;
    }
    if (intent.type === 'dir') this.handleDir(intent.dir);
  }

  /** Стрелка или свайп: команда змейке, если игра идёт. После конца игры партия сама их игнорирует. */
  private handleDir(dir: Dir): void {
    if (!this.isStarted || this.isPaused) return;
    this.round.queueDir(dir);
  }
}

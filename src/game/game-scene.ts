import Phaser from 'phaser';
import type { Dir } from './logic';
import { FIELD_Y, GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE, drawBackground, drawRound } from './draw';
import { celebrateLines, celebrateOrder, flashCells, gameOverFeedback, showLevelUpBanner, showPhaseBanner } from './effects';
import { Hud } from './hud';
import { IS_TOUCH, setupInput, type KeyIntent } from './input';
import { Round, type GameOverReason, type RoundEvents } from './round';
import { loadBestScore, saveBestScore } from './storage';
import { TEXT_COLOR, createHint, floatText, showGameOverCard, showPauseScreen, showStartScreen } from './ui';
import { toggleMuted, unlockSound } from './sound';

const MAX_FRAME_DELTA_MS = 100; // защита от рывка после переключения вкладки
const GAME_OVER_DELAY_MS = 800; // пауза перед карточкой конца: видно, что произошло
const SOUND_TOAST_Y = FIELD_Y + 40; // «Звук выключен» — у верха стакана

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
    this.hud = new Hud(this, IS_TOUCH, () => this.pause());
    this.hud.update(this.round, this.bestScore);
    this.hint = createHint(this, IS_TOUCH);
    setupInput(this, {
      onKey: (intent) => this.handleKey(intent),
      onSwipe: (dir) => this.handleDir(dir),
      onTap: () => this.handleTap(),
      onHidden: () => this.pause(), // свернули вкладку — игра ждёт на паузе
    });

    if (data.skipIntro) {
      this.isStarted = true;
    } else {
      this.closeStartScreen = showStartScreen(this, this.bestScore, IS_TOUCH, () => this.startGame());
    }
  }

  update(_time: number, delta: number): void {
    // На паузе правила стоят: змейка, фигура и таймеры не двигаются
    if (this.isStarted && !this.isPaused && !this.round.isOver) {
      this.round.tick(Math.min(delta, MAX_FRAME_DELTA_MS));
    }
    drawRound(this.board, this.round, this.time.now);
    this.hud.updateWorkshop(this.round);
    // Подсказка про стакан — только пока ставят самую первую фигуру
    this.hint.setVisible(this.round.stage === 'place' && this.round.pieceCount === 0 && !this.round.isOver);
  }

  /** Как сцена откликается на события партии. */
  private roundEvents(): RoundEvents {
    return {
      onOrderDone: (points) => celebrateOrder(this, points),
      onFreeze: (cells) => flashCells(this, cells),
      onLinesCleared: (rows, points) => celebrateLines(this, rows, points),
      onLevelUp: (oldLevel, newLevel) => {
        showLevelUpBanner(this, oldLevel, newLevel);
        this.hud.bumpLevel();
      },
      onPhaseChange: (phase) => showPhaseBanner(this, phase),
      onScoreChange: () => this.hud.update(this.round, this.bestScore),
      onGameOver: (reason) => this.gameOver(reason),
    };
  }

  // ---------- поток игры ----------

  private startGame(): void {
    if (this.isStarted) return;
    this.isStarted = true;
    this.closeStartScreen?.();
    this.closeStartScreen = null;
  }

  /** M: звук вкл/выкл, с короткой надписью у верха стакана. */
  private toggleSound(): void {
    const muted = toggleMuted();
    floatText(this, GAME_WIDTH / 2, SOUND_TOAST_Y, muted ? 'Звук выключен' : 'Звук включён', 26, TEXT_COLOR);
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

  private gameOver(reason: GameOverReason): void {
    const { score, lines, level } = this.round;
    const isNewBest = score > this.bestScore;
    if (isNewBest) {
      this.bestScore = score;
      saveBestScore(score);
    }
    this.hud.update(this.round, this.bestScore);
    gameOverFeedback(this);

    const info = { title: reason.title, reason: reason.text, score, lines, level, bestScore: this.bestScore, isNewBest };
    // Небольшая пауза: игрок успевает увидеть, что произошло
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

  /** Клавиша: Esc — пауза, M — звук; на стартовом экране — любая клавиша; в игре стрелки рисуют и двигают, пробел роняет; после конца — R, Enter, пробел. */
  private handleKey(intent: KeyIntent): void {
    unlockSound(); // браузер включает звук только после действия игрока
    if (intent.type === 'pause') {
      this.togglePause();
      return;
    }
    if (intent.type === 'mute') {
      this.toggleSound();
      return;
    }
    if (!this.isStarted) {
      this.startGame();
      return;
    }
    if (this.round.isOver) {
      if (intent.type === 'restart' || intent.type === 'drop') this.restart();
      return;
    }
    if (intent.type === 'dir') this.handleDir(intent.dir);
    if (intent.type === 'drop') this.handleDrop();
  }

  /** Касание без свайпа: на стартовом экране — начать игру, в игре — уронить фигуру. */
  private handleTap(): void {
    unlockSound();
    if (!this.isStarted) this.startGame();
    else this.handleDrop();
  }

  /** Стрелка или свайп: в мастерской шагает голова змейки, в стакане двигается или крутится фигура. Во время превращения — ничего. */
  private handleDir(dir: Dir): void {
    if (!this.isStarted || this.isPaused) return;
    this.round.steer(dir);
  }

  /** Пробел или тап: уронить фигуру в стакане. */
  private handleDrop(): void {
    if (!this.isStarted || this.isPaused) return;
    this.round.drop();
  }
}

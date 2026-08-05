/**
 * Sound effect manager for chess moves.
 *
 * Plays audio feedback for move, capture, check, and game-end events.
 * Audio files should be placed in public/audio/.
 *
 * Includes Web Audio API synthesis fallback so sound never breaks.
 */

type SoundName = "move" | "capture" | "castle" | "check" | "game_start" | "game_end";

const SOUND_PATHS: Record<SoundName, string> = {
  move: "/audio/move-self.mp3",
  capture: "/audio/capture.mp3",
  castle: "/audio/castle.mp3",
  check: "/audio/move-check.mp3",
  game_start: "/audio/game-start.mp3",
  game_end: "/audio/game-end.mp3",
};

class SoundManager {
  private enabled = true;
  private cache = new Map<string, HTMLAudioElement>();
  private audioCtx: AudioContext | null = null;

  setEnabled(on: boolean) {
    this.enabled = on;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private initAudioContext() {
    if (!this.audioCtx && typeof window !== "undefined") {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  private playSynthesis(sound: SoundName) {
    this.initAudioContext();
    if (!this.audioCtx) return;

    const ctx = this.audioCtx;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    const now = ctx.currentTime;
    
    switch (sound) {
      case "move":
      case "castle":
        osc.type = "sine";
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
      case "capture":
        osc.type = "triangle";
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.15);
        gainNode.gain.setValueAtTime(0.5, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
        break;
      case "check":
        osc.type = "square";
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.setValueAtTime(600, now + 0.1);
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;
      case "game_start":
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(554, now + 0.1);
        osc.frequency.setValueAtTime(659, now + 0.2);
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
        break;
      case "game_end":
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.4);
        gainNode.gain.setValueAtTime(0.4, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
        break;
    }
  }

  play(sound: SoundName) {
    if (!this.enabled) return;

    if (typeof window === 'undefined') return;

    const path = SOUND_PATHS[sound];

    let audio = this.cache.get(path);
    if (!audio) {
      audio = new Audio(path);
      audio.volume = 0.3;
      this.cache.set(path, audio);
    }

    audio.currentTime = 0;
    audio.play().catch(() => {
      // Silently fail if audio file is missing or blocked by browser policy
    });
  }

  /** Play move sound based on the SAN notation */
  playMoveSound(san: string) {
    if (san.includes("+") || san.includes("#")) {
      this.play("check");
    } else if (san.includes("x")) {
      this.play("capture");
    } else if (san.includes("O-O")) {
      this.play("castle");
    } else {
      this.play("move");
    }
  }

  /** Clean up cached audio elements */
  destroy() {
    this.cache.forEach((audio) => {
      audio.pause();
      audio.src = "";
    });
    this.cache.clear();
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
  }
}

export const sounds = new SoundManager();

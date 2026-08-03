/**
 * Sound effect manager for chess moves.
 *
 * Plays audio feedback for move, capture, check, and game-end events.
 * Audio files should be placed in public/audio/.
 *
 * TODO: Add actual .mp3/.wav files to public/audio/
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

  setEnabled(on: boolean) {
    this.enabled = on;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  play(sound: SoundName) {
    if (!this.enabled) return;

    const path = SOUND_PATHS[sound];

    // Try cached audio element first
    let audio = this.cache.get(path);
    if (!audio) {
      audio = new Audio(path);
      audio.volume = 0.3;
      this.cache.set(path, audio);
    }

    // Reset and play
    audio.currentTime = 0;
    audio.play().catch(() => {
      // Autoplay may be blocked — that's fine
    });
  }

  /** Play move sound based on the SAN notation */
  playMoveSound(san: string) {
    if (san.includes("+")) {
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
  }
}

export const sounds = new SoundManager();

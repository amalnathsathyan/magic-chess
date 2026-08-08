/**
 * Sound effect manager for chess moves.
 *
 * Plays audio feedback for move, capture, check, and game-end events.
 * Audio files live in public/audio/.
 */

type SoundName = "move" | "capture" | "castle" | "check" | "game_start" | "game_end";

const SOUND_ENABLED_STORAGE_KEY = "magic-chess:sound-enabled";

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
  private preferenceLoaded = false;
  private cache = new Map<string, HTMLAudioElement>();

  setEnabled(on: boolean) {
    this.enabled = on;
    this.preferenceLoaded = true;

    if (typeof window !== "undefined") {
      window.localStorage.setItem(SOUND_ENABLED_STORAGE_KEY, String(on));
    }

    if (!on) {
      this.cache.forEach((audio) => audio.pause());
    }
  }

  isEnabled(): boolean {
    this.loadPreference();
    return this.enabled;
  }

  private loadPreference() {
    if (this.preferenceLoaded || typeof window === "undefined") return;

    const storedPreference = window.localStorage.getItem(
      SOUND_ENABLED_STORAGE_KEY
    );
    if (storedPreference === "true" || storedPreference === "false") {
      this.enabled = storedPreference === "true";
    }
    this.preferenceLoaded = true;
  }

  play(sound: SoundName) {
    this.loadPreference();
    if (!this.enabled) return;

    if (typeof window === "undefined") return;

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
  }
}

export const sounds = new SoundManager();

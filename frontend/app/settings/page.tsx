"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { sounds } from "@/lib/sounds";

export default function SettingsPage() {
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    setSoundEnabled(sounds.isEnabled());
  }, []);

  const toggleSound = () => {
    const nextValue = !soundEnabled;
    sounds.setEnabled(nextValue);
    setSoundEnabled(nextValue);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-3xl font-bold">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Configure your Magic Chess experience.
        </p>
      </div>

      <div className="mt-6">
        <div className="glass-card flex items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            {soundEnabled ? (
              <Volume2
                className="h-5 w-5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            ) : (
              <VolumeX
                className="h-5 w-5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            <div>
              <p id="sound-effects-label" className="text-sm font-medium">
                Sound effects
              </p>
              <p className="text-xs text-muted-foreground">
                Play sounds for moves, captures, and game events. This setting
                is saved on this device.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={soundEnabled}
            aria-labelledby="sound-effects-label"
            onClick={toggleSound}
            className={`relative inline-flex h-10 w-16 shrink-0 items-center rounded-full border transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              soundEnabled
                ? "border-primary/50 bg-primary"
                : "border-border bg-muted"
            }`}
          >
            <span
              aria-hidden="true"
              className={`inline-block h-7 w-7 rounded-full bg-background shadow-sm transition-transform ${
                soundEnabled ? "translate-x-8" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

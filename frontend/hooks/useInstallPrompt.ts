"use client";

import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export type InstallPlatform = "ios" | "android" | "desktop";

export interface InstallPromptState {
  /** True when the page runs from the home screen (standalone display mode). */
  isStandalone: boolean;
  /** True once the browser offered `beforeinstallprompt` (Chrome, Edge, Samsung Internet). */
  canPrompt: boolean;
  /** Where the user is, to pick the right instructions when there is no prompt. */
  platform: InstallPlatform;
  /** Opens the browser's install dialog. Resolves to true when the user accepted. */
  promptInstall: () => Promise<boolean>;
}

function detectPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as a Mac; the touch check separates it.
  const isIOS =
    /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (isIOS) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

/**
 * Tracks whether ZUG Arena can be installed to the home screen. Android and
 * desktop Chromium fire `beforeinstallprompt`; iOS Safari never does, so the
 * UI shows Share → Add to Home Screen instructions there.
 */
export function useInstallPrompt(): InstallPromptState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [platform, setPlatform] = useState<InstallPlatform>("desktop");

  useEffect(() => {
    setPlatform(detectPlatform());
    setIsStandalone(detectStandalone());

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setIsStandalone(true);
    };
    const media = window.matchMedia("(display-mode: standalone)");
    const onDisplayMode = (e: MediaQueryListEvent) => setIsStandalone(e.matches);

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    media.addEventListener("change", onDisplayMode);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      media.removeEventListener("change", onDisplayMode);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    return outcome === "accepted";
  }, [deferred]);

  return { isStandalone, canPrompt: deferred !== null, platform, promptInstall };
}

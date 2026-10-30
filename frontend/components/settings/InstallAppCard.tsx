"use client";

import { useState } from "react";
import { Check, Download, LoaderCircle, Share, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

/** Settings card: install ZUG Arena to the home screen, or how to on iOS. */
export function InstallAppCard() {
  const { isStandalone, canPrompt, platform, promptInstall } = useInstallPrompt();
  const [installing, setInstalling] = useState(false);

  const install = async () => {
    setInstalling(true);
    try {
      const accepted = await promptInstall();
      if (accepted) toast.success("ZUG Arena added to your home screen");
    } catch {
      toast.error("Could not open the install dialog");
    } finally {
      setInstalling(false);
    }
  };

  if (isStandalone) {
    return (
      <div className="panel flex items-center gap-3 p-4">
        <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium">Installed</p>
          <p className="text-xs text-muted-foreground">
            You&apos;re running ZUG Arena from your home screen.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel flex flex-wrap items-center justify-between gap-4 p-4">
      <div className="flex items-start gap-3">
        <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium">Add to home screen</p>
          {canPrompt ? (
            <p className="text-xs text-muted-foreground">
              Launch ZUG Arena like an app, full screen and without the browser bar.
            </p>
          ) : platform === "ios" ? (
            <p className="text-xs text-muted-foreground">
              In Safari, tap <Share className="inline h-3.5 w-3.5 align-text-bottom" aria-label="Share" />{" "}
              Share, then <span className="text-foreground">Add to Home Screen</span>. Chrome on
              iPhone can&apos;t install web apps.
            </p>
          ) : platform === "android" ? (
            <p className="text-xs text-muted-foreground">
              In Chrome, open the browser menu and choose{" "}
              <span className="text-foreground">Add to Home screen</span> or{" "}
              <span className="text-foreground">Install app</span>.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Open playzug.xyz on your phone to install it, or use the install icon in your
              browser&apos;s address bar.
            </p>
          )}
        </div>
      </div>
      {canPrompt && (
        <button
          type="button"
          onClick={() => void install()}
          disabled={installing}
          aria-busy={installing}
          className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
        >
          {installing ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Install app
        </button>
      )}
    </div>
  );
}

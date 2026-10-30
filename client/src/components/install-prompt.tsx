import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, X, Share } from "lucide-react";
import { useTranslation } from "react-i18next";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIOSSafari(): boolean {
  try {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS|Chrome/.test(ua);
    return isIOS && isSafari;
  } catch {
    return false;
  }
}

function isStandalone(): boolean {
  try {
    return window.matchMedia("(display-mode: standalone)").matches
      || (window.navigator as any).standalone === true;
  } catch {
    return false;
  }
}

function getDismissedTimestamp(): number {
  try {
    const val = localStorage.getItem("install-prompt-dismissed");
    if (!val) return 0;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? 0 : parsed;
  } catch {
    return 0;
  }
}

function setDismissedTimestamp(): void {
  try {
    localStorage.setItem("install-prompt-dismissed", String(Date.now()));
  } catch {}
}

export function InstallPrompt() {
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setIsInstalled(true);
      return;
    }

    const dismissedAt = getDismissedTimestamp();
    if (dismissedAt > 0) {
      const daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) {
        setDismissed(true);
        return;
      }
    }

    if (isIOSSafari()) {
      setShowIOSPrompt(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    const installedHandler = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setDismissed(true);
    setDismissedTimestamp();
  };

  if (isInstalled || dismissed) return null;

  if (showIOSPrompt) {
    return (
      <div
        className="sticky top-0 left-0 right-0 z-40 p-4 bg-primary/5 dark:bg-primary/10 border-b border-primary/20"
        data-testid="banner-install-prompt"
      >
        <div className="flex items-start gap-3 max-w-md mx-auto">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <Download className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-semibold" data-testid="text-install-title">
              {t("installPrompt.installApp")}
            </p>
            <div className="mt-2 space-y-2">
              <p className="text-base text-muted-foreground flex items-center gap-2">
                <span className="font-bold text-primary">1.</span> {t("installPrompt.step1")} <Share className="h-5 w-5 inline-block text-primary shrink-0" /> {t("installPrompt.step1share")}
              </p>
              <p className="text-base text-muted-foreground flex items-center gap-2">
                <span className="font-bold text-primary">2.</span> {t("installPrompt.step2")}
              </p>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleDismiss}
            className="shrink-0"
            data-testid="button-close-install"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>
    );
  }

  if (!deferredPrompt) return null;

  return (
    <div
      className="sticky top-0 left-0 right-0 z-40 p-4 bg-primary/5 dark:bg-primary/10 border-b border-primary/20"
      data-testid="banner-install-prompt"
    >
      <div className="flex items-start gap-3 max-w-md mx-auto">
        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <Download className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-lg font-semibold" data-testid="text-install-title">
            {t("installPrompt.installApp")}
          </p>
          <p className="text-base text-muted-foreground mt-0.5">
            {t("installPrompt.addToHomeScreen")}
          </p>
          <div className="flex gap-2 mt-3">
            <Button
              size="lg"
              onClick={handleInstall}
              data-testid="button-install-app"
            >
              <Download className="h-5 w-5 mr-1.5" />
              {t("installPrompt.installButton")}
            </Button>
            <Button
              size="lg"
              variant="ghost"
              onClick={handleDismiss}
              data-testid="button-dismiss-install"
            >
              {t("installPrompt.notNow")}
            </Button>
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={handleDismiss}
          className="shrink-0"
          data-testid="button-close-install"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}

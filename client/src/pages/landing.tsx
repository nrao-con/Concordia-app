import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, RefreshCw, Pill, Phone, Heart } from "lucide-react";
import concordiaLogo from "@assets/concordia_logo_trimmed.png";
import { Link } from "wouter";

export default function Landing() {
  const { t } = useTranslation();

  const features = [
    {
      icon: ShieldCheck,
      title: t("landing.featureSafeMedication"),
      description: t("landing.featureSafeMedicationDesc"),
      bg: "bg-blue-100 dark:bg-blue-900/30",
      color: "text-blue-600 dark:text-blue-400",
      testId: "text-feature-safe-medication",
    },
    {
      icon: RefreshCw,
      title: t("landing.featureNeverMissRefill"),
      description: t("landing.featureNeverMissRefillDesc"),
      bg: "bg-orange-100 dark:bg-orange-900/30",
      color: "text-orange-600 dark:text-orange-400",
      testId: "text-feature-quick-otc",
    },
    {
      icon: Pill,
      title: t("landing.featureBlisterPack"),
      description: t("landing.featureBlisterPackDesc"),
      bg: "bg-sky-100 dark:bg-sky-900/30",
      color: "text-sky-600 dark:text-sky-400",
      testId: "text-feature-blister-pack",
    },
    {
      icon: Phone,
      title: t("landing.featureDirectPharmacy"),
      description: t("landing.featureDirectPharmacyDesc"),
      bg: "bg-purple-100 dark:bg-purple-900/30",
      color: "text-purple-600 dark:text-purple-400",
      testId: "text-feature-caregiver",
    },
  ];

  return (
    <div className="h-dvh flex flex-col items-center justify-between animate-landing-gradient px-5 py-4 overflow-hidden relative">
      <div className="w-full max-w-lg flex flex-col items-center gap-1 text-center relative z-10 pt-2">
        <img
          src={concordiaLogo}
          alt="ConcordiaCare"
          className="h-14 w-auto object-contain"
          onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }}
          data-testid="img-logo-landing"
        />
        <div className="w-14 h-14 rounded-lg bg-primary/10 flex items-center justify-center hidden">
          <Heart className="w-7 h-7 text-primary" aria-hidden="true" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight mt-2 leading-tight" data-testid="text-landing-title">
          {t("landing.title1")}<br />{t("landing.title2")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1 leading-snug max-w-xs">
          {t("landing.subtitle")}
        </p>
      </div>

      <div className="w-full max-w-lg space-y-2 relative z-10">
        {features.map((feature) => (
          <Card key={feature.testId} className="text-left">
            <CardContent className="flex items-center gap-3 p-3">
              <div className={`w-9 h-9 rounded-lg ${feature.bg} flex items-center justify-center shrink-0`} aria-hidden="true">
                <feature.icon className={`w-5 h-5 ${feature.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-tight" data-testid={feature.testId}>{feature.title}</p>
                <p className="text-xs text-muted-foreground leading-snug">{feature.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="w-full max-w-lg relative z-10 space-y-2 pb-2">
        <Link href="/sign-in">
          <Button
            size="lg"
            className="w-full text-base py-4"
            data-testid="button-login"
          >
            {t("landing.getStarted")}
          </Button>
        </Link>
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground" data-testid="text-powered-by">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t("landing.poweredBy")}</span>
        </div>
      </div>
    </div>
  );
}

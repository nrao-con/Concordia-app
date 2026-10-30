import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  QrCode,
  ShieldCheck,
  Lock,
  BadgeCheck,
  CreditCard,
  Wallet,
  RotateCcw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import concordiaLogo from "@assets/concordia_logo_trimmed.png";
import concordiaCIcon from "@assets/concordia_c_icon.png";

function generatePatientQRData(userId: string) {
  return `${window.location.origin}/loyalty/${userId}`;
}

function getTierFromPoints(points: number): { labelKey: string; className: string } {
  if (points >= 30000) return { labelKey: "memberCard.platinumMember", className: "bg-gradient-to-r from-slate-300 to-slate-100 text-slate-800" };
  if (points >= 20000) return { labelKey: "memberCard.goldMember", className: "bg-gradient-to-r from-amber-400 to-yellow-300 text-amber-900" };
  if (points >= 10000) return { labelKey: "memberCard.silverMember", className: "bg-gradient-to-r from-gray-300 to-gray-200 text-gray-700" };
  if (points >= 5000) return { labelKey: "memberCard.bronzeMember", className: "bg-gradient-to-r from-orange-400 to-orange-300 text-orange-900" };
  return { labelKey: "memberCard.memberMember", className: "bg-gradient-to-r from-blue-200 to-blue-100 text-blue-900" };
}

function formatFallbackMemberNumber(userId: string): string {
  const clean = userId.replace(/-/g, "").toUpperCase();
  return `CC-${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}`;
}

interface MemberCardProps {
  userId: string;
  name: string;
  email: string | null;
  dateOfBirth: string | null;
  loyaltyPoints?: number;
  wellnessCredits?: string;
  otcBenefitEligible?: boolean;
  concordiaId?: string | null;
}

export function MemberCard({
  userId,
  name,
  email,
  dateOfBirth,
  loyaltyPoints = 0,
  wellnessCredits = "0.00",
  otcBenefitEligible = false,
  concordiaId,
}: MemberCardProps) {
  const [flipped, setFlipped] = useState(false);
  const { t, i18n } = useTranslation();
  const tier = getTierFromPoints(loyaltyPoints);
  const memberNumber = concordiaId || formatFallbackMemberNumber(userId);

  const { data: qrDataUrl, isLoading: qrLoading } = useQuery<string>({
    queryKey: ["/api/patient-qr-member", userId],
    queryFn: async () => {
      const qrData = generatePatientQRData(userId);
      const QRCode = await import("qrcode");
      return QRCode.toDataURL(qrData, {
        width: 280,
        margin: 2,
        color: { dark: "#0F172A", light: "#FFFFFF" },
      });
    },
    staleTime: 1000 * 60 * 60,
  });

  const formatDOB = (val: string | null) => {
    if (!val) return t("common.notSet");
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    const locale = i18n.language === "es" ? "es-US" : "en-US";
    return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
  };

  return (
    <div className="space-y-3 animate-card-deal-in">
      <div className="flex flex-wrap items-center gap-2 px-1" data-testid="trust-badges">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-1 rounded-full" data-testid="badge-hipaa">
          <ShieldCheck className="h-3 w-3" aria-hidden="true" />
          {t("memberCard.hipaaCompliant")}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-1 rounded-full" data-testid="badge-encrypted">
          <Lock className="h-3 w-3" aria-hidden="true" />
          {t("memberCard.encrypted")}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 px-2 py-1 rounded-full" data-testid="badge-verified">
          <BadgeCheck className="h-3 w-3" aria-hidden="true" />
          {t("memberCard.verifiedPharmacy")}
        </span>
      </div>

      <div
        className="card-flip-container cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-lg"
        onClick={() => setFlipped(!flipped)}
        data-testid="member-card"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFlipped(!flipped); } }}
        aria-label={flipped ? t("memberCard.flipToFront") : t("memberCard.flipToBack")}
        aria-pressed={flipped}
      >
        <div className={`card-flip-inner ${flipped ? "flipped" : ""}`}>
          <div className="card-flip-front rounded-lg" data-testid="member-card-front" aria-hidden={flipped}>
            <div className="absolute inset-0 rounded-lg overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600/90 via-blue-700/85 to-slate-900/90 backdrop-blur-[15px]" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/15 to-white/10" />
              <div className="absolute top-0 left-0 right-0 h-1/2 bg-white/[0.08] rounded-b-[60%]" />
            </div>

            <div className="relative z-10 flex flex-col h-full p-5 min-h-[280px]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <img
                    src={concordiaLogo}
                    alt="Concordia Pharmacy"
                    className="h-8 w-auto object-contain brightness-0 invert"
                    data-testid="img-member-card-logo-front"
                  />
                  <p className="text-white/50 text-[10px] font-medium tracking-widest uppercase">{t("memberCard.memberCardLabel")}</p>
                </div>
                {otcBenefitEligible && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-200 bg-blue-900/40 px-2 py-0.5 rounded-full border border-blue-400/30" data-testid="badge-otc-benefit">
                    <CreditCard className="h-2.5 w-2.5" aria-hidden="true" />
                    {t("memberCard.otcBenefit")}
                  </span>
                )}
              </div>

              <div className="flex-1 flex flex-col justify-center">
                <p className="text-white/50 text-xs font-medium uppercase tracking-wider mb-1">{t("memberCard.wellnessCredits")}</p>
                <p className="text-white text-3xl font-bold tracking-tight" data-testid="text-wellness-credits">
                  ${wellnessCredits}
                </p>
                <p className="text-white/60 text-sm font-semibold mt-0.5" data-testid="text-loyalty-points-raw">
                  {loyaltyPoints.toLocaleString()} pts
                </p>
                <p className="text-white/40 text-xs mt-0.5">{t("memberCard.availableBalance")}</p>
              </div>

              <div className="flex items-end justify-between mt-auto">
                <div>
                  <p className="text-white/60 text-xs mb-1">{name}</p>
                  <Badge
                    className={`text-xs font-bold border-0 ${tier.className}`}
                    data-testid="badge-member-tier"
                  >
                    {t(tier.labelKey)}
                  </Badge>
                  <p className="text-white/40 text-[10px] mt-1" data-testid="text-loyalty-rate">
                    1000 pts = $1 credit
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-white/60 text-xs">
                  <QrCode className="h-4 w-4" aria-hidden="true" />
                  <span>{t("memberCard.tapToFlip")}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card-flip-back rounded-lg" data-testid="member-card-back" aria-hidden={!flipped}>
            <div className="absolute inset-0 rounded-lg overflow-hidden">
              <div className="absolute inset-0 bg-white dark:bg-slate-900 backdrop-blur-[15px]" />
              <div className="absolute inset-0 border-2 border-blue-200/30 dark:border-blue-700/30 rounded-lg" />
            </div>

            <div className="relative z-10 flex flex-col items-center p-4 min-h-[280px]">
              <div className="flex items-center justify-between w-full mb-2">
                <div className="flex items-center gap-2">
                  <img
                    src={concordiaCIcon}
                    alt="Concordia Pharmacy"
                    className="h-6 w-6 object-contain rounded"
                    data-testid="img-member-card-logo-back"
                  />
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 tracking-wide">{t("memberCard.concordiaPharmacy")}</p>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground text-xs">
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  <span>{t("memberCard.tapToFlip")}</span>
                </div>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                {qrLoading ? (
                  <Skeleton className="w-[110px] h-[110px] rounded-lg" />
                ) : qrDataUrl ? (
                  <div className="rounded-xl border-2 border-blue-100 dark:border-blue-800 p-2 bg-white shadow-sm">
                    <img
                      src={qrDataUrl}
                      alt="Patient QR code for pharmacy scanning"
                      className="w-[110px] h-[110px]"
                      data-testid="img-member-qr"
                    />
                  </div>
                ) : null}

                <div className="text-center space-y-0.5">
                  <p className="text-base font-semibold" data-testid="text-qr-patient-name">{name}</p>
                  <p className="text-sm text-muted-foreground" data-testid="text-qr-patient-dob">
                    {t("memberCard.dob")}: {formatDOB(dateOfBirth)}
                  </p>
                  <Badge variant="secondary" className="text-xs px-2 py-0.5 mt-1 font-mono tracking-wide" data-testid="badge-patient-id">
                    <Wallet className="h-3 w-3 mr-1" aria-hidden="true" />
                    {memberNumber}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Flame, Star, Award, Gift } from "lucide-react";
import concordiaLogo from "@assets/concordia_logo_trimmed.png";

interface CardReward {
  id: number;
  name: string;
  description: string | null;
  pointsCost: number;
  category: string | null;
  imageUrl: string | null;
  canRedeem: boolean;
}

interface PatientCardData {
  name: string;
  memberNumber: string;
  balance: number;
  tier: string;
  streakDays: number;
  rewards: CardReward[];
}

const TIER_CONFIG: Record<string, { label: string; className: string; barColor: string; nextPoints: number | null; nextLabel: string | null }> = {
  member:   { label: "Member",   className: "bg-gradient-to-r from-blue-200 to-blue-100 text-blue-900",         barColor: "bg-blue-400",   nextPoints: 5000,  nextLabel: "Bronze"   },
  bronze:   { label: "Bronze",   className: "bg-gradient-to-r from-orange-400 to-orange-300 text-orange-900",   barColor: "bg-orange-400", nextPoints: 10000, nextLabel: "Silver"   },
  silver:   { label: "Silver",   className: "bg-gradient-to-r from-gray-300 to-gray-200 text-gray-700",         barColor: "bg-gray-400",   nextPoints: 20000, nextLabel: "Gold"     },
  gold:     { label: "Gold",     className: "bg-gradient-to-r from-amber-400 to-yellow-300 text-amber-900",     barColor: "bg-amber-400",  nextPoints: 30000, nextLabel: "Platinum" },
  platinum: { label: "Platinum", className: "bg-gradient-to-r from-slate-300 to-slate-100 text-slate-800",     barColor: "bg-slate-400",  nextPoints: null,  nextLabel: null       },
};

function getTierConfig(tier: string) {
  return TIER_CONFIG[tier.toLowerCase()] ?? TIER_CONFIG["member"];
}

function getTierFloor(tier: string): number {
  const floors: Record<string, number> = { member: 0, bronze: 5000, silver: 10000, gold: 20000, platinum: 30000 };
  return floors[tier.toLowerCase()] ?? 0;
}

function PointsRing({ balance }: { balance: number }) {
  return (
    <div
      className="flex flex-col items-center justify-center w-44 h-44 rounded-full bg-gradient-to-br from-blue-600 to-blue-800 shadow-2xl shadow-blue-900/40"
      data-testid="ring-points-balance"
    >
      <p className="text-white/70 text-xs font-semibold tracking-widest uppercase">Points</p>
      <p className="text-white text-4xl font-bold leading-none mt-1" data-testid="text-points-balance">
        {balance.toLocaleString()}
      </p>
      <p className="text-white/60 text-xs mt-1">total earned</p>
    </div>
  );
}

function TierProgress({ balance, tier }: { balance: number; tier: string }) {
  const cfg = getTierConfig(tier);
  const floor = getTierFloor(tier);
  const next = cfg.nextPoints;

  let pct = 100;
  if (next !== null) {
    const range = next - floor;
    pct = Math.min(100, Math.round(((balance - floor) / range) * 100));
  }

  return (
    <div className="w-full space-y-2" data-testid="container-tier-progress">
      <div className="flex items-center justify-between">
        <Badge className={`text-xs font-bold border-0 px-3 py-1 ${cfg.className}`} data-testid="badge-tier">
          <Star className="h-3 w-3 mr-1" aria-hidden="true" />
          {cfg.label}
        </Badge>
        {next !== null ? (
          <span className="text-xs text-muted-foreground" data-testid="text-points-to-next">
            {(next - balance).toLocaleString()} pts to {cfg.nextLabel ?? "next tier"}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground" data-testid="text-top-tier">Top tier</span>
        )}
      </div>
      <div className="h-2.5 rounded-full bg-muted overflow-hidden" data-testid="bar-tier-track">
        <div
          className={`h-full rounded-full transition-all ${cfg.barColor}`}
          style={{ width: `${pct}%` }}
          data-testid="bar-tier-fill"
        />
      </div>
    </div>
  );
}

function RewardCard({ reward }: { reward: CardReward }) {
  return (
    <div
      className={`rounded-xl border p-3 space-y-1 transition-opacity ${reward.canRedeem ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30" : "border-border bg-card opacity-60"}`}
      data-testid={`card-reward-${reward.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-tight" data-testid={`text-reward-name-${reward.id}`}>
          {reward.name}
        </p>
        {reward.canRedeem && (
          <Badge className="shrink-0 text-[10px] bg-green-600 text-white border-0" data-testid={`badge-reward-eligible-${reward.id}`}>
            Eligible
          </Badge>
        )}
      </div>
      {reward.description && (
        <p className="text-xs text-muted-foreground line-clamp-2" data-testid={`text-reward-desc-${reward.id}`}>
          {reward.description}
        </p>
      )}
      <p className="text-xs font-bold text-primary" data-testid={`text-reward-cost-${reward.id}`}>
        {reward.pointsCost.toLocaleString()} pts
      </p>
    </div>
  );
}

export default function LoyaltyCard() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, isError } = useQuery<PatientCardData>({
    queryKey: ["/api/patient-card", id],
    queryFn: async () => {
      const res = await fetch(`/api/patient-card/${id}`);
      if (res.status === 404) throw new Error("not_found");
      if (!res.ok) throw new Error("server_error");
      return res.json();
    },
    enabled: !!id,
    retry: false,
  });

  return (
    <div className="min-h-dvh bg-background" data-testid="page-loyalty-card">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-xl border-b px-4 py-3 flex items-center gap-3" data-testid="header-loyalty">
        <img
          src={concordiaLogo}
          alt="ConcordiaCare Pharmacy"
          className="h-7 w-auto object-contain"
          data-testid="img-loyalty-logo"
        />
        <span className="text-sm font-semibold text-foreground">Loyalty Dashboard</span>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-6">
        {isLoading && (
          <div className="space-y-6" data-testid="skeleton-loyalty">
            <div className="flex justify-center">
              <Skeleton className="w-44 h-44 rounded-full" />
            </div>
            <Skeleton className="h-8 w-48 mx-auto" />
            <Skeleton className="h-4 w-full" />
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center" data-testid="state-card-not-found">
            <Award className="h-14 w-14 text-muted-foreground/40" />
            <p className="text-lg font-semibold">Card not found</p>
            <p className="text-sm text-muted-foreground max-w-[260px]">
              This loyalty card could not be found. Please visit the pharmacy counter for assistance.
            </p>
          </div>
        )}

        {data && (
          <>
            <div className="flex flex-col items-center gap-4" data-testid="container-patient-info">
              <PointsRing balance={data.balance} />
              <div className="text-center">
                <p className="text-xl font-bold" data-testid="text-patient-name">{data.name}</p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5" data-testid="text-member-number">
                  {data.memberNumber}
                </p>
              </div>
            </div>

            <TierProgress balance={data.balance} tier={data.tier} />

            {data.streakDays > 0 && (
              <div
                className="flex items-center gap-3 rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 px-4 py-3"
                data-testid="container-streak"
              >
                <Flame className="h-5 w-5 text-orange-500 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold" data-testid="text-streak-days">
                    {data.streakDays}-day streak
                  </p>
                  <p className="text-xs text-muted-foreground">Keep picking up your medications on time!</p>
                </div>
              </div>
            )}

            <div className="space-y-3" data-testid="container-rewards">
              <div className="flex items-center gap-2">
                <Gift className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <h2 className="text-sm font-semibold">Available Rewards</h2>
              </div>
              {data.rewards.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6" data-testid="text-no-rewards">
                  No rewards available at this time.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {data.rewards.map(r => <RewardCard key={r.id} reward={r} />)}
                </div>
              )}
            </div>

            <p className="text-center text-xs text-muted-foreground pb-2" data-testid="text-points-rate">
              1000 pts = $1 wellness credit &nbsp;·&nbsp; Redeem at the pharmacy counter
            </p>
          </>
        )}
      </main>
    </div>
  );
}

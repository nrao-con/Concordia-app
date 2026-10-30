import { useState, useEffect, useRef, Component } from "react";
import type { ReactNode } from "react";
import { Switch, Route, Link, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { CartProvider } from "@/hooks/use-cart";
import { PatientProvider, usePatientContext } from "@/hooks/use-patient-context";
import { Users, X } from "lucide-react";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Inquiry from "@/pages/inquiry";
import Orders from "@/pages/orders";
import Cart from "@/pages/cart";
import Medications from "@/pages/medications";
import BlisterPacks from "@/pages/blister-packs";
import Reminders from "@/pages/reminders";
import Profile from "@/pages/profile";
import OrderDetail from "@/pages/order-detail";
import Landing from "@/pages/landing";
import Onboarding from "@/pages/onboarding";
import PharmacyChat from "@/pages/pharmacy-chat";
import Shop from "@/pages/shop";
import AdminPatientDetail from "@/pages/admin/patient-detail";
import FraudCases from "@/pages/admin/fraud-cases";
import SyncOperations from "@/pages/admin/sync-operations";
import LoyaltyCard from "@/pages/loyalty-card";
import Settings from "@/pages/settings";
import CareNavigator from "@/pages/care-navigator";
import PharmacyLinkRequests, { PatientLinkRequired } from "@/pages/pharmacy-link";
import StandaloneAccount from "@/pages/standalone-account";
import { Pill, Smartphone, Clock, WifiOff, Shield } from "lucide-react";
import { InstallPrompt } from "@/components/install-prompt";
import { useInactivityLogout } from "@/hooks/use-inactivity-logout";
import { useInactivityAlertCheck } from "@/hooks/use-inactivity-alert-check";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/bottom-nav";
import { useTranslation } from "react-i18next";
import "@/i18n";
import { initTextSize } from "@/hooks/use-text-size";
import { useReminderScheduler } from "@/hooks/use-reminder-scheduler";
import { usePharmacyAlertSound } from "@/hooks/use-pharmacy-alert-sound";
import { useStaffPanelSSE } from "@/hooks/use-staff-panel-sse";
import { MissedAlertsDialog } from "@/components/missed-alerts-dialog";
import { SignIn, SignUp, useClerk } from "@clerk/react";

initTextSize();

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    return addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) {
        queryClient.clear();
      }
      previousUserId.current = userId;
    });
  }, [addListener, queryClient]);

  return null;
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100dvh",
            padding: "24px",
            fontFamily: "sans-serif",
            textAlign: "center",
            gap: "16px",
          }}
        >
          <p style={{ fontSize: "18px", fontWeight: 600 }}>Something went wrong</p>
          <p style={{ fontSize: "14px", color: "#666", maxWidth: "320px" }}>
            {this.state.error.message}
          </p>
          <button
            data-testid="button-error-reload"
            onClick={() => window.location.replace("/")}
            style={{
              marginTop: "8px",
              padding: "12px 28px",
              fontSize: "16px",
              borderRadius: "8px",
              border: "none",
              background: "#1d4ed8",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Reload app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function PageTransition({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  return (
    <div key={location} className="page-transition">
      {children}
    </div>
  );
}

function Router() {
  return (
    <PageTransition>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/orders" component={Orders} />
        <Route path="/orders/:id" component={OrderDetail} />
        <Route path="/cart" component={Cart} />
        <Route path="/medications" component={Medications} />
        <Route path="/inquiry" component={Inquiry} />
        <Route path="/blister-packs" component={BlisterPacks} />
        <Route path="/reminders" component={Reminders} />
        <Route path="/profile" component={Profile} />
        <Route path="/pharmacy-chat" component={PharmacyChat} />
        <Route path="/shop" component={Shop} />
        <Route path="/settings" component={Settings} />
        <Route path="/care-navigator" component={CareNavigator} />
        <Route path="/admin/patients/:id" component={AdminPatientDetail} />
        <Route path="/admin/fraud" component={FraudCases} />
        <Route path="/admin/sync-operations" component={SyncOperations} />
        <Route path="/admin/pharmacy-link-requests"><PharmacyLinkRequests /></Route>
        <Route component={NotFound} />
      </Switch>
    </PageTransition>
  );
}

const pageTitleKeys: Record<string, string> = {
  "/": "pageTitles.home",
  "/inquiry": "nav.healthChat",
  "/orders": "pageTitles.orders",
  "/medications": "pageTitles.myMedications",
  "/blister-packs": "pageTitles.blisterPacks",
  "/reminders": "pageTitles.reminders",
  "/cart": "pageTitles.yourCart",
  "/shop": "pageTitles.shop",
  "/profile": "pageTitles.myProfile",
  "/pharmacy-chat": "pageTitles.pharmacyMessages",
  "/settings": "pageTitles.settings",
  "/care-navigator": "pageTitles.careNavigator",
};

function usePageTitle(path: string): string {
  const { t } = useTranslation();
  if (path === "/records") return "Records";
  if (pageTitleKeys[path]) return t(pageTitleKeys[path]);
  if (path.startsWith("/orders/")) return t("pageTitles.orderDetails");
  return "ConcordiaCare";
}

function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-800 text-sm"
      data-testid="banner-offline"
    >
      <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
      <span className="text-amber-800 dark:text-amber-200 font-medium">
        You are offline. Some features may not be available.
      </span>
    </div>
  );
}

function InactivityWarningBanner({ secondsLeft, onStay }: { secondsLeft: number; onStay: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      data-testid="banner-inactivity-warning"
    >
      <div className="bg-card border rounded-lg shadow-xl p-6 mx-4 max-w-sm w-full text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mx-auto">
          <Clock className="h-7 w-7 text-orange-600 dark:text-orange-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold" data-testid="text-inactivity-title">{t("inactivity.title")}</h2>
          <p className="text-base text-muted-foreground mt-2">
            {t("inactivity.message")}{" "}
            <span className="font-bold text-orange-600 dark:text-orange-400" data-testid="text-logout-countdown">
              {secondsLeft}
            </span>{" "}
            {secondsLeft !== 1 ? t("inactivity.seconds") : t("inactivity.second")} {t("inactivity.dueToInactivity")}
          </p>
        </div>
        <Button
          onClick={onStay}
          className="w-full"
          size="lg"
          data-testid="button-stay-signed-in"
        >
          {t("inactivity.staySignedIn")}
        </Button>
      </div>
    </div>
  );
}

interface LinkedPatient {
  linkId: number;
  patientId: string;
  firstName: string;
  lastName: string;
  relationship: string;
  status: string;
}

function ManagingBanner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isProxy, activePatientId, setActivePatientId } = usePatientContext();

  const { data: patients = [] } = useQuery<LinkedPatient[]>({
    queryKey: ["/api/caregiver/patients"],
    enabled: isProxy && user?.userRole === "caregiver",
  });

  if (!isProxy) return null;

  const patient = patients.find((p) => p.patientId === activePatientId);
  const patientName = patient ? `${patient.firstName} ${patient.lastName}` : t("caregiver.patient", "Patient");

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-950 border-b text-sm"
      data-testid="banner-managing-patient"
    >
      <Users className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
      <span className="flex-1 font-medium text-blue-800 dark:text-blue-200">
        {t("caregiver.managingBanner", "Managing: {{name}}", { name: patientName })}
      </span>
      <button
        onClick={() => setActivePatientId(null)}
        className="p-1 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400"
        data-testid="button-stop-managing"
        aria-label={t("caregiver.stopManaging", "Stop managing")}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function AuthenticatedLayout() {
  const [location] = useLocation();
  const pageTitle = usePageTitle(location);
  const { showWarning, secondsLeft, staySignedIn } = useInactivityLogout();
  useReminderScheduler();
  usePharmacyAlertSound();
  useStaffPanelSSE();
  const { t } = useTranslation();
  const { showDialog: showInactivityAlertsDialog, missedAlerts: inactivityMissedAlerts, dismiss: dismissInactivityAlerts } = useInactivityAlertCheck();

  const style = {
    "--sidebar-width": "17rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-dvh w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center gap-3 px-4 py-3 border-b sticky top-0 bg-background/80 backdrop-blur-[15px] z-50 safe-area-top">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="h-5 w-px bg-border" />
            <h1 className="text-base font-semibold text-foreground" data-testid="text-page-header-title">
              {pageTitle}
            </h1>
          </header>
          <OfflineBanner />
          <ManagingBanner />
          <main className="flex-1 overflow-y-auto overflow-x-hidden pb-16">
            <InstallPrompt />
            <Router />
          </main>
          <BottomNav />
        </div>
      </div>
      {showWarning && (
        <InactivityWarningBanner secondsLeft={secondsLeft} onStay={staySignedIn} />
      )}
      <MissedAlertsDialog
        open={showInactivityAlertsDialog}
        alerts={inactivityMissedAlerts}
        onDismiss={dismissInactivityAlerts}
      />
    </SidebarProvider>
  );
}

function UnlinkedLayout({ name, lastName, onSignOut }: {
  name: string | null;
  lastName: string | null;
  onSignOut: () => void;
}) {
  const [location] = useLocation();
  const pageTitle = usePageTitle(location);
  const style = {
    "--sidebar-width": "17rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-dvh w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center gap-3 px-4 py-3 border-b sticky top-0 bg-background/80 backdrop-blur-[15px] z-50 safe-area-top">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="h-5 w-px bg-border" />
            <h1 className="text-base font-semibold text-foreground" data-testid="text-page-header-title">{pageTitle}</h1>
          </header>
          <OfflineBanner />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100" role="status" data-testid="banner-records-not-connected">
            <span>Your pharmacy records are not connected to this sign-in. Patient information will not appear until verified.</span>
            <Link href="/records" className="font-semibold underline">Connect records</Link>
          </div>
          <main className="flex-1 overflow-y-auto overflow-x-hidden pb-16">
            <InstallPrompt />
            {location === "/records"
              ? <StandaloneAccount name={name} lastName={lastName} onSignOut={onSignOut} section="records" />
              : <Router />}
          </main>
          <BottomNav />
        </div>
      </div>
    </SidebarProvider>
  );
}

function AppContent() {
  const { user, isLoading, authError, retryAuth, logout } = useAuth();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    if (user?.language && user.language !== i18n.language) {
      i18n.changeLanguage(user.language);
    }
  }, [user?.language, i18n]);

  if (isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-lg text-muted-foreground">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (authError) {
    const authErrorCode = authError.details.error;
    if (authErrorCode === "identity_link_required" && authError.details.staffReviewAvailable) {
      return <PharmacyLinkRequests staffMode />;
    }
    if (authErrorCode && ["identity_link_required", "identity_conflict", "pharmacy_sync_required", "pharmacy_identity_unavailable"].includes(authErrorCode)) {
      return <PatientLinkRequired error={authError} />;
    }
    const pendingReview = authError.status === 423 &&
      (authErrorCode === "verification_required" || authErrorCode === "identity_review_required");
    const sessionNotVerified = authError.status === 401;
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-xl border bg-card p-6 text-center space-y-4">
          <Shield className="h-12 w-12 text-primary mx-auto" />
          <h1 className="text-2xl font-bold">
            {pendingReview
              ? "Pharmacy verification required"
              : sessionNotVerified
                ? "Your sign-in session could not be verified"
                : "We could not finish signing you in"}
          </h1>
          <p className="text-muted-foreground">
            {pendingReview
              ? authError.details.message
              : sessionNotVerified
                ? "Clerk signed you in, but ConcordiaCare did not receive a verified session. Retry once, or sign out and sign back in."
                : "Your Clerk sign-in succeeded, but ConcordiaCare could not initialize your patient account. Please retry."}
          </p>
          {pendingReview && authError.details.caseNumber && (
            <p className="text-sm font-medium">Review reference: {authError.details.caseNumber}</p>
          )}
          <div className="space-y-2">
            {!pendingReview && (
              <Button className="w-full min-h-[48px]" onClick={() => retryAuth()}>
                {sessionNotVerified ? "Retry sign-in" : "Retry account setup"}
              </Button>
            )}
            <Button variant="outline" className="w-full min-h-[48px]" onClick={() => logout()}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Landing />;
  }

  if (user.pharmacyAccess === false) {
    if (user.isAdmin) {
      return <PharmacyLinkRequests staffMode />;
    }
    return <UnlinkedLayout name={user.firstName} lastName={user.lastName} onSignOut={logout} />;
  }

  if (!user.onboardingComplete) {
    return <Onboarding />;
  }

  return <AuthenticatedLayout />;
}

function MobileGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return true;
    const isReplit = window.location.hostname.includes("replit");
    if (isReplit) return true;
    const isPWA = window.matchMedia("(display-mode: standalone)").matches
      || (window.navigator as any).standalone === true;
    return window.innerWidth <= 768 || isPWA;
  });

  useEffect(() => {
    const isReplit = window.location.hostname.includes("replit");
    if (isReplit) return;
    const checkMobile = () => {
      const isPWA = window.matchMedia("(display-mode: standalone)").matches
        || (window.navigator as any).standalone === true;
      const isNarrow = window.innerWidth <= 768;
      setIsMobile(isNarrow || isPWA);
    };
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  if (!isMobile) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background p-8">
        <div className="text-center space-y-6 max-w-md">
          <div className="flex items-center justify-center w-20 h-20 mx-auto rounded-md bg-primary">
            <Pill className="w-10 h-10 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-desktop-block-title">
            {t("mobileGate.title")}
          </h1>
          <div className="flex items-center justify-center gap-3 text-muted-foreground">
            <Smartphone className="w-8 h-8" />
            <p className="text-lg text-left">
              {t("mobileGate.message")}
            </p>
          </div>
          <div className="rounded-md bg-muted p-4 space-y-2">
            <p className="text-sm font-medium">{t("mobileGate.howToGetStarted")}</p>
            <ol className="text-sm text-muted-foreground text-left space-y-1 list-decimal list-inside">
              <li>{t("mobileGate.step1")}</li>
              <li>{t("mobileGate.step2")}</li>
              <li>{t("mobileGate.step3")}</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function AppShell() {
  const clerkAppearance = {
    variables: {
      colorPrimary: "#2563eb",
      colorForeground: "#0f172a",
      colorMutedForeground: "#64748b",
      colorBackground: "#ffffff",
      colorInput: "#ffffff",
      colorInputForeground: "#0f172a",
      colorDanger: "#dc2626",
      colorNeutral: "#cbd5e1",
      borderRadius: "0.75rem",
    },
    elements: {
      rootBox: { width: "100%", display: "flex", justifyContent: "center" },
      cardBox: { width: "100%", maxWidth: "440px", boxShadow: "none" },
      socialButtonsBlockButton: {
        backgroundColor: "#ffffff",
        border: "1px solid #94a3b8",
        color: "#0f172a",
        minHeight: "48px",
      },
      socialButtonsBlockButtonText: { color: "#0f172a", fontWeight: 600 },
    },
  };

  return (
    <Switch>
      <Route path="/sign-in/*?">
        <div className="min-h-dvh flex items-center justify-center bg-background p-4">
          <SignIn
            routing="path"
            path="/sign-in"
            signUpUrl="/sign-up"
            fallbackRedirectUrl="/"
            appearance={clerkAppearance}
          />
        </div>
      </Route>
      <Route path="/sign-up/*?">
        <div className="min-h-dvh flex items-center justify-center bg-background p-4">
          <SignUp
            routing="path"
            path="/sign-up"
            signInUrl="/sign-in"
            fallbackRedirectUrl="/"
            appearance={clerkAppearance}
          />
        </div>
      </Route>
      <Route path="/loyalty/:id" component={LoyaltyCard} />
      <Route>
        <MobileGate>
          <AppContent />
        </MobileGate>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <PatientProvider>
          <CartProvider>
            <TooltipProvider>
              <AppShell />
              <Toaster />
            </TooltipProvider>
          </CartProvider>
        </PatientProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;

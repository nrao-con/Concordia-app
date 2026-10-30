import { Home, ShoppingCart, Pill, Bell, LogOut, UserCircle, Phone, MessageSquare, Users, Settings, Stethoscope, Activity, ClipboardCheck, FileKey2 } from "lucide-react";
import { BlisterPackSidebarIcon } from "@/components/illustrations";
import concordiaCIcon from "@assets/concordia_c_icon.png";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { usePatientContext } from "@/hooks/use-patient-context";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

interface LinkedPatient {
  linkId: number;
  patientId: string;
  firstName: string;
  lastName: string;
  relationship: string;
  status: string;
}

type NavIconComponent = LucideIcon | (({ className }: { className?: string }) => JSX.Element);

const iconTints: Record<string, { bg: string; text: string }> = {
  "/":               { bg: "bg-blue-500 dark:bg-blue-600",     text: "text-white" },
  "/orders":         { bg: "bg-orange-500 dark:bg-orange-600", text: "text-white" },
  "/medications":    { bg: "bg-blue-500 dark:bg-blue-600", text: "text-white" },
  "/pharmacy-chat":      { bg: "bg-sky-500 dark:bg-sky-600",      text: "text-white" },
  "/blister-packs":  { bg: "bg-sky-500 dark:bg-sky-600",    text: "text-white" },
  "/reminders":      { bg: "bg-rose-500 dark:bg-rose-600",     text: "text-white" },
  "/profile":        { bg: "bg-gray-500 dark:bg-gray-600",     text: "text-white" },
  "/settings":       { bg: "bg-slate-500 dark:bg-slate-600",   text: "text-white" },
  "/care-navigator": { bg: "bg-teal-500 dark:bg-teal-600",    text: "text-white" },
  "/records":        { bg: "bg-blue-500 dark:bg-blue-600",    text: "text-white" },
};

const mainNav: { titleKey: string; url: string; icon: NavIconComponent }[] = [
  { titleKey: "nav.home", url: "/", icon: Home },
  { titleKey: "nav.orders", url: "/orders", icon: ShoppingCart },
  { titleKey: "nav.myMedications", url: "/medications", icon: Pill },
  { titleKey: "nav.pharmacyMessages", url: "/pharmacy-chat", icon: MessageSquare },
];

const manageNav: { titleKey: string; url: string; icon: NavIconComponent }[] = [
  { titleKey: "nav.syncOperations", url: "/admin/sync-operations", icon: Activity },
  { titleKey: "nav.pharmacyLinkRequests", url: "/admin/pharmacy-link-requests", icon: ClipboardCheck },
  { titleKey: "nav.careNavigator", url: "/care-navigator", icon: Stethoscope },
  { titleKey: "nav.blisterPacks", url: "/blister-packs", icon: BlisterPackSidebarIcon },
  { titleKey: "nav.reminders", url: "/reminders", icon: Bell },
  { titleKey: "nav.myProfile", url: "/profile", icon: UserCircle },
  { titleKey: "nav.settings", url: "/settings", icon: Settings },
];

function NavIcon({ icon: Icon, url }: { icon: NavIconComponent; url: string }) {
  const tint = iconTints[url] || { bg: "bg-gray-500", text: "text-white" };
  return (
    <div className={`flex items-center justify-center w-7 h-7 rounded-lg ${tint.bg} shrink-0`} aria-hidden="true">
      <Icon className={`w-4 h-4 ${tint.text}`} />
    </div>
  );
}

function PatientSwitcher() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activePatientId, setActivePatientId } = usePatientContext();

  const { data: patients = [] } = useQuery<LinkedPatient[]>({
    queryKey: ["/api/caregiver/patients"],
    enabled: user?.pharmacyAccess !== false && user?.userRole === "caregiver",
  });

  const approvedPatients = patients.filter((p) => p.status === "approved");

  if (user?.userRole !== "caregiver" || approvedPatients.length === 0) {
    return null;
  }

  const currentValue = activePatientId || "myself";

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <Users className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("caregiver.managingFor", "Managing for")}
        </span>
      </div>
      <Select value={currentValue} onValueChange={(val) => setActivePatientId(val === "myself" ? null : val)}>
        <SelectTrigger
          className="w-full text-base min-h-[44px]"
          data-testid="select-patient-switcher"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="myself" data-testid="select-patient-myself">
            {user?.firstName} {user?.lastName} ({t("caregiver.myself", "Myself")})
          </SelectItem>
          {approvedPatients.map((p) => (
            <SelectItem key={p.patientId} value={p.patientId} data-testid={`select-patient-${p.patientId}`}>
              {p.firstName} {p.lastName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { isMobile, setOpenMobile } = useSidebar();
  const { t } = useTranslation();

  const closeSidebarOnMobile = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const initials = user
    ? `${(user.firstName || "")[0] || ""}${(user.lastName || "")[0] || ""}`.toUpperCase() || "U"
    : "?";

  const renderNavItem = (item: { titleKey: string; url: string; icon: NavIconComponent }) => {
    const isActive = location === item.url || (item.url !== "/" && location.startsWith(item.url));
    const title = item.titleKey === "nav.syncOperations"
      ? "Sync operations"
      : item.titleKey === "nav.pharmacyLinkRequests"
        ? "Link requests"
        : item.titleKey === "nav.records"
          ? "Records"
          : t(item.titleKey);
    return (
      <SidebarMenuItem key={item.url}>
        <SidebarMenuButton
          asChild
          data-active={isActive}
          className={`min-h-[52px] transition-colors duration-200 ${isActive ? "bg-primary/15 text-primary font-semibold" : "hover:bg-primary/10 dark:hover:bg-primary/15"}`}
        >
          <Link
            href={item.url}
            onClick={closeSidebarOnMobile}
            data-testid={`link-nav-${item.url.replace(/\//g, "") || "home"}`}
          >
            <NavIcon icon={item.icon} url={item.url} />
            <span className="text-base">{title}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-5 pb-4">
        <div className="flex items-center gap-3">
          <img
            src={concordiaCIcon}
            alt="Concordia Pharmacy"
            className="w-10 h-10 object-contain rounded-lg"
            data-testid="img-sidebar-logo"
          />
          <div>
            <h2 className="text-lg font-bold tracking-tight" data-testid="text-app-title">{t("common.appName")}</h2>
            <p className="text-xs text-muted-foreground">{t("common.pharmacyCompanion")}</p>
          </div>
        </div>
      </SidebarHeader>
      <PatientSwitcher />
      <SidebarSeparator />
      <SidebarContent className="pt-3">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground/60 mb-1 px-4">
            {t("nav.main")}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map(renderNavItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator className="my-2" />
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground/60 mb-1 mt-1 px-4">
            {t("nav.manage")}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {manageNav
                .filter((item) => !item.url.startsWith("/admin/") || user?.isAdmin)
                .map(renderNavItem)}
              {user?.pharmacyAccess === false && renderNavItem({ titleKey: "nav.records", url: "/records", icon: FileKey2 })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="p-4 space-y-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-sm"
          asChild
          data-testid="button-sidebar-call-pharmacy"
        >
          <a href="tel:7183282833">
            <Phone className="w-4 h-4 mr-2" />
            {t("common.callPharmacy")}
          </a>
        </Button>
        {user && (
          <div className="flex items-center gap-3 pt-1">
            <Link href="/profile" onClick={closeSidebarOnMobile} data-testid="link-profile-avatar">
              <Avatar className="h-9 w-9 cursor-pointer">
                <AvatarImage src={user.profileImageUrl || undefined} />
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
            </Link>
            <Link href="/profile" onClick={closeSidebarOnMobile} className="flex-1 min-w-0 cursor-pointer" data-testid="link-profile-name">
              <p className="text-sm font-medium truncate" data-testid="text-user-name">
                {user.firstName || user.lastName ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() : "Your account"}
              </p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </Link>
            <Button size="icon" variant="ghost" onClick={() => logout()} data-testid="button-logout" aria-label="Log out">
              <LogOut className="w-4 h-4" aria-hidden="true" />
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

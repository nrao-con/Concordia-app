import { Link, useLocation } from "wouter";
import { Home, ShoppingCart, Pill, User, Store } from "lucide-react";
import { useTranslation } from "react-i18next";

const navItems = [
  { href: "/", icon: Home, labelKey: "nav.home", testId: "nav-home" },
  { href: "/shop", icon: Store, labelKey: "nav.shop", testId: "nav-shop" },
  { href: "/orders", icon: ShoppingCart, labelKey: "nav.orders", testId: "nav-orders" },
  { href: "/medications", icon: Pill, labelKey: "nav.meds", testId: "nav-medications" },
  { href: "/profile", icon: User, labelKey: "nav.profile", testId: "nav-profile" },
];

export function BottomNav() {
  const [location] = useLocation();
  const { t } = useTranslation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-[20px] border-t border-border/50 safe-area-bottom"
      data-testid="bottom-navigation"
    >
      <div className="flex items-center justify-around max-w-lg mx-auto px-2 h-16">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? location === "/"
              : location.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}>
              <button
                className={`flex flex-col items-center justify-center gap-0.5 w-16 h-14 rounded-lg transition-all duration-200 ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:bg-primary/10 dark:hover:bg-primary/15"
                }`}
                data-testid={item.testId}
              >
                <div
                  className={`flex items-center justify-center w-10 h-7 rounded-full transition-all duration-300 ${
                    isActive
                      ? "bg-primary/12 scale-100"
                      : "bg-transparent scale-95"
                  }`}
                >
                  <item.icon
                    className={`h-5 w-5 transition-transform duration-200 ${
                      isActive ? "scale-105" : ""
                    }`}
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                </div>
                <span
                  className={`text-[11px] leading-tight transition-all duration-200 ${
                    isActive ? "font-semibold" : "font-medium"
                  }`}
                >
                  {t(item.labelKey)}
                </span>
              </button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

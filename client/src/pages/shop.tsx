import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useCart } from "@/hooks/use-cart";
import { useInventoryState } from "@/hooks/use-staff-panel-sse";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Play,
  Lightbulb,
  Info,
  AlertTriangle,
  Pill,
  Sparkles,
  Clock,
  Star,
  X,
  BadgeCheck,
} from "lucide-react";
import type { OtcProduct } from "@shared/schema";

interface RecommendedResponse {
  products: OtcProduct[];
  conditionNames: string[];
}

interface AdvisorRec {
  id: number;
  source: string;
  reason: string | null;
  createdAt: string;
  product: OtcProduct;
}

function AdvisorShelf({
  onProductOpen,
}: {
  onProductOpen: (p: OtcProduct) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<AdvisorRec[]>({
    queryKey: ["/api/recommendations"],
    staleTime: 2 * 60 * 1000,
  });

  const dismiss = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/recommendations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/recommendations"] }),
    onError: (error: Error) => {
      toast({
        title: "Recommendation was not removed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) return null;
  if (!data || data.length === 0) return null;

  return (
    <div className="px-4 pt-3 space-y-2" data-testid="section-advisor-shelf">
      <div className="flex items-center gap-2">
        <Star className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-semibold">Recommended by Your Advisor</span>
      </div>
      <div
        className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none"
        data-testid="list-advisor-products"
      >
        {data.map((rec) => (
          <div key={rec.id} className="relative shrink-0 w-36">
            <button
              type="button"
              onClick={() => onProductOpen(rec.product)}
              className="w-full rounded-xl border bg-muted/30 overflow-hidden text-left hover:bg-muted/60 transition-colors"
              data-testid={`card-advisor-${rec.id}`}
            >
              <div className="h-24 bg-muted flex items-center justify-center overflow-hidden">
                {rec.product.imageUrl ? (
                  <img
                    src={rec.product.imageUrl}
                    alt={rec.product.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <Pill className="h-7 w-7 text-muted-foreground" />
                )}
              </div>
              <div className="p-2 space-y-0.5">
                <span className="inline-block text-[10px] bg-primary/10 text-primary rounded px-1.5 py-0.5 font-medium leading-tight">
                  {rec.source === "health_chat" ? "Health Chat" : "Advisor"}
                </span>
                <p className="text-xs font-semibold line-clamp-2 leading-tight" data-testid={`text-advisor-name-${rec.id}`}>
                  {rec.product.name}
                </p>
                <p className="text-xs text-primary font-bold" data-testid={`text-advisor-price-${rec.id}`}>
                  ${rec.product.price}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => dismiss.mutate(rec.id)}
              disabled={dismiss.isPending}
              className="absolute top-1 right-1 h-5 w-5 rounded-full bg-background/80 border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Dismiss recommendation"
              data-testid={`button-dismiss-advisor-${rec.id}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecommendedShelf({
  onProductOpen,
}: {
  onProductOpen: (p: OtcProduct) => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery<RecommendedResponse>({
    queryKey: ["/api/shop/recommended"],
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return null;
  if (!data || data.products.length === 0) return null;

  return (
    <div className="px-4 pt-3 space-y-2" data-testid="section-recommended-shelf">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-semibold">{t("shop.recommendedForYou")}</span>
      </div>
      {data.conditionNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="list-recommended-conditions">
          {data.conditionNames.map((name) => (
            <span
              key={name}
              className="text-xs bg-primary/10 text-primary rounded-full px-2.5 py-0.5 font-medium"
              data-testid={`badge-condition-${name.replace(/\s+/g, "-").toLowerCase()}`}
            >
              {name}
            </span>
          ))}
        </div>
      )}
      <div
        className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none"
        data-testid="list-recommended-products"
      >
        {data.products.map((product) => (
          <button
            key={product.id}
            onClick={() => onProductOpen(product)}
            className="shrink-0 w-36 rounded-xl border bg-muted/30 overflow-hidden text-left hover:bg-muted/60 transition-colors"
            data-testid={`card-recommended-${product.id}`}
          >
            <div className="h-24 bg-muted flex items-center justify-center overflow-hidden">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <Pill className="h-7 w-7 text-muted-foreground" />
              )}
            </div>
            <div className="p-2 space-y-0.5">
              <p className="text-xs font-semibold line-clamp-2 leading-tight" data-testid={`text-recommended-name-${product.id}`}>
                {product.name}
              </p>
              <p className="text-xs text-primary font-bold" data-testid={`text-recommended-price-${product.id}`}>
                ${product.price}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

const CATEGORY_COMPLEMENTS: Record<string, string[]> = {
  "Pain Relief": ["Digestive Health", "Sleep Aid", "Vitamins"],
  "Allergy": ["Cough & Cold", "Sleep Aid", "Vitamins"],
  "Digestive Health": ["Vitamins", "Pain Relief"],
  "Vitamins": ["Heart Health", "Joint Health"],
  "Cough & Cold": ["Allergy", "Pain Relief", "Sleep Aid"],
  "Heart Health": ["Vitamins", "Joint Health"],
  "Joint Health": ["Pain Relief", "Vitamins"],
  "Sleep Aid": ["Vitamins", "Allergy"],
  "Dental": ["Vitamins"],
  "Skin Care": ["Vitamins"],
  "First Aid": ["Pain Relief"],
};

const SESSION_KEY = "concordia_shop_memory";
const SESSION_TTL = 30 * 60 * 1000;

type ShopMemory = {
  lastCategory: string;
  lastProductId: number | null;
  lastProductName: string | null;
  browsedCategories: string[];
  ts: number;
};

function loadMemory(): ShopMemory | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const mem: ShopMemory = JSON.parse(raw);
    if (Date.now() - mem.ts > SESSION_TTL) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return mem;
  } catch {
    return null;
  }
}

function saveMemory(m: Partial<ShopMemory>) {
  try {
    const existing = loadMemory() ?? {
      lastCategory: "All",
      lastProductId: null,
      lastProductName: null,
      browsedCategories: [],
      ts: Date.now(),
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...existing, ...m, ts: Date.now() }));
  } catch {}
}

function ImageWithFallback({ src, alt, className, "data-testid": testId }: {
  src: string;
  alt: string;
  className?: string;
  "data-testid"?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Pill className="h-12 w-12 text-muted-foreground/30" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      data-testid={testId}
      onError={() => setFailed(true)}
    />
  );
}

function MediaSlider({ images, videoUrl, name, compact = false }: {
  images: string[];
  videoUrl?: string | null;
  name: string;
  compact?: boolean;
}) {
  const slides = videoUrl ? [...images, "__video__"] : images;
  const total = slides.length;
  const [active, setActive] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchStartX = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const goTo = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(idx, total - 1));
    setActive(clamped);
  }, [total]);

  useEffect(() => {
    const isVideoSlide = slides[active] === "__video__";
    if (isVideoSlide && videoRef.current) {
      videoRef.current.play().catch(() => {});
    } else if (videoRef.current) {
      videoRef.current.pause();
    }
  }, [active, slides]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) goTo(active + (dx < 0 ? 1 : -1));
    touchStartX.current = null;
  };

  const imgH = compact ? "h-36" : "h-56";

  return (
    <div className="relative select-none" ref={containerRef}>
      <div
        className={`relative overflow-hidden rounded-t-2xl ${imgH} bg-muted/30`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        data-testid="media-slider"
      >
        {slides.map((src, i) => (
          <div
            key={i}
            className={`absolute inset-0 transition-opacity duration-300 ${
              i === active ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            {src === "__video__" ? (
              <div className="relative w-full h-full flex items-center justify-center bg-black/90">
                <video
                  ref={videoRef}
                  src={videoUrl ?? ""}
                  className="w-full h-full object-cover"
                  muted
                  loop
                  playsInline
                  preload="none"
                  data-testid="media-video"
                />
                {i !== active && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Play className="h-10 w-10 text-white/60" />
                  </div>
                )}
              </div>
            ) : src ? (
              <ImageWithFallback
                src={src}
                alt={`${name} view ${i + 1}`}
                className="w-full h-full object-cover"
                data-testid={`media-image-${i}`}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Pill className="h-12 w-12 text-muted-foreground/30" />
              </div>
            )}
          </div>
        ))}

        {!compact && total > 1 && (
          <>
            {active > 0 && (
              <button
                onClick={() => goTo(active - 1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white"
                data-testid="button-slider-prev"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            {active < total - 1 && (
              <button
                onClick={() => goTo(active + 1)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white"
                data-testid="button-slider-next"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
          </>
        )}

        {slides[active] === "__video__" && (
          <div className="absolute top-2 left-2">
            <Badge className="text-xs bg-black/50 text-white border-0 backdrop-blur-sm">
              <Play className="h-2.5 w-2.5 mr-1" /> Video
            </Badge>
          </div>
        )}
      </div>

      {total > 1 && (
        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
          {slides.map((s, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`transition-all duration-200 rounded-full ${
                i === active
                  ? "w-4 h-1.5 bg-white shadow-sm"
                  : "w-1.5 h-1.5 bg-white/50"
              }`}
              data-testid={`button-slider-dot-${i}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ProductCard({
  product,
  index,
  onClick,
}: {
  product: OtcProduct;
  index: number;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const { addToCart, getCartQuantity, updateQuantity } = useCart();
  const qty = getCartQuantity(product.id);
  const isOutOfStock = product.isAvailable === false || (product.stockCount !== null && product.stockCount <= 0);

  return (
    <Card
      className="glass-card overflow-hidden cursor-pointer hover-elevate"
      style={{ animationDelay: `${Math.min(index, 12) * 55}ms` }}
      data-testid={`card-product-${product.id}`}
    >
      <div onClick={onClick} className="relative">
        <MediaSlider
          images={product.imageUrl ? [product.imageUrl] : []}
          videoUrl={product.videoUrl}
          name={product.name}
          compact
        />
        {isOutOfStock && (
          <div className="absolute bottom-2 left-2">
            <span
              className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300 leading-none shadow-sm"
              data-testid={`badge-out-of-stock-${product.id}`}
            >
              {t("cart.outOfStock")}
            </span>
          </div>
        )}
      </div>
      <CardContent className="p-3 space-y-2">
        <div onClick={onClick}>
          <p className="text-sm font-semibold leading-tight line-clamp-2" data-testid={`text-product-name-${product.id}`}>
            {product.name}
          </p>
          {product.brand && (
            <p className="text-xs text-muted-foreground mt-0.5">{product.brand}</p>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {product.price && (
              <p className={`text-sm font-bold ${isOutOfStock ? "text-muted-foreground line-through" : "text-primary"}`} data-testid={`text-product-price-${product.id}`}>
                ${parseFloat(product.price).toFixed(2)}
              </p>
            )}
            {!isOutOfStock && product.fsaEligible && (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 leading-none"
                data-testid={`badge-fsa-${product.id}`}
                aria-label="FSA/HSA eligible"
              >
                <BadgeCheck className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                FSA/HSA
              </span>
            )}
          </div>
        </div>
        <div className="pt-1">
          {isOutOfStock ? (
            <div
              className="w-full h-8 rounded-md bg-muted/60 flex items-center justify-center"
              data-testid={`badge-card-out-of-stock-${product.id}`}
              aria-label="Out of stock"
            >
              <span className="text-xs text-muted-foreground font-medium">{t("cart.outOfStock")}</span>
            </div>
          ) : qty === 0 ? (
            <Button
              size="sm"
              className="w-full h-8 text-xs"
              onClick={() => addToCart(product)}
              data-testid={`button-add-to-cart-${product.id}`}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add
            </Button>
          ) : (
            <div className="flex items-center justify-between gap-1">
              <button
                onClick={() => updateQuantity(product.id, qty - 1)}
                className="w-7 h-7 rounded-full bg-muted flex items-center justify-center"
                data-testid={`button-decrease-${product.id}`}
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="text-sm font-semibold" data-testid={`text-qty-${product.id}`}>{qty}</span>
              <button
                onClick={() => updateQuantity(product.id, qty + 1)}
                className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground"
                data-testid={`button-increase-${product.id}`}
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ProductDrawer({
  product,
  allProducts,
  onClose,
}: {
  product: OtcProduct | null;
  allProducts: OtcProduct[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { addToCart, getCartQuantity, updateQuantity } = useCart();
  const qty = product ? getCartQuantity(product.id) : 0;
  const isOutOfStock = product ? (product.isAvailable === false || (product.stockCount !== null && product.stockCount <= 0)) : false;

  const complementCategories = product ? (CATEGORY_COMPLEMENTS[product.category] ?? []) : [];
  const complementProducts = allProducts
    .filter(p => complementCategories.includes(p.category) && p.isAvailable)
    .slice(0, 5);
  const similarProducts = allProducts
    .filter(p => p.category === product?.category && p.id !== product?.id && p.isAvailable)
    .slice(0, 5);

  return (
    <Sheet open={!!product} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="h-[90vh] rounded-t-3xl overflow-y-auto p-0"
        data-testid="drawer-product-detail"
      >
        {product && (
          <>
            <div className="relative">
              <MediaSlider
                images={product.imageUrl ? [product.imageUrl] : []}
                videoUrl={product.videoUrl}
                name={product.name}
              />
              <SheetClose
                className="absolute top-3 left-3 z-20 flex items-center justify-center w-11 h-11 rounded-full bg-black/50 backdrop-blur-sm text-white shadow-lg"
                data-testid="button-product-drawer-back"
                aria-label="Go back"
              >
                <ArrowLeft className="h-5 w-5" />
              </SheetClose>
            </div>

            <div className="p-5 space-y-5">
              <SheetHeader className="text-left">
                <SheetDescription className="sr-only">
                  {product.description ?? `Details for ${product.name}`}
                </SheetDescription>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <SheetTitle className="text-xl font-bold leading-tight" data-testid="text-drawer-product-name">
                      {product.name}
                    </SheetTitle>
                    {product.brand && (
                      <p className="text-sm text-muted-foreground mt-0.5">{product.brand}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {product.category && (
                        <Badge variant="secondary" className="text-xs">{product.category}</Badge>
                      )}
                      {isOutOfStock && (
                        <span
                          className="inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                          data-testid="badge-drawer-out-of-stock"
                        >
                          {t("cart.outOfStock")}
                        </span>
                      )}
                      {!isOutOfStock && product.fsaEligible && (
                        <span
                          className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                          data-testid="badge-drawer-fsa"
                          aria-label="FSA/HSA eligible"
                        >
                          <BadgeCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
                          FSA/HSA Eligible
                        </span>
                      )}
                    </div>
                  </div>
                  {product.price && (
                    <p className="text-2xl font-bold text-primary shrink-0" data-testid="text-drawer-price">
                      ${parseFloat(product.price).toFixed(2)}
                    </p>
                  )}
                </div>
              </SheetHeader>

              {isOutOfStock ? (
                <div
                  className="w-full min-h-[48px] rounded-lg bg-muted/60 flex items-center justify-center"
                  data-testid="badge-drawer-out-of-stock-button"
                  aria-label="Out of stock"
                >
                  <span className="text-base text-muted-foreground font-medium">{t("cart.outOfStock")}</span>
                </div>
              ) : qty === 0 ? (
                <Button
                  className="w-full min-h-[48px] text-base"
                  onClick={() => addToCart(product)}
                  data-testid="button-drawer-add-to-cart"
                >
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  {t("shop.addToCart")}
                </Button>
              ) : (
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => updateQuantity(product.id, qty - 1)}
                    className="w-11 h-11 rounded-full bg-muted flex items-center justify-center"
                    data-testid="button-drawer-decrease"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="text-xl font-bold flex-1 text-center" data-testid="text-drawer-qty">{qty}</span>
                  <button
                    onClick={() => updateQuantity(product.id, qty + 1)}
                    className="w-11 h-11 rounded-full bg-primary flex items-center justify-center text-primary-foreground"
                    data-testid="button-drawer-increase"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <Link href="/cart">
                    <Button variant="outline" className="min-h-[44px]" data-testid="button-drawer-view-cart">
                      {t("shop.viewCart")}
                    </Button>
                  </Link>
                </div>
              )}

              <Accordion type="multiple" className="space-y-2" data-testid="accordion-product-details">
                {(product.whyUseIt || product.description) && (
                  <AccordionItem value="why" className="glass-card rounded-lg border px-4">
                    <AccordionTrigger className="text-base font-semibold py-4 hover:no-underline" data-testid="accordion-trigger-why">
                      <span className="flex items-center gap-2">
                        <Info className="h-4 w-4 text-primary" />
                        {t("shop.whyUseIt")}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground pb-4 leading-relaxed">
                      {product.whyUseIt || product.description}
                    </AccordionContent>
                  </AccordionItem>
                )}

                {product.pharmacistTip && (
                  <AccordionItem value="tip" className="glass-card rounded-lg border px-4">
                    <AccordionTrigger className="text-base font-semibold py-4 hover:no-underline" data-testid="accordion-trigger-tip">
                      <span className="flex items-center gap-2">
                        <Lightbulb className="h-4 w-4 text-amber-500" />
                        {t("shop.pharmacistTip")}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground pb-4 leading-relaxed">
                      {product.pharmacistTip}
                    </AccordionContent>
                  </AccordionItem>
                )}

                {(product.dosageInfo || product.warnings) && (
                  <AccordionItem value="dosage" className="glass-card rounded-lg border px-4">
                    <AccordionTrigger className="text-base font-semibold py-4 hover:no-underline" data-testid="accordion-trigger-dosage">
                      <span className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                        {t("shop.dosageAndWarnings")}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground pb-4 leading-relaxed space-y-2">
                      {product.dosageInfo && <p>{product.dosageInfo}</p>}
                      {product.warnings && <p className="text-destructive/80">{product.warnings}</p>}
                    </AccordionContent>
                  </AccordionItem>
                )}
              </Accordion>

              {complementProducts.length > 0 && (
                <div className="space-y-3" data-testid="section-complements">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    {t("shop.pairsWellWith")}
                  </p>
                  <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
                    {complementProducts.map((p) => (
                      <MiniProductCard key={p.id} product={p} />
                    ))}
                  </div>
                </div>
              )}

              {similarProducts.length > 0 && (
                <div className="space-y-3" data-testid="section-similar">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <Pill className="h-3.5 w-3.5 text-muted-foreground" />
                    {t("shop.similarProducts")}
                  </p>
                  <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
                    {similarProducts.map((p) => (
                      <MiniProductCard key={p.id} product={p} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MiniProductCard({ product }: { product: OtcProduct }) {
  const { addToCart, getCartQuantity } = useCart();
  const qty = getCartQuantity(product.id);

  return (
    <div
      className="shrink-0 w-32 glass-card rounded-xl overflow-hidden"
      data-testid={`card-mini-product-${product.id}`}
    >
      <div className="h-20 bg-muted/30 flex items-center justify-center">
        {product.imageUrl ? (
          <ImageWithFallback
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover"
            data-testid={`img-mini-product-${product.id}`}
          />
        ) : (
          <Pill className="h-8 w-8 text-muted-foreground/30" />
        )}
      </div>
      <div className="p-2 space-y-1.5">
        <p className="text-xs font-medium leading-tight line-clamp-2">{product.name}</p>
        {product.price && (
          <p className="text-xs font-bold text-primary">${parseFloat(product.price).toFixed(2)}</p>
        )}
        <button
          onClick={() => addToCart(product)}
          className={`w-full h-7 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
            qty > 0
              ? "bg-primary/10 text-primary"
              : "bg-primary text-primary-foreground"
          }`}
          data-testid={`button-mini-add-${product.id}`}
        >
          {qty > 0 ? `In cart (${qty})` : <><Plus className="h-2.5 w-2.5" /> Add</>}
        </button>
      </div>
    </div>
  );
}

const ALL_CATEGORIES = "All";

const BANNER_THEMES = [
  {
    gradient: "from-slate-700 to-slate-500",
    light: false,
    btn: "bg-white text-slate-800",
    circle: "bg-white/10",
  },
  {
    gradient: "from-blue-900 to-blue-700",
    light: false,
    btn: "bg-white text-blue-900",
    circle: "bg-white/10",
  },
  {
    gradient: "from-slate-50 to-blue-50",
    light: true,
    btn: "bg-slate-800 text-white",
    circle: "bg-slate-200/60",
  },
  {
    gradient: "from-indigo-800 to-indigo-600",
    light: false,
    btn: "bg-white text-indigo-900",
    circle: "bg-white/10",
  },
  {
    gradient: "from-teal-800 to-teal-600",
    light: false,
    btn: "bg-white text-teal-900",
    circle: "bg-white/10",
  },
];

function FeaturedBanner({
  onProductOpen,
  drawerOpen,
}: {
  onProductOpen: (product: OtcProduct) => void;
  drawerOpen: boolean;
}) {
  const { addToCart } = useCart();
  const { data: featured = [], isLoading } = useQuery<OtcProduct[]>({
    queryKey: ["/api/otc/featured"],
    staleTime: 60_000,
  });

  const [current, setCurrent] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dragStartX = useRef<number | null>(null);
  const dragStartY = useRef<number | null>(null);

  const total = featured.length;

  const goTo = useCallback(
    (idx: number) => {
      if (total === 0) return;
      setCurrent(((idx % total) + total) % total);
    },
    [total],
  );

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (total > 1 && !drawerOpen) {
      timerRef.current = setInterval(() => {
        setCurrent((c) => (c + 1) % total);
      }, 4000);
    }
  }, [total, drawerOpen]);

  useEffect(() => {
    resetTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [resetTimer]);

  useEffect(() => {
    if (total > 0 && current >= total) {
      setCurrent(total - 1);
    }
  }, [total, current]);

  const onPointerDown = (e: React.PointerEvent) => {
    dragStartX.current = e.clientX;
    dragStartY.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragStartX.current === null) return;
    const dx = e.clientX - dragStartX.current;
    const dy = e.clientY - (dragStartY.current ?? e.clientY);
    dragStartX.current = null;
    dragStartY.current = null;

    if (Math.abs(dx) > 40) {
      // Horizontal swipe — navigate slides
      goTo(current + (dx < 0 ? 1 : -1));
      resetTimer();
      return;
    }

    if (Math.abs(dx) <= 10 && Math.abs(dy) <= 10) {
      // Tap — open product detail unless on a button (Add to Cart, dot nav)
      const target = e.target as HTMLElement;
      if (!target.closest("button")) {
        const product = featured[current];
        if (product) onProductOpen(product);
      }
    }
  };

  if (isLoading) {
    return <Skeleton className="h-44 rounded-2xl mx-4 mt-4" data-testid="skeleton-featured-banner" />;
  }

  if (total === 0) return null;

  return (
    <div className="px-4 pt-4" data-testid="section-featured-banner">
      <div
        className="relative rounded-2xl overflow-hidden shadow-md select-none"
        style={{ height: "10.5rem" }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { dragStartX.current = null; dragStartY.current = null; }}
        data-testid="featured-banner"
      >
        <div
          className="flex transition-transform duration-500 ease-in-out h-full"
          style={{
            width: `${total * 100}%`,
            transform: `translateX(-${current * (100 / total)}%)`,
          }}
        >
          {featured.map((product, idx) => {
            const theme = BANNER_THEMES[idx % BANNER_THEMES.length];
            const hasImage = !!product.imageUrl;
            const layout = hasImage ? idx % 3 : 2;
            const textColor = layout === 0 ? "text-white" : theme.light ? "text-slate-800" : "text-white";
            const subColor = layout === 0 ? "text-white/80" : theme.light ? "text-slate-500" : "text-white/80";
            const badgeBg = layout === 0 ? "bg-black/30" : theme.light ? "bg-slate-800/10" : "bg-white/20";
            const badgeText = layout === 0 ? "text-white" : theme.light ? "text-slate-700" : "text-white";

            return (
              <div
                key={product.id}
                style={{ width: `${100 / total}%` }}
                className={`flex-shrink-0 relative cursor-pointer h-full overflow-hidden ${layout !== 0 ? `bg-gradient-to-br ${theme.gradient}` : ""}`}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && onProductOpen(product)}
                data-testid={`button-featured-slide-${product.id}`}
              >
                {layout === 0 && (
                  <>
                    <ImageWithFallback
                      src={product.imageUrl!}
                      alt={product.name}
                      className="absolute inset-0 w-full h-full object-cover"
                      data-testid={`img-featured-${product.id}`}
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/55 to-black/10" />
                  </>
                )}

                {layout === 1 && (
                  <div className="absolute right-0 top-0 h-full w-[42%]">
                    <ImageWithFallback
                      src={product.imageUrl!}
                      alt={product.name}
                      className="w-full h-full object-cover"
                      data-testid={`img-featured-${product.id}`}
                    />
                    <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-current to-transparent opacity-80" />
                  </div>
                )}

                {layout === 2 && (
                  <>
                    <div className={`absolute right-[-1rem] top-1/2 -translate-y-1/2 w-36 h-36 rounded-full ${theme.circle}`} />
                    <div className={`absolute right-16 bottom-[-1rem] w-20 h-20 rounded-full ${theme.circle}`} />
                  </>
                )}

                <div className="absolute top-3 left-3 z-10">
                  <span className={`inline-flex items-center gap-1 backdrop-blur-sm text-xs font-semibold px-2.5 py-1 rounded-full ${badgeBg} ${badgeText}`}>
                    <Sparkles className="h-3 w-3" />
                    Today's Pick
                  </span>
                </div>

                <div className={`absolute inset-0 flex items-end z-10 ${layout === 1 ? "w-[60%]" : "w-full"}`}>
                  <div className="w-full flex flex-col justify-end px-4 pb-5 pt-10">
                    <p
                      className={`font-bold text-sm leading-snug line-clamp-2 drop-shadow-sm ${textColor}`}
                      data-testid={`text-featured-name-${product.id}`}
                    >
                      {product.name}
                    </p>
                    {product.brand && layout !== 0 && (
                      <p className={`text-xs mt-0.5 line-clamp-1 ${subColor}`}>{product.brand}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2.5">
                      {product.price && (
                        <span
                          className={`font-extrabold text-base drop-shadow-sm ${textColor}`}
                          data-testid={`text-featured-price-${product.id}`}
                        >
                          ${parseFloat(product.price).toFixed(2)}
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); addToCart(product); }}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold shadow-sm ${theme.btn}`}
                        data-testid={`button-featured-add-${product.id}`}
                      >
                        <Plus className="h-3 w-3" />
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                {layout === 2 && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/4 z-10">
                    <div className="w-20 h-20 rounded-2xl overflow-hidden shadow-lg bg-white/20 backdrop-blur-sm border border-white/20">
                      {hasImage ? (
                        <ImageWithFallback
                          src={product.imageUrl!}
                          alt={product.name}
                          className="w-full h-full object-cover"
                          data-testid={`img-featured-${product.id}`}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Pill className={`h-8 w-8 ${theme.light ? "text-slate-400" : "text-white/50"}`} />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {total > 1 && (() => {
          const curTheme = BANNER_THEMES[current % BANNER_THEMES.length];
          const curLayout = featured[current]?.imageUrl ? current % 3 : 2;
          const dotActive = curLayout === 0 || !curTheme.light ? "bg-white shadow-sm" : "bg-slate-700";
          const dotInactive = curLayout === 0 || !curTheme.light ? "bg-white/35" : "bg-slate-400/50";
          return (
            <div className="absolute bottom-2.5 left-0 right-0 flex justify-center gap-1.5 z-20">
              {featured.map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); goTo(i); resetTimer(); }}
                  className={`transition-all duration-300 rounded-full ${
                    i === current ? `w-5 h-1.5 ${dotActive}` : `w-1.5 h-1.5 ${dotInactive}`
                  }`}
                  data-testid={`button-featured-dot-${i}`}
                />
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

export default function ShopPage() {
  const inventory = useInventoryState();
  const { t } = useTranslation();
  const { totalItems } = useCart();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORIES);
  const [categoryKey, setCategoryKey] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState<OtcProduct | null>(null);
  const [welcomeBack, setWelcomeBack] = useState<ShopMemory | null>(null);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const [fsaOnly, setFsaOnly] = useState(false);

  const { data: products = [], isLoading } = useQuery<OtcProduct[]>({
    queryKey: ["/api/otc/products"],
  });

  useEffect(() => {
    const mem = loadMemory();
    if (mem && (mem.lastProductName || mem.lastCategory !== ALL_CATEGORIES)) {
      setWelcomeBack(mem);
      if (mem.lastCategory && mem.lastCategory !== ALL_CATEGORIES) {
        setActiveCategory(mem.lastCategory);
      }
    }
  }, []);

  const categories = [
    ALL_CATEGORIES,
    ...Array.from(new Set(products.map((p) => p.category))).sort(),
  ];

  const handleCategoryChange = (cat: string) => {
    setActiveCategory(cat);
    setCategoryKey((k) => k + 1);
    saveMemory({ lastCategory: cat });
  };

  const handleProductOpen = (product: OtcProduct) => {
    setSelectedProduct(product);
    saveMemory({
      lastProductId: product.id,
      lastProductName: product.name,
      lastCategory: activeCategory,
    });
  };

  const filtered = products.filter((p) => {
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.brand ?? "").toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase());
    const matchesCat = activeCategory === ALL_CATEGORIES || p.category === activeCategory;
    const matchesFsa = !fsaOnly || p.fsaEligible;
    return matchesSearch && matchesCat && matchesFsa && p.isShopVisible;
  });

  return (
    <div className="max-w-3xl mx-auto pb-24" data-testid="shop-page">
      <div role="status" className="px-4 py-2 text-sm border-b" data-testid="inventory-status">
        {inventory.stale
          ? "Current availability cannot be checked. Cached items cannot be purchased until inventory reconnects."
          : !inventory.revisionAvailable
            ? "Stock checked with Staff. Live revision updates are unavailable; availability will be checked again at checkout."
            : !inventory.connected
              ? "Live connection interrupted. Checking Staff inventory every second while this page is open."
              : "Connected to Staff inventory."}
      </div>
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/30 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("shop.searchProducts")}
              className="pl-9 h-10 text-sm"
              data-testid="input-shop-search"
            />
          </div>
          <Link href="/cart">
            <button
              className="relative w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"
              data-testid="button-cart-link"
            >
              <ShoppingCart className="h-5 w-5 text-primary" />
              {totalItems > 0 && (
                <span
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center"
                  data-testid="badge-cart-count"
                >
                  {totalItems}
                </span>
              )}
            </button>
          </Link>
        </div>
      </div>

      {!search && (
        <FeaturedBanner
          onProductOpen={handleProductOpen}
          drawerOpen={!!selectedProduct}
        />
      )}

      {!search && <RecommendedShelf onProductOpen={handleProductOpen} />}
      {!search && <AdvisorShelf onProductOpen={handleProductOpen} />}

      <div
        className="flex gap-2 overflow-x-auto pb-1 px-4 pt-3 scrollbar-none"
        data-testid="category-tabs"
      >
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => handleCategoryChange(cat)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 whitespace-nowrap ${
              activeCategory === cat
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
            data-testid={`button-category-${cat.replace(/\s+/g, "-").toLowerCase()}`}
          >
            {cat}
          </button>
        ))}
        <button
          onClick={() => setFsaOnly((v) => !v)}
          className={`shrink-0 inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 whitespace-nowrap ${
            fsaOnly
              ? "bg-violet-600 text-white shadow-sm"
              : "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-900/60"
          }`}
          data-testid="button-filter-fsa"
          aria-pressed={fsaOnly}
          aria-label="Show FSA/HSA eligible products only"
        >
          <BadgeCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
          FSA/HSA
        </button>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {welcomeBack && !welcomeDismissed && !search && (
          <div
            className="glass-card rounded-lg p-4 flex items-start gap-3 animate-drift-up"
            data-testid="banner-welcome-back"
          >
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{t("shop.welcomeBack")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {welcomeBack.lastProductName
                  ? t("shop.pickUpWhere", { product: welcomeBack.lastProductName })
                  : t("shop.pickUpCategory", { category: welcomeBack.lastCategory })}
              </p>
            </div>
            <button
              onClick={() => setWelcomeDismissed(true)}
              className="text-muted-foreground text-xs shrink-0 mt-0.5"
              data-testid="button-dismiss-welcome"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-3" data-testid="shop-empty-state">
            <Pill className="h-12 w-12 text-muted-foreground/30" />
            <p className="text-base font-medium">{t("shop.noProductsFound")}</p>
            <p className="text-sm text-muted-foreground max-w-xs">{t("shop.tryDifferentSearch")}</p>
            {search && (
              <Button variant="outline" size="sm" onClick={() => setSearch("")} data-testid="button-clear-search">
                {t("shop.clearSearch")}
              </Button>
            )}
          </div>
        ) : (
          <div
            key={categoryKey}
            className="grid grid-cols-2 gap-3"
            data-testid="product-grid"
          >
            {filtered.map((product, i) => (
              <div
                key={product.id}
                className="animate-drift-up"
                style={{ animationDelay: `${Math.min(i, 12) * 55}ms` }}
              >
                <ProductCard
                  product={product}
                  index={i}
                  onClick={() => handleProductOpen(product)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <ProductDrawer
        product={selectedProduct ? products.find((p) => p.id === selectedProduct.id) ??
          { ...selectedProduct, isAvailable: false, stockCount: 0 } : null}
        allProducts={products}
        onClose={() => setSelectedProduct(null)}
      />
    </div>
  );
}

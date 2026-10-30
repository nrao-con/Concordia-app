import { useQueries } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useCart } from "@/hooks/use-cart";
import { Button } from "@/components/ui/button";
import { ShoppingCart, CheckCircle, Pill } from "lucide-react";
import type { OtcProduct } from "@shared/schema";

interface CompanionProductShelfProps {
  medicationIds: number[];
  medicationName?: string;
}

export function CompanionProductShelf({ medicationIds, medicationName }: CompanionProductShelfProps) {
  const { addToCart, getCartQuantity } = useCart();
  const [, setLocation] = useLocation();

  const results = useQueries({
    queries: medicationIds.map((id) => ({
      queryKey: [`/api/medications/${id}/companion-products`],
      staleTime: 5 * 60 * 1000,
      enabled: id > 0,
    })),
  });

  const isLoading = results.some((r) => r.isLoading);
  if (isLoading || medicationIds.length === 0) return null;

  const seen = new Set<number>();
  const products: OtcProduct[] = [];
  for (const result of results) {
    const data = result.data as OtcProduct[] | undefined;
    if (data) {
      for (const p of data) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          products.push(p);
        }
      }
    }
  }

  if (products.length === 0) return null;

  const label = medicationName
    ? `Often paired with ${medicationName}`
    : "Companion Products";

  return (
    <div className="space-y-2 pt-3 border-t border-border/50" data-testid="section-companion-shelf">
      <p
        className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
        data-testid="text-companion-label"
      >
        {label}
      </p>
      <div
        className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1"
        style={{ scrollbarWidth: "none" }}
        data-testid="list-companion-products"
      >
        {products.map((product) => {
          const inCart = getCartQuantity(product.id) > 0;
          return (
            <div
              key={product.id}
              className="shrink-0 w-32 rounded-xl border border-border/60 bg-muted/20 overflow-hidden"
              data-testid={`card-companion-${product.id}`}
            >
              <button
                className="w-full text-left"
                onClick={() => setLocation(`/shop?highlight=${product.id}`)}
                data-testid={`button-companion-view-${product.id}`}
                aria-label={`View ${product.name} in shop`}
              >
                <div className="h-20 bg-muted flex items-center justify-center overflow-hidden">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      data-testid={`img-companion-${product.id}`}
                    />
                  ) : (
                    <Pill className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                  )}
                </div>
                <div className="px-2 pt-2 space-y-0.5">
                  <p
                    className="text-xs font-semibold line-clamp-2 leading-tight"
                    data-testid={`text-companion-name-${product.id}`}
                  >
                    {product.name}
                  </p>
                  {product.price && (
                    <p
                      className="text-xs text-primary font-bold"
                      data-testid={`text-companion-price-${product.id}`}
                    >
                      {product.price.startsWith("$") ? product.price : `$${product.price}`}
                    </p>
                  )}
                </div>
              </button>
              <div className="px-2 pb-2 pt-1.5">
                <Button
                  size="sm"
                  variant={inCart ? "secondary" : "default"}
                  className="w-full h-8 text-xs"
                  onClick={() => addToCart(product)}
                  data-testid={`button-companion-add-${product.id}`}
                >
                  {inCart ? (
                    <>
                      <CheckCircle className="h-3 w-3 mr-1" aria-hidden="true" />
                      In Cart
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="h-3 w-3 mr-1" aria-hidden="true" />
                      Add
                    </>
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

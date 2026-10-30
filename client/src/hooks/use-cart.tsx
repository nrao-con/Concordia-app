import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useInventoryState } from "@/hooks/use-staff-panel-sse";
import { usePatientContext, proxyUrl } from "@/hooks/use-patient-context";
import type { OtcProduct } from "@shared/schema";
import { POINTS_PER_DOLLAR } from "@shared/schema";

export type CartItem = {
  id?: number;
  otcProductId: number;
  productName: string;
  quantity: number;
  price: string | null;
  isAvailable?: boolean | null;
  stockCount?: number | null;
};

type CartContextType = {
  cart: CartItem[];
  isLoading: boolean;
  isMutating: boolean;
  addToCart: (product: OtcProduct, qty?: number) => void;
  removeFromCart: (productId: number) => void;
  updateQuantity: (productId: number, newQty: number) => void;
  clearCart: () => void;
  getCartQuantity: (productId: number) => number;
  totalItems: number;
  totalPrice: number;
  wellnessCredits: number;
  creditsApplied: number;
  applyCredits: (apply: boolean, maxAmount?: number) => void;
  amountDue: number;
};

const CartContext = createContext<CartContextType | null>(null);

const GUEST_CART_KEY = "concordia_cart";

function loadGuestCart(): CartItem[] {
  try {
    const stored = localStorage.getItem(GUEST_CART_KEY);
    if (stored) return JSON.parse(stored) as CartItem[];
  } catch {}
  return [];
}

function saveGuestCart(cart: CartItem[]) {
  try {
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(cart));
  } catch {}
}

function clearGuestCart() {
  try {
    localStorage.removeItem(GUEST_CART_KEY);
  } catch {}
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const inventory = useInventoryState();
  const { data: liveProducts } = useQuery<OtcProduct[]>({
    queryKey: ["/api/otc/products"], enabled: false,
  });
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const canUseCart = isAuthenticated && user?.pharmacyAccess !== false;
  const { toast } = useToast();
  const { isProxy, activePatientId } = usePatientContext();
  const cartUrl = proxyUrl("/api/cart", activePatientId, isProxy);
  const loyaltyUrl = proxyUrl("/api/loyalty", activePatientId, isProxy);

  const [guestCart, setGuestCart] = useState<CartItem[]>(loadGuestCart);
  const [creditsApplied, setCreditsApplied] = useState(0);
  const prevAuthRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      saveGuestCart(guestCart);
    }
  }, [guestCart, isAuthenticated]);

  const { data: serverCart, isLoading: serverLoading } = useQuery<CartItem[]>({
    queryKey: [cartUrl],
    enabled: canUseCart,
    staleTime: 30_000,
  });

  const { data: loyaltyData } = useQuery<{ balance: number; tier: string; streakDays: number }>({
    queryKey: [loyaltyUrl],
    enabled: canUseCart,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (canUseCart && !prevAuthRef.current && !authLoading) {
      const guest = loadGuestCart();
      if (guest.length > 0) {
        Promise.allSettled(
          guest.map(async (item) => {
            await apiRequest("POST", proxyUrl("/api/cart/items", activePatientId, isProxy), {
              otcProductId: item.otcProductId,
              quantity: item.quantity,
            });
            return item.otcProductId;
          })
        ).then((results) => {
          const failedIds = new Set(
            results.flatMap((result, index) =>
              result.status === "rejected" ? [guest[index].otcProductId] : []
            )
          );
          const remaining = guest.filter((item) => failedIds.has(item.otcProductId));
          if (remaining.length === 0) clearGuestCart();
          else saveGuestCart(remaining);
          setGuestCart(remaining);
          queryClient.invalidateQueries({ queryKey: [cartUrl] });
          if (remaining.length > 0) {
            toast({
              title: "Some cart items could not be restored",
              description: "Please try adding the remaining items again.",
              variant: "destructive",
            });
          }
        });
      }
    }
    prevAuthRef.current = canUseCart;
  }, [canUseCart, authLoading, toast, cartUrl, activePatientId, isProxy]);

  const cart: CartItem[] = (isAuthenticated ? (serverCart ?? []) : guestCart).map((item) => {
    if (!liveProducts) return item;
    const product = liveProducts.find((p) => p.id === item.otcProductId);
    return product ? { ...item, productName: product.name, price: product.price,
      isAvailable: !inventory.stale && product.isAvailable, stockCount: product.stockCount }
      : { ...item, isAvailable: false, stockCount: 0 };
  });
  const isLoading = isAuthenticated ? serverLoading : false;

  const addMutation = useMutation({
    mutationFn: async ({ otcProductId, quantity }: { otcProductId: number; quantity: number; productName: string; price: string | null }) => {
      const res = await apiRequest("POST", proxyUrl("/api/cart/items", activePatientId, isProxy), { otcProductId, quantity });
      return res.json() as Promise<CartItem>;
    },
    onMutate: async ({ otcProductId, quantity, productName, price }) => {
      await queryClient.cancelQueries({ queryKey: [cartUrl] });
      const prev = queryClient.getQueryData<CartItem[]>([cartUrl]);
      queryClient.setQueryData<CartItem[]>([cartUrl], (old = []) => {
        const existing = old.find((i) => i.otcProductId === otcProductId);
        if (existing) {
          return old.map((i) =>
            i.otcProductId === otcProductId
              ? { ...i, quantity: Math.min(i.quantity + quantity, 10) }
              : i
          );
        }
        return [...old, { otcProductId, productName, quantity: Math.min(quantity, 10), price }];
      });
      return { prev };
    },
    onError: (error: Error, _vars, ctx) => {
      if (ctx?.prev !== undefined) {
        queryClient.setQueryData([cartUrl], ctx.prev);
      }
      toast({ title: "Could not update cart", description: error.message, variant: "destructive" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [cartUrl] }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, quantity }: { id: number; quantity: number }) => {
      const res = await apiRequest("PATCH", proxyUrl(`/api/cart/items/${id}`, activePatientId, isProxy), { quantity });
      return res.json() as Promise<CartItem>;
    },
    onMutate: async ({ id, quantity }) => {
      await queryClient.cancelQueries({ queryKey: [cartUrl] });
      const prev = queryClient.getQueryData<CartItem[]>([cartUrl]);
      queryClient.setQueryData<CartItem[]>([cartUrl], (old = []) =>
        old.map((i) => (i.id === id ? { ...i, quantity } : i))
      );
      return { prev };
    },
    onError: (error: Error, _vars, ctx) => {
      if (ctx?.prev !== undefined) {
        queryClient.setQueryData([cartUrl], ctx.prev);
      }
      toast({ title: "Could not update quantity", description: error.message, variant: "destructive" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [cartUrl] }),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", proxyUrl(`/api/cart/items/${id}`, activePatientId, isProxy));
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: [cartUrl] });
      const prev = queryClient.getQueryData<CartItem[]>([cartUrl]);
      queryClient.setQueryData<CartItem[]>([cartUrl], (old = []) =>
        old.filter((i) => i.id !== id)
      );
      return { prev };
    },
    onError: (error: Error, _vars, ctx) => {
      if (ctx?.prev !== undefined) {
        queryClient.setQueryData([cartUrl], ctx.prev);
      }
      toast({ title: "Could not remove item", description: error.message, variant: "destructive" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [cartUrl] }),
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", cartUrl);
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: [cartUrl] });
      const prev = queryClient.getQueryData<CartItem[]>([cartUrl]);
      queryClient.setQueryData([cartUrl], []);
      return { prev };
    },
    onError: (error: Error, _vars, ctx) => {
      if (ctx?.prev !== undefined) {
        queryClient.setQueryData([cartUrl], ctx.prev);
      }
      toast({ title: "Could not clear cart", description: error.message, variant: "destructive" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [cartUrl] }),
  });

  const addToCart = useCallback(
    (product: OtcProduct, qty = 1) => {
      const current = queryClient.getQueryData<OtcProduct[]>(["/api/otc/products"])?.find((p) => p.id === product.id);
      const state = queryClient.getQueryData<{ stale: boolean }>(["staff-inventory-state"]);
      if (state?.stale !== false || !current?.isAvailable || (current.stockCount ?? 0) < qty) {
        toast({ title: "Availability not confirmed", description: "Please reconnect or choose an available item.", variant: "destructive" });
        return;
      }
      if (isAuthenticated && !canUseCart) {
        toast({
          title: "Pharmacy records not connected",
          description: "Connect your pharmacy records before adding items to your cart.",
          variant: "destructive",
        });
        return;
      }
      if (isAuthenticated) {
        if (addMutation.isPending) return;
        addMutation.mutate({ otcProductId: product.id, quantity: qty, productName: product.name, price: product.price });
      } else {
        setGuestCart((prev) => {
          const existing = prev.find((i) => i.otcProductId === product.id);
          if (existing) {
            return prev.map((i) =>
              i.otcProductId === product.id
                ? { ...i, quantity: Math.min(i.quantity + qty, 10) }
                : i
            );
          }
          return [
            ...prev,
            { otcProductId: product.id, productName: product.name, quantity: Math.min(qty, 10), price: product.price },
          ];
        });
      }
    },
    [isAuthenticated, canUseCart, addMutation, toast]
  );

  const removeFromCart = useCallback(
    (productId: number) => {
      if (isAuthenticated) {
        if (removeMutation.isPending) return;
        const item = (serverCart ?? []).find((i) => i.otcProductId === productId);
        if (!item) return;
        if (item.id !== undefined) {
          removeMutation.mutate(item.id);
        } else {
          queryClient.setQueryData<CartItem[]>([cartUrl], (old = []) =>
            old.filter((i) => i.otcProductId !== productId)
          );
        }
      } else {
        setGuestCart((prev) => prev.filter((i) => i.otcProductId !== productId));
      }
    },
    [isAuthenticated, serverCart, removeMutation]
  );

  const updateQuantity = useCallback(
    (productId: number, newQty: number) => {
      if (isAuthenticated) {
        if (updateMutation.isPending || removeMutation.isPending) return;
        const item = (serverCart ?? []).find((i) => i.otcProductId === productId);
        if (!item) return;
        if (newQty <= 0) {
          if (item.id !== undefined) {
            removeMutation.mutate(item.id);
          } else {
            queryClient.setQueryData<CartItem[]>([cartUrl], (old = []) =>
              old.filter((i) => i.otcProductId !== productId)
            );
          }
        } else if (item.id !== undefined) {
          updateMutation.mutate({ id: item.id, quantity: Math.min(newQty, 10) });
        } else {
          queryClient.setQueryData<CartItem[]>([cartUrl], (old = []) =>
            old.map((i) =>
              i.otcProductId === productId ? { ...i, quantity: Math.min(newQty, 10) } : i
            )
          );
        }
      } else {
        if (newQty <= 0) {
          setGuestCart((prev) => prev.filter((i) => i.otcProductId !== productId));
        } else {
          setGuestCart((prev) =>
            prev.map((i) =>
              i.otcProductId === productId ? { ...i, quantity: Math.min(newQty, 10) } : i
            )
          );
        }
      }
    },
    [isAuthenticated, serverCart, removeMutation, updateMutation]
  );

  const clearCart = useCallback(() => {
    if (isAuthenticated) {
      if (clearMutation.isPending) return;
      clearMutation.mutate();
    } else {
      setGuestCart([]);
    }
    setCreditsApplied(0);
  }, [isAuthenticated, clearMutation]);

  const getCartQuantity = useCallback(
    (productId: number) => cart.find((i) => i.otcProductId === productId)?.quantity ?? 0,
    [cart]
  );

  const wellnessCredits = isAuthenticated && loyaltyData ? loyaltyData.balance / POINTS_PER_DOLLAR : 0;
  const totalItems = cart.reduce((sum, i) => sum + i.quantity, 0);
  const totalPrice = cart.reduce((sum, i) => sum + parseFloat(i.price ?? "0") * i.quantity, 0);

  const applyCredits = useCallback(
    (apply: boolean, maxAmount?: number) => {
      if (!apply) {
        setCreditsApplied(0);
        return;
      }
      const available = maxAmount ?? wellnessCredits;
      setCreditsApplied(Math.min(available, totalPrice));
    },
    [wellnessCredits, totalPrice]
  );

  const effectiveCreditsApplied = Math.min(creditsApplied, wellnessCredits, totalPrice);
  const amountDue = Math.max(0, totalPrice - effectiveCreditsApplied);
  const isMutating =
    addMutation.isPending ||
    updateMutation.isPending ||
    removeMutation.isPending ||
    clearMutation.isPending;

  return (
    <CartContext.Provider
      value={{
        cart,
        isLoading,
        isMutating,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        getCartQuantity,
        totalItems,
        totalPrice,
        wellnessCredits,
        creditsApplied: effectiveCreditsApplied,
        applyCredits,
        amountDue,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}

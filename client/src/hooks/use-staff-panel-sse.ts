import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { initialInventoryState, startInventorySync, type InventoryState } from "@/lib/inventory-sync";

export function useInventoryState() {
  return useQuery<InventoryState>({
    queryKey: ["staff-inventory-state"], enabled: false, initialData: initialInventoryState,
  }).data;
}

export function useStaffPanelSSE() {
  const [location] = useLocation();
  const active = location === "/shop" || location === "/cart" || location === "/" || location === "/home";
  useEffect(() => startInventorySync({
    active,
    onState: (state) => queryClient.setQueryData<InventoryState>(["staff-inventory-state"], state),
    onCatalog: (products) => {
      queryClient.setQueryData(["/api/otc/products"], products);
      // Staff IDs are not local product IDs. Invalidate all local detail/search
      // queries rather than constructing a detail URL from an SSE product ID.
      queryClient.invalidateQueries({ predicate: (q) => {
        const key = String(q.queryKey[0]);
        return key.startsWith("/api/otc/") && key !== "/api/otc/products";
      } });
      queryClient.invalidateQueries({ predicate: (q) =>
        String(q.queryKey[0]).startsWith("/api/cart") ||
        String(q.queryKey[0]).startsWith("/api/shop/recommended") ||
        String(q.queryKey[0]).startsWith("/api/recommendations") });
    },
    onOrder: () => queryClient.invalidateQueries({ predicate: (q) =>
      String(q.queryKey[0]).startsWith("/api/orders") }),
  }), [active]);
}

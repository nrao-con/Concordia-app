export type InventoryState = {
  stale: boolean; connected: boolean; revisionAvailable: boolean | null; checkedAt: number | null;
};
export const initialInventoryState: InventoryState = {
  stale: true, connected: false, revisionAvailable: null, checkedAt: null,
};

/** Re-read Staff after an order attempt; never adjust stock from the order locally. */
export function requestInventoryRefresh() {
  window.dispatchEvent(new Event("staff-inventory-refresh"));
}

/** One lifecycle-owned connection; revision polling does not depend on SSE. */
export function startInventorySync(options: {
  onCatalog: (products: any[]) => void;
  onState: (state: InventoryState) => void;
  onOrder: () => void;
  active: boolean;
  transport?: typeof fetch;
  eventSource?: typeof EventSource;
}) {
  const transport = options.transport ?? fetch;
  const Source = options.eventSource ?? (typeof EventSource === "undefined" ? undefined : EventSource);
  let state = { ...initialInventoryState };
  let stopped = false;
  let revision: string | null = null;
  let snapshot = Promise.resolve();
  let checking = false;
  let lastRecovery = 0;
  let source: EventSource | null = null;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  const abort = new AbortController();
  const visible = () => options.active && document.visibilityState !== "hidden" && navigator.onLine !== false;
  const emit = (patch: Partial<InventoryState>) => {
    if (stopped) return;
    state = { ...state, ...patch };
    options.onState(state);
  };
  async function reload() {
    if (!visible() || stopped) return;
    // Serialize snapshots so an older response cannot overwrite a newer event.
    // Each caller awaits its own recovery, including events arriving as the
    // previous request settles. Queued tasks become no-ops after teardown.
    snapshot = snapshot.then(async () => {
      if (!visible() || stopped) return;
      try {
        const response = await transport("/api/otc/inventory/snapshot", { cache: "no-store", signal: abort.signal });
        if (!response.ok) throw new Error("inventory unavailable");
        const body = await response.json();
        if (!Array.isArray(body.products)) throw new Error("invalid inventory");
        if (!stopped && visible()) {
          options.onCatalog(body.products);
          emit({ stale: false, checkedAt: body.checkedAt });
          lastRecovery = Date.now();
        }
      } catch {
        emit({ stale: true });
      }
    });
    return snapshot;
  }
  async function check() {
    if (!visible() || stopped || checking) return;
    checking = true;
    try {
      const response = await transport("/api/otc/inventory/revision", { cache: "no-store", signal: abort.signal });
      if (!response.ok) throw new Error("revision unavailable");
      const body = await response.json();
      if (stopped) return;
      if (body.revisionAvailable === false) {
        emit({ revisionAvailable: false });
        // Staff deployment dependency: recover against the SAME catalog,
        // never an alternate source. Do not fetch it every second.
        if (Date.now() - lastRecovery >= 10_000 || state.stale) await reload();
      } else {
        if (!["string", "number"].includes(typeof body.revision)) throw new Error("invalid revision");
        emit({ revisionAvailable: true });
        const next = String(body.revision);
        if (next !== revision || state.stale) {
          emit({ stale: true });
          await reload();
          if (!state.stale) revision = next;
        }
      }
    } catch {
      emit({ stale: true, revisionAvailable: false });
      if (Date.now() - lastRecovery >= 10_000) await reload();
    } finally { checking = false; }
  }
  function connect() {
    if (stopped || !Source || document.visibilityState === "hidden") return;
    try {
      source = new Source("https://concordia-staff.replit.app/api/public/events");
      source.onopen = () => { emit({ connected: true, ...(options.active ? { stale: true } : {}) }); void reload(); };
      for (const event of ["product_updated", "product_hidden", "product_deleted", "inventory_resync"]) {
        source.addEventListener(event, () => { emit({ stale: true }); void reload(); });
      }
      source.addEventListener("order_status_changed", () => {
        options.onOrder();
        // Stock may change with an order even if a separate product event is
        // missed. Fetch Staff's snapshot; the status itself is not stock data.
        emit({ stale: true });
        void reload();
      });
      source.onerror = () => {
        source?.close();
        source = null;
        emit({ connected: false });
        if (!stopped) reconnect = setTimeout(connect, 3000);
      };
    } catch {
      emit({ connected: false });
      if (!stopped) reconnect = setTimeout(connect, 3000);
    }
  }
  function recover() {
    if (!visible()) {
      emit({ stale: true, connected: false });
      if (document.visibilityState === "hidden" || navigator.onLine === false) { source?.close(); source = null; }
      return;
    }
    emit({ stale: true });
    void reload();
    void check();
    if (!source) { clearTimeout(reconnect); connect(); }
  }
  const timer = setInterval(() => { void check(); }, 1000);
  document.addEventListener("visibilitychange", recover);
  window.addEventListener("focus", recover);
  window.addEventListener("online", recover);
  window.addEventListener("offline", recover);
  window.addEventListener("staff-inventory-refresh", recover);
  if (options.active) recover();
  else connect(); // retain existing order-event refresh outside the shop
  return () => {
    stopped = true;
    abort.abort();
    clearInterval(timer);
    clearTimeout(reconnect);
    source?.close();
    document.removeEventListener("visibilitychange", recover);
    window.removeEventListener("focus", recover);
    window.removeEventListener("online", recover);
    window.removeEventListener("offline", recover);
    window.removeEventListener("staff-inventory-refresh", recover);
  };
}

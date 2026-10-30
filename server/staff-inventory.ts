import type { InsertOtcProduct } from "@shared/schema";
import type { IStorage } from "./storage";

export const STAFF_BASE_URL = "https://concordia-staff.replit.app";

export function mapStaffProducts(value: unknown): InsertOtcProduct[] {
  if (!Array.isArray(value)) throw new Error("Invalid Staff catalog");
  const ids = new Set<string>();
  return value.map((p) => {
    const id = p?.concordiaProductId ?? p?.id;
    const stock = p?.stockQuantity ?? p?.stockCount;
    const price = Number(p?.price);
    if (!["string", "number"].includes(typeof id) || !String(id).trim() ||
        ids.has(String(id)) || typeof p.name !== "string" || !p.name.trim() ||
        !Number.isInteger(stock) || stock < 0 || p.price == null || !String(p.price).trim() ||
        !Number.isFinite(price) || price < 0) throw new Error("Invalid Staff catalog");
    ids.add(String(id));
    const hidden = p.isVisible === false || p.visible === false || p.hidden === true ||
      p.isHidden === true || p.isDeleted === true || p.deleted === true;
    return {
      externalId: `sp:${id}`, staffPanelProductId: typeof id === "number" ? id : null,
      syncSource: "staff_panel", name: p.name, category: p.category || "General",
      description: p.description || null, price: price.toFixed(2), stockCount: stock,
      imageUrl: p.imageUrl ? new URL(p.imageUrl, STAFF_BASE_URL).toString() : null,
      brand: p.brand || null, dosageInfo: p.packSize || null,
      isAvailable: !hidden && p.isAvailable !== false && p.inStock !== false && stock > 0,
      isShopVisible: !hidden,
      isFeatured: p.isFeatured === true, fsaEligible: p.fsaEligible === true,
    };
  });
}

export class StaffInventory {
  private snapshotFlight: Promise<void> | null = null;
  private revisionFlight: Promise<{ revision: string | null; revisionAvailable: boolean }> | null = null;
  private revisionCache: { revision: string | null; revisionAvailable: boolean } | null = null;
  private revisionChecked = 0;
  private checkedAt = 0;
  constructor(
    private store: Pick<IStorage, "bulkSyncOtcProducts" | "getOtcProducts">,
    private transport: typeof fetch = fetch,
  ) {}

  async refresh() {
    // Every forced refresh reaches Staff; concurrent callers share the same fetch.
    if (!this.snapshotFlight) this.snapshotFlight = (async () => {
      const response = await this.transport(`${STAFF_BASE_URL}/api/public/products`, {
        cache: "no-store", signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("Staff catalog unavailable");
      const products = mapStaffProducts(await response.json());
      // An authenticated/public complete empty snapshot means no products,
      // not permission to revive a competing catalog.
      await this.store.bulkSyncOtcProducts(products, "staff_panel");
      this.checkedAt = Date.now();
    })().finally(() => { this.snapshotFlight = null; });
    await this.snapshotFlight;
  }

  async snapshot(force = false) {
    // An event/revision recovery may arrive while an older scheduled read is
    // in flight. Wait for it, then fetch again rather than labeling old stock
    // as the snapshot corresponding to the new revision.
    if (force && this.snapshotFlight) await this.snapshotFlight;
    if (force || Date.now() - this.checkedAt > 1000) await this.refresh();
    return { products: await this.store.getOtcProducts(), checkedAt: this.checkedAt };
  }

  async revision() {
    if (this.revisionCache && Date.now() - this.revisionChecked < 500) return this.revisionCache;
    if (!this.revisionFlight) this.revisionFlight = (async () => {
      const response = await this.transport(`${STAFF_BASE_URL}/api/public/inventory/revision`, {
        cache: "no-store", signal: AbortSignal.timeout(4000),
      });
      if (response.status === 404) return { revision: null, revisionAvailable: false };
      if (!response.ok) throw new Error("Staff revision unavailable");
      const body = await response.json();
      const revision = typeof body === "object" ? body?.revision : body;
      if (!["string", "number"].includes(typeof revision)) throw new Error("Invalid Staff revision");
      return { revision: String(revision), revisionAvailable: true };
    })().then((result) => {
      this.revisionCache = result;
      this.revisionChecked = Date.now();
      return result;
    }).finally(() => { this.revisionFlight = null; });
    return this.revisionFlight;
  }
}

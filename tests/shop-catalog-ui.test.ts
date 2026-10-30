import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/hooks/use-cart", () => ({
  useCart: () => ({ addToCart: vi.fn(), getCartQuantity: () => 0, updateQuantity: vi.fn() }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key === "cart.outOfStock" ? "Out of stock" : key }),
}));
import { ProductCard } from "../client/src/pages/shop";

const product = {
  id: 901, staffPanelProductId: 7, externalId: "sp:7", syncSource: "staff_panel",
  name: "Staff zero-stock fixture", price: "4.25", description: "Staff description",
  isShopVisible: true, isAvailable: false, stockCount: 0, imageUrl: null, videoUrl: null,
} as any;
const render = (value: typeof product) =>
  renderToStaticMarkup(createElement(ProductCard, { product: value, index: 0, onClick: () => {} }));

describe("shop product stock rendering", () => {
  it("renders a visible zero-stock product with Out of stock and no purchase action", () => {
    const html = render(product);
    expect(html).toContain("Staff zero-stock fixture");
    expect(html).toContain("Out of stock");
    expect(html).toContain("badge-card-out-of-stock-901");
    expect(html).not.toContain("button-add-to-cart-901");
    expect(html).not.toContain("button-increase-901");
  });
  it("shows the current Staff price and enables Add once Staff supplies stock", () => {
    const html = render({ ...product, stockCount: 3, isAvailable: true, price: "7.65" });
    expect(html).toContain("$7.65");
    expect(html).toContain("button-add-to-cart-901");
    expect(html).not.toContain("badge-card-out-of-stock-901");
  });
});

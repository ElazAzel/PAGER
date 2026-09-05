import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LibraryOrders, LibrarySubscriptions, LibraryBookings } from "../src/app/ui/buyer-library";
import type { Booking, CatalogItem, Order, Subscription } from "../src/lib/types";

const order = { id: "order", pageId: "page", itemId: "guide", title: "Private guide", quantity: 2, amount: 2400, shippingAmount: 0, currency: "USD", status: "paid", scope: "item", fulfillment: "unfulfilled" } as Order;
const item = { id: "guide", pageId: "page", title: "Private guide", kind: "digital", fileId: "protected-file" } as CatalogItem;
const subscription = { id: "subscription", pageId: "page", scope: "page", orderId: "order", paidThrough: "2030-01-01T12:00:00Z", status: "active", cancelAtPeriodEnd: false } as Subscription;

describe("buyer library actions", () => {
  it("delivers a purchased digital file even when its original page is absent", () => {
    const html = renderToStaticMarkup(createElement(LibraryOrders, { locale: "en", orders: [order], items: [item] }));
    expect(html).toContain('href="/api/assets/protected-file"');
    expect(html).toContain("Download");
    expect(html).toContain("Quantity: 2");
  });

  it.each(["pending", "refunded", "disputed"] as const)("does not expose download actions for a %s order", status => {
    const html = renderToStaticMarkup(createElement(LibraryOrders, { locale: "en", orders: [{ ...order, status }], items: [] }));
    expect(html).not.toContain("/api/assets/");
  });

  it("renders shipping progress and treats a tracking value as plain text", () => {
    const html = renderToStaticMarkup(createElement(LibraryOrders, { locale: "en", orders: [{ ...order, fulfillment: "shipped", tracking: "ZX-123456" }], items: [{ ...item, kind: "physical" }] }));
    expect(html).toContain("Shipped");
    expect(html).toContain("ZX-123456");
    expect(html).not.toContain('href="ZX-123456"');
  });

  it.each(["ru", "en"] as const)("shows paid-through and an available cancellation action in %s", locale => {
    const html = renderToStaticMarkup(createElement(LibrarySubscriptions, { locale, subscriptions: [subscription], orders: [order], onUpdated: () => undefined }));
    expect(html).toContain("2030");
    expect(html).toContain(locale === "ru" ? "Отключить продление" : "Cancel renewal");
    expect(html).toContain("Private guide");
  });

  it("keeps paid access visible after renewal is cancelled without repeating its action", () => {
    const html = renderToStaticMarkup(createElement(LibrarySubscriptions, { locale: "en", subscriptions: [{ ...subscription, cancelAtPeriodEnd: true }], orders: [order], onUpdated: () => undefined }));
    expect(html).toContain("Renewal cancelled");
    expect(html).toContain("Access until");
    expect(html).not.toContain(">Cancel renewal</button>");
  });

  it("allows future confirmed bookings to be cancelled and labels cancelled bookings", () => {
    const booking = { id: "booking", title: "Session", status: "confirmed", startAt: "2030-01-01T12:00:00Z", timezone: "UTC" } as Booking;
    const html = renderToStaticMarkup(createElement(LibraryBookings, { locale: "en", bookings: [booking, { ...booking, id: "cancelled", status: "cancelled" }], onUpdated: () => undefined }));
    expect(html.match(/>Cancel booking</g)).toHaveLength(1);
    expect(html).toContain("Cancelled");
    expect(html).toContain("UTC");
  });
});

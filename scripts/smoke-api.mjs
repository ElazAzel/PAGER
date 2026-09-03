import assert from "node:assert/strict";

const origin = process.env.PAGER_SMOKE_URL || "http://127.0.0.1:3000";
const target = new URL(origin);
assert(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname), "API smoke only runs against a local, isolated demo");
const sessions = new Map();
let assertions = 0;
async function request(actor, path, method = "GET", payload) {
  const headers = { origin, ...(sessions.has(actor) ? { cookie: sessions.get(actor) } : {}) };
  if (payload !== undefined && !(payload instanceof FormData)) headers["content-type"] = "application/json";
  const response = await fetch(`${origin}${path}`, { method, headers, redirect: "manual", ...(payload !== undefined ? { body: payload instanceof FormData ? payload : JSON.stringify(payload) } : {}) });
  const cookie = response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  if (cookie) sessions.set(actor, cookie);
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data, headers: response.headers };
}
async function ok(actor, path, method = "GET", payload) {
  const result = await request(actor, path, method, payload);
  assert(result.status >= 200 && result.status < 300, `${method} ${path}: ${result.status} ${result.data?.error ?? ""}`);
  assertions++;
  return result.data;
}
async function denied(actor, path, method = "GET", payload) {
  const result = await request(actor, path, method, payload);
  assert([401, 403, 404, 409].includes(result.status), `${method} ${path} unexpectedly returned ${result.status}`);
  assertions++;
}
async function save(page) { return (await ok("author", "/api/page", "PUT", { page })).page; }
async function publish() { return (await ok("author", "/api/page/publish", "POST", {})).page; }
async function buy(actor, input) {
  const checkout = await ok(actor, "/api/checkout", "POST", input);
  assert.equal(checkout.demo, true);
  const paid = await ok(actor, `/api/checkout/${checkout.orderId}`, "POST", { action: "pay" });
  assert.equal(paid.order.status, "paid");
  return paid.order;
}

const session = await ok("visitor", "/api/session");
assert.equal(session.demo, true, "Use PAGER_DEMO=true and a fresh PAGER_DATA_DIR; never run against live data");
assert.equal(session.user, null);
for (const [actor, role, identity] of [["author", "creator", "primary"], ["otherAuthor", "creator", "secondary"], ["buyer", "buyer", "primary"], ["otherBuyer", "buyer", "secondary"], ["secondDevice", "buyer", "primary"]]) await ok(actor, "/api/demo/session", "POST", { role, identity });

let dashboard = await ok("author", "/api/dashboard");
const otherDashboard = await ok("otherAuthor", "/api/dashboard");
assert.notEqual(dashboard.page.ownerId, otherDashboard.page.ownerId);
await denied("otherAuthor", "/api/page", "PUT", { page: dashboard.page });
await denied("buyer", "/api/dashboard");
let page = dashboard.page;
const publicPath = `/api/public/${page.slug}`;
const initial = await ok("visitor", publicPath);
page.title = "Unpublished API smoke draft";
page = await save(page);
assert.equal((await ok("visitor", publicPath)).page.title, initial.page.title);

const protectedBlock = page.blocks.find(block => block.paid);
assert(protectedBlock, "Demo fixture requires a paid block");
const marker = `CONFIDENTIAL-${crypto.randomUUID()}`;
const form = new FormData();
form.set("pageId", page.id);
form.set("file", new Blob([marker], { type: "text/plain" }), "private-smoke.txt");
const uploaded = await ok("author", "/api/assets", "POST", form);
protectedBlock.type = "download";
protectedBlock.data = { title: "Purchased smoke material", text: marker, fileId: uploaded.asset.id };
protectedBlock.pricing = { currency: "USD", oneTime: 1900, monthly: 500 };
page = await save(page);
page = await publish();
assert(!JSON.stringify(await ok("visitor", publicPath)).includes(marker));
await denied("visitor", `/api/assets/${uploaded.asset.id}`);
await denied("otherBuyer", `/api/assets/${uploaded.asset.id}`);
const blockOrder = await buy("buyer", { pageId: page.id, blockId: protectedBlock.id, scope: "block", mode: "one_time" });
assert(JSON.stringify(await ok("secondDevice", publicPath)).includes(marker));
assert.equal((await ok("secondDevice", `/api/assets/${uploaded.asset.id}`)), marker);
await denied("otherBuyer", `/api/checkout/${blockOrder.id}`);
await ok("buyer", `/api/checkout/${blockOrder.id}`, "POST", { action: "pay" });
const firstLibrary = await ok("buyer", "/api/purchases");
assert.equal(firstLibrary.entitlements.filter(grant => grant.orderId === blockOrder.id).length, 1);

// Page access includes future blocks; refunding an independent block purchase does not remove it.
page = (await ok("author", "/api/dashboard")).page;
page.paid = true;
page.pricing = { currency: "USD", oneTime: 9900 };
page = await save(page); page = await publish();
await buy("buyer", { pageId: page.id, scope: "page", mode: "one_time" });
page.blocks.push({ id: "smoke-future", type: "text", width: "half", hidden: false, paid: true, teaser: "Future resource", pricing: { currency: "USD", monthly: 700 }, data: { text: "FUTURE-PAID-CONTENT" } });
page = await save(page); page = await publish();
assert(JSON.stringify(await ok("buyer", publicPath)).includes("FUTURE-PAID-CONTENT"));
assert(!JSON.stringify(await ok("otherBuyer", publicPath)).includes("FUTURE-PAID-CONTENT"));
await ok("author", `/api/orders/${blockOrder.id}/refund`, "POST", {});
assert(JSON.stringify(await ok("buyer", publicPath)).includes(marker));
page.paid = false; page = await save(page); page = await publish();
const monthly = await buy("otherBuyer", { pageId: page.id, scope: "block", blockId: "smoke-future", mode: "monthly" });
let library = await ok("otherBuyer", "/api/purchases");
const subscription = library.subscriptions.find(row => row.orderId === monthly.id);
assert(subscription && Date.parse(subscription.paidThrough) > Date.now());
await ok("otherBuyer", `/api/subscriptions/${subscription.id}/cancel`, "POST", {});
assert(JSON.stringify(await ok("otherBuyer", publicPath)).includes("FUTURE-PAID-CONTENT"));

// Two buyers concurrently try to reserve the final physical item.
dashboard = await ok("author", "/api/dashboard");
const physical = dashboard.items.find(item => item.kind === "physical");
physical.stock = 1; physical.shipping = [{ country: "US", amount: 500 }];
await ok("author", "/api/items", "POST", { item: physical });
const catalog = page.blocks.find(block => block.data.itemIds?.includes(physical.id));
const input = { pageId: page.id, scope: "item", itemId: physical.id, blockId: catalog.id, mode: "one_time", quantity: 1, shippingAddress: { name: "Test recipient", line1: "1 Test Street", city: "Test City", postalCode: "12345", country: "US" } };
const badCountry = await request("buyer", "/api/checkout", "POST", { ...input, shippingAddress: { ...input.shippingAddress, country: "CA" } });
assert.equal(badCountry.status, 400);
const contenders = await Promise.all(["buyer", "otherBuyer"].map(async actor => ({ actor, ...await request(actor, "/api/checkout", "POST", input) })));
assert.equal(contenders.filter(result => result.status === 200).length, 1);
assert.equal(contenders.filter(result => result.status === 409).length, 1);
const winner = contenders.find(result => result.status === 200);
const stockOrder = (await ok(winner.actor, `/api/checkout/${winner.data.orderId}`, "POST", { action: "pay" })).order;
assert.equal(stockOrder.shippingAmount, 500);
await denied("otherAuthor", `/api/orders/${stockOrder.id}`, "PATCH", { fulfillment: "shipped", tracking: "TEST-TRACK" });
await ok("author", `/api/orders/${stockOrder.id}`, "PATCH", { fulfillment: "shipped", tracking: "TEST-TRACK" });
dashboard = await ok("author", "/api/dashboard");
assert.equal(dashboard.items.find(item => item.id === physical.id).stock, 0);
assert.equal(dashboard.items.find(item => item.id === physical.id).reserved, 0);
assert.equal(dashboard.metrics.conversions, 0, "Demo conversions must not count toward traction");

// Booking happens before payment. Rescheduling and cancellation retain one record.
const bookingBlock = page.blocks.find(block => block.type === "booking");
const service = dashboard.items.find(item => item.kind === "service");
const buyer = (await ok("buyer", "/api/session")).user;
const bookingInput = { pageId: page.id, blockId: bookingBlock.id, itemId: service.id, name: buyer.name, email: buyer.email, timezone: "Asia/Almaty", startAt: new Date(Date.now() + 48 * 3600000).toISOString() };
const booked = await ok("buyer", "/api/bookings", "POST", bookingInput);
assert.equal(booked.booking.status, "confirmed");
assert.equal((await ok("buyer", `/api/checkout/${booked.orderId}`)).order.status, "pending");
await denied("otherBuyer", `/api/bookings/${booked.booking.id}/cancel`, "POST", {});
const moved = await ok("buyer", `/api/bookings/${booked.booking.id}`, "PATCH", { startAt: new Date(Date.now() + 72 * 3600000).toISOString(), endAt: new Date(Date.now() + 73 * 3600000).toISOString(), timezone: "America/New_York" });
assert(moved.booking.version > booked.booking.version);
const serviceOrder = await buy("buyer", { pageId: page.id, blockId: bookingBlock.id, itemId: service.id, bookingId: booked.booking.id, scope: "item", mode: "one_time" });
assert.equal(serviceOrder.bookingId, booked.booking.id);
const cancelled = await ok("buyer", `/api/bookings/${booked.booking.id}/cancel`, "POST", {});
assert.equal(cancelled.booking.status, "cancelled");
dashboard = await ok("author", "/api/dashboard");
assert.equal(dashboard.bookings.filter(row => row.id === booked.booking.id).length, 1);
assert.equal(dashboard.opportunities.filter(row => row.id === booked.booking.opportunityId).length, 1);
assert.equal(dashboard.metrics.conversions, 0);

// Hiding sold content affects public composition, never the buyer's material.
page = dashboard.page;
page.blocks.find(block => block.id === protectedBlock.id).hidden = true;
page = await save(page); page = await publish();
assert(!(await ok("buyer", publicPath)).page.blocks.some(block => block.id === protectedBlock.id));
library = await ok("buyer", "/api/purchases");
assert(library.pages.some(owned => owned.blocks.some(block => block.id === protectedBlock.id && block.data?.text === marker)));
assert.equal(await ok("secondDevice", `/api/assets/${uploaded.asset.id}`), marker);
await denied("otherBuyer", `/api/assets/${uploaded.asset.id}`);

// Deleting purchased content preserves the material in the buyer's library.
page.blocks = page.blocks.filter(block => block.id !== protectedBlock.id);
page = await save(page); await publish();
library = await ok("buyer", "/api/purchases");
assert(library.pages.some(owned => owned.blocks.some(block => block.id === protectedBlock.id && block.archived && block.data?.text === marker)));
assert(!(await ok("visitor", publicPath)).page.blocks.some(block => block.id === protectedBlock.id));
console.log(`API smoke passed: ${assertions} successful HTTP assertions plus confidentiality, publication, independent grants, subscription cancellation, concurrent stock, booking/rescheduling and hidden/archived material checks. LOCAL DEMO ONLY.`);

import assert from "node:assert/strict";

const origin = process.env.PAGER_SMOKE_URL || "http://127.0.0.1:3100";
assert(["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname), "Local isolated demo only");
const cookies = new Map();
let checks = 0;
function check(value, message) { assert(value, message); checks++; }
async function request(actor, path, method = "GET", payload, headers = {}) {
  const response = await fetch(origin + path, { method, redirect: "manual", headers: { origin, ...(cookies.has(actor) ? { cookie: cookies.get(actor) } : {}), ...(payload ? { "content-type": "application/json" } : {}), ...headers }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
  const cookie = response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  if (cookie) cookies.set(actor, cookie);
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, headers: response.headers, text, data };
}
async function signIn(actor, role, identity = "primary") {
  check((await request(actor, "/api/demo/session", "POST", { role, identity })).status === 200, "Demo sign-in");
}

const session = await request("visitor", "/api/session");
check(session.data.demo === true && session.data.user === null, "Fresh anonymous local demo required");
check((await request("visitor", "/api/analytics/report")).status === 401, "Analytics requires sign-in");
check((await request("visitor", "/api/admin/overview")).status === 401, "Admin requires sign-in");
const publicPage = await request("visitor", "/anna", "GET", undefined, { "user-agent": "OAI-SearchBot/1.0" });
check(publicPage.status === 200 && publicPage.text.includes("Анна Волкова") && publicPage.text.includes("Смена роли"), "Crawler receives public page content in initial HTML");
check(publicPage.text.includes("Нужно ли готовиться?") && publicPage.text.includes("Достаточно одного вопроса"), "FAQ question and answer render without JavaScript");
check(!publicPage.text.includes("Неделя 1") && !publicPage.text.includes("anna-workbook-file"), "HTML and RSC omit protected bodies and file IDs");
check(/name="robots" content="[^"]*noindex/.test(publicPage.text), "Demo page is noindex");
check((await request("visitor", "/missing-page-for-discovery-test")).status === 404, "Unknown author returns real 404");
const item = await request("visitor", "/anna/items/anna-session");
check(item.status === 200 && item.text.includes("Индивидуальная консультация"), "Public item has server rendered description");
check((await request("visitor", "/anna/items/anna-workbook?blockId=anna-library")).status === 404, "Protected item origin returns non-disclosing 404");
check((await request("visitor", "/robots.txt")).text.includes("Disallow: /"), "Demo disallows indexing");
check(!(await request("visitor", "/sitemap.xml")).text.includes("<loc>"), "Demo sitemap has no URLs");
const og = await request("visitor", "/anna/opengraph-image");
check(og.status === 200 && og.headers.get("content-type")?.startsWith("image/"), "Social image renders");

await signIn("author", "creator");
const dashboard = await request("author", "/api/dashboard");
const original = dashboard.data.page;
const changed = structuredClone(original);
changed.description = "UNPUBLISHED_DISCOVERY_SENTINEL";
const saved = await request("author", "/api/page", "PUT", { page: changed });
check(saved.status === 200, "Save isolated draft");
check(!(await request("visitor", "/anna")).text.includes(changed.description), "Draft never leaks to SSR or metadata");
const restore = await request("author", "/api/page", "PUT", { page: { ...original, revision: saved.data.page.revision } });
check(restore.status === 200, "Restore isolated draft");
const beforeEvents = (await request("author", "/api/analytics/report?days=7")).data.report.excluded.testEvents;
const visit = { pageId: original.id, kind: "view", visitorId: "smoke-visitor", eventId: crypto.randomUUID(), source: "search", device: "mobile" };
check((await request("author", "/api/analytics", "POST", visit)).status === 200, "Owner visit request accepted without counting");
check((await request("visitor", "/api/analytics", "POST", visit)).status === 200, "Visitor event accepted");
check((await request("visitor", "/api/analytics", "POST", visit)).status === 200, "Retried visitor event accepted");
check((await request("author", "/api/analytics/report?days=7")).data.report.excluded.testEvents === beforeEvents + 1, "Repeated delivery deduplicates and owner visit is excluded");
for (const days of [7, 30, 90]) {
  const report = await request("author", `/api/analytics/report?days=${days}`);
  check(report.status === 200 && report.data.report.days === days && report.data.report.daily.length === days, `Analytics ${days}-day window`);
  check(report.headers.get("cache-control")?.includes("no-store"), "Analytics not shared-cached");
  check(report.data.report.summary.views === 0 && Object.keys(report.data.report.summary.revenueByCurrency).length === 0, "Demo is not real traffic or revenue");
  check(!report.text.includes("elena@example.test") && !report.text.includes("Приватные заметки"), "Analytics omits customer records");
}
check((await request("author", "/api/analytics/report?days=999")).status === 400, "Invalid analytics period rejected");
check((await request("visitor", "/api/analytics", "POST", { pageId: original.id, kind: "paid", visitorId: "smoke-visitor" })).status === 400, "Client cannot inject payment events");
const admin = await request("author", "/api/admin/overview");
check(admin.status === 200 && admin.data.demo === true, "Explicit demo admin can open overview");
check(!admin.text.includes("elena@example.test") && !admin.text.includes("Неделя 1") && !admin.text.includes("anna-workbook-file"), "Admin projection omits private content and customer PII");
check(admin.headers.get("x-robots-tag")?.includes("noindex"), "Private endpoints deny indexing");
await signIn("other", "creator", "secondary");
check((await request("other", "/api/admin/overview")).status === 403, "Other creator cannot enter administration");
await signIn("buyer", "buyer");
check((await request("buyer", "/api/analytics/report")).status === 403, "Buyer cannot read creator analytics");
check((await request("buyer", "/api/admin/overview")).status === 403, "Buyer cannot read administration");
console.log(`Discovery/admin/analytics HTTP smoke passed: ${checks} checks. Local simulation only.`);

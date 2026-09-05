import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ baseURL }) => {
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(baseURL!).hostname);
});

async function mockOtp(page: Page, role: "buyer" | "creator") {
  await page.route("**/api/auth/otp", async route => {
    expect(route.request().postDataJSON()).toMatchObject({ email: "release@example.test", role });
    await route.fulfill({ json: { sent: true } });
  });
  await page.route("**/api/auth/verify", async route => {
    expect(route.request().postDataJSON()).toMatchObject({ email: "release@example.test", token: "123456", role });
    await route.fulfill({ json: { user: { id: "release-user", email: "release@example.test", name: "Release test", locale: "en", role, createdAt: new Date().toISOString() } } });
  });
}

async function signIn(page: Page) {
  await page.getByLabel("Email", { exact: true }).fill("release@example.test");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Code from your email").fill("123456");
  await page.getByRole("button", { name: "Verify and sign in" }).click();
}

test("RU/EN selection persists and creator intent reaches both OTP requests", async ({ page }) => {
  await mockOtp(page, "creator");
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("The next conversation");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByRole("button", { name: "Create your page", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveAccessibleName("Create your PAGER page");
  await signIn(page);
  await expect(page).toHaveURL(/\/dashboard$/);
});

for (const returnTo of ["javascript:window.__pagerInjected=true", "data:text/html,unsafe", "https://evil.example/path", "//evil.example/path", "/%2f%2fevil.example", "/safe/%2e%2e//evil.example", "%252f%252fevil.example", "/dashboard"]) {
  test(`buyer login rejects unsafe returnTo: ${returnTo}`, async ({ page }) => {
    await mockOtp(page, "buyer");
    await page.goto(`/login?lang=en&returnTo=${encodeURIComponent(returnTo)}`);
    await signIn(page);
    await expect(page).toHaveURL(/\/anna$/);
    expect(await page.evaluate(() => "__pagerInjected" in window)).toBe(false);
  });
}

test("buyer login preserves an internal path with query and fragment", async ({ page }) => {
  await mockOtp(page, "buyer");
  await page.goto(`/login?lang=en&returnTo=${encodeURIComponent("/terms?from=login#details")}`);
  await signIn(page);
  await expect(page).toHaveURL(/\/terms\?from=login#details$/);
});

test("booking exposes day and time selection without nested scrolling", async ({ page, baseURL }) => {
  const response = await page.request.post("/api/demo/session", { headers: { origin: baseURL! }, data: { role: "buyer", identity: "primary" } });
  expect(response.ok()).toBe(true);
  await page.goto("/anna");
  await expect(page.locator(".public-top")).toContainText("Елена");
  await page.locator(".public-profile .button-primary").click();
  const dialog = page.getByRole("dialog");
  const days = dialog.getByRole("tab");
  await expect(days.first()).toHaveAttribute("aria-selected", "true");
  expect(await days.count()).toBeGreaterThan(1);
  const firstSlot = dialog.getByRole("tabpanel").getByRole("button").first();
  await firstSlot.click();
  await expect(firstSlot).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.locator(".slot-selection")).toContainText("Выбрано:");
  await days.nth(1).click();
  await expect(days.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByRole("tabpanel")).toHaveCount(1);
  await expect(dialog.locator('[aria-pressed="true"]')).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Подтвердить время" })).toBeDisabled();
  expect(await dialog.locator(".slot-list").evaluate(el => getComputedStyle(el).overflowY)).toBe("visible");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("booking.png"), fullPage: true });
});

test("manifest icons load and the landing fits the viewport", async ({ page }) => {
  const response = await page.request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.icons).toHaveLength(3);
  for (const icon of manifest.icons) {
    const asset = await page.request.get(icon.src);
    expect(asset.ok()).toBe(true);
    expect(asset.headers()["content-type"]).toContain("image/png");
  }
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("landing.png"), fullPage: true });
});

test("creator JavaScript works inside an opaque sandbox and cannot read the parent", async ({ page, baseURL }) => {
  const headers = { origin: baseURL! };
  expect((await page.request.post("/api/demo/session", { headers, data: { role: "creator", identity: "secondary" } })).ok()).toBe(true);
  const dashboard = await (await page.request.get("/api/dashboard")).json();
  const draft = dashboard.page;
  draft.description = "A complete isolated creator page used to verify the public custom widget sandbox.";
  draft.blocks = [
    { id: "release-profile", type: "profile", width: "full", hidden: false, paid: false, teaser: "", pricing: { currency: "USD" }, data: { name: "Mikhail Orlov", profession: "Consultant", text: "A local browser fixture." } },
    { id: "release-form", type: "form", width: "full", hidden: false, paid: false, teaser: "", pricing: { currency: "USD" }, data: { title: "Send an enquiry" } },
  ];
  draft.blocks.push({ id: "release-widget", type: "custom_code", width: "full", hidden: false, paid: false, teaser: "", pricing: { currency: "USD" }, data: { title: "Sandbox proof", html: '<button id="proof">Ready</button><script>try { parent.document.body.dataset.pagerEscape="yes"; } catch { document.getElementById("proof").textContent="Isolated"; } document.getElementById("proof").onclick=()=>{document.getElementById("proof").textContent="Clicked"};</script>' } });
  expect((await page.request.put("/api/page", { headers, data: { page: draft } })).ok()).toBe(true);
  const publication = await page.request.post("/api/page/publish", { headers, data: {} });
  expect(publication.ok(), await publication.text()).toBe(true);
  await page.goto(`/${draft.slug}`);
  const frame = page.frameLocator('iframe[title="Sandbox proof"]');
  await expect(frame.getByRole("button", { name: "Isolated" })).toBeVisible();
  await frame.getByRole("button").click();
  await expect(frame.getByRole("button", { name: "Clicked" })).toBeVisible();
  expect(await page.locator("body").getAttribute("data-pager-escape")).toBeNull();
});

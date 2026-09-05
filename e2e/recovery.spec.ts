import { expect, test } from "@playwright/test";

test("missing pages offer localized recovery and preserve the language", async ({ page, baseURL }) => {
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(baseURL!).hostname);
  await page.context().addCookies([{ name: "pager_locale", value: "en", url: baseURL! }]);
  const response = await page.goto("/missing-pager-page-for-recovery-check");
  // A streamed Next response can use 200; the robots directive still excludes it.
  expect([200, 404]).toContain(response!.status());
  await expect(page.getByRole("heading", { name: "Page unavailable", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "My purchases", exact: true })).toHaveAttribute("href", "/purchases");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.getByRole("button", { name: "Русский", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Страница недоступна", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("link", { name: "На главную", exact: true }).click();
  await expect(page).toHaveURL(`${baseURL}/`);
});

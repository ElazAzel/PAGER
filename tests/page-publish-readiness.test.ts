import { describe, expect, it } from "vitest";
import { createDemoState } from "../src/lib/server/seed";
import { canPublishPage, pagePublishChecks } from "../src/lib/page-readiness";

describe("page publish readiness", () => {
  it("does not require a previous publication and accepts the seeded complete page", () => {
    const page = createDemoState().pages[0];
    page.publishedAt = null;
    expect(canPublishPage(page)).toBe(true);
  });

  it("identifies the content gaps that make publishing misleading", () => {
    const page = createDemoState().pages[0];
    page.title = "Short";
    page.description = "Too short";
    page.blocks = page.blocks.filter(block => block.type !== "profile" && block.type !== "booking" && block.type !== "form" && block.type !== "messenger");
    expect(pagePublishChecks(page)).toEqual([
      { key: "identity", ok: false },
      { key: "profile", ok: false },
      { key: "nextStep", ok: false },
    ]);
    expect(canPublishPage(page)).toBe(false);
  });

  it("lets a whole-page offer publish with a clear paid preview", () => {
    const page = createDemoState().pages[0];
    page.paid = true;
    page.teaser = "Доступ к рабочей библиотеке и новым материалам для клиентов.";
    page.blocks = page.blocks.map(block => ({ ...block, paid: true }));
    expect(canPublishPage(page)).toBe(true);
  });
});

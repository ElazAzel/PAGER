import { describe, expect, it } from "vitest";
import { DraftWriter, navigateAfterDraftSave, type DraftState } from "../src/app/ui/editor-draft";
import { applyAppearancePreset } from "../src/lib/appearance";
import { createDemoState } from "../src/lib/server/seed";
import { savePage, publishPage } from "../src/lib/server/pages";
import type { Page } from "../src/lib/types";

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

describe("serialized visual draft writer", () => {
  it("waits for pending appearance edits before leaving the editor for another client route", async () => {
    const state = createDemoState(); const gate = barrier(); let destination = "";
    const writer = new DraftWriter(state.pages[0], async page => { await gate.promise; return savePage(state, page.ownerId, page); }, () => {}, () => {});
    writer.edit(applyAppearancePreset(writer.page, "rose"));
    const leaving = navigateAfterDraftSave(writer, () => { destination = "/admin"; });
    expect(destination).toBe(""); gate.release();
    expect(await leaving).toBe(true); expect(destination).toBe("/admin");
    expect(state.pages[0].appearance?.theme).toBe("rose");
  });

  it("stays in the editor when navigation cannot save the draft", async () => {
    const state = createDemoState(); let navigated = false;
    const writer = new DraftWriter(state.pages[0], async () => { throw new Error("Offline"); }, () => {}, () => {});
    writer.edit(applyAppearancePreset(writer.page, "midnight"));
    expect(await navigateAfterDraftSave(writer, () => { navigated = true; })).toBe(false);
    expect(navigated).toBe(false); expect(writer.page.appearance?.theme).toBe("midnight");
  });
  it("keeps newer input visible and saves it with the returned revision during a slow autosave", async () => {
    const state = createDemoState(); const gate = barrier(); const sent: Page[] = []; const visible: Page[] = []; const statuses: DraftState[] = [];
    const writer = new DraftWriter(state.pages[0], async page => {
      sent.push(structuredClone(page)); if (sent.length === 1) await gate.promise;
      return savePage(state, page.ownerId, page);
    }, page => visible.push(structuredClone(page)), status => statuses.push(status));
    writer.edit(applyAppearancePreset(writer.page, "sage")); const saved = writer.flush();
    writer.edit(applyAppearancePreset(writer.page, "rose"));
    expect(writer.page.appearance?.theme).toBe("rose"); expect(writer.state.status).toBe("pending");
    gate.release(); expect(await saved).toBe(true);
    expect(sent.map(page => [page.appearance?.theme, page.revision])).toEqual([["sage", 1], ["rose", 2]]);
    expect(visible.slice(1).every(page => page.appearance?.theme === "rose")).toBe(true);
    expect(writer.page).toMatchObject({ appearance: { theme: "rose" }, revision: 3 });
    expect(state.pages[0].appearance?.theme).toBe("rose"); expect(writer.dirty).toBe(false);
    expect(statuses.at(-1)?.status).toBe("saved");
  });

  it("coalesces repeated publication clicks into one request, including while a save is pending", async () => {
    const state = createDemoState(); const gate = barrier(); let sends = 0;
    const writer = new DraftWriter(state.pages[0], async page => { await gate.promise; return savePage(state, page.ownerId, page); }, () => {}, () => {});
    writer.edit(applyAppearancePreset(writer.page, "sage"));
    const send = async (revision: number) => { sends += 1; return publishPage(state, writer.page.ownerId, revision); };
    const first = writer.publish(send); const second = writer.publish(send);
    gate.release(); const outcomes = await Promise.all([first, second]);
    expect(outcomes).toEqual([true, true]); expect(sends).toBe(1);
    expect(state.publishedPages[0].appearance?.theme).toBe("sage");
  });

  it("does not discard an edit made immediately after publishing a clean draft", async () => {
    const state = createDemoState(); const gate = barrier();
    const writer = new DraftWriter(state.pages[0], async page => savePage(state, page.ownerId, page), () => {}, () => {});
    const publication = writer.publish(async revision => { await gate.promise; return publishPage(state, writer.page.ownerId, revision); });
    writer.edit(applyAppearancePreset(writer.page, "rose"));
    gate.release(); expect(await publication).toBe(true); expect(await writer.flush()).toBe(true);
    expect(writer.page.appearance?.theme).toBe("rose");
    expect(state.pages[0].appearance?.theme).toBe("rose");
    expect(state.publishedPages[0].appearance?.theme).not.toBe("rose");
  });

  it("leaves edits made during publication in the next draft rather than publishing them accidentally", async () => {
    const state = createDemoState(); const gate = barrier(); const started = barrier();
    const writer = new DraftWriter(state.pages[0], async page => savePage(state, page.ownerId, page), () => {}, () => {});
    writer.edit(applyAppearancePreset(writer.page, "sage"));
    const publication = writer.publish(async revision => { started.release(); await gate.promise; return publishPage(state, writer.page.ownerId, revision); });
    await started.promise; writer.edit(applyAppearancePreset(writer.page, "midnight"));
    expect(writer.state.status).toBe("publishing"); gate.release();
    expect(await publication).toBe(true); expect(await writer.flush()).toBe(true);
    expect(state.publishedPages[0].appearance?.theme).toBe("sage");
    expect(state.pages[0].appearance?.theme).toBe("midnight"); expect(writer.dirty).toBe(false);
  });

  it("keeps conflicting input and refuses an automatic overwrite until an explicit replacement", async () => {
    const state = createDemoState(); let requests = 0;
    const writer = new DraftWriter(state.pages[0], async () => { requests += 1; throw Object.assign(new Error("Changed elsewhere"), { status: 409 }); }, () => {}, () => {});
    writer.edit(applyAppearancePreset(writer.page, "rose"));
    expect(await writer.flush()).toBe(false); expect(writer.state.status).toBe("conflict");
    writer.edit(applyAppearancePreset(writer.page, "midnight"));
    expect(await writer.flush()).toBe(false); expect(requests).toBe(1); expect(writer.page.appearance?.theme).toBe("midnight");
    writer.replace(state.pages[0]); expect(writer.dirty).toBe(false); expect(writer.state.status).toBe("saved");
  });

  it("retries a failed request with the latest input and clears a synchronously failed publication", async () => {
    const state = createDemoState(); let requests = 0;
    const writer = new DraftWriter(state.pages[0], async page => {
      requests += 1; if (requests === 1) throw new Error("Offline"); return savePage(state, page.ownerId, page);
    }, () => {}, () => {});
    writer.edit(applyAppearancePreset(writer.page, "sage"));
    expect(await writer.flush()).toBe(false); expect(writer.state.status).toBe("error");
    writer.edit(applyAppearancePreset(writer.page, "rose"));
    expect(await writer.flush()).toBe(true);
    expect(await writer.publish(() => { throw new Error("Offline"); })).toBe(false);
    expect(await writer.publish(async revision => publishPage(state, writer.page.ownerId, revision))).toBe(true);
    expect(state.publishedPages[0].appearance?.theme).toBe("rose");
  });
});

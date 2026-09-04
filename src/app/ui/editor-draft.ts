import type { Block, Page } from "@/lib/types";

export type DraftStatus = "saved" | "pending" | "saving" | "publishing" | "error" | "conflict";
export type DraftState = { status: DraftStatus; error?: string };

export function moveBlock(blocks: Block[], id: string, targetId: string): Block[] {
  const from = blocks.findIndex(block => block.id === id);
  const to = blocks.findIndex(block => block.id === targetId);
  if (from < 0 || to < 0 || from === to) return blocks;
  const result = [...blocks];
  result.splice(to, 0, result.splice(from, 1)[0]);
  return result;
}

/** One serialized writer; a response may update metadata, never newer local input. */
export class DraftWriter {
  page: Page;
  state: DraftState = { status: "saved" };
  private version = 0;
  private savedVersion = 0;
  private inFlight: Promise<boolean> | null = null;
  private publication: Promise<boolean> | null = null;
  constructor(page: Page, private save: (page: Page) => Promise<Page>, private onPage: (page: Page) => void, private onState: (state: DraftState) => void) {
    this.page = page;
  }
  get dirty() { return this.version !== this.savedVersion; }
  private status(state: DraftState) { this.state = state; this.onState(state); }
  edit(page: Page) {
    this.page = { ...page, revision: this.page.revision, updatedAt: this.page.updatedAt, publishedAt: this.page.publishedAt };
    this.version += 1;
    this.onPage(this.page);
    if (!["conflict", "publishing"].includes(this.state.status)) this.status({ status: "pending" });
  }
  replace(page: Page) {
    if (this.inFlight || this.publication) throw new Error("A save is still running");
    this.page = page; this.version += 1; this.savedVersion = this.version;
    this.onPage(page); this.status({ status: "saved" });
  }
  private accept(server: Page, sentVersion: number) {
    this.page = sentVersion === this.version ? server : { ...this.page, revision: server.revision, updatedAt: server.updatedAt, publishedAt: server.publishedAt };
    this.savedVersion = sentVersion;
    this.onPage(this.page);
  }
  private fail(error: unknown) {
    const conflict = error && typeof error === "object" && "status" in error && error.status === 409;
    this.status({ status: conflict ? "conflict" : "error", error: error instanceof Error ? error.message : "Save failed" });
  }
  flush(): Promise<boolean> {
    if (this.publication) return this.publication.then(ok => ok ? this.saveLatest() : false);
    return this.saveLatest();
  }
  private saveLatest(): Promise<boolean> {
    if (this.inFlight) return this.inFlight;
    if (this.state.status === "conflict") return Promise.resolve(false);
    if (!this.dirty) return Promise.resolve(true);
    const run = async () => {
      while (this.dirty) {
        const sentVersion = this.version;
        const snapshot = structuredClone(this.page);
        this.status({ status: "saving" });
        try { this.accept(await this.save(snapshot), sentVersion); }
        catch (error) { this.fail(error); return false; }
      }
      this.status({ status: "saved" });
      return true;
    };
    this.inFlight = run().finally(() => { this.inFlight = null; });
    return this.inFlight;
  }
  publish(send: (revision: number) => Promise<Page>): Promise<boolean> {
    if (this.publication) return this.publication;
    if (this.state.status === "conflict") return Promise.resolve(false);
    const run = async () => {
      // A clean draft can be published synchronously up to the network boundary.
      // After an awaited save, recheck edits made in the intervening microtask.
      while (this.dirty) if (!(await this.saveLatest())) return false;
      const sentVersion = this.version;
      const revision = this.page.revision;
      this.status({ status: "publishing" });
      try { this.accept(await send(revision), sentVersion); this.status({ status: this.dirty ? "pending" : "saved" }); return true; }
      catch (error) { this.fail(error); return false; }
    };
    // Acquire one lock for saving AND publishing. Clear it even if send throws
    // synchronously, then persist newer edits as a draft, not a publication.
    this.publication = run().finally(() => {
      this.publication = null;
      if (this.dirty && this.state.status === "pending") void this.flush();
    });
    return this.publication;
  }
}

/** Client-side routing does not fire beforeunload. All workspace exits share
 * this gate so a debounce timer cannot be discarded by an unmount. */
export async function navigateAfterDraftSave(writer: DraftWriter | null, navigate: () => void): Promise<boolean> {
  if (writer && !(await writer.flush())) return false;
  navigate(); return true;
}

import { mkdtemp, readFile, rm, writeFile, utimes } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileRepository } from "../src/lib/db/file-repository";
import { diffState } from "../src/lib/db/diff";
import { createDemoState } from "../src/lib/server/seed";

describe("durable transaction repository", () => {
  const directories: string[] = [];
  afterEach(async () => { vi.restoreAllMocks(); await Promise.all(directories.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
  it("fails closed on an orphan lock without deleting it or changing durable state", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "pager-core-")); directories.push(dir);
    const repo = new FileRepository(dir, createDemoState); await repo.read();
    const lockPath = path.join(dir, "transaction.lock"); const owner = JSON.stringify({ pid: 99999999, token: "crashed-owner" });
    await writeFile(lockPath, owner); await utimes(lockPath, new Date(0), new Date(0));
    let time = 1000; vi.spyOn(Date, "now").mockImplementation(() => time += 11000);
    await expect(repo.mutate(state => { state.pages[0].title = "WRONG"; })).rejects.toThrow("lock timeout");
    expect(await readFile(lockPath, "utf8")).toBe(owner);
    expect(JSON.parse(await readFile(path.join(dir, "state.json"), "utf8")).pages[0].title).not.toBe("WRONG");
  });
  it("retains integration extension metadata across unrelated saves", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "pager-core-")); directories.push(dir);
    const repo = new FileRepository(dir, createDemoState);
    await repo.mutate(state => state.integrations.push({ id: "extension", ownerId: "creator-anna", updatedAt: new Date().toISOString(), commerce: { nonce: "private-nonce", reservation: { status: "held", count: 1 } } } as import("../src/lib/types").Integration));
    await repo.mutate(state => { state.pages[0].title = "Unrelated save"; });
    expect((await repo.read()).integrations[0]).toMatchObject({ commerce: { nonce: "private-nonce", reservation: { status: "held", count: 1 } } });
  });
  it("serializes independent instances, rolls back failure, persists and detaches reads/results", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "pager-core-")); directories.push(dir);
    const a = new FileRepository(dir, createDemoState); const b = new FileRepository(dir, createDemoState);
    await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? a : b).mutate(state => { state.pages[0].revision += 1; })));
    const snapshot = await a.read(); expect(snapshot.pages[0].revision).toBe(13);
    snapshot.pages[0].title = "OUTSIDE MUTATION";
    await expect(a.mutate(state => { state.pages[0].title = "ROLLBACK"; throw new Error("abort"); })).rejects.toThrow("abort");
    const result = await a.mutate(state => state.pages[0]); result.title = "DETACHED RESULT";
    const persisted = await new FileRepository(dir, createDemoState).read();
    expect(persisted.pages[0].title).not.toMatch(/OUTSIDE|ROLLBACK|DETACHED/);
    expect(JSON.parse(await readFile(path.join(dir, "state.json"), "utf8")).pages[0].revision).toBe(13);
  });
  it("diff updates only changed rows and explicitly deleted known rows, never another tenant", () => {
    const before = createDemoState(); const after = structuredClone(before);
    after.pages[0].title = "Draft update";
    const changes = diffState(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ collection: "pages", operation: "upsert", id: "page-anna" });
    after.pages[0].ownerId = "creator-other";
    expect(() => diffState(before, after)).toThrow();
  });
});

import "server-only";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DatabaseState } from "../types";
import { assertStateShape, diffState } from "./diff";

export class FileRepository {
  constructor(private directory: string, private initialize: () => DatabaseState) {}
  private async locked<T>(fn: () => Promise<T>): Promise<T> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const lockPath = path.join(this.directory, "transaction.lock"); const started = Date.now(); let handle;
    while (!handle) {
      try { handle = await open(lockPath, "wx", 0o600); await handle.writeFile(JSON.stringify({ pid: process.pid, token: randomUUID() })); await handle.sync(); }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        // Windows can return EPERM while another process unlinks its released lock.
        if (code !== "EEXIST" && !(process.platform === "win32" && code === "EPERM")) throw error;
        // Never steal a lock based on its age: a slow transaction may still own it.
        // After a crash, stop all demo processes before manually removing this file.
        if (Date.now() - started > 20_000) throw new Error("Demo lock timeout; if the owner crashed, stop all demo processes before removing transaction.lock");
        await new Promise(resolve => setTimeout(resolve, 15 + Math.random() * 30));
      }
    }
    try { return await fn(); } finally { await handle.close(); await unlink(lockPath); }
  }
  private async load(): Promise<DatabaseState> {
    try { const state: unknown = JSON.parse(await readFile(path.join(this.directory, "state.json"), "utf8")); assertStateShape(state); return state; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; const state = this.initialize(); await this.persist(state); return state; }
  }
  private async persist(state: DatabaseState): Promise<void> {
    const temporary = path.join(this.directory, `.state-${randomUUID()}.tmp`); const handle = await open(temporary, "wx", 0o600);
    try { await handle.writeFile(JSON.stringify(state)); await handle.sync(); } finally { await handle.close(); }
    try {
      await rename(temporary, path.join(this.directory, "state.json"));
      // Directory fsync makes the rename durable on POSIX; Windows does not support it.
      if (process.platform !== "win32") { const dir = await open(this.directory, "r"); try { await dir.sync(); } finally { await dir.close(); } }
    } finally { await unlink(temporary).catch(error => { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }); }
  }
  async read(): Promise<DatabaseState> { return this.locked(async () => structuredClone(await this.load())); }
  async mutate<T>(fn: (state: DatabaseState) => T | Promise<T>): Promise<T> {
    return this.locked(async () => {
      const state = await this.load(); const previous = structuredClone(state);
      const result = await fn(state); assertStateShape(state); diffState(previous, state);
      const detachedResult = structuredClone(result); await this.persist(state); return detachedResult;
    });
  }
}

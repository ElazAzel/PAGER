import "server-only";
import postgres from "postgres";
import type { DatabaseState } from "../types";
import { assertStateShape, COLLECTIONS, diffState, TABLE_NAMES, type Collection, type StateRow } from "./diff";
import { emptyState } from "../server/seed";

const ADVISORY_KEY = "746392081205";
const columns: Partial<Record<Collection, string[]>> = { pages: ["ownerId", "slug"], publishedPages: ["ownerId", "slug"], items: ["ownerId", "pageId"], contacts: ["ownerId", "email"], opportunities: ["ownerId", "pageId", "contactId"], bookings: ["ownerId", "pageId", "contactId", "buyerId", "opportunityId"], orders: ["ownerId", "pageId", "contactId", "buyerId", "opportunityId"], subscriptions: ["ownerId", "pageId", "buyerId", "orderId"], entitlements: ["ownerId", "pageId", "buyerId", "orderId"], timeline: ["ownerId", "contactId"], integrations: ["ownerId"], analytics: ["ownerId", "pageId"], assets: ["ownerId", "pageId"], notifications: ["ownerId"] };
const snake = (field: string): string => field.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
export class PostgresRepository {
  private sql;
  constructor(url: string) { this.sql = postgres(url, { prepare: false, max: 8, idle_timeout: 20, connect_timeout: 10, onnotice: () => undefined }); }
  private async load(tx: postgres.TransactionSql): Promise<DatabaseState> {
    const state = emptyState();
    for (const key of COLLECTIONS) {
      const rows = await tx`select payload from ${tx(TABLE_NAMES[key])} order by id`;
      (state[key] as StateRow[]) = rows.map(row => row.payload as StateRow);
    }
    assertStateShape(state); return state;
  }
  async read(): Promise<DatabaseState> {
    return this.sql.begin(async tx => {
      await tx`select pg_advisory_xact_lock_shared(${ADVISORY_KEY}::bigint)`;
      return structuredClone(await this.load(tx));
    }) as Promise<DatabaseState>;
  }
  async mutate<T>(fn: (state: DatabaseState) => T | Promise<T>): Promise<T> {
    return this.sql.begin(async tx => {
      await tx`select pg_advisory_xact_lock(${ADVISORY_KEY}::bigint)`;
      await tx`set constraints all deferred`;
      const state = await this.load(tx); const before = structuredClone(state);
      const result = await fn(state); assertStateShape(state);
      for (const change of diffState(before, state)) {
        const previous = before[change.collection].find(row => row.id === change.id);
        if (change.operation === "delete") {
          // Only delete IDs observed in this locked snapshot, never truncate a tenant/table.
          const deleted = await tx`delete from ${tx(TABLE_NAMES[change.collection])} where id = ${change.id} and payload = ${tx.json(JSON.parse(JSON.stringify(previous)))} returning id`;
          if (deleted.length !== 1) throw new Error("Concurrent repository row modification");
          continue;
        }
        const row: Record<string, postgres.ParameterOrJSON<never>> = { id: change.id, payload: tx.json(JSON.parse(JSON.stringify(change.row))) };
        for (const field of columns[change.collection] ?? []) row[snake(field)] = ((change.row as unknown as Record<string, string>)[field] ?? null);
        const fields = Object.keys(row);
        if (!previous) await tx`insert into ${tx(TABLE_NAMES[change.collection])} ${tx(row, ...fields)}`;
        else {
          const changed = await tx`update ${tx(TABLE_NAMES[change.collection])} set ${tx(row, ...fields.filter(f => f !== "id"))} where id = ${change.id} and payload = ${tx.json(JSON.parse(JSON.stringify(previous)))} returning id`;
          if (changed.length !== 1) throw new Error("Concurrent repository row modification");
        }
      }
      return structuredClone(result);
    }) as Promise<T>;
  }
  async close(): Promise<void> { await this.sql.end({ timeout: 5 }); }
}

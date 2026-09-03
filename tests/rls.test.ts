import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Executes the production SQL. Auth roles/function are a local harness, not Supabase Auth.
const creatorA = "11111111-1111-4111-8111-111111111111";
const creatorB = "22222222-2222-4222-8222-222222222222";
const buyerA = "33333333-3333-4333-8333-333333333333";
const buyerB = "44444444-4444-4444-8444-444444444444";
const tables = ["users", "pages", "published_pages", "items", "contacts", "opportunities", "bookings", "orders", "subscriptions", "entitlements", "timeline", "integrations", "analytics", "assets", "webhooks", "notifications"];
let db: PGlite;

async function insert(table: string, fields: Record<string, unknown>, payload: Record<string, unknown>) {
  const names = Object.keys(fields);
  await db.query(`INSERT INTO public.pager_${table} (${names.join(",")},payload) VALUES (${names.map((_, i) => `$${i + 1}`).join(",")},$${names.length + 1}::jsonb)`, [...Object.values(fields), JSON.stringify(payload)]);
}
async function actor<T>(role: "anon" | "authenticated", id: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`SET ROLE ${role}`);
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id ?? ""]);
  try { return await fn(); }
  finally { await db.exec("RESET ROLE; RESET request.jwt.claim.sub"); }
}
async function ids(table: string) {
  return (await db.query<{ id: string }>(`SELECT id FROM public.pager_${table} ORDER BY id`)).rows.map(row => row.id);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint);
  `);
  await db.exec(await readFile("supabase/migrations/202609020001_core.sql", "utf8"));
  for (const id of [creatorA, creatorB, buyerA, buyerB]) await insert("users", { id }, { id });
  for (const [tag, ownerId, buyerId] of [["a", creatorA, buyerA], ["b", creatorB, buyerB]]) {
    const pageId = `page-${tag}`, contactId = `contact-${tag}`, opportunityId = `opportunity-${tag}`, orderId = `order-${tag}`;
    await insert("pages", { id: pageId, owner_id: ownerId, slug: tag }, { id: pageId, ownerId, slug: tag, blocks: [{ data: { text: `PRIVATE-${tag}` } }] });
    await insert("published_pages", { id: pageId, owner_id: ownerId, slug: tag }, { id: pageId, ownerId, slug: tag, paid: true, blocks: [{ data: { text: `PAID-${tag}` } }] });
    await insert("contacts", { id: contactId, owner_id: ownerId, email: `${tag}@example.test` }, { id: contactId, ownerId, email: `${tag}@example.test` });
    await insert("opportunities", { id: opportunityId, owner_id: ownerId, page_id: pageId, contact_id: contactId }, { id: opportunityId, ownerId, pageId, contactId });
    await insert("orders", { id: orderId, owner_id: ownerId, page_id: pageId, contact_id: contactId, buyer_id: buyerId, opportunity_id: opportunityId }, { id: orderId, ownerId, pageId, contactId, buyerId, opportunityId });
    await insert("entitlements", { id: `grant-${tag}`, owner_id: ownerId, page_id: pageId, buyer_id: buyerId, order_id: orderId }, { id: `grant-${tag}`, ownerId, pageId, buyerId, orderId });
    await insert("integrations", { id: `integration-${tag}`, owner_id: ownerId }, { id: `integration-${tag}`, ownerId, calApiKeyEncrypted: "PRIVATE-CREDENTIAL" });
  }
}, 60_000);
afterAll(async () => { await db?.close(); });

describe("production migration and RLS in PostgreSQL WASM", () => {
  it("forces row security on every PAGER table and creates only a private bucket", async () => {
    const result = await db.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relname LIKE 'pager_%'");
    expect(result.rows).toHaveLength(16);
    expect(result.rows.every(row => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    expect((await db.query("SELECT id, public, file_size_limit FROM storage.buckets")).rows).toEqual([{ id: "pager-private", public: false, file_size_limit: 10485760 }]);
  });
  it("author A can read only their own drafts, published payloads, contacts and orders", async () => {
    await actor("authenticated", creatorA, async () => {
      expect(await ids("pages")).toEqual(["page-a"]);
      expect(await ids("published_pages")).toEqual(["page-a"]);
      expect(await ids("contacts")).toEqual(["contact-a"]);
      expect(await ids("orders")).toEqual(["order-a"]);
      await expect(ids("integrations")).rejects.toThrow(/permission denied/);
    });
    await actor("authenticated", creatorB, async () => {
      expect(await ids("pages")).toEqual(["page-b"]);
      expect(await ids("contacts")).toEqual(["contact-b"]);
      expect(await ids("orders")).toEqual(["order-b"]);
    });
  });
  it("buyers see their purchases, but even a page buyer cannot read raw paid payloads", async () => {
    for (const [buyerId, tag] of [[buyerA, "a"], [buyerB, "b"]]) await actor("authenticated", buyerId, async () => {
      expect(await ids("orders")).toEqual([`order-${tag}`]);
      expect(await ids("entitlements")).toEqual([`grant-${tag}`]);
      expect(await ids("users")).toEqual([buyerId]);
      for (const table of ["pages", "published_pages", "contacts", "items", "opportunities", "assets"]) expect(await ids(table)).toEqual([]);
    });
  });
  it("anonymous SQL cannot bypass the server's public projection", async () => {
    await actor("anon", null, async () => {
      for (const table of tables) await expect(ids(table)).rejects.toThrow(/permission denied/);
    });
  });
  it("authenticated roles cannot forge grants, prices, stock, orders or identity", async () => {
    await actor("authenticated", creatorA, async () => {
      for (const table of tables) {
        await expect(db.query(`DELETE FROM public.pager_${table}`)).rejects.toThrow(/permission denied/);
        await expect(db.query(`UPDATE public.pager_${table} SET payload = '{}'::jsonb`)).rejects.toThrow(/permission denied/);
      }
      await expect(db.query("INSERT INTO public.pager_entitlements (id,owner_id,page_id,buyer_id,order_id,payload) VALUES ('forged',$1,'page-a',$2,'order-a','{}')", [creatorA, buyerB])).rejects.toThrow(/permission denied/);
    });
  });
  it("rejects mismatched payload ownership and cross-tenant foreign keys even on the server connection", async () => {
    await expect(insert("contacts", { id: "forged-contact", owner_id: creatorA, email: "x@example.test" }, { id: "forged-contact", ownerId: creatorB, email: "x@example.test" })).rejects.toThrow(/check constraint/);
    await expect(insert("opportunities", { id: "forged-opportunity", owner_id: creatorA, page_id: "page-a", contact_id: "contact-b" }, { id: "forged-opportunity", ownerId: creatorA, pageId: "page-a", contactId: "contact-b" })).rejects.toThrow(/foreign key constraint/);
    await expect(insert("items", { id: "over-reserved", owner_id: creatorA, page_id: "page-a" }, { id: "over-reserved", ownerId: creatorA, pageId: "page-a", stock: 1, reserved: 2 })).rejects.toThrow(/check constraint/);
  });
});

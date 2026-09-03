import "server-only";
import { randomUUID } from "node:crypto";
import type { Contact, DatabaseState, Opportunity, TimelineEvent } from "../types";
import { ApiError } from "./http";
import { emailSchema } from "./validation";

export function upsertContact(state: DatabaseState, ownerId: string, email: string, name: string): Contact {
  if (!state.users.some(u => u.id === ownerId && u.role === "creator")) throw new ApiError(400, "Invalid contact owner");
  const normalized = emailSchema.parse(email); const now = new Date().toISOString();
  const existing = state.contacts.find(c => c.ownerId === ownerId && c.email.toLowerCase() === normalized);
  if (existing) { if (name.trim()) existing.name = name.trim().slice(0, 200); existing.updatedAt = now; return existing; }
  const contact: Contact = { id: randomUUID(), ownerId, email: normalized, name: name.trim().slice(0, 200), notes: "", createdAt: now, updatedAt: now };
  state.contacts.push(contact); return contact;
}
export function createOpportunity(state: DatabaseState, input: Pick<Opportunity, "ownerId" | "pageId" | "contactId" | "source"> & Partial<Pick<Opportunity, "message" | "test" | "id">> & { blockId?: string }): Opportunity & { blockId?: string } {
  if (!state.contacts.some(c => c.id === input.contactId && c.ownerId === input.ownerId) || !state.pages.some(p => p.id === input.pageId && p.ownerId === input.ownerId)) throw new ApiError(403, "Opportunity tenant mismatch");
  if (input.id) {
    const existing = state.opportunities.find(o => o.id === input.id);
    if (existing) { if (existing.ownerId !== input.ownerId || existing.pageId !== input.pageId || existing.contactId !== input.contactId) throw new ApiError(409, "Opportunity identity conflict"); return existing; }
  }
  const opportunity: Opportunity & { blockId?: string } = { id: input.id ?? randomUUID(), ownerId: input.ownerId, pageId: input.pageId, contactId: input.contactId, source: input.source, message: (input.message ?? "").slice(0, 5000), test: input.test ?? false, createdAt: new Date().toISOString(), convertedAt: null, status: "new", ...(input.blockId ? { blockId: input.blockId } : {}) };
  state.opportunities.push(opportunity); return opportunity;
}
export function addTimeline(state: DatabaseState, input: Omit<TimelineEvent, "id" | "createdAt">): TimelineEvent {
  if (!state.contacts.some(c => c.id === input.contactId && c.ownerId === input.ownerId)) throw new ApiError(403, "Timeline tenant mismatch");
  const existing = input.referenceId ? state.timeline.find(e => e.ownerId === input.ownerId && e.contactId === input.contactId && e.kind === input.kind && e.referenceId === input.referenceId) : undefined;
  if (existing) return existing;
  const event = { ...input, id: randomUUID(), createdAt: new Date().toISOString() }; state.timeline.push(event); return event;
}
export function markConverted(state: DatabaseState, opportunityId: string, status: "booked" | "paid"): void {
  const opportunity = state.opportunities.find(o => o.id === opportunityId); if (!opportunity) throw new ApiError(404, "Opportunity not found");
  opportunity.convertedAt ??= new Date().toISOString();
  if (opportunity.status !== "paid") opportunity.status = status;
}
export function contactsCsv(contacts: Contact[]): string {
  const cell = (input: string): string => { const value = /^[\s]*[=+\-@\t\r]/.test(input) ? `'${input}` : input; return `"${value.replaceAll('"', '""')}"`; };
  return "\uFEFF" + [["name", "email", "notes", "createdAt"], ...contacts.map(c => [c.name, c.email, c.notes, c.createdAt])].map(row => row.map(cell).join(",")).join("\r\n");
}

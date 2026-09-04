import "server-only";
import { randomUUID } from "node:crypto";
import type { DatabaseState, User } from "../types";
import { ApiError } from "./http";
import { emailSchema } from "./validation";
import { getCapabilities } from "./capabilities";
import { starterPage } from "./seed";

export const PILOT_CREATOR_LIMIT = 10;
function configuredInvites(): Set<string> {
  return new Set((process.env.PAGER_CREATOR_INVITE_EMAILS ?? "").split(",").map(value => value.trim().toLowerCase()).filter(value => emailSchema.safeParse(value).success));
}
export function isInvited(state: DatabaseState, email: string, now = new Date()): boolean {
  const normalized = email.trim().toLowerCase();
  const invite = state.creatorInvites.find(entry => entry.email === normalized);
  // A persisted revocation takes precedence over an environment bootstrap invite.
  if (invite) return !invite.revokedAt && Date.parse(invite.expiresAt) > now.getTime();
  return configuredInvites().has(normalized);
}
export function createCreatorInvite(state: DatabaseState, actorId: string, email: string, now = new Date()) {
  const normalized = emailSchema.parse(email);
  const existing = state.creatorInvites.find(invite => invite.email === normalized);
  if (existing?.acceptedBy) throw new ApiError(409, "Invitation already accepted / Приглашение уже принято");
  const invite = { id: existing?.id ?? randomUUID(), email: normalized, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 14 * 86400_000).toISOString(), createdBy: actorId };
  if (existing) state.creatorInvites[state.creatorInvites.indexOf(existing)] = invite; else state.creatorInvites.push(invite);
  return structuredClone(invite);
}
/** Caller must supply a Supabase-verified email; never a client-supplied identity. */
export function enrollVerifiedUser(state: DatabaseState, verified: Pick<User, "id" | "email" | "name" | "locale">, requestedRole: "creator" | "buyer", now = new Date()): User {
  let user = state.users.find(entry => entry.id === verified.id);
  const pilot = getCapabilities().pilot;
  const mayCreate = pilot ? isInvited(state, verified.email, now) : requestedRole === "creator";
  if (!user) {
    user = { ...verified, email: emailSchema.parse(verified.email), role: "buyer", createdAt: now.toISOString() };
    state.users.push(user);
  } else user.email = emailSchema.parse(verified.email);
  if (user.role !== "creator" && mayCreate) {
    if (pilot && state.users.filter(entry => entry.role === "creator").length >= PILOT_CREATOR_LIMIT) throw new ApiError(409, "The ten creator places are filled / Все 10 мест авторов заняты");
    user.role = "creator";
    const invite = state.creatorInvites.find(entry => entry.email === user.email);
    if (invite) { invite.acceptedBy = user.id; invite.acceptedAt = now.toISOString(); }
    if (!state.pages.some(page => page.ownerId === user.id)) state.pages.push(starterPage(user));
  }
  return user;
}

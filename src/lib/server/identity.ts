import "server-only";
import type { DatabaseState, User } from "../types";
import { claimUnassignedBookings } from "../integrations/booking-claims";

// Call only after Supabase getUser() confirms email ownership, never with a
// caller-supplied email. An assigned buyer is immutable across reconciliation.
export function reconcileVerifiedBookings(state: DatabaseState, verified: User): void {
  // Supabase auth uses real data only. Share the integration helper's tenant,
  // immutable-buyer, self-booking and mode checks rather than duplicating them.
  claimUnassignedBookings(state, verified, false);
}

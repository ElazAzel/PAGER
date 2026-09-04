import type { AccessPrice, Booking } from "./types";

export type BookingApiResult = {
  booking?: Booking;
  orderId?: string;
  paymentError?: string;
  bookingUrl?: string;
};

export type ConfirmedBookingResult = {
  booking: Booking;
  orderId?: string;
  paymentError?: string;
  bookingUrl?: string;
};

export type AccessOfferMode = "one_time" | "monthly";
export type AccessOffer = { mode: AccessOfferMode; amount: number; currency: string };

export function normalizeBookingResult(result: BookingApiResult): ConfirmedBookingResult | null {
  if (!result.booking) return null;
  return {
    booking: result.booking,
    ...(result.orderId ? { orderId: result.orderId } : {}),
    ...(result.paymentError ? { paymentError: result.paymentError } : {}),
    ...(result.bookingUrl ? { bookingUrl: result.bookingUrl } : {}),
  };
}

export function accessOfferOptions(pricing: AccessPrice): AccessOffer[] {
  return [
    ...(pricing.oneTime ? [{ mode: "one_time" as const, amount: pricing.oneTime, currency: pricing.currency }] : []),
    ...(pricing.monthly ? [{ mode: "monthly" as const, amount: pricing.monthly, currency: pricing.currency }] : []),
  ];
}

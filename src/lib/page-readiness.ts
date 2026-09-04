import type { Page } from "./types";

export type PagePublishCheckKey = "identity" | "profile" | "nextStep";
export type PagePublishCheck = { key: PagePublishCheckKey; ok: boolean };

export function pagePublishChecks(page: Page): PagePublishCheck[] {
  const visible = page.blocks.filter(block => !block.hidden && !block.archived && !block.paid);
  const profile = visible.find(block => block.type === "profile");
  return [
    { key: "identity", ok: page.title.trim().length >= 10 && page.description.trim().length >= 50 },
    { key: "profile", ok: page.paid ? Boolean(page.teaser.trim()) : Boolean(profile?.data.profession?.trim() && (profile.data.text?.trim() || profile.data.html?.trim())) },
    { key: "nextStep", ok: page.paid ? page.teaser.trim().length >= 30 : visible.some(block => block.type === "booking" || block.type === "form" || block.type === "messenger") },
  ];
}

export function canPublishPage(page: Page): boolean {
  return pagePublishChecks(page).every(check => check.ok);
}

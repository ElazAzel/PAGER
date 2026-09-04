import type { CSSProperties } from "react";
import type { Page } from "./types";

// Only finite design tokens are persisted. Never accept CSS, URLs or HTML here:
// this allowlist is shared by the editor, validation and public projections.
export const APPEARANCE_OPTIONS = {
  theme: ["paper", "studio", "sage", "midnight", "rose"],
  background: ["solid", "gradient", "mesh"],
  pattern: ["none", "dots", "grid"],
  font: ["editorial", "modern", "rounded", "mono"],
  radius: ["sharp", "soft", "round"],
  spacing: ["compact", "comfortable", "airy"],
  surface: ["solid", "outline", "glass"],
  shadow: ["none", "soft", "deep"],
  button: ["solid", "outline", "pill"],
  entrance: ["none", "fade", "rise", "scale"],
  hover: ["none", "lift", "glow"],
  speed: ["slow", "normal", "fast"],
} as const;

export type PageAppearance = { -readonly [K in keyof typeof APPEARANCE_OPTIONS]: (typeof APPEARANCE_OPTIONS)[K][number] };
export type BlockAppearance = {
  entrance?: "inherit" | PageAppearance["entrance"];
  hover?: "inherit" | PageAppearance["hover"];
};
export const DEFAULT_APPEARANCE: Readonly<PageAppearance> = Object.freeze({
  theme: "paper", background: "solid", pattern: "none", font: "editorial",
  radius: "soft", spacing: "comfortable", surface: "solid", shadow: "soft",
  button: "solid", entrance: "none", hover: "none", speed: "normal",
});

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function choice<T extends readonly string[]>(value: unknown, values: T, fallback: T[number]): T[number] {
  return typeof value === "string" && values.includes(value) ? value as T[number] : fallback;
}
export function appearanceOf(value?: Partial<PageAppearance> | null): PageAppearance {
  const input = record(value);
  return Object.fromEntries(Object.entries(APPEARANCE_OPTIONS).map(([key, options]) => [
    key, choice(input[key], options, DEFAULT_APPEARANCE[key as keyof PageAppearance]),
  ])) as PageAppearance;
}
export function blockAppearanceOf(value?: BlockAppearance | null): BlockAppearance {
  const input = record(value); const result: BlockAppearance = {};
  if (input.entrance !== undefined) result.entrance = choice(input.entrance, ["inherit", ...APPEARANCE_OPTIONS.entrance] as const, "inherit");
  if (input.hover !== undefined) result.hover = choice(input.hover, ["inherit", ...APPEARANCE_OPTIONS.hover] as const, "inherit");
  return result;
}

type AppearancePreset = {
  id: PageAppearance["theme"];
  name: { ru: string; en: string };
  description: { ru: string; en: string };
  accent: string;
  appearance: PageAppearance;
};
export const APPEARANCE_PRESETS: readonly AppearancePreset[] = [
  { id: "paper", name: { ru: "Бумага", en: "Paper" }, description: { ru: "Тёплая редакционная классика", en: "Warm editorial essentials" }, accent: "#c16344", appearance: { ...DEFAULT_APPEARANCE } },
  { id: "studio", name: { ru: "Студия", en: "Studio" }, description: { ru: "Чёткие линии и лёгкое появление", en: "Clean lines and a gentle fade" }, accent: "#335bb5", appearance: { ...DEFAULT_APPEARANCE, theme: "studio", font: "modern", radius: "sharp", surface: "outline", shadow: "none", entrance: "fade", hover: "lift" } },
  { id: "sage", name: { ru: "Шалфей", en: "Sage" }, description: { ru: "Спокойные цвета и мягкие формы", en: "Calm colors and soft shapes" }, accent: "#357158", appearance: { ...DEFAULT_APPEARANCE, theme: "sage", font: "rounded", radius: "round", spacing: "airy", button: "pill", entrance: "rise", hover: "lift" } },
  { id: "midnight", name: { ru: "Полночь", en: "Midnight" }, description: { ru: "Тёмный фон и полупрозрачные карточки", en: "Dark canvas and translucent cards" }, accent: "#c1cbfc", appearance: { ...DEFAULT_APPEARANCE, theme: "midnight", background: "mesh", font: "modern", surface: "glass", shadow: "deep", entrance: "scale", hover: "glow" } },
  { id: "rose", name: { ru: "Роза", en: "Rose" }, description: { ru: "Пудровые оттенки и выразительный текст", en: "Soft blush and expressive type" }, accent: "#a04968", appearance: { ...DEFAULT_APPEARANCE, theme: "rose", background: "gradient", radius: "round", button: "outline", entrance: "fade", hover: "lift", speed: "slow" } },
];
export function applyAppearancePreset(page: Page, id: PageAppearance["theme"]): Page {
  const preset = APPEARANCE_PRESETS.find(p => p.id === id) ?? APPEARANCE_PRESETS[0];
  return { ...page, accent: preset.accent, appearance: { ...preset.appearance } };
}
export function appearanceAttributes(value?: Partial<PageAppearance> | null): Record<string, string> {
  return Object.fromEntries(Object.entries(appearanceOf(value)).map(([key, token]) => [`data-page-${key}`, token]));
}
export function shouldAnimateAppearance(platformMotion: string | undefined, systemReducedMotion: boolean): boolean {
  // Wait for the persisted preference: a reduced-motion visitor must not get
  // a brief entrance animation while the browser settings are hydrating.
  return platformMotion === "standard" && !systemReducedMotion;
}
export function blockEffectAttributes(page?: Partial<PageAppearance> | null, block?: BlockAppearance | null): { "data-entrance": PageAppearance["entrance"]; "data-hover": PageAppearance["hover"] } {
  const defaults = appearanceOf(page); const override = blockAppearanceOf(block);
  return {
    "data-entrance": !override.entrance || override.entrance === "inherit" ? defaults.entrance : override.entrance,
    "data-hover": !override.hover || override.hover === "inherit" ? defaults.hover : override.hover,
  };
}

const palettes = {
  paper: { paper: "#f3f0e9", surface: "#fbfaf7", soft: "#ebe8e0", ink: "#1c2923", muted: "#626860", line: "#d4d8ce", feature: "#314238" },
  studio: { paper: "#eef2f8", surface: "#ffffff", soft: "#e4ebf5", ink: "#18283c", muted: "#546478", line: "#d6ddeb", feature: "#233a59" },
  sage: { paper: "#e9efe7", surface: "#f5f8f2", soft: "#dee8da", ink: "#203c31", muted: "#54695a", line: "#c8d6c3", feature: "#233f33" },
  midnight: { paper: "#121b26", surface: "#1d2938", soft: "#26374a", ink: "#edf2f9", muted: "#b2c0d0", line: "#3e5267", feature: "#2b3c52" },
  rose: { paper: "#f6eeef", surface: "#fff9f9", soft: "#efdee4", ink: "#452b37", muted: "#785866", line: "#e4cdd6", feature: "#4d3140" },
} as const;
function channels(hex: string): number[] { return [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16)); }
function alpha(hex: string, opacity: number): string { return `rgba(${channels(hex).join(", ")}, ${opacity})`; }
function luminance(hex: string): number {
  const rgb = channels(hex).map(n => { const v = n / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a: string, b: string): number {
  const first = luminance(a); const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
const fonts = {
  editorial: { heading: 'Georgia, "Times New Roman", serif', body: '"Avenir Next", "Segoe UI", sans-serif' },
  modern: { heading: '"Avenir Next", "Segoe UI", sans-serif', body: '"Avenir Next", "Segoe UI", sans-serif' },
  rounded: { heading: 'ui-rounded, "Trebuchet MS", "Segoe UI", sans-serif', body: '"Trebuchet MS", "Segoe UI", sans-serif' },
  mono: { heading: '"SFMono-Regular", Consolas, "Liberation Mono", monospace', body: '"SFMono-Regular", Consolas, "Liberation Mono", monospace' },
} as const;
export function appearanceVariables(value?: Partial<PageAppearance> | null, accent?: string): CSSProperties & Record<string, string | number> {
  const a = appearanceOf(value); const palette = palettes[a.theme];
  const color = typeof accent === "string" && /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#c16344";
  const onAccent = contrast(color, "#111827") >= contrast(color, "#ffffff") ? "#111827" : "#ffffff";
  const link = contrast(color, palette.surface) >= 4.5 ? color : palette.ink;
  const shadow = { none: "none", soft: `0 2px 8px ${alpha("#101d17", 0.06)}, 0 1px 0 ${palette.line}`, deep: `0 12px 28px ${alpha("#050c12", a.theme === "midnight" ? 0.28 : 0.12)}` }[a.shadow];
  const background = a.background === "gradient"
    ? `linear-gradient(145deg, ${palette.paper} 12%, ${palette.soft} 100%)`
    : a.background === "mesh"
      ? `radial-gradient(ellipse at 8% 8%, ${alpha(color, 0.12)}, transparent 45%), radial-gradient(ellipse at 95% 75%, ${palette.soft}, transparent 50%), ${palette.paper}`
      : palette.paper;
  return {
    "--paper": palette.paper, "--surface": palette.surface, "--surface-soft": palette.soft,
    "--ink": palette.ink, "--muted": palette.muted, "--faint": palette.muted, "--line": palette.line,
    "--blue": color, "--blue-strong": link, "--blue-soft": palette.soft, "--green": a.theme === "midnight" ? "#a6d9b6" : "#2f6548",
    "--danger": a.theme === "midnight" ? "#ffb4aa" : "#a12a20", "--canvas": palette.paper, "--shadow": shadow,
    "--page-accent": color, "--appearance-on-accent": onAccent, "--appearance-link": link,
    "--appearance-heading-font": fonts[a.font].heading, "--appearance-body-font": fonts[a.font].body,
    "--appearance-radius": { sharp: "4px", soft: "18px", round: "28px" }[a.radius],
    "--appearance-button-radius": a.button === "pill" ? "999px" : { sharp: "4px", soft: "12px", round: "18px" }[a.radius],
    "--appearance-gap": { compact: "10px", comfortable: "16px", airy: "24px" }[a.spacing],
    "--appearance-padding": { compact: "16px", comfortable: "22px", airy: "28px" }[a.spacing],
    "--appearance-shadow": shadow, "--appearance-background": background,
    "--appearance-card": a.surface === "glass" ? alpha(palette.surface, 0.84) : palette.surface,
    "--appearance-pattern-color": alpha(palette.ink, 0.07),
    "--appearance-feature": palette.feature, "--appearance-feature-ink": "#fbfaf7", "--appearance-feature-muted": "#d6dfda",
    "--appearance-accent-wash": alpha(color, 0.10), "--appearance-accent-glow": alpha(color, 0.25),
    "--appearance-duration": { slow: "680ms", normal: "440ms", fast: "240ms" }[a.speed],
  };
}

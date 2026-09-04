import "server-only";
import { z } from "zod";
import { BLOCK_TYPES } from "../types";
import { APPEARANCE_OPTIONS, DEFAULT_APPEARANCE } from "../appearance";
export const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const currencySchema = z.enum(["USD", "EUR", "GBP"]);
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const moneySchema = z.number().int().min(0).max(99_999_999);
const short = z.string().max(500);
export const pricingSchema = z.object({ currency: currencySchema, oneTime: moneySchema.positive().optional(), monthly: moneySchema.positive().optional() }).strict();
export const appearanceSchema = z.object({
  theme: z.enum(APPEARANCE_OPTIONS.theme).default(DEFAULT_APPEARANCE.theme),
  background: z.enum(APPEARANCE_OPTIONS.background).default(DEFAULT_APPEARANCE.background),
  pattern: z.enum(APPEARANCE_OPTIONS.pattern).default(DEFAULT_APPEARANCE.pattern),
  font: z.enum(APPEARANCE_OPTIONS.font).default(DEFAULT_APPEARANCE.font),
  radius: z.enum(APPEARANCE_OPTIONS.radius).default(DEFAULT_APPEARANCE.radius),
  spacing: z.enum(APPEARANCE_OPTIONS.spacing).default(DEFAULT_APPEARANCE.spacing),
  surface: z.enum(APPEARANCE_OPTIONS.surface).default(DEFAULT_APPEARANCE.surface),
  shadow: z.enum(APPEARANCE_OPTIONS.shadow).default(DEFAULT_APPEARANCE.shadow),
  button: z.enum(APPEARANCE_OPTIONS.button).default(DEFAULT_APPEARANCE.button),
  entrance: z.enum(APPEARANCE_OPTIONS.entrance).default(DEFAULT_APPEARANCE.entrance),
  hover: z.enum(APPEARANCE_OPTIONS.hover).default(DEFAULT_APPEARANCE.hover),
  speed: z.enum(APPEARANCE_OPTIONS.speed).default(DEFAULT_APPEARANCE.speed),
}).strict();
export const blockAppearanceSchema = z.object({
  entrance: z.enum(["inherit", ...APPEARANCE_OPTIONS.entrance]).optional(),
  hover: z.enum(["inherit", ...APPEARANCE_OPTIONS.hover]).optional(),
}).strict();
export const blockDataSchema = z.object({
  title: short.optional(), text: z.string().max(100_000).optional(), subtitle: short.optional(), url: z.string().max(2048).optional(), image: z.string().max(2048).optional(), name: short.optional(), label: short.optional(), alt: short.optional(), beforeAlt: short.optional(), afterAlt: short.optional(),
  items: z.array(z.object({ id: idSchema.optional(), title: short.optional(), text: z.string().max(20_000).optional(), url: z.string().max(2048).optional(), image: z.string().max(2048).optional(), icon: z.string().max(2048).optional(), alt: short.optional() }).strict()).max(100).optional(),
  itemIds: z.array(idSchema).max(100).optional(), beforeImage: z.string().max(2048).optional(), afterImage: z.string().max(2048).optional(), endsAt: z.string().datetime({ offset: true }).optional(), code: z.string().max(100_000).optional(),
  address: short.optional(), html: z.string().max(100_000).optional(), calLink: z.string().max(2048).optional(), eventTypeId: z.number().int().positive().optional(), fileId: idSchema.optional(),
  price: moneySchema.optional(), capacity: z.number().int().min(0).max(1_000_000).optional(), location: short.optional(), category: short.optional(), avatar: z.string().max(2048).optional(), profession: short.optional(),
}).strict();
export const blockSchema = z.object({ id: idSchema, type: z.enum(BLOCK_TYPES), width: z.enum(["half", "full"]), hidden: z.boolean(), archived: z.boolean().optional(), paid: z.boolean(), teaser: z.string().max(2000), pricing: pricingSchema, data: blockDataSchema, appearance: blockAppearanceSchema.optional() }).strict();
export const pageSchema = z.object({ id: idSchema, ownerId: idSchema, slug: z.string().min(2).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), title: z.string().min(1).max(200), description: z.string().max(2000), locale: z.enum(["ru", "en"]), accent: z.string().regex(/^#[0-9a-fA-F]{6}$/), appearance: appearanceSchema.optional(), blocks: z.array(blockSchema).max(100), paid: z.boolean(), teaser: z.string().max(2000), pricing: pricingSchema, publishedAt: z.string().datetime({ offset: true }).nullable(), updatedAt: z.string().datetime({ offset: true }), revision: z.number().int().positive(), moderation: z.object({ status: z.enum(["active", "blocked"]), reason: z.string().max(2000), updatedAt: z.string(), version: z.number().int().nonnegative() }).optional(), slugAliases: z.array(z.string().max(64)).max(1000).optional(), firstPublishedAt: z.string().datetime({ offset: true }).optional() }).strict();
export const itemSchema = z.object({ id: idSchema, ownerId: idSchema, pageId: idSchema, title: z.string().min(1).max(200), description: z.string().max(20_000), kind: z.enum(["service", "digital", "physical", "ticket"]), price: moneySchema.positive(), currency: currencySchema, image: z.string().max(2048).optional(), category: short.optional(), stock: z.number().int().min(0).max(1_000_000).nullable(), reserved: z.number().int().min(0), fileId: idSchema.optional(), calLink: z.string().max(2048).optional(), eventTypeId: z.number().int().positive().optional(), shipping: z.array(z.object({ country: z.string().regex(/^[A-Z]{2}$/), amount: moneySchema }).strict()).max(250), createdAt: z.string().datetime({ offset: true }) }).strict();

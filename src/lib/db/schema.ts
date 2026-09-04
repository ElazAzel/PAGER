import "server-only";
import { index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import type { AdminAuditEvent, CreatorInvite, Asset, AnalyticsEvent, Booking, CatalogItem, Contact, Entitlement, Integration, Notification, Opportunity, Order, Page, Subscription, TimelineEvent, User, WebhookEvent } from "../types";

// Full payload retains integration-owned commerce metadata. Typed columns enforce
// relational tenancy and index lookups; the migration adds deferred composite FKs/RLS.
const id = () => text("id").primaryKey();
const owner = () => text("owner_id").notNull();
const page = () => text("page_id").notNull();
const buyer = () => text("buyer_id").notNull();
const contact = () => text("contact_id").notNull();
export const users = pgTable("pager_users", { id: id(), payload: jsonb("payload").$type<User>().notNull() });
export const adminAudit = pgTable("pager_admin_audit", { id: id(), payload: jsonb("payload").$type<AdminAuditEvent>().notNull() });
export const creatorInvites = pgTable("pager_creator_invites", { id: id(), payload: jsonb("payload").$type<CreatorInvite>().notNull() });
export const pages = pgTable("pager_pages", { id: id(), ownerId: owner().references(() => users.id), slug: text("slug").notNull(), payload: jsonb("payload").$type<Page>().notNull() }, t => [uniqueIndex("pager_pages_owner").on(t.ownerId), uniqueIndex("pager_pages_slug").on(t.slug), uniqueIndex("pager_pages_identity").on(t.id, t.ownerId)]);
export const publishedPages = pgTable("pager_published_pages", { id: id(), ownerId: owner(), slug: text("slug").notNull(), payload: jsonb("payload").$type<Page>().notNull() }, t => [uniqueIndex("pager_published_slug").on(t.slug)]);
export const items = pgTable("pager_items", { id: id(), ownerId: owner(), pageId: page(), payload: jsonb("payload").$type<CatalogItem>().notNull() }, t => [index("pager_items_owner").on(t.ownerId), uniqueIndex("pager_items_identity").on(t.id, t.ownerId)]);
export const contacts = pgTable("pager_contacts", { id: id(), ownerId: owner(), email: text("email").notNull(), payload: jsonb("payload").$type<Contact>().notNull() }, t => [uniqueIndex("pager_contacts_email").on(t.ownerId, t.email), uniqueIndex("pager_contacts_identity").on(t.id, t.ownerId)]);
export const opportunities = pgTable("pager_opportunities", { id: id(), ownerId: owner(), pageId: page(), contactId: contact(), payload: jsonb("payload").$type<Opportunity>().notNull() }, t => [index("pager_opportunities_owner").on(t.ownerId), uniqueIndex("pager_opportunities_identity").on(t.id, t.ownerId)]);
export const bookings = pgTable("pager_bookings", { id: id(), ownerId: owner(), pageId: page(), contactId: contact(), buyerId: text("buyer_id"), opportunityId: text("opportunity_id").notNull(), payload: jsonb("payload").$type<Booking>().notNull() }, t => [index("pager_bookings_owner").on(t.ownerId), index("pager_bookings_buyer").on(t.buyerId)]);
export const orders = pgTable("pager_orders", { id: id(), ownerId: owner(), pageId: page(), contactId: contact(), buyerId: buyer(), opportunityId: text("opportunity_id").notNull(), payload: jsonb("payload").$type<Order>().notNull() }, t => [index("pager_orders_owner").on(t.ownerId), index("pager_orders_buyer").on(t.buyerId), uniqueIndex("pager_orders_identity").on(t.id, t.ownerId)]);
export const subscriptions = pgTable("pager_subscriptions", { id: id(), ownerId: owner(), pageId: page(), buyerId: buyer(), orderId: text("order_id").notNull(), payload: jsonb("payload").$type<Subscription>().notNull() }, t => [index("pager_subscriptions_owner").on(t.ownerId), index("pager_subscriptions_buyer").on(t.buyerId), uniqueIndex("pager_subscriptions_identity").on(t.id, t.ownerId)]);
export const entitlements = pgTable("pager_entitlements", { id: id(), ownerId: owner(), pageId: page(), buyerId: buyer(), orderId: text("order_id").notNull(), payload: jsonb("payload").$type<Entitlement>().notNull() }, t => [index("pager_entitlements_owner").on(t.ownerId), index("pager_entitlements_buyer").on(t.buyerId)]);
export const timeline = pgTable("pager_timeline", { id: id(), ownerId: owner(), contactId: contact(), payload: jsonb("payload").$type<TimelineEvent>().notNull() }, t => [index("pager_timeline_owner").on(t.ownerId)]);
export const integrations = pgTable("pager_integrations", { id: id(), ownerId: owner(), payload: jsonb("payload").$type<Integration>().notNull() }, t => [uniqueIndex("pager_integrations_owner").on(t.ownerId)]);
export const analytics = pgTable("pager_analytics", { id: id(), ownerId: owner(), pageId: page(), payload: jsonb("payload").$type<AnalyticsEvent>().notNull() }, t => [index("pager_analytics_owner").on(t.ownerId)]);
export const assets = pgTable("pager_assets", { id: id(), ownerId: owner(), pageId: page(), payload: jsonb("payload").$type<Asset>().notNull() }, t => [index("pager_assets_owner").on(t.ownerId)]);
export const webhooks = pgTable("pager_webhooks", { id: id(), payload: jsonb("payload").$type<WebhookEvent>().notNull() });
export const notifications = pgTable("pager_notifications", { id: id(), ownerId: owner(), payload: jsonb("payload").$type<Notification>().notNull() }, t => [index("pager_notifications_owner").on(t.ownerId)]);

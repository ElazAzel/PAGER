-- PAGER core: normalized rows, lossless JSON payloads, composite tenant FKs.
-- Run as database owner. Application writes use the server-only DB connection.
-- All user-facing reads/mutations pass the server's authorization/projection.
CREATE TABLE public.pager_users (
  id text PRIMARY KEY, payload jsonb NOT NULL,
  CHECK (jsonb_typeof(payload) = 'object'),
  CHECK ((payload->>'id') IS NOT DISTINCT FROM id)
);
CREATE TABLE public.pager_pages (
  id text PRIMARY KEY, owner_id text NOT NULL REFERENCES public.pager_users(id) DEFERRABLE INITIALLY DEFERRED,
  slug text NOT NULL, payload jsonb NOT NULL,
  CONSTRAINT pager_pages_owner UNIQUE(owner_id), CONSTRAINT pager_pages_slug UNIQUE(slug), CONSTRAINT pager_pages_identity UNIQUE(id, owner_id),
  CHECK ((payload->>'id') IS NOT DISTINCT FROM id), CHECK ((payload->>'ownerId') IS NOT DISTINCT FROM owner_id), CHECK ((payload->>'slug') IS NOT DISTINCT FROM slug)
);
CREATE TABLE public.pager_published_pages (
  id text PRIMARY KEY, owner_id text NOT NULL, slug text NOT NULL UNIQUE, payload jsonb NOT NULL,
  FOREIGN KEY(id, owner_id) REFERENCES public.pager_pages(id, owner_id) DEFERRABLE INITIALLY DEFERRED,
  CHECK ((payload->>'id') IS NOT DISTINCT FROM id), CHECK ((payload->>'ownerId') IS NOT DISTINCT FROM owner_id), CHECK ((payload->>'slug') IS NOT DISTINCT FROM slug)
);
CREATE TABLE public.pager_items (
  id text PRIMARY KEY, owner_id text NOT NULL, page_id text NOT NULL, payload jsonb NOT NULL, UNIQUE(id, owner_id),
  FOREIGN KEY(page_id, owner_id) REFERENCES public.pager_pages(id, owner_id) DEFERRABLE INITIALLY DEFERRED,
  CHECK ((payload->>'id') IS NOT DISTINCT FROM id), CHECK ((payload->>'ownerId') IS NOT DISTINCT FROM owner_id), CHECK ((payload->>'pageId') IS NOT DISTINCT FROM page_id),
  CHECK ((payload->>'reserved')::integer >= 0), CHECK ((payload->>'stock') IS NULL OR (payload->>'stock')::integer >= (payload->>'reserved')::integer)
);
CREATE TABLE public.pager_contacts (
  id text PRIMARY KEY, owner_id text NOT NULL REFERENCES public.pager_users(id) DEFERRABLE INITIALLY DEFERRED,
  email text NOT NULL, payload jsonb NOT NULL, UNIQUE(id, owner_id), UNIQUE(owner_id, email),
  CHECK (email = lower(trim(email))), CHECK ((payload->>'id') IS NOT DISTINCT FROM id), CHECK ((payload->>'ownerId') IS NOT DISTINCT FROM owner_id), CHECK ((payload->>'email') IS NOT DISTINCT FROM email)
);
CREATE TABLE public.pager_opportunities (
  id text PRIMARY KEY, owner_id text NOT NULL, page_id text NOT NULL, contact_id text NOT NULL, payload jsonb NOT NULL, UNIQUE(id, owner_id),
  FOREIGN KEY(page_id, owner_id) REFERENCES public.pager_pages(id, owner_id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(contact_id, owner_id) REFERENCES public.pager_contacts(id, owner_id) DEFERRABLE INITIALLY DEFERRED,
  CHECK ((payload->>'id') IS NOT DISTINCT FROM id), CHECK ((payload->>'ownerId') IS NOT DISTINCT FROM owner_id), CHECK ((payload->>'pageId') IS NOT DISTINCT FROM page_id), CHECK ((payload->>'contactId') IS NOT DISTINCT FROM contact_id)
);
CREATE TABLE public.pager_bookings (
  id text PRIMARY KEY, owner_id text NOT NULL, page_id text NOT NULL, contact_id text NOT NULL,
  buyer_id text REFERENCES public.pager_users(id) DEFERRABLE INITIALLY DEFERRED, opportunity_id text NOT NULL, payload jsonb NOT NULL,
  FOREIGN KEY(page_id, owner_id) REFERENCES public.pager_pages(id, owner_id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(contact_id, owner_id) REFERENCES public.pager_contacts(id, owner_id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(opportunity_id, owner_id) REFERENCES public.pager_opportunities(id, owner_id) DEFERRABLE INITIALLY DEFERRED,
  CHECK ((payload->>'id') IS NOT DISTINCT FROM id), CHECK ((payload->>'ownerId') IS NOT DISTINCT FROM owner_id), CHECK ((payload->>'pageId') IS NOT DISTINCT FROM page_id), CHECK ((payload->>'contactId') IS NOT DISTINCT FROM contact_id), CHECK ((payload->>'buyerId') IS NOT DISTINCT FROM buyer_id), CHECK ((payload->>'opportunityId') IS NOT DISTINCT FROM opportunity_id)
);
CREATE TABLE public.pager_orders (
  id text PRIMARY KEY, owner_id text NOT NULL, page_id text NOT NULL, contact_id text NOT NULL,
  buyer_id text NOT NULL REFERENCES public.pager_users(id) DEFERRABLE INITIALLY DEFERRED, opportunity_id text NOT NULL, payload jsonb NOT NULL, UNIQUE(id, owner_id),
  FOREIGN KEY(page_id, owner_id) REFERENCES public.pager_pages(id, owner_id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(contact_id, owner_id) REFERENCES public.pager_contacts(id, owner_id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(opportunity_id, owner_id) REFERENCES public.pager_opportunities(id, owner_id) DEFERRABLE INITIALLY DEFERRED,
  CHECK ((payload->>'id') IS NOT DISTINCT FROM id), CHECK ((payload->>'ownerId') IS NOT DISTINCT FROM owner_id), CHECK ((payload->>'pageId') IS NOT DISTINCT FROM page_id), CHECK ((payload->>'contactId') IS NOT DISTINCT FROM contact_id), CHECK ((payload->>'buyerId') IS NOT DISTINCT FROM buyer_id), CHECK ((payload->>'opportunityId') IS NOT DISTINCT FROM opportunity_id)
);
CREATE TABLE public.pager_subscriptions (
  id text PRIMARY KEY, owner_id text NOT NULL, page_id text NOT NULL,
  buyer_id text NOT NULL REFERENCES public.pager_users(id) DEFERRABLE INITIALLY DEFERRED, order_id text NOT NULL, payload jsonb NOT NULL, UNIQUE(id, owner_id),
  FOREIGN KEY(page_id, owner_id) REFERENCES public.pager_pages(id, owner_id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(order_id, owner_id) REFERENCES public.pager_orders(id, owner_id) DEFERRABLE INITIALLY DEFERRED,
  CHECK ((payload->>'id') IS NOT DISTINCT FROM id), CHECK ((payload->>'ownerId') IS NOT DISTINCT FROM owner_id), CHECK ((payload->>'pageId') IS NOT DISTINCT FROM page_id), CHECK ((payload->>'buyerId') IS NOT DISTINCT FROM buyer_id), CHECK ((payload->>'orderId') IS NOT DISTINCT FROM order_id)
);
CREATE TABLE public.pager_entitlements (
  id text PRIMARY KEY, owner_id text NOT NULL, page_id text NOT NULL,
  buyer_id text NOT NULL REFERENCES public.pager_users(id) DEFERRABLE INITIALLY DEFERRED, order_id text NOT NULL, payload jsonb NOT NULL,
  FOREIGN KEY(page_id, owner_id) REFERENCES public.pager_pages(id, owner_id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(order_id, owner_id) REFERENCES public.pager_orders(id, owner_id) DEFERRABLE INITIALLY DEFERRED,
  CHECK ((payload->>'id') IS NOT DISTINCT FROM id), CHECK ((payload->>'ownerId') IS NOT DISTINCT FROM owner_id), CHECK ((payload->>'pageId') IS NOT DISTINCT FROM page_id), CHECK ((payload->>'buyerId') IS NOT DISTINCT FROM buyer_id), CHECK ((payload->>'orderId') IS NOT DISTINCT FROM order_id)
);
CREATE TABLE public.pager_timeline (
  id text PRIMARY KEY, owner_id text NOT NULL, contact_id text NOT NULL, payload jsonb NOT NULL,
  FOREIGN KEY(contact_id, owner_id) REFERENCES public.pager_contacts(id, owner_id) DEFERRABLE INITIALLY DEFERRED,
  CHECK ((payload->>'id') IS NOT DISTINCT FROM id), CHECK ((payload->>'ownerId') IS NOT DISTINCT FROM owner_id), CHECK ((payload->>'contactId') IS NOT DISTINCT FROM contact_id)
);
CREATE TABLE public.pager_integrations (
  id text PRIMARY KEY, owner_id text NOT NULL UNIQUE REFERENCES public.pager_users(id) DEFERRABLE INITIALLY DEFERRED, payload jsonb NOT NULL,
  CHECK ((payload->>'id') IS NOT DISTINCT FROM id), CHECK ((payload->>'ownerId') IS NOT DISTINCT FROM owner_id)
);
CREATE TABLE public.pager_analytics (
  id text PRIMARY KEY, owner_id text NOT NULL, page_id text NOT NULL, payload jsonb NOT NULL,
  FOREIGN KEY(page_id, owner_id) REFERENCES public.pager_pages(id, owner_id) DEFERRABLE INITIALLY DEFERRED,
  CHECK ((payload->>'id') IS NOT DISTINCT FROM id), CHECK ((payload->>'ownerId') IS NOT DISTINCT FROM owner_id), CHECK ((payload->>'pageId') IS NOT DISTINCT FROM page_id)
);
CREATE TABLE public.pager_assets (
  id text PRIMARY KEY, owner_id text NOT NULL, page_id text NOT NULL, payload jsonb NOT NULL,
  FOREIGN KEY(page_id, owner_id) REFERENCES public.pager_pages(id, owner_id) DEFERRABLE INITIALLY DEFERRED,
  CHECK ((payload->>'id') IS NOT DISTINCT FROM id), CHECK ((payload->>'ownerId') IS NOT DISTINCT FROM owner_id), CHECK ((payload->>'pageId') IS NOT DISTINCT FROM page_id)
);
CREATE TABLE public.pager_webhooks (
  id text PRIMARY KEY, payload jsonb NOT NULL, CHECK ((payload->>'id') IS NOT DISTINCT FROM id)
);
CREATE TABLE public.pager_notifications (
  id text PRIMARY KEY, owner_id text NOT NULL REFERENCES public.pager_users(id) DEFERRABLE INITIALLY DEFERRED, payload jsonb NOT NULL,
  CHECK ((payload->>'id') IS NOT DISTINCT FROM id), CHECK ((payload->>'ownerId') IS NOT DISTINCT FROM owner_id)
);

-- RLS default denies raw public documents: paid/private blocks coexist in payloads.
-- Browser roles are read-only; only the server may publish, change stock or grant access.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['pager_users','pager_pages','pager_published_pages','pager_items','pager_contacts','pager_opportunities','pager_bookings','pager_orders','pager_subscriptions','pager_entitlements','pager_timeline','pager_integrations','pager_analytics','pager_assets','pager_webhooks','pager_notifications'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', table_name);
    IF table_name NOT IN ('pager_integrations','pager_notifications','pager_webhooks') THEN
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', table_name);
      IF table_name = 'pager_users' THEN
        EXECUTE format('CREATE POLICY own_read ON public.%I FOR SELECT TO authenticated USING (id = (SELECT auth.uid())::text)', table_name);
      ELSIF table_name IN ('pager_orders','pager_bookings','pager_subscriptions','pager_entitlements') THEN
        EXECUTE format('CREATE POLICY own_read ON public.%I FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid())::text OR buyer_id = (SELECT auth.uid())::text)', table_name);
      ELSE
        EXECUTE format('CREATE POLICY own_read ON public.%I FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid())::text)', table_name);
      END IF;
    END IF;
    IF table_name NOT IN ('pager_users','pager_webhooks') THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(owner_id)', table_name || '_owner_lookup', table_name);
    END IF;
  END LOOP;
END $$;
CREATE INDEX pager_orders_buyer ON public.pager_orders(buyer_id);
CREATE INDEX pager_bookings_buyer ON public.pager_bookings(buyer_id);
CREATE INDEX pager_entitlements_buyer ON public.pager_entitlements(buyer_id);
CREATE INDEX pager_subscriptions_buyer ON public.pager_subscriptions(buyer_id);
CREATE INDEX pager_analytics_page_date ON public.pager_analytics(page_id, (payload->>'createdAt'));
CREATE INDEX pager_opportunities_conversion ON public.pager_opportunities(owner_id, (payload->>'convertedAt'));

-- Actual Supabase storage, if installed. No anon/authenticated object policy: the
-- application authorizes a reference/purchase, then signs a short-lived URL.
DO $$ BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets(id, name, public, file_size_limit)
    VALUES ('pager-private', 'pager-private', false, 10485760)
    ON CONFLICT(id) DO UPDATE SET public = false, file_size_limit = 10485760;
  END IF;
END $$;

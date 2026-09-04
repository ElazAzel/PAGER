-- Pilot enrollment and moderation history: server-only, no browser read/write grant.
CREATE TABLE public.pager_admin_audit (
  id text PRIMARY KEY, payload jsonb NOT NULL,
  CHECK ((payload->>'id') IS NOT DISTINCT FROM id),
  CHECK (payload->>'action' IN ('publication.block', 'publication.restore'))
);
CREATE TABLE public.pager_creator_invites (
  id text PRIMARY KEY, payload jsonb NOT NULL,
  CHECK ((payload->>'id') IS NOT DISTINCT FROM id),
  CHECK (payload->>'email' = lower(trim(payload->>'email')))
);
CREATE UNIQUE INDEX pager_invite_email ON public.pager_creator_invites ((payload->>'email'));
CREATE INDEX pager_audit_created ON public.pager_admin_audit ((payload->>'createdAt'));
CREATE INDEX pager_audit_page ON public.pager_admin_audit ((payload->>'pageId'));
ALTER TABLE public.pager_admin_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pager_admin_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pager_creator_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pager_creator_invites FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pager_admin_audit, public.pager_creator_invites FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.pager_admin_audit TO service_role;
GRANT ALL ON public.pager_creator_invites TO service_role;

CREATE FUNCTION public.pager_keep_audit() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'Admin audit is append-only'; END;
$$;
CREATE TRIGGER pager_keep_audit BEFORE UPDATE OR DELETE ON public.pager_admin_audit FOR EACH ROW EXECUTE FUNCTION public.pager_keep_audit();

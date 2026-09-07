-- Domain Phase 2 architecture review (item 7): checked the existing 25
-- reserved words (migration 0010) against the real target domain topology
-- (innerdwes.com / www / app / *.innerdwes.com guest Spaces) and the
-- explicit infrastructure-name list called out in that review - www, app,
-- api, admin, auth, mail, smtp, support. All but one were already
-- reserved. Only "smtp" was missing (a mail-infrastructure name in the
-- same category as the already-reserved "mail") - this migration adds
-- exactly that one word, nothing else. See src/lib/slug.ts, updated in
-- the same batch to keep the TypeScript mirror in sync.
insert into public.reserved_slugs (slug) values ('smtp')
on conflict (slug) do nothing;

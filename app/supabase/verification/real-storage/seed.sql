do $$
declare u uuid; t uuid; i int; pt text;
begin
  for i in 1..3 loop
    u := ('00000000-0000-4000-8000-00000000000'||i)::uuid;
    t := ('00000000-0000-4000-9000-00000000000'||i)::uuid;
    pt := case when i = 2 then 'retreat' else 'teach' end;
    insert into auth.users (id, email, instance_id, aud, role) values (u, 'u'||i||'@p4b.test','00000000-0000-0000-0000-000000000000','authenticated','authenticated') on conflict do nothing;
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into public.tenants (id, name, product_type, timezone) values (t, 'P4B '||i, pt, 'Asia/Bangkok') on conflict do nothing;
    reset role;
    insert into public.space_entitlements (tenant_id, access_type, access_ends_at) values (t,'complimentary', now()+interval '1 year') on conflict (tenant_id) do nothing;
  end loop;
end $$;
select t.id, t.product_type, (select count(*) from public.tenant_members m where m.tenant_id=t.id) from public.tenants t order by 1;

-- One-time 50-point welcome balance after SK staff verifies a submitted KK profile.
-- Never award on registration, draft, pending or rejection.
-- The partial unique index makes repeated updates/retries idempotent.
create unique index if not exists kk_points_unique_verification_bonus
  on vasra.kk_points(member_id)
  where reason='KK verified profile welcome bonus';

create or replace function vasra.kk_welcome_points_on_verified()
returns trigger language plpgsql set search_path = '' as $kkbonus$
begin
 if new.status='verified' and old.status is distinct from 'verified' then
  if new.reviewer_id is null then
    raise exception 'Verified KK profile must have an authorized SK reviewer';
  end if;
  insert into vasra.kk_points(member_id,delta,reason,staff_id)
  values(new.member_id,50,'KK verified profile welcome bonus',new.reviewer_id)
  on conflict (member_id) where reason='KK verified profile welcome bonus' do nothing;
 end if;
 return new;
end $kkbonus$;
revoke all on function vasra.kk_welcome_points_on_verified() from public, anon, authenticated;
drop trigger if exists kk_verified_welcome_points on vasra.kk_profiles;
create trigger kk_verified_welcome_points
after update of status on vasra.kk_profiles
for each row execute function vasra.kk_welcome_points_on_verified();

-- Backfill only legitimately verified profiles, never unverified members.
insert into vasra.kk_points(member_id,delta,reason,staff_id)
select pr.member_id,50,'KK verified profile welcome bonus',pr.reviewer_id
from vasra.kk_profiles pr
where pr.status='verified' and pr.reviewer_id is not null
on conflict (member_id) where reason='KK verified profile welcome bonus' do nothing;

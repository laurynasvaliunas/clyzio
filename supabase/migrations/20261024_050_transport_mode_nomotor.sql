-- 050: "Other, no motor" transport mode (kick scooter, skateboard, roller
-- skates…), added with the 2026-10 pictogram set.
--
-- The app now writes rides.transport_mode = 'nomotor' (zero emissions). The
-- company green score counts a trip as green only if its mode is in the
-- catalog with is_green, so the mode needs a catalog row before app builds
-- that offer it reach users. Insert only: existing rows and labels are read
-- by the website and stay as they are.

insert into public.transport_mode_catalog (id, label, co2_per_km, is_green, canonical, sort)
values ('nomotor', 'Other, no motor', 0, true, true, 10)
on conflict (id) do nothing;

comment on column public.rides.transport_mode is
  'Mode id — must match public.transport_mode_catalog.id (canonical: walking, bike, ebike, public, carpool, wfh, taxi, moto, my_car, nomotor).';

-- ╔══════════════════════════════════════════════════════════════╗
-- ║  ⚠️  LOCAL DEVELOPMENT ONLY — DO NOT RUN IN PRODUCTION  ⚠️  ║
-- ║  All users below have password: Test1234!                   ║
-- ║  This file is for seeding local Supabase instances only.    ║
-- ╚══════════════════════════════════════════════════════════════╝

-- Clyzio Seed Data — 10 test users in Vilnius area
-- All users have password: Test1234!
-- Run this after all migrations have been applied.

-- ============================================
-- SAFETY: skip if test users already exist
-- ============================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = 'agna@clyzio.test') THEN
    RAISE NOTICE 'Seed data already present — skipping.';
    RETURN;
  END IF;
END $$;

-- ============================================
-- 1. Auth users (10 test accounts)
-- ============================================
INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
VALUES
  -- 1 Agnė Petrauskienė — driver, public
  ('a1000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'agne@clyzio.test', crypt('Test1234!', gen_salt('bf', 10)), NOW(),
   '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), '', '', '', ''),
  -- 2 Marius Jonaitis — cyclist, public
  ('a1000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'marius@clyzio.test', crypt('Test1234!', gen_salt('bf', 10)), NOW(),
   '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), '', '', '', ''),
  -- 3 Eglė Kazlauskaitė — public transport, public
  ('a1000000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'egle@clyzio.test', crypt('Test1234!', gen_salt('bf', 10)), NOW(),
   '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), '', '', '', ''),
  -- 4 Tomas Rimkus — driver, public
  ('a1000000-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'tomas@clyzio.test', crypt('Test1234!', gen_salt('bf', 10)), NOW(),
   '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), '', '', '', ''),
  -- 5 Viktorija Stankevičiūtė — e-bike, public
  ('a1000000-0000-0000-0000-000000000005',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'viktorija@clyzio.test', crypt('Test1234!', gen_salt('bf', 10)), NOW(),
   '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), '', '', '', ''),
  -- 6 Lukas Paulauskas — driver, public
  ('a1000000-0000-0000-0000-000000000006',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'lukas@clyzio.test', crypt('Test1234!', gen_salt('bf', 10)), NOW(),
   '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), '', '', '', ''),
  -- 7 Rūta Jankauskienė — driver, public
  ('a1000000-0000-0000-0000-000000000007',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ruta@clyzio.test', crypt('Test1234!', gen_salt('bf', 10)), NOW(),
   '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), '', '', '', ''),
  -- 8 Darius Mickevičius — walking + public transport, private (not on map)
  ('a1000000-0000-0000-0000-000000000008',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'darius@clyzio.test', crypt('Test1234!', gen_salt('bf', 10)), NOW(),
   '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), '', '', '', ''),
  -- 9 Simona Bernotaitė — driver, private (not on map)
  ('a1000000-0000-0000-0000-000000000009',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'simona@clyzio.test', crypt('Test1234!', gen_salt('bf', 10)), NOW(),
   '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), '', '', '', ''),
  -- 10 Karolis Žukauskas — manager + driver, public
  ('a1000000-0000-0000-0000-000000000010',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'karolis@clyzio.test', crypt('Test1234!', gen_salt('bf', 10)), NOW(),
   '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), '', '', '', '')
ON CONFLICT (email) DO NOTHING;

-- ============================================
-- 2. Profiles (trigger auto-creates rows; we UPDATE with full data)
-- ============================================
UPDATE public.profiles SET
  first_name = 'Agnė', last_name = 'Petrauskienė',
  email = 'agne@clyzio.test',
  is_driver = true, is_public = true,
  company_name = 'Codeshift UAB', department = 'Engineering',
  car_model = 'Volkswagen Golf', car_fuel_type = 'gasoline',
  home_address = 'Žirmūnų g. 68, Vilnius', home_lat = 54.7038, home_long = 25.2807,
  work_address = 'Konstitucijos pr. 21, Vilnius', work_lat = 54.6961, work_long = 25.2756,
  preferred_departure_time = '08:15', preferred_departure_days = '{true,true,true,true,true,false,false}',
  baseline_co2 = 0.192, baseline_co2_mode = 'Car (Gasoline)',
  xp_points = 1240, level = 4,
  commuting_habits = '[{"mode":"car","frequency":"daily","avg_km":9.2}]',
  terms_accepted_at = NOW(), privacy_policy_accepted_at = NOW()
WHERE id = 'a1000000-0000-0000-0000-000000000001';

UPDATE public.profiles SET
  first_name = 'Marius', last_name = 'Jonaitis',
  email = 'marius@clyzio.test',
  is_driver = false, is_public = true,
  company_name = 'Codeshift UAB', department = 'Product',
  car_model = NULL, car_fuel_type = NULL,
  home_address = 'Antakalnio g. 14, Vilnius', home_lat = 54.6985, home_long = 25.3051,
  work_address = 'Konstitucijos pr. 21, Vilnius', work_lat = 54.6961, work_long = 25.2756,
  preferred_departure_time = '08:30', preferred_departure_days = '{true,true,true,true,true,false,false}',
  baseline_co2 = 0.0, baseline_co2_mode = 'Electric Bike/Scooter',
  xp_points = 2870, level = 7,
  commuting_habits = '[{"mode":"bike","frequency":"daily","avg_km":6.8}]',
  terms_accepted_at = NOW(), privacy_policy_accepted_at = NOW()
WHERE id = 'a1000000-0000-0000-0000-000000000002';

UPDATE public.profiles SET
  first_name = 'Eglė', last_name = 'Kazlauskaitė',
  email = 'egle@clyzio.test',
  is_driver = false, is_public = true,
  company_name = 'Codeshift UAB', department = 'Design',
  car_model = NULL, car_fuel_type = NULL,
  home_address = 'Šeškinės g. 5, Vilnius', home_lat = 54.7112, home_long = 25.2448,
  work_address = 'Konstitucijos pr. 21, Vilnius', work_lat = 54.6961, work_long = 25.2756,
  preferred_departure_time = '08:00', preferred_departure_days = '{true,true,true,true,true,false,false}',
  baseline_co2 = 0.04, baseline_co2_mode = 'Public Transport',
  xp_points = 890, level = 3,
  commuting_habits = '[{"mode":"bus","frequency":"daily","avg_km":10.1}]',
  terms_accepted_at = NOW(), privacy_policy_accepted_at = NOW()
WHERE id = 'a1000000-0000-0000-0000-000000000003';

UPDATE public.profiles SET
  first_name = 'Tomas', last_name = 'Rimkus',
  email = 'tomas@clyzio.test',
  is_driver = true, is_public = true,
  company_name = 'Codeshift UAB', department = 'Engineering',
  car_model = 'Toyota Yaris Hybrid', car_fuel_type = 'hybrid',
  home_address = 'Viršuliškių g. 30, Vilnius', home_lat = 54.7078, home_long = 25.2219,
  work_address = 'Konstitucijos pr. 21, Vilnius', work_lat = 54.6961, work_long = 25.2756,
  preferred_departure_time = '07:45', preferred_departure_days = '{true,true,true,true,true,false,false}',
  baseline_co2 = 0.096, baseline_co2_mode = 'Car (Gasoline)',
  xp_points = 3450, level = 9,
  commuting_habits = '[{"mode":"car","frequency":"daily","avg_km":12.4},{"mode":"carpool","frequency":"twice_week","avg_km":12.4}]',
  terms_accepted_at = NOW(), privacy_policy_accepted_at = NOW()
WHERE id = 'a1000000-0000-0000-0000-000000000004';

UPDATE public.profiles SET
  first_name = 'Viktorija', last_name = 'Stankevičiūtė',
  email = 'viktorija@clyzio.test',
  is_driver = false, is_public = true,
  company_name = 'Codeshift UAB', department = 'Marketing',
  car_model = NULL, car_fuel_type = NULL,
  home_address = 'Lazdynų g. 12, Vilnius', home_lat = 54.6845, home_long = 25.2071,
  work_address = 'Konstitucijos pr. 21, Vilnius', work_lat = 54.6961, work_long = 25.2756,
  preferred_departure_time = '09:00', preferred_departure_days = '{true,true,false,true,true,false,false}',
  baseline_co2 = 0.023, baseline_co2_mode = 'Electric Bike/Scooter',
  xp_points = 560, level = 2,
  commuting_habits = '[{"mode":"ebike","frequency":"daily","avg_km":8.7}]',
  terms_accepted_at = NOW(), privacy_policy_accepted_at = NOW()
WHERE id = 'a1000000-0000-0000-0000-000000000005';

UPDATE public.profiles SET
  first_name = 'Lukas', last_name = 'Paulauskas',
  email = 'lukas@clyzio.test',
  is_driver = true, is_public = true,
  company_name = 'Codeshift UAB', department = 'Sales',
  car_model = 'BMW 3 Series', car_fuel_type = 'gasoline',
  home_address = 'Pilaitės pr. 22, Vilnius', home_lat = 54.7001, home_long = 25.1892,
  work_address = 'Konstitucijos pr. 21, Vilnius', work_lat = 54.6961, work_long = 25.2756,
  preferred_departure_time = '08:00', preferred_departure_days = '{true,true,true,true,true,false,false}',
  baseline_co2 = 0.192, baseline_co2_mode = 'Car (Gasoline)',
  xp_points = 720, level = 3,
  commuting_habits = '[{"mode":"car","frequency":"daily","avg_km":15.2}]',
  terms_accepted_at = NOW(), privacy_policy_accepted_at = NOW()
WHERE id = 'a1000000-0000-0000-0000-000000000006';

UPDATE public.profiles SET
  first_name = 'Rūta', last_name = 'Jankauskienė',
  email = 'ruta@clyzio.test',
  is_driver = true, is_public = true,
  company_name = 'Codeshift UAB', department = 'HR',
  car_model = 'Renault Clio', car_fuel_type = 'gasoline',
  home_address = 'Žvėryno g. 8, Vilnius', home_lat = 54.6921, home_long = 25.2542,
  work_address = 'Konstitucijos pr. 21, Vilnius', work_lat = 54.6961, work_long = 25.2756,
  preferred_departure_time = '08:45', preferred_departure_days = '{true,false,true,true,true,false,false}',
  baseline_co2 = 0.192, baseline_co2_mode = 'Car (Gasoline)',
  xp_points = 1890, level = 5,
  commuting_habits = '[{"mode":"car","frequency":"daily","avg_km":7.1},{"mode":"walking","frequency":"once_week","avg_km":3.5}]',
  terms_accepted_at = NOW(), privacy_policy_accepted_at = NOW()
WHERE id = 'a1000000-0000-0000-0000-000000000007';

UPDATE public.profiles SET
  first_name = 'Darius', last_name = 'Mickevičius',
  email = 'darius@clyzio.test',
  is_driver = false, is_public = false,
  company_name = 'Codeshift UAB', department = 'Engineering',
  car_model = NULL, car_fuel_type = NULL,
  home_address = 'Naujamiesčio g. 34, Vilnius', home_lat = 54.6798, home_long = 25.2697,
  work_address = 'Konstitucijos pr. 21, Vilnius', work_lat = 54.6961, work_long = 25.2756,
  preferred_departure_time = '09:30', preferred_departure_days = '{true,true,true,true,false,false,false}',
  baseline_co2 = 0.04, baseline_co2_mode = 'Public Transport',
  xp_points = 340, level = 1,
  commuting_habits = '[{"mode":"walking","frequency":"twice_week","avg_km":1.8},{"mode":"bus","frequency":"three_week","avg_km":5.4}]',
  terms_accepted_at = NOW(), privacy_policy_accepted_at = NOW()
WHERE id = 'a1000000-0000-0000-0000-000000000008';

UPDATE public.profiles SET
  first_name = 'Simona', last_name = 'Bernotaitė',
  email = 'simona@clyzio.test',
  is_driver = true, is_public = false,
  company_name = 'Codeshift UAB', department = 'Finance',
  car_model = 'Audi A4', car_fuel_type = 'diesel',
  home_address = 'Pašilaičių g. 15, Vilnius', home_lat = 54.7189, home_long = 25.2132,
  work_address = 'Konstitucijos pr. 21, Vilnius', work_lat = 54.6961, work_long = 25.2756,
  preferred_departure_time = '08:00', preferred_departure_days = '{true,true,true,true,true,false,false}',
  baseline_co2 = 0.171, baseline_co2_mode = 'Car (Gasoline)',
  xp_points = 210, level = 1,
  commuting_habits = '[{"mode":"car","frequency":"daily","avg_km":16.8}]',
  terms_accepted_at = NOW(), privacy_policy_accepted_at = NOW()
WHERE id = 'a1000000-0000-0000-0000-000000000009';

UPDATE public.profiles SET
  first_name = 'Karolis', last_name = 'Žukauskas',
  email = 'karolis@clyzio.test',
  is_driver = true, is_public = true, is_manager = true,
  company_name = 'Codeshift UAB', department = 'Management',
  car_model = 'Tesla Model 3', car_fuel_type = 'electric',
  home_address = 'Verkių g. 50, Vilnius', home_lat = 54.7234, home_long = 25.2901,
  work_address = 'Konstitucijos pr. 21, Vilnius', work_lat = 54.6961, work_long = 25.2756,
  preferred_departure_time = '08:00', preferred_departure_days = '{true,true,true,true,true,false,false}',
  baseline_co2 = 0.032, baseline_co2_mode = 'Car (Electric)',
  xp_points = 5120, level = 12,
  commuting_habits = '[{"mode":"car_electric","frequency":"daily","avg_km":18.2},{"mode":"carpool","frequency":"twice_week","avg_km":18.2}]',
  terms_accepted_at = NOW(), privacy_policy_accepted_at = NOW()
WHERE id = 'a1000000-0000-0000-0000-000000000010';

-- ============================================
-- 3. Historical completed rides (past 30 days)
-- ============================================
INSERT INTO public.rides (
  id, driver_id, rider_id, status,
  origin_lat, origin_long, dest_lat, dest_long,
  origin_address, dest_address,
  transport_mode, transport_label,
  distance_km, co2_saved,
  created_at, updated_at
) VALUES
  -- Agnė driving solo (past rides)
  (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000001', NULL, 'completed',
   54.7038, 25.2807, 54.6961, 25.2756,
   'Žirmūnų g. 68, Vilnius', 'Konstitucijos pr. 21, Vilnius',
   'my_car', 'My Car', 9.2, 0.0,
   NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000001', NULL, 'completed',
   54.7038, 25.2807, 54.6961, 25.2756,
   'Žirmūnų g. 68, Vilnius', 'Konstitucijos pr. 21, Vilnius',
   'my_car', 'My Car', 9.2, 0.0,
   NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
  -- Agnė carpooling with Tomas (she rode, he drove)
  (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'completed',
   54.7038, 25.2807, 54.6961, 25.2756,
   'Žirmūnų g. 68, Vilnius', 'Konstitucijos pr. 21, Vilnius',
   'my_car', 'My Car', 9.2, 0.89,
   NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),

  -- Tomas driving
  (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000004', NULL, 'completed',
   54.7078, 25.2219, 54.6961, 25.2756,
   'Viršuliškių g. 30, Vilnius', 'Konstitucijos pr. 21, Vilnius',
   'my_car', 'My Car', 12.4, 0.0,
   NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000006', 'completed',
   54.7078, 25.2219, 54.6961, 25.2756,
   'Viršuliškių g. 30, Vilnius', 'Konstitucijos pr. 21, Vilnius',
   'my_car', 'My Car', 12.4, 1.19,
   NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days'),

  -- Marius cycling
  (gen_random_uuid(), NULL, 'a1000000-0000-0000-0000-000000000002', 'completed',
   54.6985, 25.3051, 54.6961, 25.2756,
   'Antakalnio g. 14, Vilnius', 'Konstitucijos pr. 21, Vilnius',
   'bike', 'Bike / Scooter', 6.8, 1.31,
   NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), NULL, 'a1000000-0000-0000-0000-000000000002', 'completed',
   54.6985, 25.3051, 54.6961, 25.2756,
   'Antakalnio g. 14, Vilnius', 'Konstitucijos pr. 21, Vilnius',
   'bike', 'Bike / Scooter', 6.8, 1.31,
   NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
  (gen_random_uuid(), NULL, 'a1000000-0000-0000-0000-000000000002', 'completed',
   54.6985, 25.3051, 54.6961, 25.2756,
   'Antakalnio g. 14, Vilnius', 'Konstitucijos pr. 21, Vilnius',
   'bike', 'Bike / Scooter', 6.8, 1.31,
   NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),

  -- Eglė on public transport
  (gen_random_uuid(), NULL, 'a1000000-0000-0000-0000-000000000003', 'completed',
   54.7112, 25.2448, 54.6961, 25.2756,
   'Šeškinės g. 5, Vilnius', 'Konstitucijos pr. 21, Vilnius',
   'public', 'Public Transport', 10.1, 1.57,
   NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), NULL, 'a1000000-0000-0000-0000-000000000003', 'completed',
   54.7112, 25.2448, 54.6961, 25.2756,
   'Šeškinės g. 5, Vilnius', 'Konstitucijos pr. 21, Vilnius',
   'public', 'Public Transport', 10.1, 1.57,
   NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),

  -- Lukas driving solo
  (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000006', NULL, 'completed',
   54.7001, 25.1892, 54.6961, 25.2756,
   'Pilaitės pr. 22, Vilnius', 'Konstitucijos pr. 21, Vilnius',
   'my_car', 'My Car', 15.2, 0.0,
   NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000006', NULL, 'completed',
   54.7001, 25.1892, 54.6961, 25.2756,
   'Pilaitės pr. 22, Vilnius', 'Konstitucijos pr. 21, Vilnius',
   'my_car', 'My Car', 15.2, 0.0,
   NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),

  -- Karolis (Tesla) driving + carpooling with Darius
  (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000008', 'completed',
   54.7234, 25.2901, 54.6961, 25.2756,
   'Verkių g. 50, Vilnius', 'Konstitucijos pr. 21, Vilnius',
   'my_car', 'My Car', 18.2, 1.75,
   NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000010', NULL, 'completed',
   54.7234, 25.2901, 54.6961, 25.2756,
   'Verkių g. 50, Vilnius', 'Konstitucijos pr. 21, Vilnius',
   'my_car', 'My Car', 18.2, 0.0,
   NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),

  -- Rūta driving
  (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000007', NULL, 'completed',
   54.6921, 25.2542, 54.6961, 25.2756,
   'Žvėryno g. 8, Vilnius', 'Konstitucijos pr. 21, Vilnius',
   'my_car', 'My Car', 7.1, 0.0,
   NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),

  -- Viktorija on e-bike
  (gen_random_uuid(), NULL, 'a1000000-0000-0000-0000-000000000005', 'completed',
   54.6845, 25.2071, 54.6961, 25.2756,
   'Lazdynų g. 12, Vilnius', 'Konstitucijos pr. 21, Vilnius',
   'ebike', 'E-Bike / E-Scooter', 8.7, 1.47,
   NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), NULL, 'a1000000-0000-0000-0000-000000000005', 'completed',
   54.6845, 25.2071, 54.6961, 25.2756,
   'Lazdynų g. 12, Vilnius', 'Konstitucijos pr. 21, Vilnius',
   'ebike', 'E-Bike / E-Scooter', 8.7, 1.47,
   NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days')
ON CONFLICT DO NOTHING;

-- ============================================
-- 4. Upcoming scheduled rides (visible on map tomorrow morning)
-- ============================================
INSERT INTO public.rides (
  id, driver_id, rider_id, status, scheduled_at,
  origin_lat, origin_long, dest_lat, dest_long,
  origin_address, dest_address,
  transport_mode, transport_label, distance_km, ai_matched
) VALUES
  -- Tomas offering to drive (public, will appear on map)
  ('b1000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000004', NULL, 'scheduled',
   (NOW() + INTERVAL '1 day')::date + TIME '07:45',
   54.7078, 25.2219, 54.6961, 25.2756,
   'Viršuliškių g. 30, Vilnius', 'Konstitucijos pr. 21, Vilnius',
   'my_car', 'My Car', 12.4, false),

  -- Lukas offering to drive
  ('b1000000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000006', NULL, 'scheduled',
   (NOW() + INTERVAL '1 day')::date + TIME '08:00',
   54.7001, 25.1892, 54.6961, 25.2756,
   'Pilaitės pr. 22, Vilnius', 'Konstitucijos pr. 21, Vilnius',
   'my_car', 'My Car', 15.2, false),

  -- Agnė looking for carpool
  ('b1000000-0000-0000-0000-000000000003',
   NULL, 'a1000000-0000-0000-0000-000000000001', 'requested',
   (NOW() + INTERVAL '1 day')::date + TIME '08:15',
   54.7038, 25.2807, 54.6961, 25.2756,
   'Žirmūnų g. 68, Vilnius', 'Konstitucijos pr. 21, Vilnius',
   'my_car', 'My Car', 9.2, false),

  -- Karolis offering Tesla carpool (AI matched)
  ('b1000000-0000-0000-0000-000000000004',
   'a1000000-0000-0000-0000-000000000010', NULL, 'scheduled',
   (NOW() + INTERVAL '1 day')::date + TIME '08:00',
   54.7234, 25.2901, 54.6961, 25.2756,
   'Verkių g. 50, Vilnius', 'Konstitucijos pr. 21, Vilnius',
   'my_car', 'My Car', 18.2, true),

  -- Rūta offering ride
  ('b1000000-0000-0000-0000-000000000005',
   'a1000000-0000-0000-0000-000000000007', NULL, 'scheduled',
   (NOW() + INTERVAL '1 day')::date + TIME '08:45',
   54.6921, 25.2542, 54.6961, 25.2756,
   'Žvėryno g. 8, Vilnius', 'Konstitucijos pr. 21, Vilnius',
   'my_car', 'My Car', 7.1, false),

  -- Simona (private) driving — won't appear on map
  ('b1000000-0000-0000-0000-000000000006',
   'a1000000-0000-0000-0000-000000000009', NULL, 'scheduled',
   (NOW() + INTERVAL '1 day')::date + TIME '08:00',
   54.7189, 25.2132, 54.6961, 25.2756,
   'Pašilaičių g. 15, Vilnius', 'Konstitucijos pr. 21, Vilnius',
   'my_car', 'My Car', 16.8, false)
ON CONFLICT DO NOTHING;

-- ============================================
-- 5. AI suggestions log
-- ============================================
INSERT INTO public.ai_suggestions (user_id, suggestion_type, input_context, ai_response, tokens_used)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'commute_plan',
   '{"mode":"car","daily_km":9.2}',
   '{"insight":"Carpooling with a colleague could cut your commute cost in half.","suggestions":[{"mode":"carpool","co2_saving_kg":0.89,"cost_saving_eur":4.2}]}',
   312),
  ('a1000000-0000-0000-0000-000000000004', 'carpool_match',
   '{"origin":"Viršuliškės","dest":"Konstitucijos pr."}',
   '{"ranked_matches":[{"user":"Lukas P.","score":87,"reasoning":"Same route, 15 min overlap"}]}',
   289),
  ('a1000000-0000-0000-0000-000000000010', 'sustainability_insight',
   '{"company":"Codeshift UAB","employees":10}',
   '{"green_commute_score":64,"executive_summary":"Team shows strong green commuting trend, led by cycling and e-bike users.","top_insights":["3 employees commute emission-free daily","Carpool adoption is growing"]}',
   521)
ON CONFLICT DO NOTHING;

-- ============================================
-- 6. Sample carpool suggestions (AI-generated)
-- ============================================
INSERT INTO public.carpool_suggestions (
  from_user_id, to_user_id, ride_id,
  compatibility_score, co2_saving_kg, estimated_detour_min,
  ai_reasoning, suggested_departure, status
) VALUES
  -- Tomas suggests to Agnė (they have overlapping routes)
  ('a1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001',
   'b1000000-0000-0000-0000-000000000001',
   0.87, 0.89, 8,
   'Tomas passes within 600m of your home on the way to the office. Sharing saves ~0.89 kg CO₂.',
   (NOW() + INTERVAL '1 day')::date + TIME '07:45', 'pending'),

  -- Karolis suggests to Eglė
  ('a1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000003',
   'b1000000-0000-0000-0000-000000000004',
   0.72, 1.57, 14,
   'Karolis drives a Tesla and passes near Šeškinė. Zero-emission carpool opportunity.',
   (NOW() + INTERVAL '1 day')::date + TIME '08:00', 'pending')
ON CONFLICT DO NOTHING;

-- Migration: Create core tables for clyzio app
-- Date: 2024-12-05

-- ============================================
-- 1. Create transport_modes table
-- ============================================
CREATE TABLE IF NOT EXISTS public.transport_modes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode_of_transport TEXT NOT NULL UNIQUE,
  co2_per_vehicle DECIMAL(10, 4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.transport_modes ENABLE ROW LEVEL SECURITY;

-- Allow read access to all authenticated users
CREATE POLICY "Allow read access for all users" ON public.transport_modes
  FOR SELECT USING (true);

-- Insert seed data
INSERT INTO public.transport_modes (mode_of_transport, co2_per_vehicle) VALUES
  ('Walking', 0.0),
  ('Car (Electric)', 0.032),
  ('Electric Bike/Scooter', 0.023),
  ('Ridesharing (2 people)', 0.192),
  ('Public Transport', 0.04),
  ('Car (Gasoline)', 0.192)
ON CONFLICT (mode_of_transport) DO NOTHING;

-- ============================================
-- 2. Create profiles table
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  is_driver BOOLEAN DEFAULT false,
  company_name TEXT,
  baseline_co2_mode TEXT DEFAULT 'Car (Gasoline)',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================
-- 3. Create function to auto-create profile on signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call function on new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- Migration: Create rides and messages tables for real-time booking & chat
-- Date: 2024-12-06

-- ============================================
-- 1. Create rides table
-- ============================================
CREATE TABLE IF NOT EXISTS public.rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'requested' CHECK (status IN ('requested', 'accepted', 'in_progress', 'completed', 'cancelled')),
  origin_lat DOUBLE PRECISION,
  origin_long DOUBLE PRECISION,
  dest_lat DOUBLE PRECISION,
  dest_long DOUBLE PRECISION,
  co2_saved DOUBLE PRECISION DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;

-- Users can read their own rides (as rider or driver)
CREATE POLICY "Users can view own rides" ON public.rides
  FOR SELECT USING (auth.uid() = rider_id OR auth.uid() = driver_id);

-- Users can create rides as rider
CREATE POLICY "Users can create rides" ON public.rides
  FOR INSERT WITH CHECK (auth.uid() = rider_id);

-- Users can update their own rides
CREATE POLICY "Users can update own rides" ON public.rides
  FOR UPDATE USING (auth.uid() = rider_id OR auth.uid() = driver_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.rides;

-- ============================================
-- 2. Create messages table
-- ============================================
CREATE TABLE IF NOT EXISTS public.messages (
  id BIGSERIAL PRIMARY KEY,
  ride_id UUID REFERENCES public.rides(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Users can read messages for rides they're part of
CREATE POLICY "Users can view ride messages" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.rides 
      WHERE rides.id = messages.ride_id 
      AND (rides.rider_id = auth.uid() OR rides.driver_id = auth.uid())
    )
  );

-- Users can insert messages for rides they're part of
CREATE POLICY "Users can send messages" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM public.rides 
      WHERE rides.id = messages.ride_id 
      AND (rides.rider_id = auth.uid() OR rides.driver_id = auth.uid())
    )
  );

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- ============================================
-- 3. Create index for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_rides_rider_id ON public.rides(rider_id);
CREATE INDEX IF NOT EXISTS idx_rides_driver_id ON public.rides(driver_id);
CREATE INDEX IF NOT EXISTS idx_rides_status ON public.rides(status);
CREATE INDEX IF NOT EXISTS idx_messages_ride_id ON public.messages(ride_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at);


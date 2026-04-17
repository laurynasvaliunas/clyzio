-- ============================================
-- ADD WAYPOINTS COLUMN TO RIDES TABLE
-- Run this in Supabase SQL Editor
-- Phase 22: Waypoints Feature
-- ============================================

-- Add waypoints column (jsonb array to store multiple stops)
ALTER TABLE public.rides 
ADD COLUMN IF NOT EXISTS waypoints JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.rides.waypoints IS 'Array of waypoint objects with lat/lng/name for stops along the route';

-- Example waypoint structure:
-- [
--   {
--     "latitude": 37.7749,
--     "longitude": -122.4194,
--     "name": "School Pickup"
--   },
--   {
--     "latitude": 37.7849,
--     "longitude": -122.4094,
--     "name": "Grocery Store"
--   }
-- ]

-- Verify the column was added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'rides' AND column_name = 'waypoints';


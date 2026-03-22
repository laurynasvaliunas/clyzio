-- Migration: Create ride_requests table for driver/rider matching
-- This table manages the request/approval flow between drivers and riders

CREATE TABLE IF NOT EXISTS ride_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ride_id UUID REFERENCES rides(id) ON DELETE CASCADE,
  
  -- Request details
  requester_role VARCHAR(10) NOT NULL CHECK (requester_role IN ('driver', 'rider')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  
  -- Route information
  pickup_lat DECIMAL(10, 8),
  pickup_long DECIMAL(11, 8),
  pickup_address TEXT,
  dropoff_lat DECIMAL(10, 8),
  dropoff_long DECIMAL(11, 8),
  dropoff_address TEXT,
  
  -- Metadata
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  responded_at TIMESTAMP WITH TIME ZONE,
  
  -- Ensure users can't request themselves
  CONSTRAINT no_self_request CHECK (requester_id != target_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ride_requests_requester ON ride_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_ride_requests_target ON ride_requests(target_id);
CREATE INDEX IF NOT EXISTS idx_ride_requests_status ON ride_requests(status);
CREATE INDEX IF NOT EXISTS idx_ride_requests_created ON ride_requests(created_at DESC);

-- RLS Policies
ALTER TABLE ride_requests ENABLE ROW LEVEL SECURITY;

-- Users can view requests they are involved in (as requester or target)
CREATE POLICY "Users can view their own requests"
ON ride_requests FOR SELECT
USING (
  auth.uid() = requester_id OR auth.uid() = target_id
);

-- Users can create requests
CREATE POLICY "Users can create requests"
ON ride_requests FOR INSERT
WITH CHECK (auth.uid() = requester_id);

-- Target users can update request status (accept/decline)
CREATE POLICY "Target users can respond to requests"
ON ride_requests FOR UPDATE
USING (auth.uid() = target_id)
WITH CHECK (auth.uid() = target_id);

-- Requesters can cancel their own requests
CREATE POLICY "Requesters can cancel requests"
ON ride_requests FOR UPDATE
USING (auth.uid() = requester_id AND status = 'pending')
WITH CHECK (auth.uid() = requester_id AND status = 'cancelled');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_ride_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  IF OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined') THEN
    NEW.responded_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamps
DROP TRIGGER IF EXISTS ride_requests_updated_at ON ride_requests;
CREATE TRIGGER ride_requests_updated_at
  BEFORE UPDATE ON ride_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_ride_requests_updated_at();

-- Comments
COMMENT ON TABLE ride_requests IS 'Manages ride sharing requests between drivers and riders';
COMMENT ON COLUMN ride_requests.requester_role IS 'Role of the person making the request (driver or rider)';
COMMENT ON COLUMN ride_requests.status IS 'Current status: pending, accepted, declined, or cancelled';


-- Updated RLS policies for rides table
-- Since solo rides now have rider_id set, we can simplify the policies

-- Drop existing policies
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON rides;
DROP POLICY IF EXISTS "Enable select for authenticated users" ON rides;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON rides;

-- Simplified policies: user must be driver OR rider
CREATE POLICY "Enable insert for authenticated users"
ON rides FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = driver_id OR auth.uid() = rider_id
);

CREATE POLICY "Enable select for authenticated users"
ON rides FOR SELECT
TO authenticated
USING (
  auth.uid() = driver_id OR auth.uid() = rider_id
);

CREATE POLICY "Enable update for authenticated users"
ON rides FOR UPDATE
TO authenticated
USING (
  auth.uid() = driver_id OR auth.uid() = rider_id
)
WITH CHECK (
  auth.uid() = driver_id OR auth.uid() = rider_id
);

-- Verify policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd 
FROM pg_policies 
WHERE tablename = 'rides';


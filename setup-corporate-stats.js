const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qvevbbqcrizfywqexlkw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2ZXZiYnFjcml6Znl3cWV4bGt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MDA4MDMsImV4cCI6MjA4MDI3NjgwM30.xxUFjg3RGvAcYkVvZzKxbWTG8MuAl0pX72fgTvaLhWI';

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupCorporateStats() {
  console.log('Setting up corporate stats functions...');
  console.log('');
  console.log('Please run these SQL commands in Supabase Dashboard (SQL Editor):');
  console.log('');
  console.log(`
-- Get department leaderboard for a user's department
CREATE OR REPLACE FUNCTION get_department_leaderboard(user_uuid UUID)
RETURNS TABLE(
  user_id UUID,
  user_name TEXT,
  total_co2_saved REAL,
  total_trips BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
  user_dept_id UUID;
BEGIN
  -- Get user's department
  SELECT department_id INTO user_dept_id 
  FROM public.profiles 
  WHERE id = user_uuid;
  
  IF user_dept_id IS NULL THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    p.id AS user_id,
    COALESCE(p.first_name || ' ' || COALESCE(p.last_name, ''), p.email) AS user_name,
    COALESCE(SUM(r.co2_saved), 0)::REAL AS total_co2_saved,
    COUNT(r.id) AS total_trips
  FROM public.profiles p
  LEFT JOIN public.rides r ON (r.rider_id = p.id OR r.driver_id = p.id) AND r.status = 'completed'
  WHERE p.department_id = user_dept_id
  GROUP BY p.id, p.first_name, p.last_name, p.email
  ORDER BY total_co2_saved DESC
  LIMIT 5;
END;
$$;

-- Get company breakdown by department
CREATE OR REPLACE FUNCTION get_company_breakdown(user_uuid UUID)
RETURNS TABLE(
  department_id UUID,
  department_name TEXT,
  total_co2_saved REAL,
  employee_count BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
  user_company_id UUID;
BEGIN
  -- Get user's company
  SELECT company_id INTO user_company_id 
  FROM public.profiles 
  WHERE id = user_uuid;
  
  IF user_company_id IS NULL THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    d.id AS department_id,
    d.name AS department_name,
    COALESCE(SUM(r.co2_saved), 0)::REAL AS total_co2_saved,
    COUNT(DISTINCT p.id) AS employee_count
  FROM public.departments d
  LEFT JOIN public.profiles p ON p.department_id = d.id
  LEFT JOIN public.rides r ON (r.rider_id = p.id OR r.driver_id = p.id) AND r.status = 'completed'
  WHERE d.company_id = user_company_id
  GROUP BY d.id, d.name
  ORDER BY total_co2_saved DESC;
END;
$$;

-- Get company totals
CREATE OR REPLACE FUNCTION get_company_totals(user_uuid UUID)
RETURNS TABLE(
  company_name TEXT,
  total_co2_saved REAL,
  total_trips BIGINT,
  employee_count BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
  user_company_id UUID;
BEGIN
  -- Get user's company
  SELECT company_id INTO user_company_id 
  FROM public.profiles 
  WHERE id = user_uuid;
  
  IF user_company_id IS NULL THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    c.name AS company_name,
    COALESCE(SUM(r.co2_saved), 0)::REAL AS total_co2_saved,
    COUNT(r.id) AS total_trips,
    COUNT(DISTINCT p.id) AS employee_count
  FROM public.companies c
  LEFT JOIN public.profiles p ON p.company_id = c.id
  LEFT JOIN public.rides r ON (r.rider_id = p.id OR r.driver_id = p.id) AND r.status = 'completed'
  WHERE c.id = user_company_id
  GROUP BY c.id, c.name;
END;
$$;
  `);
}

setupCorporateStats().catch(console.error);


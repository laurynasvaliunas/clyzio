const SUPABASE_ACCESS_TOKEN = '***REVOKED-SUPABASE-TOKEN***';
const PROJECT_REF = 'qvevbbqcrizfywqexlkw';

async function setupCorporate() {
  console.log('🔧 Setting up Corporate Identity tables...\n');
  
  const sql = `
    -- 1. CREATE COMPANIES TABLE
    CREATE TABLE IF NOT EXISTS public.companies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      domain TEXT UNIQUE NOT NULL,
      logo_url TEXT,
      primary_color TEXT DEFAULT '#4DD0E1',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Enable RLS
    ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
    
    -- Allow authenticated users to read companies
    DROP POLICY IF EXISTS "Users can view companies" ON public.companies;
    CREATE POLICY "Users can view companies" ON public.companies 
      FOR SELECT USING (true);

    -- 2. CREATE DEPARTMENTS TABLE
    CREATE TABLE IF NOT EXISTS public.departments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(company_id, name)
    );

    -- Enable RLS
    ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
    
    -- Allow authenticated users to read departments
    DROP POLICY IF EXISTS "Users can view departments" ON public.departments;
    CREATE POLICY "Users can view departments" ON public.departments 
      FOR SELECT USING (true);

    -- 3. UPDATE PROFILES TABLE
    ALTER TABLE public.profiles 
      ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id),
      ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id),
      ADD COLUMN IF NOT EXISTS is_solo_user BOOLEAN DEFAULT false;

    -- 4. CREATE FUNCTION TO ASSIGN COMPANY ON PROFILE CREATION
    CREATE OR REPLACE FUNCTION public.assign_company_to_profile()
    RETURNS TRIGGER AS $$
    DECLARE
      user_domain TEXT;
      matched_company_id UUID;
    BEGIN
      -- Extract domain from email
      user_domain := LOWER(SPLIT_PART(NEW.email, '@', 2));
      
      -- Check for generic email domains
      IF user_domain IN ('gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'protonmail.com') THEN
        NEW.is_solo_user := true;
        NEW.company_id := NULL;
        RETURN NEW;
      END IF;
      
      -- Look up company by domain
      SELECT id INTO matched_company_id
      FROM public.companies
      WHERE LOWER(domain) = user_domain;
      
      IF matched_company_id IS NOT NULL THEN
        NEW.company_id := matched_company_id;
        NEW.is_solo_user := false;
      ELSE
        -- Corporate domain but company not registered yet
        NEW.is_solo_user := false;
        NEW.company_id := NULL;
      END IF;
      
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    -- Create trigger on profile insert/update
    DROP TRIGGER IF EXISTS on_profile_assign_company ON public.profiles;
    CREATE TRIGGER on_profile_assign_company
      BEFORE INSERT ON public.profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.assign_company_to_profile();

    -- 5. UPDATE EXISTING HANDLE_NEW_USER FUNCTION
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS TRIGGER AS $$
    DECLARE
      user_domain TEXT;
      matched_company_id UUID;
      solo_flag BOOLEAN;
    BEGIN
      -- Extract domain from email
      user_domain := LOWER(SPLIT_PART(NEW.email, '@', 2));
      
      -- Check for generic email domains
      IF user_domain IN ('gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'protonmail.com') THEN
        solo_flag := true;
        matched_company_id := NULL;
      ELSE
        -- Look up company by domain
        SELECT id INTO matched_company_id
        FROM public.companies
        WHERE LOWER(domain) = user_domain;
        
        solo_flag := false;
      END IF;
      
      INSERT INTO public.profiles (id, email, company_id, is_solo_user)
      VALUES (NEW.id, NEW.email, matched_company_id, solo_flag);
      
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    -- 6. SEED SOME EXAMPLE COMPANIES
    INSERT INTO public.companies (name, domain, logo_url, primary_color)
    VALUES 
      ('Clyzio', 'clyzio.com', NULL, '#4DD0E1'),
      ('Tesla', 'tesla.com', NULL, '#CC0000'),
      ('Google', 'google.com', NULL, '#4285F4'),
      ('Microsoft', 'microsoft.com', NULL, '#00A4EF'),
      ('Apple', 'apple.com', NULL, '#555555')
    ON CONFLICT (domain) DO NOTHING;

    -- 7. SEED SOME DEPARTMENTS FOR EACH COMPANY
    INSERT INTO public.departments (company_id, name)
    SELECT c.id, d.name
    FROM public.companies c
    CROSS JOIN (
      VALUES ('Engineering'), ('Marketing'), ('Sales'), ('Human Resources'), ('Finance'), ('Operations')
    ) AS d(name)
    ON CONFLICT (company_id, name) DO NOTHING;
  `;
  
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Failed:', response.status, errorText);
    return;
  }
  
  console.log('✅ Corporate Identity setup complete!');
  console.log('   - companies table created');
  console.log('   - departments table created');
  console.log('   - profiles updated with company_id, department_id, is_solo_user');
  console.log('   - Domain matching trigger created');
  console.log('   - Sample companies seeded (Clyzio, Tesla, Google, Microsoft, Apple)');
  console.log('   - Departments seeded for each company');
}

setupCorporate().catch(console.error);


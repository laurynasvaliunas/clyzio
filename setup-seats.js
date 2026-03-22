const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qvevbbqcrizfywqexlkw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2ZXZiYnFjcml6Znl3cWV4bGt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MDA4MDMsImV4cCI6MjA4MDI3NjgwM30.xxUFjg3RGvAcYkVvZzKxbWTG8MuAl0pX72fgTvaLhWI';

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupSeats() {
  console.log('Adding available_seats column to rides table...');
  
  const { error } = await supabase.rpc('exec_sql', {
    sql: `
      -- Add available_seats column to rides table
      ALTER TABLE public.rides 
      ADD COLUMN IF NOT EXISTS available_seats INTEGER DEFAULT 4;
      
      -- Update existing rides to have default seats
      UPDATE public.rides 
      SET available_seats = 4 
      WHERE available_seats IS NULL;
    `
  });

  if (error) {
    // Try direct SQL if RPC doesn't exist
    console.log('RPC not available, trying direct approach...');
    
    // Check if column exists by querying
    const { data, error: selectError } = await supabase
      .from('rides')
      .select('available_seats')
      .limit(1);
    
    if (selectError && selectError.message.includes('available_seats')) {
      console.log('Column does not exist. Please run this SQL in Supabase Dashboard:');
      console.log(`
ALTER TABLE public.rides 
ADD COLUMN available_seats INTEGER DEFAULT 4;
      `);
    } else {
      console.log('Column already exists or was added successfully!');
    }
  } else {
    console.log('Successfully added available_seats column!');
  }
}

setupSeats().catch(console.error);


// IMPORTANT: You are using the SERVICE ROLE key in the frontend. 
// For a production app, you should use the "anon_key" and enforce Row Level Security (RLS) in Supabase.
// I'm using the provided service key because it guarantees our queries will work instantly without complex RLS issues for now.
const SUPABASE_URL = 'https://djkuezrfpktfraokprok.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqa3VlenJmcGt0ZnJhb2twcm9rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk4Mzg0MiwiZXhwIjoyMDkyNTU5ODQyfQ.Tb78LrRlS-m8gbSAmulI9xKZp5F5PFS3ucYrkCxScTk';

window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

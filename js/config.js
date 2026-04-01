// Supabase Configuration
const SUPABASE_URL = 'https://rilgmbjpdgndfwdjodos.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpbGdtYmpwZGduZGZ3ZGpvZG9zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDQyMjUsImV4cCI6MjA5MDYyMDIyNX0.HFeeaJdY8-VDUqqDQsVt4pZOu25kP6wvYzZdTbxFui8';
const STORAGE_BUCKET = 'question-images';

// Initialize Supabase client (uses global supabase from CDN)
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

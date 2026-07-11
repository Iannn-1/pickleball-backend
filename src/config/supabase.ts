import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL ?? '';
// Standardized to SUPABASE_KEY — remove SUPABASE_ANON_KEY fallback
const supabaseKey = process.env.SUPABASE_KEY ?? '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env file!');
  process.exit(1);
}

export const supabase = createClient(supabaseUrl, supabaseKey);
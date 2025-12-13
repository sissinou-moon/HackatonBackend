import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseAnonKey = process.env.SUPABASE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing SUPABASE_URL. Please check your .env.local file.');
}

if (!supabaseServiceKey && !supabaseAnonKey) {
  throw new Error('Missing Supabase key. Please provide SUPABASE_SERVICE_KEY or SUPABASE_KEY in .env.local');
}

/**
 * Service Role Client - BYPASSES RLS
 * Use this for server-side operations like file uploads, admin tasks
 * This client has full access to all data regardless of RLS policies
 */
export const supabaseAdmin: SupabaseClient = createClient(
  supabaseUrl,
  supabaseServiceKey || supabaseAnonKey!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/**
 * Anon/Public Client - RESPECTS RLS
 * Use this for user authentication and operations that should respect RLS
 * This is the client that should be used for auth operations
 */
export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey || supabaseServiceKey!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export const BUCKET_NAME = 'documents';

// Log which keys are being used (for debugging, remove in production)
console.log('🔐 Supabase initialized:');
console.log(`   - URL: ${supabaseUrl}`);
console.log(`   - Service Key: ${supabaseServiceKey ? '✓ Available' : '✗ Missing'}`);
console.log(`   - Anon Key: ${supabaseAnonKey ? '✓ Available' : '✗ Missing'}`);

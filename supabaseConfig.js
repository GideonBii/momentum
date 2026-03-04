// supabaseConfig.js - Replaces firebaseConfig.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ctmzcbtzvqmpfyanspbe.supabase.co"; // <- paste yours here
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0bXpjYnR6dnFtcGZ5YW5zcGJlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAxMDUyNCwiZXhwIjoyMDg3NTg2NTI0fQ.4NMkvNP4esQKkLpusFARknm1v9DkGxUnrylAKC51Y9A";  // <- paste your anon key here

// Your Render backend URL (from Phase 2)
export const BACKEND_URL = "https://momentum-backend-2.onrender.com"; // <- paste yours

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export default supabase;
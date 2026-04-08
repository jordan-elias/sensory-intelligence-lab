// auth-guard.js

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = "YOUR_SUPABASE_URL";
const supabaseAnonKey = "YOUR_SUPABASE_ANON_KEY";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkAuth() {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session) {
    console.log("User not authenticated");

    window.location.href = "/";
    return;
  }

  console.log("User authenticated:", data.session.user.email);
}

checkAuth();

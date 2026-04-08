// auth-guard.js

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://lrjuufvrgkuvfxcmybtf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_VyiIJOgsGueUOVU_ed49-Q_rS4mi7J1";


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

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ─────────────────────────────
PRICE MAP
Replace these with your actual Stripe Price IDs.
Find them in Stripe Dashboard → Products → click a product → copy the Price ID (price_xxx).
Alternatively, if you've set lookup_keys in Stripe, you can use stripe.prices.list({ lookup_keys: [plan] })
instead of a hardcoded map — see the comment in the handler below.
───────────────────────────── */
const PRICE_IDS = {
  lab_monthly:   process.env.STRIPE_PRICE_LAB_MONTHLY   || "price_lab_monthly_id_here",
  lab_yearly:    process.env.STRIPE_PRICE_LAB_YEARLY    || "price_lab_yearly_id_here",
  call1_monthly: process.env.STRIPE_PRICE_CALL1_MONTHLY || "price_call1_monthly_id_here",
  call1_yearly:  process.env.STRIPE_PRICE_CALL1_YEARLY  || "price_call1_yearly_id_here",
  call2_monthly: process.env.STRIPE_PRICE_CALL2_MONTHLY || "price_call2_monthly_id_here",
  call2_yearly:  process.env.STRIPE_PRICE_CALL2_YEARLY  || "price_call2_yearly_id_here",
};

const TIER_ORDER = { free: 0, lab: 1, call1: 2, call2: 3 };

// Session capacity — must match SESSION_CAPACITY in create-checkout-session.js
const SESSION_CAPACITY  = 64;
const SESSIONS_PER_TIER = { call1: 1, call2: 2 };

function getTierFromPlan(plan) {
  if (plan.startsWith("lab"))   return "lab";
  if (plan.startsWith("call1")) return "call1";
  if (plan.startsWith("call2")) return "call2";
  return "free";
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  /* ── Auth ── */
  const token = (event.headers.authorization || "").replace("Bearer ", "").trim();
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: "Missing auth token" }) };
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  /* ── Parse body ── */
  let plan;
  try {
    ({ plan } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body" }) };
  }

  if (!plan || !PRICE_IDS[plan]) {
    return { statusCode: 400, body: JSON.stringify({ error: `Invalid plan: ${plan}` }) };
  }

  /* ── Fetch user profile ── */
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("stripe_subscription_id, subscription_tier, subscription_status")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return { statusCode: 400, body: JSON.stringify({ error: "Could not load user profile" }) };
  }

  if (!profile.stripe_subscription_id) {
    return { statusCode: 400, body: JSON.stringify({ error: "No active subscription found. Please subscribe first." }) };
  }

  if (!["active", "trialing"].includes(profile.subscription_status)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Subscription is not currently active." }) };
  }

  const newTier   = getTierFromPlan(plan);
  const oldTier   = profile.subscription_tier || "free";
  const isUpgrade = TIER_ORDER[newTier] > TIER_ORDER[oldTier];

  /* ── Capacity check for session tiers (upgrades only) ── */
  if (isUpgrade && SESSIONS_PER_TIER[newTier]) {
    const { data: activeRows } = await supabase
      .from("profiles")
      .select("subscription_tier")
      .in("subscription_tier", ["call1", "call2"])
      .in("subscription_status", ["active", "trialing"]);

    const sessionsUsed = (activeRows || []).reduce(
      (t, r) => t + (SESSIONS_PER_TIER[r.subscription_tier] ?? 0), 0
    );

    if (sessionsUsed + SESSIONS_PER_TIER[newTier] > SESSION_CAPACITY) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: "capacity_full", message: "Session slots are currently full." }),
      };
    }
  }

  /* ── Update Stripe subscription ── */
  try {
    const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
    const itemId       = subscription.items.data[0].id;

    // Option A: use hardcoded PRICE_IDS map (default)
    const newPriceId = PRICE_IDS[plan];

    // Option B (alternative): resolve by lookup_key if you've set them in Stripe
    // const prices    = await stripe.prices.list({ lookup_keys: [plan], limit: 1 });
    // const newPriceId = prices.data[0]?.id;
    // if (!newPriceId) throw new Error(`No price found for lookup key: ${plan}`);

    await stripe.subscriptions.update(profile.stripe_subscription_id, {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: isUpgrade
        ? "always_invoice"   // charge prorated difference immediately
        : "none",            // downgrade takes effect at end of billing period
    });

    const message = isUpgrade
      ? "Your plan has been upgraded and access is now active."
      : "Your plan will downgrade at the end of your current billing period. You keep full access until then.";

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message, isUpgrade }),
    };

  } catch (err) {
    console.error("Stripe subscription update error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Failed to update subscription" }),
    };
  }
}

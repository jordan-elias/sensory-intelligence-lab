import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

/* ─────────────────────────────
   STRIPE
   ───────────────────────────── */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

/* ─────────────────────────────
   SUPABASE (SERVER)
   ───────────────────────────── */

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ─────────────────────────────
   PLAN → PRICE MAP
   ───────────────────────────── */

const PRICE_MAP = {
  lab_monthly:   process.env.STRIPE_LAB_MONTHLY_PRICE_ID,
  lab_yearly:    process.env.STRIPE_LAB_YEARLY_PRICE_ID,
  call1_monthly: process.env.STRIPE_CALL1_MONTHLY_PRICE_ID,
  call1_yearly:  process.env.STRIPE_CALL1_YEARLY_PRICE_ID,
  call2_monthly: process.env.STRIPE_CALL2_MONTHLY_PRICE_ID,
  call2_yearly:  process.env.STRIPE_CALL2_YEARLY_PRICE_ID,
};

// Sessions committed per subscriber per month, by tier
const SESSIONS_PER_TIER = { call1: 1, call2: 2 };

// Maximum total sessions per month across all session-tier subscribers
const SESSION_CAPACITY = 64;

/* ─────────────────────────────
   HELPERS
   ───────────────────────────── */

function getPlanTier(plan) {
  if (plan.startsWith("lab"))   return "lab";
  if (plan.startsWith("call1")) return "call1";
  if (plan.startsWith("call2")) return "call2";
  return "unknown";
}

/**
 * Count total monthly sessions currently committed across all active
 * call1 and call2 subscribers. Used to enforce the 64-session cap.
 *
 * We read from `profiles` (written by the Stripe webhook) rather than
 * a separate subscriptions table so the check is consistent with the
 * rest of the codebase.
 */
async function getTotalSessionsCommitted() {
  const { data, error } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .in("subscription_tier", ["call1", "call2"])
    .in("subscription_status", ["active", "trialing"]);

  if (error) {
    console.error("Could not count active session subscribers:", error);
    // Fail open — don't block checkout due to a counting failure
    return 0;
  }

  return (data || []).reduce((total, row) => {
    return total + (SESSIONS_PER_TIER[row.subscription_tier] ?? 0);
  }, 0);
}

/* ─────────────────────────────
   NETLIFY HANDLER
   ───────────────────────────── */

export async function handler(event) {

  /* METHOD CHECK */
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {

    /* PARSE BODY */
    const body = JSON.parse(event.body);
    const plan = body.plan;

    if (!plan) {
      return { statusCode: 400, body: "Plan required" };
    }

    /* VALIDATE PLAN */
    const priceId = PRICE_MAP[plan];
    if (!priceId) {
      console.error("Invalid plan:", plan);
      return { statusCode: 400, body: "Invalid plan" };
    }

    /* AUTH HEADER */
    const authHeader = event.headers.authorization;
    if (!authHeader) {
      return { statusCode: 401, body: "Missing authorization header" };
    }

    const token = authHeader.replace("Bearer ", "");

    /* VERIFY USER */
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      console.error("User auth failed:", userError);
      return { statusCode: 401, body: "Invalid user" };
    }

    /* CHECK FOR EXISTING ACTIVE SUBSCRIPTION
       Belt-and-suspenders: the RLS unique partial index and the webhook
       both enforce this, but we also block it here for a clean UX error. */
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("subscription_status, subscription_tier")
      .eq("id", user.id)
      .single();

    const hasActiveSub =
      existingProfile?.subscription_status === "active" ||
      existingProfile?.subscription_status === "trialing";

    if (hasActiveSub) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "You already have an active subscription. Manage it via the billing portal.",
        }),
      };
    }

    /* SESSION CAPACITY CHECK (call1 and call2 only)
       If adding this subscriber's monthly sessions would exceed the cap, block checkout.
       We query live counts so concurrent signups are handled correctly.
       Note: there is a small TOCTOU window between this check and the webhook
       writing the new subscription — acceptable at this scale. */
    const tier = getPlanTier(plan);
    if (tier === "call1" || tier === "call2") {
      const sessionsNeeded = SESSIONS_PER_TIER[tier];
      const sessionsUsed   = await getTotalSessionsCommitted();

      if (sessionsUsed + sessionsNeeded > SESSION_CAPACITY) {
        const remaining = Math.max(0, SESSION_CAPACITY - sessionsUsed);
        console.log(
          `Session capacity reached: ${sessionsUsed}/${SESSION_CAPACITY} used, ` +
          `${sessionsNeeded} needed, ${remaining} slots left`
        );
        return {
          statusCode: 409,
          body: JSON.stringify({
            error: "capacity_full",
            message:
              "All session slots for this month are currently filled. " +
              "Please join the waitlist or check back next month.",
          }),
        };
      }
    }

    /* CREATE STRIPE CHECKOUT SESSION */
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url:    process.env.SITE_URL + "/dashboard/?success=true",
      cancel_url:     process.env.SITE_URL + "/subscribe/?canceled=true",
      customer_email: user.email,
      metadata: {
        user_id: user.id,
        email:   user.email,
        plan,
        tier,
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url }),
    };

  } catch (error) {
    console.error("Checkout error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to create checkout session" }),
    };
  }
}

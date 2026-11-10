import { withCors } from './lib/cors.js';
import { returnUrl } from './lib/return-url.js';
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
};

/* ─────────────────────────────
   HELPERS
   ───────────────────────────── */

function getPlanTier(plan) {
  return plan.startsWith("lab") ? "lab" : "unknown";
}

/* ─────────────────────────────
   NETLIFY HANDLER
   ───────────────────────────── */

async function rawHandler(event) {

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

    if (existingProfile?.subscription_status === "past_due") {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error:
            "Your subscription has a failed payment. Please update your payment method via the billing portal.",
        }),
      };
    }

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

    const tier = getPlanTier(plan);

    /* CREATE STRIPE CHECKOUT SESSION */
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url:    returnUrl(process.env.SITE_URL, "/subscribe/?success=true", body.app === true),
      cancel_url:     returnUrl(process.env.SITE_URL, "/subscribe/?canceled=true", body.app === true),
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

export const handler = withCors(rawHandler);

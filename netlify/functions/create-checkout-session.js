import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

/* ─────────────────────────────
STRIPE
───────────────────────────── */

const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY,
  {
    apiVersion: "2024-06-20"
  }
);

/* ─────────────────────────────
SUPABASE (SERVER)
───────────────────────────── */

const supabase =
createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ─────────────────────────────
PLAN → PRICE MAP
───────────────────────────── */

const PRICE_MAP = {

  lab_monthly:
    process.env
    .STRIPE_LAB_MONTHLY_PRICE_ID,

  lab_yearly:
    process.env
    .STRIPE_LAB_YEARLY_PRICE_ID,

  call1_monthly:
    process.env
    .STRIPE_CALL1_MONTHLY_PRICE_ID,

  call1_yearly:
    process.env
    .STRIPE_CALL1_YEARLY_PRICE_ID,

  call2_monthly:
    process.env
    .STRIPE_CALL2_MONTHLY_PRICE_ID,

  call2_yearly:
    process.env
    .STRIPE_CALL2_YEARLY_PRICE_ID

};

/* ─────────────────────────────
HELPER — PLAN TYPE
───────────────────────────── */

function getPlanTier(plan) {

  if (plan.startsWith("lab"))
    return "lab";

  if (plan.startsWith("call1"))
    return "call1";

  if (plan.startsWith("call2"))
    return "call2";

  return "unknown";

}

/* ─────────────────────────────
NETLIFY HANDLER
───────────────────────────── */

export async function handler(event) {

  /* METHOD CHECK */

  if (event.httpMethod !== "POST") {

    return {
      statusCode: 405,
      body: "Method not allowed"
    };

  }

  try {

    /* PARSE BODY */

    const body =
    JSON.parse(event.body);

    const plan =
    body.plan;

    if (!plan) {

      return {
        statusCode: 400,
        body: "Plan required"
      };

    }

    /* VALIDATE PLAN */

    const priceId =
    PRICE_MAP[plan];

    if (!priceId) {

      console.error(
        "Invalid plan:",
        plan
      );

      return {
        statusCode: 400,
        body: "Invalid plan"
      };

    }

    /* AUTH HEADER */

    const authHeader =
    event.headers.authorization;

    if (!authHeader) {

      return {
        statusCode: 401,
        body: "Missing authorization header"
      };

    }

    const token =
    authHeader.replace(
      "Bearer ",
      ""
    );

    /* VERIFY USER */

    const {
      data: { user },
      error: userError
    } =
    await supabase
    .auth
    .getUser(token);

    if (userError || !user) {

      console.error(
        "User auth failed:",
        userError
      );

      return {
        statusCode: 401,
        body: "Invalid user"
      };

    }

    /* OPTIONAL:
       CHECK IF USER ALREADY
       HAS ACTIVE SUBSCRIPTION
    */

    const {
      data: existingSub
    } =
    await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();

    if (
      existingSub &&
      existingSub.status ===
      "active"
    ) {

      return {
        statusCode: 400,
        body:
        "You already have an active subscription."
      };

    }

    /* CREATE STRIPE SESSION */

    const session =
    await stripe
    .checkout
    .sessions
    .create({

      mode:
        "subscription",

      payment_method_types:
        ["card"],

      line_items: [

        {
          price:
            priceId,

          quantity:
            1

        }

      ],

      success_url:

        process.env
        .SITE_URL +

        "/dashboard/?success=true",

      cancel_url:

        process.env
        .SITE_URL +

        "/subscribe/?canceled=true",

      customer_email:
        user.email,

      metadata: {

        user_id:
          user.id,

        email:
          user.email,

        plan:
          plan,

        tier:
          getPlanTier(plan)

      }

    });

    /* RETURN URL */

    return {

      statusCode: 200,

      body:
      JSON.stringify({

        url:
          session.url

      })

    };

  }

  catch (error) {

    console.error(
      "Checkout error:",
      error
    );

    return {

      statusCode: 500,

      body:
      JSON.stringify({

        error:
        "Failed to create checkout session"

      })

    };

  }

}

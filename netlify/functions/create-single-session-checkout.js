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
NETLIFY HANDLER
───────────────────────────── */

export async function handler(event) {

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {

    /* AUTH HEADER */
    const authHeader = event.headers.authorization;
    if (!authHeader) {
      return { statusCode: 401, body: "Missing authorization header" };
    }

    const token = authHeader.replace("Bearer ", "");

    /* VERIFY USER */
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error("User auth failed:", userError);
      return { statusCode: 401, body: "Invalid user" };
    }

    /* CREATE STRIPE CHECKOUT SESSION
       - mode: payment (one-time, not subscription)
       - price: STRIPE_SINGLE_SESSION_PRICE_ID env var
       - After payment: redirect to /booking/?session_paid=true
         so the booking page can show the Cal.com embed to schedule the time
    */

    const session = await stripe.checkout.sessions.create({

      mode: "payment",

      payment_method_types: ["card"],

      line_items: [
        {
          price: process.env.STRIPE_SINGLE_SESSION_PRICE_ID,
          quantity: 1,
        },
      ],

      /* Cancellation policy shown on checkout:
         - Full refund if cancelled more than 48 hours before session start
         - No refund within 48 hours (reschedule offered)
         The policy text surfaces here and is enforced manually.
      */
      payment_intent_data: {
        description:
          "50-minute video session with Jordan Elias. " +
          "Full refund if cancelled more than 48 hours before your appointment. " +
          "Within 48 hours, sessions may be rescheduled but not refunded.",
        metadata: {
          user_id: user.id,
          email: user.email,
          type: "single_session",
        },
      },

      success_url:
        process.env.SITE_URL +
        "/booking/?session_paid=true",

      cancel_url:
        process.env.SITE_URL +
        "/booking/?session_canceled=true",

      customer_email: user.email,

      metadata: {
        user_id: user.id,
        email: user.email,
        type: "single_session",
      },

    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url }),
    };

  } catch (error) {
    console.error("Single session checkout error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to create checkout session" }),
    };
  }
}

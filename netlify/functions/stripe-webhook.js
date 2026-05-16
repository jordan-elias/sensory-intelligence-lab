import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

/* ─────────────────────────────
STRIPE
───────────────────────────── */
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

/* ─────────────────────────────
SUPABASE
───────────────────────────── */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ─────────────────────────────
RESEND
───────────────────────────── */
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM    = process.env.RESEND_FROM_ADDRESS || "Jordan Elias <hello@jordanelias.de>";

// Aliases must match exactly what you named them in Resend → Templates
const TEMPLATE_BY_TIER = {
  lab:   "subscription-successful",
  call1: "upgrade-successful-1",
  call2: "upgrade-successful-2",
};

async function sendTierEmail({ to, tier, variables, idempotencyKey }) {
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY not set — skipping email");
    return;
  }

  const templateAlias = TEMPLATE_BY_TIER[tier];
  if (!templateAlias) {
    console.log(`No email template configured for tier "${tier}" — skipping`);
    return;
  }

  if (!to) {
    console.error("No recipient email — skipping email");
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization:     `Bearer ${RESEND_API_KEY}`,
        "Content-Type":    "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from:        RESEND_FROM,
        to:          [to],
        template_id: templateAlias,
        variables,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`Resend send failed (${res.status}):`, err);
    } else {
      console.log(`Email sent → ${to} (template: ${templateAlias})`);
    }
  } catch (err) {
    console.error("Resend threw an error:", err);
  }
}

/* ─────────────────────────────
HELPERS
───────────────────────────── */

function getTierFromPlan(plan) {
  switch (plan) {
    case "lab_monthly":
    case "lab_yearly":
      return "lab";
    case "call1_monthly":
    case "call1_yearly":
      return "call1";
    case "call2_monthly":
    case "call2_yearly":
      return "call2";
    default:
      return "free";
  }
}

// Send an email whenever the tier changes to something paid and the subscription
// is active or trialing — this covers both upgrades and downgrades (e.g. call2→lab).
function shouldSendEmail({ status, tier, oldTier }) {
  return (
    ["active", "trialing"].includes(status) &&
    tier !== "free" &&
    tier !== (oldTier || "free")
  );
}

async function upsertSubscription({
  userId, email, plan, tier, customerId, subscriptionId, status, periodEnd,
}) {
  const { error } = await supabase.from("subscriptions").upsert(
    {
      user_id:                userId,
      email,
      plan,
      tier,
      stripe_customer_id:     customerId,
      stripe_subscription_id: subscriptionId,
      status,
      current_period_end:     periodEnd,
    },
    { onConflict: "stripe_subscription_id" }
  );
  if (error) console.error("Supabase subscription upsert error:", error);
}

async function updateProfile({
  userId, email, plan, tier, customerId, subscriptionId, status, periodEnd,
}) {
  const { error } = await supabase
    .from("profiles")
    .update({
      email,
      subscription_status:    status,
      subscription_plan:      plan,
      subscription_tier:      tier,
      stripe_customer_id:     customerId,
      stripe_subscription_id: subscriptionId,
      current_period_end:     periodEnd,
      updated_at:             new Date(),
    })
    .eq("id", userId);

  if (error) console.error("Profile update error:", error);
}

/* ─────────────────────────────
NETLIFY HANDLER
───────────────────────────── */
export async function handler(event) {
  const sig = event.headers["stripe-signature"];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  try {
    switch (stripeEvent.type) {

      /* ─────────────────────────────
      CHECKOUT COMPLETED
      ───────────────────────────── */
      case "checkout.session.completed": {
        const session      = stripeEvent.data.object;
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const metadata     = session.metadata;
        const periodEnd    = new Date(subscription.current_period_end * 1000);
        const tier         = getTierFromPlan(metadata.plan);

        // cancel_at_period_end from the subscription object
        const cancelAtPeriodEnd = !!subscription.cancel_at_period_end;

        // Fetch existing profile to detect tier change and get name
        const { data: profile } = await supabase
          .from("profiles")
          .select("subscription_tier, email, full_name")
          .eq("id", metadata.user_id)
          .single();

        const oldTier = profile?.subscription_tier || "free";

        await upsertSubscription({
          userId:         metadata.user_id,
          email:          metadata.email,
          plan:           metadata.plan,
          tier,
          customerId:     session.customer,
          subscriptionId: subscription.id,
          status:         subscription.status,
          periodEnd,
        });

        await updateProfile({
          userId:         metadata.user_id,
          email:          metadata.email,
          plan:           metadata.plan,
          tier,
          customerId:     session.customer,
          subscriptionId: subscription.id,
          status:         subscription.status,
          periodEnd,
        });

        // Write cancel_at_period_end separately (not in updateProfile helper to
        // keep the helper reusable for the checkout flow where it's always false)
        await supabase
          .from("profiles")
          .update({ cancel_at_period_end: cancelAtPeriodEnd })
          .eq("id", metadata.user_id);

        console.log("Subscription created:", subscription.id, "| Tier:", tier);

        if (shouldSendEmail({ status: subscription.status, tier, oldTier })) {
          await sendTierEmail({
            to:   metadata.email || profile?.email,
            tier,
            variables: {
              NAME:       profile?.full_name || metadata.email || "",
              USER_EMAIL: metadata.email || profile?.email || "",
              PLAN:       metadata.plan || "",
              TIER:       tier,
            },
            idempotencyKey: `checkout:${stripeEvent.id}`,
          });
        }

        break;
      }

      /* ─────────────────────────────
      SUBSCRIPTION UPDATED
      (upgrades, downgrades, renewals, cancellation scheduling)
      ───────────────────────────── */
      case "customer.subscription.updated": {
        const subscription   = stripeEvent.data.object;
        const customerId     = subscription.customer;
        const subscriptionId = subscription.id;
        const periodEnd      = new Date(subscription.current_period_end * 1000);
        const status         = subscription.status;

        // Capture whether the user has scheduled a cancellation at period end
        const cancelAtPeriodEnd = !!subscription.cancel_at_period_end;

        const price     = subscription.items?.data?.[0]?.price;
        const lookupKey = price?.lookup_key;
        if (!lookupKey) {
          throw new Error(
            `customer.subscription.updated: Stripe price ${price?.id ?? "?"} has no lookup_key — set lookup_key in the Stripe Dashboard (subscription ${subscriptionId})`
          );
        }
        const plan = lookupKey;
        const tier = getTierFromPlan(plan);
        if (tier === "free") {
          throw new Error(
            `customer.subscription.updated: unrecognized plan lookup_key "${lookupKey}" (subscription ${subscriptionId})`
          );
        }

        // Fetch before updating so we can detect the tier change
        const { data: profile } = await supabase
          .from("profiles")
          .select("subscription_tier, email, full_name")
          .eq("stripe_subscription_id", subscriptionId)
          .single();

        const oldTier = profile?.subscription_tier || "free";

        await supabase.from("subscriptions").upsert({
          stripe_subscription_id: subscriptionId,
          stripe_customer_id:     customerId,
          plan,
          tier,
          status,
          current_period_end: periodEnd,
        }, { onConflict: "stripe_subscription_id" });

        await supabase
          .from("profiles")
          .update({
            subscription_plan:      plan,
            subscription_tier:      tier,
            subscription_status:    status,
            current_period_end:     periodEnd,
            cancel_at_period_end:   cancelAtPeriodEnd,
            updated_at:             new Date(),
          })
          .eq("stripe_subscription_id", subscriptionId);

        console.log(
          "Subscription updated:", subscriptionId,
          "| Tier:", tier,
          "| Status:", status,
          "| cancel_at_period_end:", cancelAtPeriodEnd
        );

        // Send email on any paid tier change (upgrade or downgrade)
        if (shouldSendEmail({ status, tier, oldTier })) {
          await sendTierEmail({
            to:   profile?.email,
            tier,
            variables: {
              NAME:       profile?.full_name || profile?.email || "",
              USER_EMAIL: profile?.email || "",
              PLAN:       plan,
              TIER:       tier,
            },
            idempotencyKey: `sub-updated:${stripeEvent.id}`,
          });
        }

        break;
      }

      /* ─────────────────────────────
      PAYMENT SUCCESS
      (monthly/yearly renewal)
      ───────────────────────────── */
      case "invoice.paid": {
        const invoice = stripeEvent.data.object;
        const rawSub  = invoice.subscription;
        const subscriptionId =
          typeof rawSub === "string" ? rawSub : rawSub?.id ?? null;

        if (!subscriptionId) {
          console.log(
            "invoice.paid: no subscription on invoice — skipping DB update",
            invoice.id
          );
          break;
        }

        const lines = invoice.lines?.data ?? [];
        let periodEndUnix = null;
        for (const line of lines) {
          if (line?.period?.end != null) {
            periodEndUnix = line.period.end;
            break;
          }
        }

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);

        if (periodEndUnix == null) {
          if (subscription.current_period_end != null) {
            periodEndUnix = subscription.current_period_end;
          } else {
            console.error(
              "invoice.paid: could not resolve period end — skipping DB update",
              { invoiceId: invoice.id, subscriptionId }
            );
            break;
          }
        }

        const periodEnd = new Date(periodEndUnix * 1000);
        const subStatus = subscription.status;

        // On renewal cancel_at_period_end resets to false, so sync it
        const cancelAtPeriodEnd = !!subscription.cancel_at_period_end;

        await supabase
          .from("subscriptions")
          .update({
            status:             subStatus,
            current_period_end: periodEnd,
          })
          .eq("stripe_subscription_id", subscriptionId);

        await supabase
          .from("profiles")
          .update({
            subscription_status:  subStatus,
            current_period_end:   periodEnd,
            cancel_at_period_end: cancelAtPeriodEnd,
            updated_at:           new Date(),
          })
          .eq("stripe_subscription_id", subscriptionId);

        console.log("Invoice paid — subscription renewed:", subscriptionId);
        break;
      }

      /* ─────────────────────────────
      PAYMENT FAILED
      ───────────────────────────── */
      case "invoice.payment_failed": {
        const invoice        = stripeEvent.data.object;
        const subscriptionId = invoice.subscription;

        await supabase
          .from("subscriptions")
          .update({ status: "past_due" })
          .eq("stripe_subscription_id", subscriptionId);

        await supabase
          .from("profiles")
          .update({
            subscription_status: "past_due",
            updated_at:          new Date(),
          })
          .eq("stripe_subscription_id", subscriptionId);

        console.log("Payment failed — subscription past due:", subscriptionId);
        break;
      }

      /* ─────────────────────────────
      SUBSCRIPTION CANCELED
      (fires at period end when cancel_at_period_end was true, or on immediate cancel)
      ───────────────────────────── */
      case "customer.subscription.deleted": {
        const subscription = stripeEvent.data.object;

        await supabase
          .from("subscriptions")
          .update({ status: "canceled" })
          .eq("stripe_subscription_id", subscription.id);

        await supabase
          .from("profiles")
          .update({
            subscription_status:  "canceled",
            subscription_plan:    null,
            subscription_tier:    "free",
            cancel_at_period_end: false,
            updated_at:           new Date(),
          })
          .eq("stripe_subscription_id", subscription.id);

        console.log("Subscription canceled — downgraded to free:", subscription.id);
        break;
      }

      default:
        console.log("Unhandled Stripe event:", stripeEvent.type);
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };

  } catch (error) {
    console.error("Webhook processing error:", error);
    return { statusCode: 500, body: "Webhook handler failed" };
  }
}

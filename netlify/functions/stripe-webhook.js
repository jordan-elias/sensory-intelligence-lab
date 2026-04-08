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
HELPERS
───────────────────────────── */

// Map plan IDs to subscription tiers and calls
function getTierSettings(plan) {
  switch (plan) {
    case "lab_monthly":
    case "lab_yearly":
      return { tier: "lab", callsPerMonth: 0 };
    case "call1_monthly":
    case "call1_yearly":
      return { tier: "call1", callsPerMonth: 1 };
    case "call2_monthly":
    case "call2_yearly":
      return { tier: "call2", callsPerMonth: 2 };
    default:
      return { tier: "free", callsPerMonth: 0 };
  }
}

// Upsert subscription in subscriptions table
async function upsertSubscription({
  userId,
  email,
  plan,
  tier,
  customerId,
  subscriptionId,
  status,
  periodEnd,
}) {
  const { error } = await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      email,
      plan,
      tier,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      status,
      current_period_end: periodEnd,
    },
    { onConflict: "stripe_subscription_id" }
  );
  if (error) console.error("Supabase upsert error:", error);
}

// Update profiles table automatically
async function updateProfileFromSubscription({
  userId,
  email,
  plan,
  customerId,
  subscriptionId,
  status,
  periodEnd,
}) {
  const settings = getTierSettings(plan);

  const { error } = await supabase.from("profiles").update({
    email,
    subscription_status: status,
    subscription_plan: plan,
    subscription_tier: settings.tier,
    calls_per_month: settings.callsPerMonth,
    calls_used_this_month: 0,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    current_period_end: periodEnd,
    updated_at: new Date(),
  }).eq("id", userId);

  if (error) console.error("Profile update failed:", error);
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
        const session = stripeEvent.data.object;
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const metadata = session.metadata;
        const periodEnd = new Date(subscription.current_period_end * 1000);

        await upsertSubscription({
          userId: metadata.user_id,
          email: metadata.email,
          plan: metadata.plan,
          tier: getTierSettings(metadata.plan).tier,
          customerId: session.customer,
          subscriptionId: subscription.id,
          status: subscription.status,
          periodEnd,
        });

        await updateProfileFromSubscription({
          userId: metadata.user_id,
          email: metadata.email,
          plan: metadata.plan,
          customerId: session.customer,
          subscriptionId: subscription.id,
          status: subscription.status,
          periodEnd,
        });

        console.log("Subscription created:", subscription.id);
        break;
      }

      /* ─────────────────────────────
      SUBSCRIPTION UPDATED (UPGRADES/DOWNGRADES)
      ───────────────────────────── */
      case "customer.subscription.updated": {
        const subscription = stripeEvent.data.object;
        const customerId = subscription.customer;
        const subscriptionId = subscription.id;
        const periodEnd = new Date(subscription.current_period_end * 1000);
        const status = subscription.status;
        const plan = subscription.items.data[0].price.id; // Assuming single price per subscription
        const tierSettings = getTierSettings(plan);

        // Update subscriptions table
        await supabase.from("subscriptions").upsert({
          stripe_subscription_id: subscriptionId,
          stripe_customer_id: customerId,
          plan,
          tier: tierSettings.tier,
          status,
          current_period_end: periodEnd,
        }, { onConflict: "stripe_subscription_id" });

        // Update profiles table
        await supabase.from("profiles").update({
          subscription_plan: plan,
          subscription_tier: tierSettings.tier,
          subscription_status: status,
          calls_per_month: tierSettings.callsPerMonth,
          calls_used_this_month: 0,
          current_period_end: periodEnd,
          updated_at: new Date(),
        }).eq("stripe_subscription_id", subscriptionId);

        console.log("Subscription updated:", subscriptionId);
        break;
      }

      /* ─────────────────────────────
      PAYMENT SUCCESS
      ───────────────────────────── */
      case "invoice.paid": {
        const invoice = stripeEvent.data.object;
        const subscriptionId = invoice.subscription;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const periodEnd = new Date(subscription.current_period_end * 1000);

        await supabase.from("subscriptions").update({
          status: subscription.status,
          current_period_end: periodEnd,
        }).eq("stripe_subscription_id", subscriptionId);

        await supabase.from("profiles").update({
          subscription_status: subscription.status,
          current_period_end: periodEnd,
          calls_used_this_month: 0,
        }).eq("stripe_subscription_id", subscriptionId);

        console.log("Invoice paid:", subscriptionId);
        break;
      }

      /* ─────────────────────────────
      PAYMENT FAILED
      ───────────────────────────── */
      case "invoice.payment_failed": {
        const invoice = stripeEvent.data.object;
        const subscriptionId = invoice.subscription;

        await supabase.from("subscriptions").update({ status: "past_due" })
          .eq("stripe_subscription_id", subscriptionId);

        await supabase.from("profiles").update({ subscription_status: "past_due" })
          .eq("stripe_subscription_id", subscriptionId);

        console.log("Payment failed:", subscriptionId);
        break;
      }

      /* ─────────────────────────────
      SUBSCRIPTION CANCELED
      ───────────────────────────── */
      case "customer.subscription.deleted": {
        const subscription = stripeEvent.data.object;

        await supabase.from("subscriptions").update({ status: "canceled" })
          .eq("stripe_subscription_id", subscription.id);

        await supabase.from("profiles").update({
          subscription_status: "canceled",
          subscription_plan: "free",
          subscription_tier: "free",
          calls_per_month: 0,
        }).eq("stripe_subscription_id", subscription.id);

        console.log("Subscription canceled:", subscription.id);
        break;
      }

      default:
        console.log("Unhandled event:", stripeEvent.type);
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (error) {
    console.error("Webhook processing error:", error);
    return { statusCode: 500, body: "Webhook handler failed" };
  }
}

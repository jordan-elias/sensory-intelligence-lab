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
SUPABASE
───────────────────────────── */

const supabase =
createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ─────────────────────────────
HELPERS
───────────────────────────── */

async function upsertSubscription({

  userId,
  email,
  plan,
  tier,
  customerId,
  subscriptionId,
  status,
  periodEnd

}) {

  const { error } =
  await supabase
  .from("subscriptions")
  .upsert({

    user_id:
      userId,

    email:
      email,

    plan:
      plan,

    tier:
      tier,

    stripe_customer_id:
      customerId,

    stripe_subscription_id:
      subscriptionId,

    status:
      status,

    current_period_end:
      periodEnd

  },
  {
    onConflict:
      "stripe_subscription_id"
  });

  if (error) {

    console.error(
      "Supabase upsert error:",
      error
    );

  }

}

/* ─────────────────────────────
NETLIFY HANDLER
───────────────────────────── */

export async function handler(event) {

  const sig =
    event.headers["stripe-signature"];

  let stripeEvent;

  try {

    stripeEvent =
      stripe.webhooks.constructEvent(

        event.body,
        sig,
        process.env
          .STRIPE_WEBHOOK_SECRET

      );

  }

  catch (err) {

    console.error(
      "Webhook signature error:",
      err.message
    );

    return {

      statusCode: 400,
      body:
        `Webhook Error: ${err.message}`

    };

  }

  try {

    switch (
      stripeEvent.type
    ) {

      /* ─────────────────────────────
      CHECKOUT COMPLETED
      ───────────────────────────── */

      case
      "checkout.session.completed":

      {

        const session =
          stripeEvent.data.object;

        const subscription =
          await stripe
          .subscriptions
          .retrieve(
            session.subscription
          );

        const metadata =
          session.metadata;

        const periodEnd =
          new Date(
            subscription
              .current_period_end
              * 1000
          );

        await upsertSubscription({

          userId:
            metadata.user_id,

          email:
            metadata.email,

          plan:
            metadata.plan,

          tier:
            metadata.tier,

          customerId:
            session.customer,

          subscriptionId:
            subscription.id,

          status:
            subscription.status,

          periodEnd:
            periodEnd

        });

        console.log(
          "Subscription created:",
          subscription.id
        );

        break;

      }

      /* ─────────────────────────────
      PAYMENT SUCCESS
      ───────────────────────────── */

      case
      "invoice.paid":

      {

        const invoice =
          stripeEvent.data.object;

        const subscriptionId =
          invoice.subscription;

        const subscription =
          await stripe
          .subscriptions
          .retrieve(
            subscriptionId
          );

        const periodEnd =
          new Date(
            subscription
              .current_period_end
              * 1000
          );

        await supabase
          .from("subscriptions")
          .update({

            status:
              subscription.status,

            current_period_end:
              periodEnd

          })
          .eq(
            "stripe_subscription_id",
            subscriptionId
          );

        console.log(
          "Invoice paid:",
          subscriptionId
        );

        break;

      }

      /* ─────────────────────────────
      PAYMENT FAILED
      ───────────────────────────── */

      case
      "invoice.payment_failed":

      {

        const invoice =
          stripeEvent.data.object;

        const subscriptionId =
          invoice.subscription;

        await supabase
          .from("subscriptions")
          .update({

            status:
              "past_due"

          })
          .eq(
            "stripe_subscription_id",
            subscriptionId
          );

        console.log(
          "Payment failed:",
          subscriptionId
        );

        break;

      }

      /* ─────────────────────────────
      SUBSCRIPTION CANCELED
      ───────────────────────────── */

      case
      "customer.subscription.deleted":

      {

        const subscription =
          stripeEvent.data.object;

        await supabase
          .from("subscriptions")
          .update({

            status:
              "canceled"

          })
          .eq(
            "stripe_subscription_id",
            subscription.id
          );

        console.log(
          "Subscription canceled:",
          subscription.id
        );

        break;

      }

      default:

        console.log(
          "Unhandled event:",
          stripeEvent.type
        );

    }

    return {

      statusCode: 200,
      body:
        JSON.stringify({
          received: true
        })

    };

  }

  catch (error) {

    console.error(
      "Webhook processing error:",
      error
    );

    return {

      statusCode: 500,
      body:
        "Webhook handler failed"

    };

  }

}

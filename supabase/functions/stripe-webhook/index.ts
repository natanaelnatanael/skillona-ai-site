// Supabase Edge Function: stripe-webhook
// Receives Stripe events (test mode). On a completed checkout it records the
// payment in the payments table and applies the promotion to the listing.

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@16";

Deno.serve(async (req) => {
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
  const signature = req.headers.get("stripe-signature");
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = await stripe.webhooks.constructEventAsync(body, signature!, secret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const listingId = session.metadata?.listing_id;
    const userId = session.metadata?.user_id;
    const productType = session.metadata?.product_type;

    if (listingId && userId && productType) {
      // Service role: webhook has no user context; RLS is bypassed deliberately here
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { error: payErr } = await admin.from("payments").insert({
        user_id: userId,
        listing_id: listingId,
        product_type: productType,
        amount: (session.amount_total ?? 0) / 100,
        currency: (session.currency ?? "eur").toUpperCase(),
        payment_status: "paid",
        provider_reference: session.id,
        paid_at: new Date().toISOString()
      });
      if (payErr) console.error("Recording payment failed:", payErr);

      const update: Record<string, unknown> = {};
      if (productType === "featured_listing") update.is_featured = true;
      if (productType === "premium_position") { update.is_premium = true; update.is_featured = true; }
      if (Object.keys(update).length) {
        const { error: updErr } = await admin.from("listings").update(update).eq("id", listingId);
        if (updErr) console.error("Applying promotion failed:", updErr);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" }
  });
});

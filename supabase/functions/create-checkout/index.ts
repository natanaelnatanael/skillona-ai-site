// Supabase Edge Function: create-checkout
// Creates a Stripe Checkout session (test mode) for promoting a listing.
// The caller must be signed in and must own the listing.

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@16";

const PRODUCTS: Record<string, { name: string; amount: number; product_type: string }> = {
  featured: { name: "Featured listing (60 days)", amount: 900, product_type: "featured_listing" },
  premium: { name: "Premium position (60 days)", amount: 1500, product_type: "premium_position" }
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { listing_id, product, return_url } = await req.json();
    const item = PRODUCTS[product];
    if (!item || !listing_id) {
      return json({ error: "Unknown product or missing listing" }, 400);
    }

    // Identify the signed-in caller from their JWT
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Sign in required" }, 401);

    // Confirm ownership of the listing
    const { data: listing, error: listErr } = await supabase
      .from("listings")
      .select("id,user_id,title")
      .eq("id", listing_id)
      .single();
    if (listErr || !listing) return json({ error: "Listing not found" }, 404);
    if (listing.user_id !== userData.user.id) return json({ error: "You can promote only your own listings" }, 403);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
    const site = (return_url && String(return_url).startsWith("https://")) ? String(return_url) : "https://skillona.ai";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: item.amount,
          product_data: { name: `${item.name} — ${listing.title}`.slice(0, 120) }
        }
      }],
      metadata: {
        listing_id: String(listing.id),
        user_id: userData.user.id,
        product_type: item.product_type
      },
      customer_email: userData.user.email ?? undefined,
      success_url: `${site}?payment=success`,
      cancel_url: `${site}?payment=cancelled`
    });

    return json({ url: session.url });
  } catch (err) {
    console.error(err);
    return json({ error: String(err?.message ?? err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

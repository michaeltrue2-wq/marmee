// ============================================================
//  POST /.netlify/functions/stripe-webhook
//
//  Stripe's own record of what happened, written back to our visits.
//
//  Why this exists: stripe-charge-visit updates the visit right after
//  charging. If that update fails — a timeout, a dropped connection, a
//  function cold-start killed mid-flight — Stripe has the money and our
//  database says `unpaid`. This endpoint closes that gap, and is also how
//  we hear about refunds and disputes we didn't initiate.
//
//  AUTH NOTE: Stripe is not a signed-in user, so there is no token to
//  act on behalf of and RLS would block every write. This is the one
//  function that uses the service-role key. Two things keep that safe:
//  the key never leaves Netlify's environment, and nothing is written
//  until Stripe's signature has been verified against the endpoint
//  secret — an unsigned or forged request is rejected before any
//  database call.
// ============================================================

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if(event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig    = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  if(!secret) { console.error('STRIPE_WEBHOOK_SECRET is not set'); return { statusCode: 500, body: 'not configured' }; }
  if(!sig)    return { statusCode: 400, body: 'missing signature' };

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

  // The signature is computed over the exact bytes Stripe sent, so use the
  // raw body — not a re-serialised object.
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;

  let evt;
  try{
    evt = stripe.webhooks.constructEvent(raw, sig, secret);
  }catch(err){
    console.error('signature verification failed', err.message);
    return { statusCode: 400, body: `signature check failed` };
  }

  const db = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const intent   = evt.data?.object || {};
  const visitId  = intent.metadata?.marmee_visit_id
                || intent.payment_intent?.metadata?.marmee_visit_id
                || null;

  try{
    switch(evt.type){

      case 'payment_intent.succeeded': {
        if(!visitId) break;
        await db.from('visits').update({
          payment_status: 'paid',
          amount_cents: intent.amount_received ?? intent.amount,
          stripe_payment_intent: intent.id,
          paid_at: new Date().toISOString(),
          payment_error: null
        }).eq('id', visitId);
        console.log('visit paid', visitId);
        break;
      }

      case 'payment_intent.payment_failed': {
        if(!visitId) break;
        await db.from('visits').update({
          payment_status: 'failed',
          stripe_payment_intent: intent.id,
          payment_error: intent.last_payment_error?.message || 'The card was declined.'
        }).eq('id', visitId);
        console.log('visit payment failed', visitId);
        break;
      }

      case 'charge.refunded': {
        // Refunds initiated in the Stripe dashboard land here too, which is
        // how the console stays honest about money that went back.
        const pi = intent.payment_intent;
        if(!pi) break;
        await db.from('visits').update({
          payment_status: 'refunded',
          payment_error: null
        }).eq('stripe_payment_intent', typeof pi === 'string' ? pi : pi.id);
        console.log('visit refunded', pi);
        break;
      }

      case 'charge.dispute.created': {
        const pi = intent.payment_intent;
        if(!pi) break;
        await db.from('visits').update({
          payment_error: 'Disputed by the cardholder — check Stripe.'
        }).eq('stripe_payment_intent', typeof pi === 'string' ? pi : pi.id);
        console.log('dispute opened', pi);
        break;
      }

      default:
        // Everything else is acknowledged and ignored, so Stripe stops retrying.
        break;
    }
  }catch(e){
    console.error('webhook handler failed', evt.type, e);
    // 500 tells Stripe to retry, which is what we want if our database was down.
    return { statusCode: 500, body: 'handler error' };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

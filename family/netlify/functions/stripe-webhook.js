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

  // supabase-js resolves with { data, error } rather than throwing, so every
  // `await db...update()` below used to swallow its own failure: the catch
  // never fired, the function returned 200, and Stripe recorded a successful
  // delivery and never retried. Money taken, row still saying unpaid, and no
  // trace. Throwing here is what makes the 500 — and Stripe's retry — real.
  async function write(builder, what){
    const { error } = await builder;
    if(error) throw new Error(what + ': ' + error.message);
  }

  try{
    switch(evt.type){

      case 'payment_intent.succeeded': {
        if(!visitId) break;
        const cents = intent.amount_received ?? intent.amount;
        await write(db.from('visits').update({
          payment_status: 'paid',
          amount_cents: cents,
          // The charge function writes this too; the webhook exists for the
          // case where that write is the thing that failed, so it has to
          // write the fee as well or platform revenue records as NULL.
          platform_fee_cents: Math.round(cents * 0.15),
          stripe_payment_intent: intent.id,
          paid_at: new Date().toISOString(),
          payment_error: null
        }).eq('id', visitId), 'mark paid');
        console.log('visit paid', visitId);
        break;
      }

      case 'payment_intent.payment_failed': {
        if(!visitId) break;
        // Stripe does not promise delivery order, and retries reorder further.
        // The 3D Secure path emits payment_failed (authentication_required)
        // and then succeeded once she approves. If failed arrived last it
        // flipped a paid visit back to failed — which invites the operator to
        // charge again, with a fresh attempt number and therefore a fresh
        // idempotency key. That is a real second charge. A paid visit is
        // final here.
        await write(db.from('visits').update({
          payment_status: 'failed',
          stripe_payment_intent: intent.id,
          payment_error: intent.last_payment_error?.message || 'The card was declined.'
        }).eq('id', visitId).neq('payment_status', 'paid'), 'mark failed');
        console.log('visit payment failed', visitId);
        break;
      }

      case 'charge.refunded': {
        // Refunds initiated in the Stripe dashboard land here too, which is
        // how the console stays honest about money that went back.
        const pi = intent.payment_intent;
        if(!pi) break;

        // charge.refunded fires for partial refunds as well. Booking a $10
        // goodwill refund on a $140 visit as fully refunded loses $130.
        const refunded = Number(intent.amount_refunded ?? 0);
        const charged  = Number(intent.amount ?? 0);
        if(charged && refunded < charged){
          await write(db.from('visits').update({
            payment_error: `Partly refunded — $${(refunded/100).toFixed(2)} of $${(charged/100).toFixed(2)}. Check Stripe.`
          }).eq('stripe_payment_intent', typeof pi === 'string' ? pi : pi.id), 'note partial refund');
          console.log('partial refund', pi, refunded, 'of', charged);
          break;
        }

        await write(db.from('visits').update({
          payment_status: 'refunded',
          payment_error: null
        }).eq('stripe_payment_intent', typeof pi === 'string' ? pi : pi.id), 'mark refunded');
        console.log('visit refunded', pi);
        break;
      }

      case 'charge.dispute.created': {
        const pi = intent.payment_intent;
        if(!pi) break;
        await write(db.from('visits').update({
          payment_error: 'Disputed by the cardholder — check Stripe.'
        }).eq('stripe_payment_intent', typeof pi === 'string' ? pi : pi.id), 'note dispute');
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

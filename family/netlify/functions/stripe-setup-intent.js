// ============================================================
//  POST /.netlify/functions/stripe-setup-intent
//
//  Called by the Mom's app when she taps "Add a card".
//  Creates (or reuses) her Stripe customer, then returns a
//  SetupIntent client secret so the browser can collect the card
//  directly with Stripe. The card number never reaches our servers.
//
//  Returns: { clientSecret, customerId }
// ============================================================

const { json, stripe, authed, preflight } = require('./_shared');

exports.handler = async (event) => {
  const early = preflight(event);
  if(early) return early;

  const { db, user, error } = await authed(event);
  if(error) return error;

  try{
    // The caller must own a family row. RLS means this returns only theirs.
    const { data: rows, error: qErr } = await db
      .from('families')
      .select('id, name, stripe_customer_id')
      .eq('user_id', user.id)
      .limit(1);

    if(qErr) return json(500, { error: 'Could not read your account.' });
    const family = rows && rows[0];
    if(!family) return json(403, { error: 'No household found for this login.' });

    const s = stripe();
    let customerId = family.stripe_customer_id;

    if(!customerId){
      const customer = await s.customers.create({
        email: user.email,
        name:  family.name || undefined,
        metadata: { marmee_family_id: family.id, supabase_user_id: user.id }
      });
      customerId = customer.id;

      const { error: uErr } = await db
        .from('families')
        .update({ stripe_customer_id: customerId })
        .eq('id', family.id);
      if(uErr) return json(500, { error: 'Could not save your billing profile.' });
    }

    const setupIntent = await s.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session',      // so we can charge after a visit without her present
      metadata: { marmee_family_id: family.id }
    });

    return json(200, {
      clientSecret: setupIntent.client_secret,
      customerId,
      // Safe to send to the browser — this is the publishable key, not the secret.
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || ''
    });

  }catch(e){
    console.error('stripe-setup-intent', e);
    return json(500, { error: 'Could not start card setup. Please try again.' });
  }
};

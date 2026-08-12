// ============================================================
//  POST /.netlify/functions/stripe-save-card
//  body: { setupIntentId }
//
//  Called after the browser confirms the SetupIntent. Verifies the
//  intent really belongs to this caller's Stripe customer, then
//  records the payment method id plus brand / last4 / expiry so the
//  app can say "Visa ending 4242" without holding card data.
//
//  Returns: { brand, last4, exp }
// ============================================================

const { json, stripe, authed, preflight } = require('./_shared');

exports.handler = async (event) => {
  const early = preflight(event);
  if(early) return early;

  const { db, user, error } = await authed(event);
  if(error) return error;

  let body;
  try{ body = JSON.parse(event.body || '{}'); }
  catch{ return json(400, { error: 'Bad request.' }); }

  const setupIntentId = body.setupIntentId;
  if(!setupIntentId) return json(400, { error: 'Missing setupIntentId.' });

  try{
    const { data: rows } = await db
      .from('families')
      .select('id, stripe_customer_id')
      .eq('user_id', user.id)
      .limit(1);

    const family = rows && rows[0];
    if(!family) return json(403, { error: 'No household found for this login.' });

    const s = stripe();
    const si = await s.setupIntents.retrieve(setupIntentId, { expand: ['payment_method'] });

    // Never trust the id the browser handed us — confirm it is this
    // customer's intent and that it actually succeeded.
    if(si.customer !== family.stripe_customer_id) return json(403, { error: 'That card setup does not belong to this account.' });
    if(si.status !== 'succeeded')                 return json(400, { error: 'That card was not confirmed. Please try again.' });

    const pm = si.payment_method;
    if(!pm || !pm.card) return json(400, { error: 'No card was attached.' });

    // Make it the default for future off-session charges.
    await s.customers.update(family.stripe_customer_id, {
      invoice_settings: { default_payment_method: pm.id }
    });

    const exp = String(pm.card.exp_month).padStart(2,'0') + '/' + String(pm.card.exp_year).slice(-2);

    const { error: uErr } = await db.from('families').update({
      payment_method_id: pm.id,
      card_brand: pm.card.brand,
      card_last4: pm.card.last4,
      card_exp:   exp
    }).eq('id', family.id);

    if(uErr) return json(500, { error: 'Card saved with Stripe but we could not record it. Contact us.' });

    return json(200, { brand: pm.card.brand, last4: pm.card.last4, exp });

  }catch(e){
    console.error('stripe-save-card', e);
    return json(500, { error: 'Could not save that card. Please try again.' });
  }
};

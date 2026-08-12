// ============================================================
//  POST /.netlify/functions/stripe-charge-visit
//  body: { visitId }
//
//  Called from the console when an operator marks a visit done.
//  Charges the household's saved card off-session for
//  hours × rate, and records the result on the visit.
//
//  Only an operator can call it: RLS on `visits` update is
//  operator-only, so a Mom or Marm hitting this endpoint gets
//  nowhere. The amount is computed here from the visit row, never
//  taken from the request body.
//
//  Returns: { status, amountCents, paymentIntentId }
// ============================================================

const { json, stripe, authed, preflight } = require('./_shared');

const DEFAULT_RATE = 28;      // dollars per hour — matches RATE in the console
const PLATFORM_FEE = 0.15;    // Marmee's share

exports.handler = async (event) => {
  const early = preflight(event);
  if(early) return early;

  const { db, user, error } = await authed(event);
  if(error) return error;

  let body;
  try{ body = JSON.parse(event.body || '{}'); }
  catch{ return json(400, { error: 'Bad request.' }); }

  const visitId = body.visitId;
  if(!visitId) return json(400, { error: 'Missing visitId.' });

  try{
    // Caller must be an operator.
    const { data: prof } = await db.from('profiles').select('role').eq('id', user.id).limit(1);
    if(!prof || !prof[0] || prof[0].role !== 'operator'){
      return json(403, { error: 'Only an operator can charge a visit.' });
    }

    const { data: visits, error: vErr } = await db
      .from('visits')
      .select('id, family_id, hours, rate, payment_status, amount_cents')
      .eq('id', visitId)
      .limit(1);

    if(vErr) return json(500, { error: 'Could not read that visit.' });
    const visit = visits && visits[0];
    if(!visit) return json(404, { error: 'Visit not found.' });

    // Idempotence: never charge the same visit twice.
    if(visit.payment_status === 'paid'){
      return json(200, { status: 'paid', alreadyCharged: true, amountCents: visit.amount_cents });
    }
    if(visit.payment_status === 'processing'){
      return json(409, { error: 'That visit is already being charged.' });
    }

    const { data: fams } = await db
      .from('families')
      .select('id, name, stripe_customer_id, payment_method_id')
      .eq('id', visit.family_id)
      .limit(1);

    const family = fams && fams[0];
    if(!family) return json(404, { error: 'Household not found for that visit.' });
    if(!family.stripe_customer_id || !family.payment_method_id){
      return json(400, { error: `${family.name || 'That household'} has no card on file yet.` });
    }

    const hours  = Number(visit.hours) || 0;
    const rate   = Number(visit.rate)  || DEFAULT_RATE;
    const amount = Math.round(hours * rate * 100);           // cents
    const fee    = Math.round(amount * PLATFORM_FEE);

    if(amount <= 0) return json(400, { error: 'That visit has no hours recorded, so there is nothing to charge.' });

    await db.from('visits').update({ payment_status: 'processing' }).eq('id', visit.id);

    const s = stripe();

    // Stripe emails a receipt when receipt_email is set. The address lives on
    // the Stripe customer, not in our tables, so read it from there. A failure
    // here must not stop the charge — worst case she gets no receipt.
    let receiptEmail = null;
    try{
      const cust = await s.customers.retrieve(family.stripe_customer_id);
      receiptEmail = (cust && !cust.deleted && cust.email) || null;
    }catch(e){ console.error('could not read customer email', e); }

    let intent;
    try{
      intent = await s.paymentIntents.create({
        amount,
        currency: 'usd',
        customer: family.stripe_customer_id,
        payment_method: family.payment_method_id,
        off_session: true,
        confirm: true,
        description: `Marmee visit — ${family.name || ''}`.trim(),
        receipt_email: receiptEmail || undefined,
        metadata: { marmee_visit_id: visit.id, marmee_family_id: family.id, platform_fee_cents: String(fee) }
      }, {
        // Stripe will not double-charge if this is retried.
        idempotencyKey: `marmee-visit-${visit.id}`
      });
    }catch(stripeErr){
      const message = stripeErr?.raw?.message || 'The card was declined.';
      await db.from('visits').update({
        payment_status: 'failed',
        payment_error: message,
        amount_cents: amount,
        platform_fee_cents: fee
      }).eq('id', visit.id);
      return json(402, { error: message, status: 'failed' });
    }

    const paid = intent.status === 'succeeded';
    await db.from('visits').update({
      payment_status: paid ? 'paid' : 'failed',
      amount_cents: amount,
      platform_fee_cents: fee,
      stripe_payment_intent: intent.id,
      paid_at: paid ? new Date().toISOString() : null,
      payment_error: paid ? null : `Stripe returned status ${intent.status}`
    }).eq('id', visit.id);

    return json(200, {
      status: paid ? 'paid' : intent.status,
      amountCents: amount,
      platformFeeCents: fee,
      paymentIntentId: intent.id
    });

  }catch(e){
    console.error('stripe-charge-visit', e);
    return json(500, { error: 'Something went wrong taking that payment.' });
  }
};

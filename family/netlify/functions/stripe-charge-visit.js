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

const DEFAULT_RATE = 35;      // dollars per hour — matches RATE in the console
const PLATFORM_FEE = 0.15;    // Marmee's share

// supabase-js RESOLVES with { data, error }; it does not throw. Every
// `await db.from(...).update(...)` in this file used to drop its error on the
// floor, so a failed write ran on to `return json(200, {status:'paid'})` —
// card charged, row still saying `processing`, console showing "being
// charged" forever. This makes a failed write behave like a failed write.
async function upd(db, id, patch){
  const { error } = await db.from('visits').update(patch).eq('id', id);
  if(error){ const e = new Error('visit write failed: ' + error.message); e.dbWrite = true; throw e; }
}

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
      .select('id, family_id, hours, rate, payment_status, amount_cents, charge_attempts')
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
    // `needs_auth` means a PaymentIntent is already open and its client secret
    // is sitting in the Mom's app waiting for her to approve it. Creating a
    // second one here leaves two live intents on the same visit, both
    // confirmable — she approves one, we confirm the other, and the card is
    // charged twice. She has to finish or abandon the first one.
    if(visit.payment_status === 'needs_auth'){
      return json(409, { error: 'She has been asked to approve this payment. Wait for her, or clear it before charging again.' });
    }

    const { data: fams } = await db
      .from('families')
      .select('id, name, market_id, stripe_customer_id, payment_method_id')
      .eq('id', visit.family_id)
      .limit(1);

    const family = fams && fams[0];
    if(!family) return json(404, { error: 'Household not found for that visit.' });
    if(!family.stripe_customer_id || !family.payment_method_id){
      return json(400, { error: `${family.name || 'That household'} has no card on file yet.` });
    }

    const hours = Number(visit.hours) || 0;

    // The fallback rate belongs to this household's market, not to Portland.
    // A visit almost always carries its own rate, so this only matters for
    // rows written before markets existed — but getting it wrong would mean
    // charging a Boston household Maine prices, silently.
    let fallbackRate = DEFAULT_RATE;
    if(family.market_id){
      const { data: mk } = await db
        .from('markets').select('hourly_rate_cents').eq('id', family.market_id).limit(1);
      const cents = mk && mk[0] && Number(mk[0].hourly_rate_cents);
      if(cents && isFinite(cents)) fallbackRate = cents / 100;
    }

    // `Number(visit.rate) || fallbackRate` turned a deliberate rate of 0 — a
    // comped visit, a make-good — into a full-price charge, because 0 is
    // falsy. Only a missing rate should fall back.
    const rate = (visit.rate === null || visit.rate === undefined) ? fallbackRate : Number(visit.rate);
    if(!Number.isFinite(rate) || rate < 0){
      return json(400, { error: 'That visit has an unreadable hourly rate. Fix the rate before charging.' });
    }

    const amount = Math.round(hours * rate * 100);           // cents
    const fee    = Math.round(amount * PLATFORM_FEE);

    if(amount <= 0) return json(400, { error: 'That visit has no hours recorded, so there is nothing to charge.' });

    // Claim the visit before touching Stripe, conditional on the status we
    // just read. Two operators clicking Charge at the same moment both read
    // `unpaid` and both computed attempt = 1; only Stripe's idempotency key
    // stopped the second charge, and the moment those keys diverge it stops
    // stopping it. Whoever writes first wins; the loser gets 409.
    //
    // A retry must be a NEW request to Stripe. Reusing the idempotency key
    // would replay the previous decline verbatim, even with a good card.
    const attempt = (Number(visit.charge_attempts) || 0) + 1;
    let claim = db.from('visits')
      .update({ payment_status: 'processing', charge_attempts: attempt })
      .eq('id', visit.id);
    claim = (visit.payment_status === null || visit.payment_status === undefined)
      ? claim.is('payment_status', null)
      : claim.eq('payment_status', visit.payment_status);

    const { data: claimed, error: claimErr } = await claim.select('id');
    if(claimErr) return json(500, { error: 'Could not start that payment.' });
    if(!claimed || !claimed.length){
      return json(409, { error: 'That visit changed while you were clicking. Reload and check before charging again.' });
    }

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
        idempotencyKey: `marmee-visit-${visit.id}-${attempt}`
      });
    }catch(stripeErr){
      const code = stripeErr?.code || stripeErr?.raw?.code;
      const pi   = stripeErr?.raw?.payment_intent;

      // The card is fine — her bank wants her to approve it. Telling her the
      // card was declined would send her off to replace a working card.
      if(code === 'authentication_required' && pi){
        await upd(db, visit.id, {
          payment_status: 'needs_auth',
          stripe_payment_intent: pi.id,
          stripe_client_secret: pi.client_secret,
          amount_cents: amount,
          platform_fee_cents: fee,
          payment_error: 'Her bank asked her to approve this payment.'
        });
        return json(200, { status: 'needs_auth', amountCents: amount });
      }

      const message = stripeErr?.raw?.message || 'The card was declined.';
      await upd(db, visit.id, {
        payment_status: 'failed',
        payment_error: message,
        amount_cents: amount,
        platform_fee_cents: fee
      });
      return json(402, { error: message, status: 'failed' });
    }

    const paid = intent.status === 'succeeded';
    await upd(db, visit.id, {
      payment_status: paid ? 'paid' : 'failed',
      amount_cents: amount,
      platform_fee_cents: fee,
      stripe_payment_intent: intent.id,
      paid_at: paid ? new Date().toISOString() : null,
      payment_error: paid ? null : `Stripe returned status ${intent.status}`
    });

    return json(200, {
      status: paid ? 'paid' : intent.status,
      amountCents: amount,
      platformFeeCents: fee,
      paymentIntentId: intent.id
    });

  }catch(e){
    console.error('stripe-charge-visit', e);

    // The card may well have been charged — the write is what failed. Say so,
    // and hand back the PaymentIntent id so it can be reconciled in Stripe.
    // The webhook is the other net under this.
    if(e && e.dbWrite){
      return json(500, {
        error: 'The payment went through but we could not record it. Check this visit in Stripe before charging again.',
        needsReconcile: true
      });
    }
    return json(500, { error: 'Something went wrong taking that payment.' });
  }
};

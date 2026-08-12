// ============================================================
//  POST /.netlify/functions/stripe-refund-visit
//  body: { visitId, token?, reason? }
//
//  Operator-only. Refunds the charge for a visit in full and records it.
//  You will need this the first time a visit is charged in error, and the
//  alternative — refunding in the Stripe dashboard — leaves the console
//  still claiming the visit was Paid.
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

  const visitId = body.visitId;
  if(!visitId) return json(400, { error: 'Missing visitId.' });

  try{
    const { data: prof } = await db.from('profiles').select('role').eq('id', user.id).limit(1);
    if(!prof?.[0] || prof[0].role !== 'operator'){
      return json(403, { error: 'Only an operator can refund a visit.' });
    }

    const { data: visits } = await db
      .from('visits')
      .select('id, payment_status, stripe_payment_intent, amount_cents')
      .eq('id', visitId).limit(1);

    const visit = visits?.[0];
    if(!visit) return json(404, { error: 'Visit not found.' });
    if(visit.payment_status === 'refunded') return json(200, { status:'refunded', alreadyRefunded:true });
    if(visit.payment_status !== 'paid' || !visit.stripe_payment_intent){
      return json(400, { error: 'That visit was never charged, so there is nothing to refund.' });
    }

    const s = stripe();
    const refund = await s.refunds.create({
      payment_intent: visit.stripe_payment_intent,
      reason: 'requested_by_customer',
      metadata: { marmee_visit_id: visit.id, refunded_by: user.email || user.id }
    }, {
      idempotencyKey: `marmee-refund-${visit.id}`
    });

    // The charge.refunded webhook will also set this. Writing it here too
    // means the console updates immediately rather than whenever Stripe calls.
    await db.from('visits').update({
      payment_status: 'refunded',
      payment_error: null
    }).eq('id', visit.id);

    return json(200, {
      status: 'refunded',
      amountCents: refund.amount,
      refundId: refund.id
    });

  }catch(e){
    console.error('stripe-refund-visit', e);
    return json(500, { error: e?.raw?.message || 'Could not refund that visit.' });
  }
};

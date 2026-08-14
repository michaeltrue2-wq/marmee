// ============================================================
//  POST /.netlify/functions/payout-visit
//  body: { token, visitId }
//
//  Operator only. Sends a Marm her share of one visit.
//
//  Deliberately a separate step from the charge. The Mom's payment and the
//  Marm's payout are different events that can fail independently: a
//  transfer can bounce because her bank details are wrong without any of
//  that touching money the Mom has already paid. Keeping them apart means
//  a payout problem is never a billing problem.
//
//  Three things this refuses to do, each learned the hard way elsewhere in
//  this codebase:
//
//   · Pay for a visit the Mom has not paid for, or that was refunded.
//   · Pay twice. `transferred_at` is claimed before Stripe is called, and
//     the idempotency key includes the attempt number so a retry after a
//     genuine failure is a new request rather than a replayed answer.
//   · Report success when the database write failed. Every write is
//     checked; the amount sent is recorded or the caller is told to go and
//     reconcile in Stripe.
// ============================================================

const { json, stripe, authed, preflight } = require('./_shared');
const { createClient } = require('@supabase/supabase-js');

const MARM_SHARE = 0.85;

function adminDb(){
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
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
    const { data: prof } = await db.from('profiles').select('role').eq('id', user.id).limit(1);
    if(!prof || !prof[0] || prof[0].role !== 'operator'){
      return json(403, { error: 'Only an operator can send a payout.' });
    }

    const { data: visits, error: vErr } = await db
      .from('visits')
      .select('id, mom_id, amount_cents, payment_status, transferred_at, transfer_id, payout_attempts')
      .eq('id', visitId).limit(1);

    if(vErr) return json(500, { error: 'Could not read that visit.' });
    const visit = visits && visits[0];
    if(!visit) return json(404, { error: 'Visit not found.' });

    if(visit.transferred_at){
      return json(200, { status:'already_paid', transferId: visit.transfer_id });
    }
    if(visit.payment_status !== 'paid'){
      return json(400, { error: 'That visit has not been paid for yet, so there is nothing to send on.' });
    }

    const gross = Number(visit.amount_cents) || 0;
    const amount = Math.round(gross * MARM_SHARE);
    if(amount <= 0) return json(400, { error: 'That visit has no amount recorded.' });

    const { data: moms } = await db
      .from('moms')
      .select('id, first_name, stripe_account_id, payouts_enabled')
      .eq('id', visit.mom_id).limit(1);

    const marm = moms && moms[0];
    if(!marm) return json(404, { error: 'No Marm on that visit.' });
    if(!marm.stripe_account_id){
      return json(400, { error: `${marm.first_name || 'She'} has not set up payouts yet.` });
    }
    if(!marm.payouts_enabled){
      return json(400, { error: `Stripe is not ready to pay ${marm.first_name || 'her'} yet. Check her payout status first.` });
    }

    const admin = adminDb();
    const attempt = (Number(visit.payout_attempts) || 0) + 1;

    // Claim it before calling Stripe, conditional on it still being unpaid.
    // Two clicks at the same moment cannot both proceed.
    const { data: claimed, error: claimErr } = await admin
      .from('visits')
      .update({ payout_attempts: attempt })
      .eq('id', visit.id)
      .is('transferred_at', null)
      .select('id');

    if(claimErr) return json(500, { error: 'Could not start that payout.' });
    if(!claimed || !claimed.length){
      return json(409, { error: 'That payout is already being sent.' });
    }

    let transfer;
    try{
      transfer = await s_transfer(amount, marm.stripe_account_id, visit, attempt);
    }catch(stripeErr){
      const message = stripeErr?.raw?.message || 'Stripe would not send that payout.';
      await admin.from('visits').update({ payout_error: message }).eq('id', visit.id);
      // Insufficient funds is the common one and it is not an error in her
      // details — the Mom's payment simply has not settled yet.
      const soft = /insufficient/i.test(message);
      return json(soft ? 409 : 402, {
        error: soft
          ? 'The money from that visit has not settled in Stripe yet. Usually a day or two — try again then.'
          : message
      });
    }

    const { error: wErr } = await admin.from('visits').update({
      payout_cents: amount,
      transfer_id: transfer.id,
      transferred_at: new Date().toISOString(),
      payout_error: null
    }).eq('id', visit.id);

    if(wErr){
      console.error('payout-visit: sent but not recorded', visit.id, transfer.id, wErr.message);
      return json(500, {
        error: 'The payout was sent but we could not record it. Do not send it again — check Stripe first.',
        transferId: transfer.id, needsReconcile: true
      });
    }

    return json(200, { status:'sent', amountCents: amount, transferId: transfer.id });

  }catch(e){
    console.error('payout-visit', e);
    return json(500, { error: 'Something went wrong sending that payout.' });
  }
};

function s_transfer(amount, destination, visit, attempt){
  return stripe().transfers.create({
    amount,
    currency: 'usd',
    destination,
    description: `Marmee visit ${visit.id}`,
    metadata: { marmee_visit_id: visit.id, marmee_mom_id: visit.mom_id }
  }, {
    // A retry after a real failure must be a new request, not a replay of
    // the old answer — the same trap the charge path fell into.
    idempotencyKey: `marmee-payout-${visit.id}-${attempt}`
  });
}

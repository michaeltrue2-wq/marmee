// ============================================================
//  POST /.netlify/functions/connect-status
//  body: { token, momId? }
//
//  Asks Stripe whether a Marm can actually be paid yet, and records the
//  answer. A Marm may call it for herself; an operator may call it for
//  anyone.
//
//  This exists because onboarding is not a single moment. She can finish
//  Stripe's form and still not be payable — a document under review, a
//  bank account that failed verification. Storing `payouts_enabled` from
//  Stripe rather than assuming it after onboarding is the difference
//  between "we think she is set up" and "she is".
//
//  `payouts_needs` carries Stripe's outstanding requirements in plain
//  words, so the console can say what is missing instead of just no.
// ============================================================

const { json, stripe, authed, preflight } = require('./_shared');
const { createClient } = require('@supabase/supabase-js');

function adminDb(){
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
}

// Stripe's requirement codes are for developers. These are for Mike.
const PLAIN = {
  'individual.verification.document': 'a photo ID',
  'individual.id_number': 'the last four of her SSN',
  'external_account': 'her bank account',
  'individual.address.line1': 'her address',
  'individual.dob.day': 'her date of birth',
  'tos_acceptance.date': 'she still needs to accept Stripe’s terms'
};
function plainly(list){
  const seen = [];
  (list||[]).forEach(code => {
    const k = Object.keys(PLAIN).find(p => code.indexOf(p) === 0);
    const say = k ? PLAIN[k] : code;
    if(seen.indexOf(say) === -1) seen.push(say);
  });
  return seen.length ? ('Stripe still needs ' + seen.slice(0,3).join(', ')) : null;
}

exports.handler = async (event) => {
  const early = preflight(event);
  if(early) return early;

  const { db, user, error } = await authed(event);
  if(error) return error;

  let body = {};
  try{ body = JSON.parse(event.body || '{}'); }catch{}

  try{
    const { data: prof } = await db.from('profiles').select('role').eq('id', user.id).limit(1);
    const isOperator = prof && prof[0] && prof[0].role === 'operator';

    let q = db.from('moms').select('id, stripe_account_id, first_name');
    q = (isOperator && body.momId) ? q.eq('id', body.momId) : q.eq('user_id', user.id);
    const { data: rows } = await q.limit(1);

    const me = rows && rows[0];
    if(!me) return json(404, { error: 'No Marm found.' });
    if(!me.stripe_account_id){
      return json(200, { ready: false, started: false, needs: 'She has not started payout setup yet.' });
    }

    const s = stripe();
    const acct = await s.accounts.retrieve(me.stripe_account_id);

    const ready = !!(acct.payouts_enabled && acct.charges_enabled !== false);
    const due   = (acct.requirements && (acct.requirements.currently_due || [])) || [];
    const needs = ready ? null : (plainly(due) || 'Stripe is still reviewing her details.');

    const { error: wErr } = await adminDb().from('moms').update({
      payouts_enabled: ready,
      payouts_checked_at: new Date().toISOString(),
      payouts_needs: needs
    }).eq('id', me.id);
    if(wErr) console.error('connect-status: write failed', wErr.message);

    return json(200, { ready, started: true, needs, accountId: me.stripe_account_id });

  }catch(e){
    console.error('connect-status', e);
    return json(500, { error: e?.raw?.message || 'Could not check payout status.' });
  }
};

// ============================================================
//  POST /.netlify/functions/connect-onboard
//  body: { token }
//
//  Called by a Marm from her own app. Creates her Stripe Express account
//  if she does not have one, then returns a one-time link to Stripe's
//  hosted onboarding.
//
//  Express is the deliberate choice. Stripe collects her bank details and
//  runs the identity checks on their own pages, so Marmee never sees,
//  transmits or stores a bank account number or a tax ID. For a business
//  whose whole proposition is trust with older women, the difference
//  between "we never had your bank details" and "we had them and were
//  careful" is worth the slightly less bespoke onboarding screen.
//
//  The caller is identified by their Supabase token, and the account is
//  attached to whichever Marm row belongs to that user. She cannot pass
//  an id and onboard on someone else's behalf.
// ============================================================

const { json, stripe, authed, preflight } = require('./_shared');

const RETURN_URL  = 'https://moms.hiremarmee.com/?payouts=done';
const REFRESH_URL = 'https://moms.hiremarmee.com/?payouts=retry';

exports.handler = async (event) => {
  const early = preflight(event);
  if(early) return early;

  const { db, user, error } = await authed(event);
  if(error) return error;

  try{
    const { data: rows, error: readErr } = await db
      .from('moms')
      .select('id, first_name, last_initial, phone, stripe_account_id')
      .eq('user_id', user.id)
      .limit(1);

    if(readErr) return json(500, { error: 'Could not read your profile.' });
    const me = rows && rows[0];
    if(!me) return json(403, { error: 'No Marm profile found for this login.' });

    const s = stripe();
    let accountId = me.stripe_account_id;

    if(!accountId){
      const account = await s.accounts.create({
        type: 'express',
        country: 'US',
        email: user.email || undefined,
        business_type: 'individual',
        capabilities: { transfers: { requested: true } },
        business_profile: {
          product_description: 'Household help provided through Marmee'
        },
        metadata: { marmee_mom_id: me.id }
      }, {
        // If she taps twice, or the response is lost on a poor connection,
        // Stripe returns the same account rather than making a second one.
        idempotencyKey: `marmee-connect-${me.id}`
      });
      accountId = account.id;

      // Written with the service-role-free client bound to her token would
      // fail — the column is revoked from `authenticated` on purpose. This
      // runs server side, so use the admin path.
      const { createClient } = require('@supabase/supabase-js');
      const adminDb = createClient(
        process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );
      const { error: wErr } = await adminDb
        .from('moms').update({ stripe_account_id: accountId }).eq('id', me.id);
      if(wErr){
        console.error('connect-onboard: could not save account id', wErr.message);
        return json(500, { error: 'Created your payout account but could not save it. Tell Mike before trying again.' });
      }
    }

    // Account links are single use and short lived, so one is made per visit
    // to this endpoint rather than stored.
    const link = await s.accountLinks.create({
      account: accountId,
      refresh_url: REFRESH_URL,
      return_url: RETURN_URL,
      type: 'account_onboarding'
    });

    return json(200, { url: link.url, accountId });

  }catch(e){
    console.error('connect-onboard', e);
    return json(500, { error: e?.raw?.message || 'Could not start payout setup.' });
  }
};

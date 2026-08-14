// ============================================================
//  notify-messages — scheduled, every 15 minutes
//
//  Messaging works, but nobody is told they have a message. A Marm in her
//  sixties is not going to sit refreshing a browser tab, so without this the
//  feature is decorative.
//
//  Two behaviours, one function:
//
//    · Prompt.  A pending message triggers an email, at most one every six
//      hours per conversation. A chatty back-and-forth therefore produces one
//      email, not fifteen.
//    · Daily.   The 13:00 UTC run (about 9am in Maine) sweeps up everything
//      still unsent regardless of the six-hour rule, so nothing waits a day
//      without being mentioned.
//
//  The email deliberately does NOT contain the message text. It says who
//  wrote and how many, and links to the app. Email lands in shared inboxes,
//  gets forwarded, and sits on unlocked phones — and we told both sides these
//  conversations are private between them and Marmee.
//
//  Nothing here is allowed to throw. A failed send must not stop the other
//  recipients from getting theirs, and must never mark a message as notified.
// ============================================================

const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const MOMS_URL   = 'https://moms.hiremarmee.com/';
const FAMILY_URL = 'https://book.hiremarmee.com/';
const FROM       = 'Marmee <hello@hiremarmee.com>';
const QUIET_HOURS = 6;

function admin(){
  if(!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
}

function postJson(host, path, body, apiKey){
  return new Promise(resolve => {
    const payload = JSON.stringify(body);
    const req = https.request({
      host, path, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Authorization': 'Bearer ' + apiKey
      }
    }, res => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', d => buf += d);
      res.on('end', () => resolve({ status: res.statusCode, body: buf }));
    });
    req.setTimeout(8000, () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
    req.on('error', e => resolve({ status: 0, body: e.message }));
    req.write(payload);
    req.end();
  });
}

async function sendEmail(to, subject, text, apiKey){
  const r = await postJson('api.resend.com', '/emails',
    { from: FROM, to: [to], subject, text }, apiKey);
  const ok = r.status >= 200 && r.status < 300;
  if(!ok) console.error('resend failed', r.status, r.body);
  return ok;
}

exports.handler = async () => {
  const db = admin();
  const key = process.env.RESEND_API_KEY;
  if(!db)  { console.error('notify-messages: no service role key'); return { statusCode: 200, body: 'no db' }; }
  if(!key) { console.error('notify-messages: no RESEND_API_KEY');   return { statusCode: 200, body: 'no key' }; }

  const isDigestRun = new Date().getUTCHours() === 13;

  const { data: pending, error } = await db
    .from('messages')
    .select('id, mom_id, family_id, sender_role, created_at')
    .is('notified_at', null)
    .order('created_at', { ascending: true });

  if(error){ console.error('notify-messages: read failed', error.message); return { statusCode: 500, body: 'read failed' }; }
  if(!pending || !pending.length) return { statusCode: 200, body: 'nothing pending' };

  // An operator message goes to both sides; everything else goes to the
  // person who did not write it.
  const groups = {};
  for(const m of pending){
    const sides = m.sender_role === 'operator' ? ['mom','family']
                : m.sender_role === 'family'   ? ['mom']
                : ['family'];
    for(const side of sides){
      const k = `${m.mom_id}|${m.family_id}|${side}`;
      (groups[k] = groups[k] || { mom_id: m.mom_id, family_id: m.family_id, side, ids: [] }).ids.push(m.id);
    }
  }

  let sent = 0, skipped = 0, failed = 0;

  for(const g of Object.values(groups)){
    try{
      if(!isDigestRun){
        // Has this person already had an email about this conversation recently?
        const since = new Date(Date.now() - QUIET_HOURS * 3600 * 1000).toISOString();
        const { data: recent } = await db
          .from('messages')
          .select('id')
          .eq('mom_id', g.mom_id).eq('family_id', g.family_id)
          .not('notified_at', 'is', null)
          .gte('notified_at', since)
          .limit(1);
        if(recent && recent.length){ skipped++; continue; }
      }

      let to = null, subject = '', body = '', who = 'someone';

      if(g.side === 'mom'){
        const { data: mom } = await db.from('moms')
          .select('first_name, user_id').eq('id', g.mom_id).limit(1);
        const { data: fam } = await db.from('families')
          .select('name').eq('id', g.family_id).limit(1);
        if(!mom || !mom[0] || !mom[0].user_id) { skipped++; continue; }
        const { data: u } = await db.auth.admin.getUserById(mom[0].user_id);
        to = u && u.user && u.user.email;
        who = (fam && fam[0] && fam[0].name) || 'One of your Moms';
        subject = `${who} sent you a message`;
        body = `Hello${mom[0].first_name ? ' ' + mom[0].first_name : ''},\n\n`
             + `${who} sent you ${g.ids.length === 1 ? 'a message' : g.ids.length + ' messages'} on Marmee.\n\n`
             + `Read and reply here: ${MOMS_URL}\n\n`
             + `— Marmee`;
      } else {
        const { data: fam } = await db.from('families')
          .select('name, contact_email, user_id').eq('id', g.family_id).limit(1);
        const { data: mom } = await db.from('moms')
          .select('first_name, last_initial').eq('id', g.mom_id).limit(1);
        if(!fam || !fam[0]) { skipped++; continue; }
        to = fam[0].contact_email;
        if(!to && fam[0].user_id){
          const { data: u } = await db.auth.admin.getUserById(fam[0].user_id);
          to = u && u.user && u.user.email;
        }
        who = mom && mom[0]
          ? ((mom[0].first_name || '') + ' ' + (mom[0].last_initial || '')).trim()
          : 'Your Marm';
        subject = `${who} sent you a message`;
        body = `Hello,\n\n`
             + `${who} sent you ${g.ids.length === 1 ? 'a message' : g.ids.length + ' messages'} on Marmee.\n\n`
             + `Read and reply here: ${FAMILY_URL}\n\n`
             + `— Marmee`;
      }

      if(!to){ skipped++; continue; }

      const ok = await sendEmail(to, subject, body, key);
      if(!ok){ failed++; continue; }   // leave notified_at null so the next run retries

      const { error: markErr } = await db.from('messages')
        .update({ notified_at: new Date().toISOString() })
        .in('id', g.ids);
      if(markErr) console.error('notify-messages: mark failed', markErr.message);
      sent++;

    }catch(e){
      // One bad recipient must not stop the rest.
      console.error('notify-messages: group failed', e && e.message);
      failed++;
    }
  }

  console.log(`notify-messages: sent ${sent}, skipped ${skipped}, failed ${failed}, digest=${isDigestRun}`);
  return { statusCode: 200, body: JSON.stringify({ sent, skipped, failed, digest: isDigestRun }) };
};

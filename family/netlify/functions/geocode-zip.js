// ============================================================
//  GET /.netlify/functions/geocode-zip?zip=04101
//
//  Turns a US postcode into a rough lat/lng so matching can measure real
//  distance. Without this, only people who tap "Use my location" ever get
//  coordinates — and most people type their ZIP instead, so distance
//  matching silently fell back to comparing neighbourhood labels.
//
//  Every answer is cached in `zip_codes`, so a given postcode is looked up
//  once, ever. Portland is ~23 postcodes; after the first week this table
//  answers almost everything and the outside world is barely touched.
//
//  Deliberately unauthenticated: it runs during sign-up, before anyone has
//  an account, and it only exposes the location of a postcode — which is
//  public information in any atlas. The `zip` input is validated to five
//  digits before it reaches anything.
//
//  A GET with no custom headers is a CORS "simple request", so this works
//  cross-origin from moms. and book. without a preflight that Netlify
//  would answer itself.
//
//  Failure is never fatal. If the lookup does not work we return null and
//  sign-up carries on: the person still gets their ZIP and their market,
//  and matching falls back to neighbourhood names as it does today.
// ============================================================

const https = require('https');
const { createClient } = require('@supabase/supabase-js');
const { CORS } = require('./_shared');

const HEADERS = { ...CORS, 'Access-Control-Allow-Methods': 'GET, OPTIONS' };

function reply(statusCode, body){
  return { statusCode, headers: HEADERS, body: JSON.stringify(body) };
}

// Writes to the cache need to happen for people who are not signed in yet,
// so this one place uses the service role. It only ever touches zip_codes.
// Returns null rather than throwing when the key is absent. createClient with
// an undefined key throws immediately, which took down the whole handler and
// looked identical to "we have never heard of that postcode" — the cache is a
// speed-up, not a dependency, and it must not be able to break the lookup.
function admin(){
  if(!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY){
    console.error('geocode-zip: SUPABASE_SERVICE_ROLE_KEY missing — running without the cache');
    return null;
  }
  try{
    return createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }catch(e){
    console.error('geocode-zip: could not build admin client', e.message);
    return null;
  }
}

// Netlify's Node runtime does not reliably provide a global fetch, and when
// it is missing the call throws instantly and looks exactly like "the ZIP is
// unknown". node:https is present on every version. One redirect hop is
// followed because both providers use them.
function fetchJson(url, ms, hops){
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if(!done){ done = true; resolve(v); } };
    let req;
    try{
      req = https.get(url, {
        headers: { 'User-Agent': 'Marmee/1.0 (hiremarmee.com)', 'Accept': 'application/json' }
      }, res => {
        const code = res.statusCode || 0;
        if(code >= 300 && code < 400 && res.headers.location && (hops||0) < 2){
          res.resume();
          return finish(fetchJson(res.headers.location, ms, (hops||0)+1));
        }
        if(code < 200 || code >= 300){ res.resume(); return finish({ err: 'status ' + code }); }
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', d => { buf += d; if(buf.length > 200000) req.destroy(); });
        res.on('end', () => {
          try{ finish({ data: JSON.parse(buf) }); }
          catch(e){ finish({ err: 'unparseable response' }); }
        });
      });
    }catch(e){ return finish({ err: 'request failed: ' + e.message }); }

    req.setTimeout(ms || 4000, () => { req.destroy(); finish({ err: 'timeout' }); });
    req.on('error', e => finish({ err: e.message }));
  });
}

// Two independent sources. Neither needs an API key. If the first is down or
// has never heard of the postcode, the second gets a turn. The reason each
// one failed is carried back so a silent "unknown" can be diagnosed.
async function lookup(zip){
  const why = [];

  const a = await fetchJson('https://api.zippopotam.us/us/' + zip);
  if(a.err) why.push('zippopotam: ' + a.err);
  const place = a.data && Array.isArray(a.data.places) && a.data.places[0];
  if(place && place.latitude && place.longitude){
    return { lat: Number(place.latitude), lng: Number(place.longitude),
             city: place['place name'] || null,
             state: place['state abbreviation'] || null };
  }
  if(a.data && !place) why.push('zippopotam: no places');

  const b = await fetchJson(
    'https://nominatim.openstreetmap.org/search?postalcode=' + zip + '&country=us&format=json&limit=1'
  );
  if(b.err) why.push('nominatim: ' + b.err);
  const hit = Array.isArray(b.data) && b.data[0];
  if(hit && hit.lat && hit.lon){
    return { lat: Number(hit.lat), lng: Number(hit.lon), city: null, state: null };
  }
  if(b.data && !hit) why.push('nominatim: no match');

  return { failed: true, why: why.join('; ') || 'no result' };
}

exports.handler = async (event) => {
  if(event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };
  if(event.httpMethod !== 'GET')     return reply(405, { error: 'Method not allowed.' });

  const zip = String((event.queryStringParameters || {}).zip || '').trim();
  if(!/^\d{5}$/.test(zip)) return reply(400, { error: 'Give me a five digit ZIP.' });

  const db = admin();
  const noCache = !db;

  try{
    // Cached already? Then nobody outside gets asked.
    if(db){
      try{
        const { data: hit } = await db
          .from('zip_codes').select('zip, lat, lng, city, state').eq('zip', zip).limit(1);
        if(hit && hit[0] && hit[0].lat != null && hit[0].lng != null){
          return reply(200, { zip, lat: Number(hit[0].lat), lng: Number(hit[0].lng),
                              city: hit[0].city, state: hit[0].state, cached: true });
        }
      }catch(e){ console.error('geocode-zip: cache read failed', e.message); }
    }

    const found = await lookup(zip);
    if(!found || found.failed){
      // Say so plainly rather than pretending. The caller carries on without
      // coordinates; it is a worse match, not a broken sign-up. `why` is what
      // turns a silent failure into a fixable one.
      console.error('geocode-zip unknown', zip, found && found.why);
      return reply(200, { zip, lat: null, lng: null, unknown: true,
                          why: (found && found.why) || 'no reason recorded', noCache });
    }

    if(db){
      try{
        const { error: upErr } = await db.from('zip_codes').upsert({
          zip, lat: found.lat, lng: found.lng,
          city: found.city, state: found.state, updated_at: new Date().toISOString()
        }, { onConflict: 'zip' });
        if(upErr) console.error('zip cache write failed', zip, upErr.message);
      }catch(e){ console.error('zip cache write threw', zip, e.message); }
    }

    return reply(200, { zip, lat: found.lat, lng: found.lng,
                        city: found.city, state: found.state, cached: false, noCache });

  }catch(e){
    console.error('geocode-zip', e);
    // Carries the reason back rather than an anonymous "unknown". A silent
    // failure here is indistinguishable from a postcode that does not exist.
    return reply(200, { zip, lat: null, lng: null, unknown: true,
                        why: 'handler threw: ' + (e && e.message), noCache });
  }
};

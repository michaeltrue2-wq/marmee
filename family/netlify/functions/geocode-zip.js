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

const { createClient } = require('@supabase/supabase-js');
const { CORS } = require('./_shared');

const HEADERS = { ...CORS, 'Access-Control-Allow-Methods': 'GET, OPTIONS' };

function reply(statusCode, body){
  return { statusCode, headers: HEADERS, body: JSON.stringify(body) };
}

// Writes to the cache need to happen for people who are not signed in yet,
// so this one place uses the service role. It only ever touches zip_codes.
function admin(){
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

async function fetchJson(url, ms){
  const ctl = new AbortController();
  const t = setTimeout(()=>ctl.abort(), ms || 4000);
  try{
    const r = await fetch(url, {
      signal: ctl.signal,
      headers: { 'User-Agent': 'Marmee/1.0 (hiremarmee.com)' }
    });
    if(!r.ok) return null;
    return await r.json();
  }catch(e){ return null; }
  finally{ clearTimeout(t); }
}

// Two independent sources. Neither needs an API key. If the first is down
// or has never heard of the postcode, the second gets a turn.
async function lookup(zip){
  const zp = await fetchJson(`https://api.zippopotam.us/us/${zip}`);
  const place = zp && Array.isArray(zp.places) && zp.places[0];
  if(place && place.latitude && place.longitude){
    return {
      lat: Number(place.latitude),
      lng: Number(place.longitude),
      city: place['place name'] || null,
      state: place['state abbreviation'] || null
    };
  }

  const nom = await fetchJson(
    `https://nominatim.openstreetmap.org/search?postalcode=${zip}&country=us&format=json&limit=1`
  );
  const hit = Array.isArray(nom) && nom[0];
  if(hit && hit.lat && hit.lon){
    return { lat: Number(hit.lat), lng: Number(hit.lon), city: null, state: null };
  }

  return null;
}

exports.handler = async (event) => {
  if(event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };
  if(event.httpMethod !== 'GET')     return reply(405, { error: 'Method not allowed.' });

  const zip = String((event.queryStringParameters || {}).zip || '').trim();
  if(!/^\d{5}$/.test(zip)) return reply(400, { error: 'Give me a five digit ZIP.' });

  try{
    const db = admin();

    // Cached already? Then nobody outside gets asked.
    const { data: hit } = await db
      .from('zip_codes').select('zip, lat, lng, city, state').eq('zip', zip).limit(1);

    if(hit && hit[0] && hit[0].lat != null && hit[0].lng != null){
      return reply(200, { zip, lat: Number(hit[0].lat), lng: Number(hit[0].lng),
                          city: hit[0].city, state: hit[0].state, cached: true });
    }

    const found = await lookup(zip);
    if(!found){
      // Say so plainly rather than pretending. The caller carries on without
      // coordinates; it is a worse match, not a broken sign-up.
      return reply(200, { zip, lat: null, lng: null, unknown: true });
    }

    const { error: upErr } = await db.from('zip_codes').upsert({
      zip, lat: found.lat, lng: found.lng,
      city: found.city, state: found.state, updated_at: new Date().toISOString()
    }, { onConflict: 'zip' });
    if(upErr) console.error('zip cache write failed', zip, upErr.message);

    return reply(200, { zip, lat: found.lat, lng: found.lng,
                        city: found.city, state: found.state, cached: false });

  }catch(e){
    console.error('geocode-zip', e);
    return reply(200, { zip, lat: null, lng: null, unknown: true });
  }
};

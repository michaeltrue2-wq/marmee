// ============================================================
//  Shared helpers for the Marmee Netlify functions.
//
//  The Stripe secret key lives only in Netlify's environment. It is
//  never sent to a browser. Every function authenticates the caller
//  with their Supabase access token and then talks to Postgres AS
//  THAT USER, so row-level security still decides what they may touch.
//  No service-role key is used anywhere.
// ============================================================

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

const CORS = {
  'Access-Control-Allow-Origin':  process.env.ALLOWED_ORIGINS || '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

function json(statusCode, body){
  return { statusCode, headers: CORS, body: JSON.stringify(body) };
}

function stripe(){
  if(!STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set in Netlify');
  return new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
}

// Builds a Supabase client bound to the caller's token so RLS applies.
async function authed(event){
  const header = event.headers.authorization || event.headers.Authorization || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if(!token) return { error: json(401, { error: 'Not signed in.' }) };

  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data, error } = await db.auth.getUser(token);
  if(error || !data?.user) return { error: json(401, { error: 'Your session has expired. Sign in again.' }) };

  return { db, user: data.user };
}

// Guard rails shared by every handler.
function preflight(event){
  if(event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if(event.httpMethod !== 'POST')    return json(405, { error: 'Method not allowed.' });
  return null;
}

module.exports = { json, stripe, authed, preflight, CORS };

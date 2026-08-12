# Resend + Supabase — setup checklist

**Why:** Supabase's built-in email sender is capped at **2 messages per hour, project-wide**, and sends from a Supabase address. Upgrading your Supabase plan does not change this. Custom SMTP does.

**After this:** 30/hour (raisable), sent from `hiremarmee.com`, and the email templates become editable.

**Time:** ~15 minutes, most of it waiting on DNS.

---

## 1 · Create the Resend account

- Go to **https://resend.com** and sign up.
- Free tier: 3,000 emails/month, 100/day. The pilot will use maybe 30.

## 2 · Add your domain

**Domains → Add Domain** → `hiremarmee.com`

Resend shows three DNS records to add:

| Type | What it does |
|---|---|
| `MX` | receives bounce notifications |
| `TXT` (SPF) | authorises Resend to send as your domain |
| `TXT` (DKIM) | signs each message so inboxes trust it |

## 3 · Add those records to DNS

Your domains are served through Netlify, so DNS is most likely there.

- **Netlify:** Domains → `hiremarmee.com` → **DNS records** → Add a record, once per row.
- **If DNS is at your registrar instead** (GoDaddy, Namecheap, Cloudflare), add them there — wherever the nameservers point.

> **The one gotcha.** Many DNS panels auto-append the domain. If Resend says the host is
> `send.hiremarmee.com` and you paste that whole thing, you can end up with
> `send.hiremarmee.com.hiremarmee.com` and it will never verify. If a record won't
> verify, that's almost always why — try entering just `send`.

Back in Resend, click **Verify**. Usually a few minutes; can take up to an hour.

## 4 · Create an API key

**API Keys → Create API Key**

- Name: `supabase`
- Permission: **Sending access**

Copy it now — it is shown once.

## 5 · Point Supabase at Resend

**Supabase → Authentication → Emails → SMTP Settings** → enable custom SMTP:

```
Host             smtp.resend.com
Port             465
Username         resend
Password         <the Resend API key>
Sender email     hello@hiremarmee.com
Sender name      Marmee
```

Save. The "Set up custom SMTP to edit templates" banner disappears.

> Port **465** is what Resend documents. If it misbehaves, **587** also works.

## 6 · Fix the Site URL — do not skip this

**Supabase → Authentication → URL Configuration**

- **Site URL:** `https://moms.hiremarmee.com`
- **Redirect URLs:** add all three
  - `https://moms.hiremarmee.com/**`
  - `https://book.hiremarmee.com/**`
  - `https://console.hiremarmee.com/**`

Without this, the confirmation link in the email points somewhere useless and the
whole flow dead-ends after sign-up.

## 7 · Rewrite the two emails that matter

Templates are editable now.

- **Confirm sign up** — the first thing a Marm ever receives from Marmee. The default is a bare link with no context.
- **Reset password** — the second.

---

## Verify it worked

1. Supabase → Authentication → Users → **Add user**, any throwaway address you can read, **without** auto-confirm.
2. The confirmation email should arrive from `hello@hiremarmee.com`, not a Supabase address.
3. Resend → **Logs** shows every send, with delivery status. If something fails, the reason is there.

---

## If it isn't ready in time tonight

You can confirm accounts by hand, which needs no email at all:

**Supabase → Authentication → Users** → find the row → **⋯** → confirm the address.

Fine for two people. Not fine for twenty.

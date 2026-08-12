# Marmee — auth email templates

Paste these into **Supabase → Authentication → Emails → Templates**.
Editable now that custom SMTP is configured.

Notes on the HTML: everything is tables with inline styles, because Outlook and
Gmail strip `<style>` blocks and ignore flexbox. Fonts fall back to Georgia and
system sans — Fraunces and Hanken Grotesk won't load in most mail clients, and
Georgia is the closest widely-installed match to Fraunces.

Supabase variables available: `{{ .ConfirmationURL }}`, `{{ .Email }}`,
`{{ .SiteURL }}`, `{{ .Token }}`, `{{ .TokenHash }}`.

---

## 1 · Confirm sign up

**Subject**

```
You're nearly in — one tap to finish
```

**Body**

```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0;padding:0;background:#F6F1E7;">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 2px 8px rgba(21,32,26,0.06);">

        <!-- masthead -->
        <tr>
          <td style="background:#1E3A2E;padding:28px 32px;">
            <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#E4B968;"></span>
            <span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:600;color:#F6F1E7;letter-spacing:-0.01em;padding-left:8px;">Marmee</span>
          </td>
        </tr>

        <!-- body -->
        <tr>
          <td style="padding:36px 32px 8px 32px;">
            <h1 style="margin:0 0 16px 0;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;font-weight:500;color:#1E3A2E;">
              Welcome — you're nearly there.
            </h1>
            <p style="margin:0 0 24px 0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:17px;line-height:1.6;color:#15201A;">
              One tap below and you're all set. This just confirms
              <strong style="color:#1E3A2E;">{{ .Email }}</strong> is really yours —
              it's the last bit of housekeeping, we promise.
            </p>
          </td>
        </tr>

        <!-- button -->
        <tr>
          <td align="center" style="padding:8px 32px 28px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="background:#C8993A;border-radius:100px;">
                  <a href="{{ .ConfirmationURL }}"
                     style="display:inline-block;padding:16px 36px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;color:#152A21;text-decoration:none;border-radius:100px;">
                    Confirm my email
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- fallback -->
        <tr>
          <td style="padding:0 32px 28px 32px;">
            <p style="margin:0 0 8px 0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#5C6B60;">
              If the button doesn't work, copy this into your browser:
            </p>
            <p style="margin:0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;word-break:break-all;">
              <a href="{{ .ConfirmationURL }}" style="color:#806116;">{{ .ConfirmationURL }}</a>
            </p>
          </td>
        </tr>

        <!-- footer -->
        <tr>
          <td style="padding:22px 32px 28px 32px;border-top:1px solid #EBE3D3;">
            <p style="margin:0 0 8px 0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#5C6B60;">
              Didn't sign up for Marmee? You can ignore this — nothing will happen,
              and we won't email you again.
            </p>
            <p style="margin:0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:#5C6B60;">
              Marmee · Portland, Maine
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
```

---

## 2 · Reset password

**Subject**

```
Let's get you back in
```

**Body**

```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0;padding:0;background:#F6F1E7;">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 2px 8px rgba(21,32,26,0.06);">

        <tr>
          <td style="background:#1E3A2E;padding:28px 32px;">
            <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#E4B968;"></span>
            <span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:600;color:#F6F1E7;letter-spacing:-0.01em;padding-left:8px;">Marmee</span>
          </td>
        </tr>

        <tr>
          <td style="padding:36px 32px 8px 32px;">
            <h1 style="margin:0 0 16px 0;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;font-weight:500;color:#1E3A2E;">
              Let's get you back in.
            </h1>
            <p style="margin:0 0 24px 0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:17px;line-height:1.6;color:#15201A;">
              Tap below to choose a new password. It only takes a moment, and the
              link works for the next hour.
            </p>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:8px 32px 28px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="background:#C8993A;border-radius:100px;">
                  <a href="{{ .ConfirmationURL }}"
                     style="display:inline-block;padding:16px 36px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;color:#152A21;text-decoration:none;border-radius:100px;">
                    Choose a new password
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:0 32px 28px 32px;">
            <p style="margin:0 0 8px 0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#5C6B60;">
              If the button doesn't work, copy this into your browser:
            </p>
            <p style="margin:0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;word-break:break-all;">
              <a href="{{ .ConfirmationURL }}" style="color:#806116;">{{ .ConfirmationURL }}</a>
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:22px 32px 28px 32px;border-top:1px solid #EBE3D3;">
            <p style="margin:0 0 8px 0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#5C6B60;">
              Didn't ask for this? You can ignore it — your password stays exactly
              as it was.
            </p>
            <p style="margin:0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:#5C6B60;">
              Marmee · Portland, Maine
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
```

---

## Before you send these to real people

- **Send one to yourself first.** Gmail, Outlook and Apple Mail render differently.
- **17px body text is deliberate.** Most marketing email uses 14–15px; your supply
  side is 55+ and reading on a phone.
- **The `hello@hiremarmee.com` sender can't receive replies.** Resend's MX record
  only covers the `send` subdomain. Someone confused *will* hit Reply. Either set
  up forwarding on `hello@`, or change the sender to an address you actually read.

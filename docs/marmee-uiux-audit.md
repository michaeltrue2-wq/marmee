# Marmee — UI/UX Audit

**Date:** 12 August 2026
**Scope:** `console/index.html`, `moms/index.html`, `moms/apply.html`, `family/index.html`, `family/family-request.html`
**Method:** source inventory across all five files, plus every screen walked in a real browser at a true 390 × 780 viewport with computed styles read off the rendered DOM.

---

## How to read this

Every finding has an ID, a severity, a file and line, and a specific fix. Nothing says "improve spacing."

| Severity | Meaning |
|---|---|
| **Critical** | A user gets stuck, loses work, or cannot complete the task. Fix before the pilot. |
| **High** | Visibly broken, or fails an accessibility standard. Fix before the pilot. |
| **Medium** | Inconsistent or sloppy. Fix during the spacing pass. |
| **Low** | Polish. |

This is a menu, not a mandate. Veto anything — the IDs are here so you can say "skip SP-4" and we both know what that means.

**What's measured vs. inferred.** Padding values, font sizes, tap-target dimensions, element geometry and contrast ratios are all measured — either counted in source or read from `getComputedStyle` on the live rendered page. Two things are reasoned rather than confirmed: behaviour on physical iOS hardware (the safe-area findings are inferred from the *absence* of any inset handling in source, which is certain; the exact visual result on a given iPhone is not), and anything requiring more than one concurrent real user.

---

## Scoreboard

| Area | Finding | Severity |
|---|---|---|
| Spacing | 27 distinct values, 66% off any 4pt grid | High |
| Type | 43 distinct font sizes, most of them accidental | High |
| Contrast | Brand gold fails WCAG AA everywhere it's used as text | High |
| Safe area | Zero handling in any file; fixed bars flush to viewport edge | High |
| Popups | 34 native `alert`/`prompt`/`confirm` dialogs | High |
| Errors | Raw backend strings shown to end users | Critical |
| Auth | Signed-in-with-no-profile is an unrecoverable dead end | Critical |
| Schedule | Past visits shown as "Upcoming"; completed visits cancellable | High |
| Debug | Three build tags shipped to production, with drifted numbers | Medium |
| Terminology | **Fixed and shipped 12 Aug** — 54 strings across 5 files | Done |

---

# Part 1 — Spacing

This is the headline, and it's worse than "ad hoc."

## The inventory

**354 spacing declarations. 27 distinct values. 235 of them (66%) sit off any 4pt grid.**

*Correction, found during the migration:* that count covered only the shorthand properties (`padding`, `margin`, `gap`). It missed the directional longhands — `margin-bottom:12px`, `margin-top:8px` and friends — which add **129 more declarations, 78 of them off-grid.** True totals: **483 declarations, 313 off-grid.** The migration covers both.

```
 14px  ×33  ← off-grid, and the most-used value in the product
 16px  ×32
 13px  ×25  ← off-grid
 12px  ×25
 22px  ×24  ← off-grid
 18px  ×24  ← off-grid
 20px  ×23
 10px  ×22  ← off-grid
 15px  ×21  ← off-grid
  6px  ×18  ← off-grid
 11px  ×16  ← off-grid
  4px  ×15
  9px  ×13  ← off-grid
  7px  ×10  ← off-grid
  8px  ×9
  3px  ×8   ← off-grid
 24px  ×7
 26px  ×6   ← off-grid
 34px  ×5   ← off-grid
 60px  ×4
  2px  ×3   ← off-grid
 30px  ×3   ← off-grid
 28px  ×3
150px  ×2   ← off-grid
 40px  ×1
 38px  ×1   ← off-grid
 31px  ×1   ← off-grid
```

Per file:

| File | Declarations | Distinct values |
|---|---:|---:|
| `moms/index.html` | 112 | 22 |
| `console/index.html` | 84 | 25 |
| `family/index.html` | 78 | 21 |
| `moms/apply.html` | 47 | 16 |
| `family/family-request.html` | 33 | 16 |

**SP-1 · High · The 13/14/15/16 cluster.**
Four values competing for the same job, 111 uses between them. No human decided that a card needs `14px` here and `15px` there; these accreted. This is the single biggest source of the "something's slightly off" feeling, and it's invisible in code review because each individual value looks reasonable.

**SP-2 · High · The 9/10/11/12 cluster.**
Same problem one step down. 76 uses across four values.

**SP-3 · Medium · The 2/3px values.**
Eleven uses of `2px` and `3px` as spacing. At these sizes the value is doing nothing a `0` or a `4` wouldn't do, and they make the scale look more intentional than it is.

## The proposed scale

One 4pt scale, ten tokens, covering every current use:

```css
:root{
  --s1:  4px;   /* hairline gaps, chip padding */
  --s2:  8px;   /* icon-to-label, tight stacks */
  --s3: 12px;   /* input padding, chip gaps */
  --s4: 16px;   /* the default — card padding, row gaps */
  --s5: 20px;   /* card padding on wide surfaces */
  --s6: 24px;   /* section padding */
  --s7: 32px;   /* between sections */
  --s8: 40px;   /* major breaks */
  --s9: 48px;
  --s10:64px;   /* page top/bottom */
}
```

Migration map — every existing value has a destination:

| Current | → | Token | Uses affected |
|---|---|---|---:|
| `2px`, `3px`, `4px` | → | `--s1` (4px) | 26 |
| `6px`, `7px`, `8px` | → | `--s2` (8px) | 37 |
| `9px`, `10px`, `11px`, `12px`, `13px` | → | `--s3` (12px) | 101 |
| `14px`, `15px`, `16px` | → | `--s4` (16px) | 86 |
| `18px`, `20px` | → | `--s5` (20px) | 47 |
| `22px`, `24px`, `26px` | → | `--s6` (24px) | 37 |
| `28px`, `30px`, `31px`, `34px` | → | `--s7` (32px) | 12 |
| `38px`, `40px` | → | `--s8` (40px) | 2 |
| `60px` | → | `--s10` (64px) | 4 |
| `150px` | → | see **LO-2** | 2 |

**SP-4 · Medium · Do this in one commit, not five.**
A partial spacing migration is worse than none — you end up with two scales instead of one. The whole thing is a single mechanical pass, reviewable as one diff, revertible as one commit.

---

# Part 2 — Type

**TY-1 · High · 43 distinct font sizes.**

Seventeen of them live between 12px and 17.6px:

```
12.0   12.16  12.48  12.8   13.12  13.6   13.76  14.08  14.4
14.72  15.04  15.2   15.36  15.52  15.68  16.0   16.32  16.8
17.0   17.28  17.6
```

**Nobody chose `14.72px`.**

*Corrected diagnosis.* An earlier draft blamed `em` compounding through nested containers. That was wrong, and checking it took one command: **237 `rem` declarations, zero `em`, and no `html{font-size}` override anywhere.** So `rem × 16` exactly, with no inheritance involved — `14.72px` is simply `0.92rem`, a value picked by eye.

That makes it a simpler problem than it looked. There's no cascade to untangle; there are just 43 hand-chosen values that never had a scale to snap to.

**TY-2 · Medium · Two spellings of the same value.**
`.95rem` and `0.95rem` both appear; so do `.9`/`0.9`, `.82`/`0.82`, `.78`/`0.78`, `.92`/`0.92`, `.8`/`0.8`, `.76`/`0.76`, `.85`/`0.85`, `.74`, `.88`, `.97`, `.98`, `.68`. This is why the problem was invisible — no two greps agree, so the scale never looked as fragmented as it is.

**TY-3 · High · Fix the cause, not the symptom.**
Rounding 43 values to a scale won't hold if they're still declared in compounding `em`. Declare type in `px` at the point of use, or in `rem` only from elements that are direct children of a non-scaled parent.

Proposed scale — nine steps, all on the 4pt-compatible grid:

```css
:root{
  --t-xs:  12px;  /* eyebrow labels, timestamps */
  --t-sm:  14px;  /* meta, captions */
  --t-md:  16px;  /* body — the default */
  --t-lg:  18px;  /* emphasised body, list titles */
  --t-xl:  20px;  /* card headings */
  --t-2xl: 24px;  /* section headings */
  --t-3xl: 30px;  /* screen titles */
  --t-4xl: 36px;  /* hero numerals */
  --t-5xl: 48px;  /* the one big stat */
}
```

---

# Part 3 — Touch targets

Apple's HIG and WCAG 2.5.5 both put the floor at 44 × 44px.

**TT-1 · High · The `Available` toggle is 106 × 38px.**
`moms/index.html` — the persistent header control on all four tabs. This is the switch that decides whether a Marm receives work at all. It is the *only* sub-44px target on that screen, which makes it worse, not better: it's the one thing she'll reach for most and the one thing hardest to hit.
**Fix:** `min-height:44px` on the pill, padding adjusted to suit.

**TT-2 · Medium · `Save & finish later` is 124 × 20px.**
`moms/apply.html`, persistent in the application header. Twenty pixels tall. A 62-year-old on a phone will miss it, and the thing she misses is the control that stops her losing a half-finished application.
**Fix:** `display:inline-block; padding:12px 8px; min-height:44px`.

**TT-3 · Low · Audit remaining rows after the spacing pass.**
Several list rows currently clear 44px only because of ad-hoc padding. Once spacing is normalised, re-measure — some will drop below.

---

# Part 4 — Layout, fixed bars and safe area

**LO-1 · High · Zero safe-area handling anywhere in the codebase.**

```
safe-area-inset : 0 occurrences across all 5 files
viewport-fit    : 0 occurrences across all 5 files
```

Measured on the rendered Marm dashboard at 780px viewport height:

| Element | Position | Top | Bottom |
|---|---|---:|---:|
| `.tabbar` (`moms/index.html:129`) | fixed | 716 | **780** |

Flush to the bottom edge. On any iPhone with a home indicator, the bottom ~34px of all four tab buttons sits underneath it.

Same pattern in the application flow — `.nav` at `moms/apply.html:118` and `family/family-request.html:56` are both `position:fixed; bottom:0` with no inset. Measured there: nav bottom edge at **781px** in a 780px viewport.

**Fix**, in each file:

```html
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
```

```css
.tabbar{ padding-bottom: env(safe-area-inset-bottom, 0px); }
.nav   { padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px)); }
```

**LO-2 · High · The `150px` hand-tuned dodge.**
`moms/apply.html:34` and `family/family-request.html:26`:

```css
.stage{max-width:560px;margin:0 auto;padding:26px 20px 150px}
```

That `150px` is someone eyeballing clearance for the fixed footer. The footer is 84px tall and starts at 697px, so 83px of that padding is wasted — and content *still* gets clipped, because the number was guessed rather than derived. Visible on step 1 (the `OUR SPECIALTY` badge is cut) and step 2 (the photo upload box is sliced in half).

**Fix:** derive it.

```css
:root{ --navbar-h: 84px; }
.stage{ padding-bottom: calc(var(--navbar-h) + 24px + env(safe-area-inset-bottom, 0px)); }
```

**LO-3 · Medium · `100vh` used six times.**

```
moms/index.html:20     .app    min-height:100vh
moms/index.html:158    .vet    min-height:100vh
console/index.html:39  .shell  min-height:100vh
console/index.html:41  .side   height:100vh
console/index.html:60  .main   max-height:100vh
console/index.html:138 .drawer height:100vh
```

On mobile Safari `100vh` is taller than the visible viewport, because it excludes the collapsing browser chrome. Any full-height element sized this way overflows by the height of the URL bar.
**Fix:** `100dvh` with a `100vh` fallback.

```css
min-height:100vh;
min-height:100dvh;
```

**LO-4 · High · The greeting header breaks on every screen of the Marm's app.**
Measured: "Good afternoon, Master" renders in a **160px-wide box, 108px tall — three lines.** The `Available` pill is claiming width from a flex row with no `min-width` discipline. Because the header is persistent, it's broken on Home, Schedule, Earnings *and* You.
**Fix:** shorten the greeting to the name alone (`Good afternoon,` on its own line above, or just `Hi, Bev`), and give the pill `flex-shrink:0` with the greeting `min-width:0`.

**LO-5 · Low · `.hero` overflows horizontally by 60px.**
`family/index.html` — measured `scrollWidth` 410 vs `clientWidth` 350. Clipped, so invisible here, but it's the kind of thing that produces a stray horizontal scrollbar on some Android browsers.

**LO-6 · Medium · Duplicate `UPCOMING` label.**
Marm app, Schedule tab: the section eyebrow and the card's own eyebrow both read `UPCOMING`, stacked directly on top of each other.

**LO-7 · Medium · Primary CTA is off-centre.**
`moms/apply.html` — the `Get started` / `Continue` button sits ~39px right of the footer's centre axis, because the footer is a flex row containing an invisible spacer and the fixed build tag.

---

# Part 5 — Colour and contrast

Palette, extracted from source:

```
--ink        #15201a     --pine       #1e3a2e     --pine-deep  #152a21
--ivory      #f6f1e7     --ivory-dim  #ebe3d3     --muted      #5c6b60
--honey      #c8993a     --honey-deep #8a6a1f     --honey-soft #e4b968
--clay       #b4552f     --blush      #e6c6b4
--line       #e0d8c6  /  #e4dcc9   ← two different values
```

Measured contrast ratios (WCAG AA: 4.5:1 body, 3.0:1 large):

| Ratio | AA body | AA large | Usage |
|---:|---|---|---|
| 14.88:1 | PASS | PASS | `--ink` body text on page |
| 5.83:1 | PASS | PASS | Primary button label on gold |
| 5.63:1 | PASS | PASS | `--muted` on white cards |
| 5.01:1 | PASS | PASS | `--muted` on page |
| 4.75:1 | PASS | PASS | Gold on dark hero card |
| **4.36:1** | **FAIL** | PASS | **`--clay` — the error message colour** |
| **2.60:1** | **FAIL** | **FAIL** | **`--honey` as text on white cards** |
| **2.31:1** | **FAIL** | **FAIL** | **`--honey` as text on ivory** |

**CO-1 · High · Gold text fails AA. — FIXED 12 Aug.**

*Corrected count.* An earlier draft of this audit said "37 places." That number was wrong: the regex also matched `border-color: var(--honey)`, which is decoration, not text, and is held to 3:1 rather than 4.5:1. The real breakdown:

| Usage | Count | Ratio on ivory | AA body |
|---|---:|---:|---|
| `color: var(--honey)` — actual text | 5 | 2.31:1 | FAIL |
| `color: var(--honey-deep)` — the section eyebrows | 16 | 4.48:1 | FAIL (by 0.02) |
| `border-color` / `outline-color: var(--honey)` | 32 | — | not a text issue |

So **21 text usages**, not 37. The 16 eyebrows are the ones that matter: `YOUR MATCH`, `UPCOMING`, `SO FAR`, `YOUR MOMS`, `EARNINGS`, `YOUR PROFILE`. Small, uppercase, letterspaced and low-contrast — the four properties that compound worst for a reader over 55, which is your entire supply side.

**Fixed:** `--honey-deep` darkened `#8A6A1F` → `#806116`, chosen by walking the same hue down until it cleared 4.5:1 against all three backgrounds in use:

| On | Was | Now |
|---|---:|---:|
| `--ivory` #f6f1e7 | 4.48:1 | **5.13:1** |
| `--ivory-dim` #ebe3d3 | 3.95:1 | **4.52:1** |
| white | 5.05:1 | **5.77:1** |

The five real `--honey` text uses (star ratings) were repointed to `--honey-deep`. `--honey` is retained for fills, borders and the dark hero cards, where it measures 4.75:1 and passes.

**CO-2 · High · Error text failed contrast. — FIXED 12 Aug.**
`--clay` #b4552f at 4.36:1 — the message a stuck Marm most needs to read was the hardest one to read.
**Fixed:** `#B4552F` → `#9D4526`. Now **5.63:1** on ivory, 6.34:1 on white, 4.97:1 on ivory-dim. The one hardcoded copy of the old value (`.actbtn.warn`) was updated too.

**CO-3 · Low · `--line` has two values.**
`#e0d8c6` in some files, `#e4dcc9` in others. Nobody will consciously notice; it's the sort of thing that makes two screens feel subtly unrelated.

---

# Part 6 — Native popups

**ST-1 · High · 34 native browser dialogs.**

| File | `alert` | `prompt` | `confirm` |
|---|---:|---:|---:|
| `family/index.html` | 13 | 3 | 1 |
| `moms/index.html` | 7 | 3 | 1 |
| `moms/apply.html` | 2 | — | — |
| `console/index.html` | — | 3 | 1 |
| **Total** | **22** | **9** | **3** |

These render as unstyled OS dialogs headed **"moms.hiremarmee.com says"**. They cannot be branded, cannot be dismissed by tapping outside, block the entire page, and look — to a non-technical person — exactly like the browser warnings she's been told to be suspicious of.

`prompt()` is the worse half. `moms/index.html:484` and `console/index.html:666` collect a free-text cancellation reason through a browser prompt. On iOS Safari that's a cramped single-line field with no label and no validation.

**Fix:** you already have a toast component (`moms/index.html:138`) and a drawer (`console/index.html:138`). Route confirmations through the drawer and notifications through the toast. Roughly a day's work; it removes the single most off-brand element in the product.

---

# Part 7 — Empty and error states

**ER-1 · Critical · Raw backend error strings reach end users.**
All three apps do:

```js
if(error){ gerr(error.message || 'That didn\'t work — check your details.'); }
```

`error.message` is Supabase's, not yours. A Marm who signs up while you're over the email-send limit gets an account stuck at "Waiting for verification," and when she tries to sign in the app tells her:

> **Invalid login credentials**

She will conclude she typed her password wrong, and try again forever. The app never says "check your email" or "we're still setting up your account."

**Fix:** map the known cases and never pass `error.message` through.

```js
const FRIENDLY = {
  'Invalid login credentials':
    'That email and password don\'t match. If you just applied, check your email for a confirmation link first.',
  'Email not confirmed':
    'Almost there — tap the link in the email we sent you, then sign in.',
};
gerr(FRIENDLY[error.message] || 'That didn\'t work. Try again, or reply to our email and we\'ll sort it out.');
```

**ER-2 · Critical · Signed-in-with-no-profile is an unrecoverable dead end.**
When a session exists but the matching `moms`/`families` row doesn't, `enter()` fails the lookup and returns to the gate with an error painted over the login form. There is **no sign-out control on the gate screen** — `signout()` lives inside the app shell, which is exactly what you can't reach. The only escape is clearing site data.

This is not hypothetical. It happened twice during this audit: once with an operator account, once when a Marm's credentials were entered into the Mom's app.

**Fix:** two lines.

```js
// in enter(), on the profile-not-found path
await db.auth.signOut();
gerr('We couldn\'t find your account on this app. ' + crossAppHint(uid));
```

**ER-3 · High · No cross-app hint on the wrong-app dead end.**
`moms.hiremarmee.com` and `book.hiremarmee.com` have near-identical sign-in screens — same logo, same fields, same button. The only difference is one line of subtitle. A Marm who lands on the wrong one is told *"We couldn't find your account. If you just requested help, give it a moment"* — which describes a completely different situation and gives her no way forward.

**Fix:** on profile-not-found, check the other table before giving up.

```js
const { data:other } = await db.from('moms').select('id').eq('user_id', uid);
if(other && other.length){
  gerr('This looks like a Marm account. Sign in at moms.hiremarmee.com →');
}
```

**ER-4 · Medium · Empty states are inconsistent in voice and structure.**
Some are a bold line plus explanation (`No requests yet` / `New Mom requests will land here.`), some are a bare sentence (`No Moms yet`), some are a sentence fragment inside a card. Pick one shape — bold line, one sentence, optional action — and apply it to all of them.

---

# Part 8 — Functional defects

**FN-1 · High · The Schedule shows past visits as "Upcoming."**
`console/index.html`, Schedule view — subtitled *"Every upcoming visit, by day."* On 12 August it listed visits dated **Aug 4, Aug 6 and Aug 8**. The Aug 8 visit still carried an `Upcoming` badge and a `Mark done` button, four days after it happened. Nothing ages out, rolls forward, or flags overdue.
**Fix:** partition by date against `today` — Overdue / Today / Upcoming — and default the view to Today.

**FN-2 · Medium · Completed visits can be cancelled.**
Same view: rows with a `Completed` badge still render a `Cancel` button. Cancelling something that already happened has no defined meaning, and the Marm has already been paid for it.
**Fix:** hide `Cancel` when `status === 'completed'`.

**FN-3 · Critical · Sign-in could hang forever. — FIXED 12 Aug.**
`signInWithPassword()` was immediately followed by `db.auth.getUser()`, which contends for the same supabase-js auth lock. When it deadlocked, the button sat at "Signing in…" permanently: no timeout, no error, no recovery but a page refresh the user has no reason to attempt. Reproduced live on `moms.hiremarmee.com`.
**Fixed in:** all three apps — sign-in now uses the user object the auth response already returned, falls back to `getSession()` (local storage, no lock), wraps both calls in a 15-second timeout, and resets the button in `finally`.

**FN-4 · Medium · Three debug build tags shipped to production.**

```
family/index.html:149          <div class="buildtag">Marmee family · build 4</div>
family/family-request.html:183 <div class="buildtag">Marmee family · build 1</div>
moms/apply.html:455            <div style="position:fixed;…">Marmee build 3</div>
```

All three are `position:fixed; z-index:9999`, visible on every screen, and clipped at the right edge on narrow viewports. The numbers are hand-maintained and have already drifted apart — build 4, build 1, build 3 for code shipped the same week. The one in `moms/apply.html` is an inline style rather than a class, so it doesn't even share the others' definition.
**Fix:** delete all three. If you want a build marker, put it in an HTML comment.

**FN-5 · Medium · The console grants operator to one hardcoded address.**
`database/marmee-roles-security.sql:84`:

```sql
select id, 'operator' from auth.users where email = 'mike@hiremarmee.com'
```

Your sister cannot get into the console without a SQL edit. There's no invite flow and no sign-up path for operators at all.
**Fix:** an `operators` allowlist table, or at minimum add her address to that `in (...)` list now.

---

# Part 9 — Terminology

**Fixed and shipped 12 August.** 54 user-visible strings across all five files.

The product previously used "mom" for helpers in the console and "Marmee" for helpers in both mobile apps, while calling clients both "family" and "mom" interchangeably — sometimes in the same file. `Marms` appeared zero times in the codebase.

Now consistent: **Moms** are clients, **Marms** are helpers, **Marmee** is the company.

| Surface | Was | Now |
|---|---|---|
| Console nav | `Moms` / `Families` | `Marms` / `Moms` |
| Console | `Assign a mom`, `Needs a mom`, `No mom yet` | `…a Marm` |
| Console | `Family requests`, `Client families` | `Mom requests`, `Your Moms` |
| Marm app | `Your families`, `Rate this family` | `Your Moms`, `Rate this Mom` |
| Mom app | `Request a Marmee`, `Your Marmee` | `Request a Marm`, `Your Marm` |
| Mom app | `an experienced mom near you` | `an experienced Marm near you` |

Internal identifiers (`moms` table, `mom_id`, `momName()`, `view-moms`) were deliberately left alone — renaming them touches queries and wiring for no user-visible gain.

**TE-1 · Medium · The subdomains still contradict the language.**
`moms.hiremarmee.com` serves the **Marm's** app. `book.hiremarmee.com` serves the **Mom's** app. So under the shipped terminology, `moms.` is where Marms go. This caused a real misreading during this audit.
**Recommendation:** `book.` → `families.` (or `moms.`), and `moms.` → `marms.` DNS is yours; flagging, not touching.

---

# Suggested order

1. **ER-1, ER-2, ER-3** — the auth dead ends. Critical, and cheap.
2. **LO-1, LO-2** — safe area and the `150px` dodge. One pass, fixes visible clipping.
3. **CO-1, CO-2** — contrast. Two hex values, fixes 39 usages.
4. **TT-1, TT-2** — the two undersized tap targets.
5. **FN-1, FN-2, FN-4** — schedule dates, cancel button, build tags.
6. **SP-1…4 + TY-1…3** — the spacing and type migration, as one commit.
7. **ST-1** — replace the 34 native dialogs.
8. **FN-5, TE-1** — operator access and the subdomain rename.

Items 1–5 are roughly a day. Item 6 is the big mechanical pass. Item 7 is the biggest visual upgrade per hour spent.

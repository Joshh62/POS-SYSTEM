"""
email_service.py — ProfitTrack transactional emails via Resend.

Emails sent:
  1.  welcome()               → on signup (hello@profittrack.ng)
  2.  trial_ending()          → 3 days before trial ends (billing@profittrack.ng)
  3.  trial_expired()         → trial expired, account suspended (billing@profittrack.ng)
  4.  payment_success()       → charge.success webhook (billing@profittrack.ng)
  5.  payment_failed()        → invoice.payment_failed webhook (billing@profittrack.ng)
  6.  subscription_cancelled()→ on cancel (billing@profittrack.ng)
  7.  password_changed()      → on password change (hello@profittrack.ng)
  8.  account_deletion_requested() → on deletion request (hello@profittrack.ng)
  9.  downgrade_scheduled()   → on downgrade scheduling (billing@profittrack.ng)

All functions are fire-and-forget — they never raise exceptions into callers.
Errors are logged to stdout only.

Setup:
  pip install resend
  Add RESEND_API_KEY to Render environment variables
  Verify profittrack.ng as a sending domain in Resend dashboard
"""

import os
import resend

resend.api_key = os.getenv("RESEND_API_KEY", "")

HELLO_EMAIL   = "hello@profittrack.ng"
BILLING_EMAIL = "billing@profittrack.ng"
APP_URL       = "https://www.profittrack.ng"
SUPPORT_PHONE = "+234 901 298 4122"
AMBER         = "#C8820A"
DARK          = "#111111"

# ── Shared HTML helpers ───────────────────────────────────────────────────────

def _base(title: str, content: str, footer_extra: str = "") -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#F9F5EE;font-family:Georgia,'Times New Roman',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9F5EE;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:{DARK};border-radius:12px 12px 0 0;padding:24px 32px;text-align:center;">
            <div style="display:inline-flex;align-items:center;gap:10px;">
              <div style="width:32px;height:32px;background:{AMBER};border-radius:8px;display:inline-block;vertical-align:middle;"></div>
              <span style="font-size:18px;font-weight:700;color:#ffffff;vertical-align:middle;margin-left:8px;">ProfitTrack</span>
            </div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:36px 32px;border-left:1px solid #E8D8B8;border-right:1px solid #E8D8B8;">
            {content}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F2EBE0;border-radius:0 0 12px 12px;border:1px solid #E8D8B8;border-top:none;padding:20px 32px;text-align:center;">
            <p style="margin:0 0 6px;font-size:12px;color:#888888;">
              ProfitTrack · profittrack.ng · Built for Nigerian retail
            </p>
            <p style="margin:0 0 6px;font-size:12px;color:#888888;">
              support@profittrack.ng &nbsp;·&nbsp; {SUPPORT_PHONE}
            </p>
            {footer_extra}
            <p style="margin:8px 0 0;font-size:11px;color:#aaaaaa;">
              © 2026 Profit Apps Enterprises. All rights reserved.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _h1(text: str) -> str:
    return f'<h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:{DARK};line-height:1.3;">{text}</h1>'

def _h2(text: str) -> str:
    return f'<h2 style="margin:20px 0 8px;font-size:16px;font-weight:700;color:{DARK};">{text}</h2>'

def _p(text: str, color: str = "#444444") -> str:
    return f'<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:{color};">{text}</p>'

def _btn(text: str, url: str) -> str:
    return f'''
<table cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="background:{AMBER};border-radius:10px;padding:0;">
      <a href="{url}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;
         color:#ffffff;text-decoration:none;font-family:Georgia,serif;">{text}</a>
    </td>
  </tr>
</table>'''

def _info_box(rows: list, bg: str = "#FDF8F0", border: str = "#E8D8B8") -> str:
    items = "".join(
        f'<tr><td style="padding:6px 0;font-size:13px;color:#888888;width:40%;">{k}</td>'
        f'<td style="padding:6px 0;font-size:13px;color:{DARK};font-weight:600;">{v}</td></tr>'
        for k, v in rows
    )
    return f'''
<table width="100%" cellpadding="0" cellspacing="0"
  style="background:{bg};border:1px solid {border};border-radius:10px;padding:16px;margin:20px 0;">
  <tr><td><table width="100%">{items}</table></td></tr>
</table>'''

def _alert_box(text: str, bg: str = "#FAEEDA", border: str = "#C8820A", color: str = "#854F0B") -> str:
    return f'''
<div style="background:{bg};border-left:4px solid {border};border-radius:0 8px 8px 0;
  padding:14px 18px;margin:20px 0;font-size:14px;color:{color};line-height:1.6;">
  {text}
</div>'''

def _divider() -> str:
    return '<hr style="border:none;border-top:1px solid #E8D8B8;margin:24px 0;" />'

def _send(to_email: str, subject: str, html: str, from_email: str = HELLO_EMAIL):
    """Fire and forget — never raises. Logs errors to stdout."""
    if not resend.api_key:
        print(f"[Email] RESEND_API_KEY not set — skipping email to {to_email}")
        return
    if not to_email or "@" not in to_email:
        print(f"[Email] Invalid email address: {to_email!r} — skipping")
        return
    try:
        result = resend.Emails.send({
            "from":    from_email,
            "to":      [to_email],
            "subject": subject,
            "html":    html,
        })
        print(f"[Email] Sent '{subject}' → {to_email} | id={result.get('id','?')}")
    except Exception as e:
        print(f"[Email] Failed '{subject}' → {to_email}: {e}")


# ════════════════════════════════════════════════════════════════════════════
# 1. WELCOME EMAIL — sent immediately after signup
# ════════════════════════════════════════════════════════════════════════════

def welcome(
    to_email: str,
    full_name: str,
    business_name: str,
    username: str,
    plan: str,
    trial_ends_at: str,   # e.g. "15 June 2026"
):
    plan_label = plan.capitalize()
    content = "".join([
        _h1(f"Welcome to ProfitTrack, {full_name.split()[0]}! 🎉"),
        _p(f"<strong>{business_name}</strong> is now on ProfitTrack. "
           f"Your <strong>{trial_ends_at}</strong> free trial has started — "
           f"full access, no credit card needed."),
        _info_box([
            ("Business name", business_name),
            ("Plan", f"{plan_label} (14-day free trial)"),
            ("Username", f"<span style='font-family:monospace;font-size:14px;'>{username}</span>"),
            ("Trial ends", trial_ends_at),
        ]),
        _alert_box("💡 Save your username — you'll need it every time you log in. "
                   "Your password was set during registration."),
        _h2("Get started in 3 steps"),
        _p("1️⃣ &nbsp;<strong>Add your products</strong> — go to Products → Add product, "
           "or bulk import from Excel.<br/><br/>"
           "2️⃣ &nbsp;<strong>Create staff accounts</strong> — go to Users → New user. "
           "Assign each cashier their branch.<br/><br/>"
           "3️⃣ &nbsp;<strong>Make your first sale</strong> — open POS, scan a barcode "
           "or search a product, select payment method, done."),
        _btn("Open my dashboard →", APP_URL),
        _divider(),
        _p("Questions? WhatsApp us on <strong>09012984122</strong> (Mon–Sat, 9AM–6PM Lagos time) "
           "or reply to this email.", color="#888888"),
    ])
    _send(to_email, f"Welcome to ProfitTrack — your trial has started 🚀", _base("Welcome", content),
          from_email=HELLO_EMAIL)


# ════════════════════════════════════════════════════════════════════════════
# 2. TRIAL ENDING SOON — send at 3 days and 1 day before expiry
# ════════════════════════════════════════════════════════════════════════════

def trial_ending(
    to_email: str,
    full_name: str,
    business_name: str,
    days_left: int,       # 3 or 1
    trial_ends_at: str,
    plan: str,
):
    plan_label  = plan.capitalize()
    urgency     = "⚠️ 1 day left" if days_left == 1 else "⏰ 3 days left"
    subject     = f"{urgency} on your ProfitTrack trial"
    day_str     = "1 day" if days_left == 1 else f"{days_left} days"

    content = "".join([
        _h1(f"Your trial ends in {day_str}"),
        _p(f"Hi {full_name.split()[0]}, your ProfitTrack free trial for "
           f"<strong>{business_name}</strong> ends on <strong>{trial_ends_at}</strong>."),
        _p("After that, your account will be suspended until you subscribe. "
           "Your data is kept — you won't lose anything. But your staff won't be able "
           "to make sales or access the system."),
        _info_box([
            ("Current plan", f"{plan_label} (trial)"),
            ("Trial ends", trial_ends_at),
            ("Monthly price", "₦5,000" if plan == "solo" else
                              "₦12,000" if plan == "starter" else
                              "₦25,000" if plan == "business" else "₦50,000"),
        ]),
        _btn("Subscribe now — keep my data →", f"{APP_URL}/app#billing"),
        _divider(),
        _p("Annual plans save 2 months (17%). Secured by Paystack. Cancel anytime.", color="#888888"),
        _p("Need help deciding which plan is right for you? Reply to this email "
           "or WhatsApp <strong>09012984122</strong>.", color="#888888"),
    ])
    _send(to_email, subject, _base("Trial ending", content), from_email=BILLING_EMAIL)


# ════════════════════════════════════════════════════════════════════════════
# 3. TRIAL EXPIRED — sent when trial_ends_at passes with no subscription
# ════════════════════════════════════════════════════════════════════════════

def trial_expired(
    to_email: str,
    full_name: str,
    business_name: str,
    plan: str,
):
    plan_label = plan.capitalize()
    content = "".join([
        _h1("Your ProfitTrack trial has ended"),
        _p(f"Hi {full_name.split()[0]}, the free trial for "
           f"<strong>{business_name}</strong> has ended. "
           "Your account has been suspended."),
        _alert_box(
            "🔒 <strong>Your data is safe.</strong> All your products, sales history, "
            "customers, and inventory are kept for 90 days. Subscribe now and everything "
            "is restored exactly as you left it.",
            bg="#FCEBEB", border="#A32D2D", color="#A32D2D"
        ),
        _info_box([
            ("Plan", plan_label),
            ("Monthly price", "₦5,000" if plan == "solo" else
                              "₦12,000" if plan == "starter" else
                              "₦25,000" if plan == "business" else "₦50,000"),
            ("Annual price", "₦50,000" if plan == "solo" else
                             "₦120,000" if plan == "starter" else
                             "₦250,000" if plan == "business" else "₦500,000"),
        ]),
        _btn("Reactivate my account →", f"{APP_URL}/app#billing"),
        _divider(),
        _p("Questions? WhatsApp <strong>09012984122</strong> or reply to this email. "
           "We'll get you back up within minutes.", color="#888888"),
    ])
    _send(to_email, "Your ProfitTrack trial has ended — reactivate to continue",
          _base("Trial expired", content), from_email=BILLING_EMAIL)


# ════════════════════════════════════════════════════════════════════════════
# 4. PAYMENT SUCCESS — sent on charge.success webhook
# ════════════════════════════════════════════════════════════════════════════

def payment_success(
    to_email: str,
    full_name: str,
    business_name: str,
    plan: str,
    billing: str,          # "monthly" or "annual"
    amount_paid: float,    # in Naira
    period_end: str,       # e.g. "15 June 2027"
    reference: str,
):
    plan_label    = plan.capitalize()
    billing_label = "Annual" if billing == "annual" else "Monthly"
    content = "".join([
        _h1("Payment confirmed ✓"),
        _p(f"Hi {full_name.split()[0]}, your payment has been received and your "
           f"<strong>{plan_label}</strong> subscription for "
           f"<strong>{business_name}</strong> is now active."),
        _info_box([
            ("Plan",        f"{plan_label} — {billing_label}"),
            ("Amount paid", f"₦{amount_paid:,.0f}"),
            ("Next renewal", period_end),
            ("Reference",   f"<span style='font-family:monospace;font-size:12px;'>{reference}</span>"),
        ], bg="#EAF3DE", border="#3B6D11"),
        _p("You can manage your subscription, switch plans, or cancel anytime from "
           "<strong>Plan & Billing</strong> inside the app."),
        _btn("Open ProfitTrack →", APP_URL),
        _divider(),
        _p("Keep this email as your payment receipt. Paystack will also send a "
           "separate receipt to this address.", color="#888888"),
    ])
    _send(to_email, f"Payment confirmed — {plan_label} plan active ✓",
          _base("Payment confirmed", content), from_email=BILLING_EMAIL)


# ════════════════════════════════════════════════════════════════════════════
# 5. PAYMENT FAILED — sent on invoice.payment_failed webhook
# ════════════════════════════════════════════════════════════════════════════

def payment_failed(
    to_email: str,
    full_name: str,
    business_name: str,
    plan: str,
    grace_days: int = 3,
):
    plan_label = plan.capitalize()
    content = "".join([
        _h1("⚠️ Payment failed"),
        _p(f"Hi {full_name.split()[0]}, we were unable to process the subscription "
           f"payment for <strong>{business_name}</strong> ({plan_label} plan)."),
        _alert_box(
            f"Your account remains active for <strong>{grace_days} more days</strong>. "
            "If payment is not updated within that time, your account will be suspended. "
            "Your data will never be deleted.",
            bg="#FAEEDA", border="#C8820A", color="#854F0B"
        ),
        _p("This usually happens because:"),
        _p("• Your card expired or has insufficient funds<br/>"
           "• Your bank declined the international transaction<br/>"
           "• Your Paystack payment method needs to be updated"),
        _btn("Update payment method →", f"{APP_URL}/app#billing"),
        _divider(),
        _p("Need help? WhatsApp <strong>09012984122</strong> or reply to this email — "
           "we'll sort it out together.", color="#888888"),
    ])
    _send(to_email, "⚠️ ProfitTrack payment failed — action required",
          _base("Payment failed", content), from_email=BILLING_EMAIL)


# ════════════════════════════════════════════════════════════════════════════
# 6. SUBSCRIPTION CANCELLED — sent on cancel
# ════════════════════════════════════════════════════════════════════════════

def subscription_cancelled(
    to_email: str,
    full_name: str,
    business_name: str,
    plan: str,
    access_until: str,    # e.g. "15 June 2026"
    data_kept_until: str, # access_until + 90 days
):
    plan_label = plan.capitalize()
    content = "".join([
        _h1("Subscription cancelled"),
        _p(f"Hi {full_name.split()[0]}, we've received your cancellation request for "
           f"the <strong>{plan_label}</strong> subscription on "
           f"<strong>{business_name}</strong>."),
        _info_box([
            ("Plan cancelled",   plan_label),
            ("Access continues until", access_until),
            ("Data kept until",  data_kept_until),
        ]),
        _p("You can continue using ProfitTrack until <strong>" + access_until + "</strong>. "
           "After that, your account will be suspended but all your data is kept for "
           "90 days in case you return."),
        _p("If you cancelled by mistake or want to resubscribe, you can do so anytime "
           "from Plan & Billing before your access ends."),
        _btn("Resubscribe →", f"{APP_URL}/app#billing"),
        _divider(),
        _p("We're sorry to see you go. If there was something we could have done better, "
           "please reply to this email — we read every response.", color="#888888"),
    ])
    _send(to_email, "ProfitTrack subscription cancelled",
          _base("Cancelled", content), from_email=BILLING_EMAIL)


# ════════════════════════════════════════════════════════════════════════════
# 7. PASSWORD CHANGED — sent on successful password change
# ════════════════════════════════════════════════════════════════════════════

def password_changed(
    to_email: str,
    full_name: str,
    username: str,
    changed_at: str,      # e.g. "21 May 2026 at 3:45 PM"
):
    content = "".join([
        _h1("Password changed"),
        _p(f"Hi {full_name.split()[0]}, the password for your ProfitTrack account "
           f"<strong>@{username}</strong> was successfully changed."),
        _info_box([
            ("Account",    f"@{username}"),
            ("Changed at", changed_at),
        ]),
        _alert_box(
            "🔒 <strong>If you did not make this change</strong>, contact us immediately: "
            f"WhatsApp <strong>09012984122</strong> or email support@profittrack.ng. "
            "We will lock your account and help you recover access.",
            bg="#FCEBEB", border="#A32D2D", color="#A32D2D"
        ),
        _p("If this was you, no action is needed."),
        _divider(),
        _p("For your security, ProfitTrack never stores your password in plain text. "
           "All passwords are encrypted.", color="#888888"),
    ])
    _send(to_email, "ProfitTrack password changed",
          _base("Password changed", content), from_email=HELLO_EMAIL)


# ════════════════════════════════════════════════════════════════════════════
# 8. ACCOUNT DELETION REQUESTED — sent on deletion request
# ════════════════════════════════════════════════════════════════════════════

def account_deletion_requested(
    to_email: str,
    full_name: str,
    business_name: str,
    deletion_date: str,   # 90 days from now
):
    content = "".join([
        _h1("Account deletion requested"),
        _p(f"Hi {full_name.split()[0]}, we've received a request to permanently delete "
           f"the ProfitTrack account for <strong>{business_name}</strong>."),
        _info_box([
            ("Business",          business_name),
            ("Request received",  "Today"),
            ("Data deleted on",   deletion_date),
        ]),
        _alert_box(
            "⏳ <strong>You have 90 days to cancel this request.</strong> "
            "If you change your mind, contact us before " + deletion_date + " and we will "
            "restore your account with all data intact.",
            bg="#FAEEDA", border="#C8820A", color="#854F0B"
        ),
        _p("To cancel this deletion request, contact us:"),
        _p("📱 WhatsApp: <strong>09012984122</strong><br/>"
           "📧 Email: <strong>support@profittrack.ng</strong>"),
        _divider(),
        _p("If you did not request this deletion, contact us immediately — "
           "your account may have been compromised.", color="#888888"),
    ])
    _send(to_email, "ProfitTrack account deletion requested",
          _base("Deletion requested", content), from_email=HELLO_EMAIL)


# ════════════════════════════════════════════════════════════════════════════
# 9. DOWNGRADE SCHEDULED — sent when downgrade is scheduled
# ════════════════════════════════════════════════════════════════════════════

def downgrade_scheduled(
    to_email: str,
    full_name: str,
    business_name: str,
    current_plan: str,
    new_plan: str,
    applies_on: str,      # next renewal date
):
    current_label = current_plan.capitalize()
    new_label     = new_plan.capitalize()
    content = "".join([
        _h1("Plan downgrade scheduled"),
        _p(f"Hi {full_name.split()[0]}, your ProfitTrack plan for "
           f"<strong>{business_name}</strong> is scheduled to change."),
        _info_box([
            ("Current plan",  current_label),
            ("Changing to",   new_label),
            ("Takes effect",  applies_on),
        ]),
        _p(f"Your <strong>{current_label}</strong> plan continues with full access until "
           f"<strong>{applies_on}</strong>. After that, your account will automatically "
           f"switch to the <strong>{new_label}</strong> plan. No payment is charged today."),
        _p("You can cancel this downgrade anytime before the date above from "
           "<strong>Plan & Billing</strong> inside the app."),
        _btn("Manage my plan →", f"{APP_URL}/app#billing"),
        _divider(),
        _p("Note: if your current setup exceeds the limits of the new plan (e.g. more "
           "branches than allowed), you may need to adjust before the switch date.", color="#888888"),
    ])
    _send(to_email, f"Plan downgrade scheduled — {new_label} from {applies_on}",
          _base("Downgrade scheduled", content), from_email=BILLING_EMAIL)
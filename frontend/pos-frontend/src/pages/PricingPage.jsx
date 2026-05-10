import { useState, useEffect, useRef } from "react";
import api from "../api/api";

const PLANS = [
  {
    key: "solo", name: "Solo", monthly: 5000, annual: 50000, rank: 1,
    desc: "1 branch · 1 user",
    features: ["Full POS checkout", "Inventory management", "Sales history", "Reports"],
  },
  {
    key: "starter", name: "Starter", monthly: 12000, annual: 120000, rank: 2,
    desc: "1 branch · 3 users",
    features: ["Everything in Solo", "3 staff accounts", "Expense tracking", "Loyalty & credit", "Bulk import"],
    popular: true,
  },
  {
    key: "business", name: "Business", monthly: 25000, annual: 250000, rank: 3,
    desc: "3 branches · 10 users",
    features: ["Everything in Starter", "Multi-branch", "Analytics dashboard", "WhatsApp reports"],
  },
  {
    key: "enterprise", name: "Enterprise", monthly: 50000, annual: 500000, rank: 4,
    desc: "Unlimited branches & users",
    features: ["Everything in Business", "Unlimited branches", "White-label branding", "Priority support"],
  },
];

const PLAN_GUIDE = [
  {
    q: "How does the 14-day free trial work?",
    a: "When you register, you get 14 days of full access on your chosen plan — no payment required. Before the trial ends, add your payment details to continue. If you don't, the account is suspended until payment is made.",
  },
  {
    q: "What happens when I upgrade to a higher plan?",
    a: "Upgrades take effect immediately. You are charged the full price of the new plan right away. Your previous plan is not refunded — the upgrade replaces it from the moment of payment.",
  },
  {
    q: "What happens when I downgrade to a lower plan?",
    a: "Downgrades are scheduled for your next renewal date. Your current plan continues until that date, then the lower plan activates automatically. You are not charged anything immediately.",
  },
  {
    q: "Can I switch from monthly to annual billing?",
    a: "Yes. Switching from monthly to annual is treated as an upgrade — it takes effect immediately and you are charged the full annual price. You save the equivalent of 2 months compared to paying monthly.",
  },
  {
    q: "Can I switch from annual to monthly?",
    a: "Yes, but it is treated as a downgrade. Your annual plan continues until its end date, then monthly billing begins at the next renewal.",
  },
  {
    q: "What happens if my payment fails?",
    a: "You receive a WhatsApp alert immediately. You have a 3-day grace period to update your payment method. If payment is not resolved within 3 days, access is suspended. Your data is never deleted — it is restored the moment payment is made.",
  },
  {
    q: "Can I cancel my subscription?",
    a: "Yes. You can cancel at any time from this page. Access continues until the end of your current paid period. After that, the account is suspended but your data is kept for 90 days in case you return.",
  },
  {
    q: "What happens to my data if I cancel?",
    a: "Your data (products, sales history, customers, inventory) is kept for 90 days after cancellation. If you resubscribe within that period, everything is restored exactly as you left it.",
  },
  {
    q: "Can I have multiple branches on a lower plan?",
    a: "No. The number of branches is enforced by your plan. If you downgrade and have more branches than your new plan allows, you will need to deactivate the extra branches before the downgrade takes effect.",
  },
  {
    q: "How do I get a receipt for my payment?",
    a: "Paystack sends a payment receipt to your registered email address automatically after every successful transaction.",
  },
];

const fmt = (v) => `₦${parseFloat(v || 0).toLocaleString("en-NG")}`;

export default function PricingPage() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const [subscription,   setSubscription]   = useState(null);
  const [billing,        setBilling]        = useState("monthly");
  const [selectedPlan,   setSelectedPlan]   = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [paying,         setPaying]         = useState(false);
  const [error,          setError]          = useState(null);
  const [successMsg,     setSuccessMsg]     = useState(null);
  const [infoMsg,        setInfoMsg]        = useState(null);
  const [branding,       setBranding]       = useState(null);
  const [activeGuide,    setActiveGuide]    = useState(null);
  const [showGuide,      setShowGuide]      = useState(false);
  const [cancelling,     setCancelling]     = useState(false);
  const [showCancel,     setShowCancel]     = useState(false);
  const paystackLoaded = useRef(false);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const [subRes, brandRes] = await Promise.all([
          api.get("/payments/subscription"),
          api.get("/businesses/my/branding").catch(() => ({ data: null })),
        ]);
        setSubscription(subRes.data);
        setBranding(brandRes.data);
        setSelectedPlan(subRes.data.plan || "starter");
      } catch { setError("Failed to load subscription details."); }
      finally { setLoading(false); }
    };
    fetch();
    loadPaystack();
  }, []);

  const loadPaystack = () => {
    if (paystackLoaded.current || window.PaystackPop) return;
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v1/inline.js";
    s.async = true;
    s.onload = () => { paystackLoaded.current = true; };
    document.head.appendChild(s);
  };

  // Determine change type
  const currentRank   = PLANS.find(p => p.key === subscription?.plan)?.rank || 0;
  const selectedRank  = PLANS.find(p => p.key === selectedPlan)?.rank || 0;
  const isUpgrade     = selectedRank > currentRank || (selectedRank === currentRank && billing === "annual");
  const isDowngrade   = selectedRank < currentRank || (selectedRank === currentRank && billing === "monthly");
  const isSamePlan    = selectedPlan === subscription?.plan && subscription?.subscription_status === "active";
  const hasPending    = !!subscription?.pending_plan;

  const handlePay = async () => {
    if (!selectedPlan) return;
    if (!branding?.email) { setError("Please add your email in Branding & Settings first."); return; }

    setPaying(true); setError(null); setInfoMsg(null);

    try {
      const initRes = await api.post("/payments/initialize", {
        plan: selectedPlan, billing, email: branding.email,
      });

      // Downgrade scheduled — no payment needed
      if (initRes.data.type === "downgrade_scheduled") {
        setInfoMsg(initRes.data.message);
        setSubscription(s => ({ ...s, pending_plan: selectedPlan, pending_billing: billing }));
        setPaying(false);
        return;
      }

      const { payment_url, reference, amount } = initRes.data;

      if (!window.PaystackPop) { window.location.href = payment_url; return; }

      const PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || "";
      const handler = window.PaystackPop.setup({
        key:      PUBLIC_KEY,
        email:    branding.email,
        amount:   amount * 100,
        ref:      reference,
        currency: "NGN",
        channels: ["card", "bank", "ussd", "bank_transfer"],
        metadata: { business_id: user.business_id, plan: selectedPlan, billing },
        onSuccess: async (transaction) => {
          try {
            const verifyRes = await api.get(`/payments/verify/${transaction.reference}`);
            setSuccessMsg(`🎉 Payment successful! Your ${PLANS.find(p=>p.key===verifyRes.data.plan)?.name} plan is now active.`);
            setTimeout(() => { window.location.href = window.location.href; }, 3000);
          } catch { setError("Payment received but verification failed. Contact support."); }
          setPaying(false);
        },
        onCancel: () => { setPaying(false); },
      });
      handler.openIframe();

    } catch (err) {
      setError(err.response?.data?.detail || "Payment initialization failed.");
      setPaying(false);
    }
  };

  const handleCancelDowngrade = async () => {
    try {
      await api.delete("/payments/pending-downgrade");
      setSubscription(s => ({ ...s, pending_plan: null, pending_billing: null }));
      setInfoMsg(null);
    } catch (err) { setError(err.response?.data?.detail || "Failed to cancel downgrade."); }
  };

  const handleCancelSubscription = async () => {
    setCancelling(true);
    try {
      const res = await api.post("/payments/cancel");
      setShowCancel(false);
      setInfoMsg(res.data.message);
      setSubscription(s => ({ ...s, subscription_status: "cancelled" }));
    } catch (err) { setError(err.response?.data?.detail || "Failed to cancel subscription."); }
    finally { setCancelling(false); }
  };

  const statusBadge = () => {
    if (!subscription) return null;
    const { subscription_status, trial_active, trial_days_left } = subscription;
    if (trial_active)                         return <Badge color="#854F0B" bg="#FAEEDA">⏰ Trial — {trial_days_left} day{trial_days_left !== 1 ? "s" : ""} left</Badge>;
    if (subscription_status === "active")     return <Badge color="#3B6D11" bg="#EAF3DE">✓ Active</Badge>;
    if (subscription_status === "past_due")   return <Badge color="#A32D2D" bg="#FCEBEB">⚠️ Payment failed</Badge>;
    if (subscription_status === "cancelled")  return <Badge color="#5F5E5A" bg="#F1EFE8">Cancelled</Badge>;
    return <Badge color="#A32D2D" bg="#FCEBEB">Expired</Badge>;
  };

  const chosenPlan     = PLANS.find(p => p.key === selectedPlan);
  const price          = chosenPlan ? (billing === "annual" ? chosenPlan.annual : chosenPlan.monthly) : 0;
  const annualSaving   = chosenPlan ? (chosenPlan.monthly * 12) - chosenPlan.annual : 0;
  const currentPlan    = PLANS.find(p => p.key === subscription?.plan);

  // Button state
  const getButtonState = () => {
    if (successMsg)   return { text: "Payment complete", disabled: true };
    if (paying)       return { text: "Opening payment...", disabled: true };
    if (isSamePlan)   return { text: "✓ Already on this plan", disabled: true };
    if (isDowngrade && subscription?.subscription_status === "active")
                      return { text: `Schedule downgrade to ${chosenPlan?.name}`, disabled: false, isSchedule: true };
    if (isUpgrade)    return { text: `Upgrade — Pay ${fmt(price)} now`, disabled: false };
    return { text: `Pay ${fmt(price)} via Paystack`, disabled: false };
  };

  const btnState = getButtonState();

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--color-text-tertiary)", fontSize: 13 }}>
      Loading...
    </div>
  );

  return (
    <div style={{ padding: "16px 24px", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>

        {/* ── Current status ── */}
        <div style={{ background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, padding: "16px 20px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>Current subscription</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", textTransform: "capitalize" }}>
                {currentPlan?.name || "—"} plan
              </span>
              {statusBadge()}
            </div>
            {subscription?.current_period_end && subscription?.subscription_status === "active" && (
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>
                Renews {new Date(subscription.current_period_end).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}
              </div>
            )}
            {subscription?.trial_ends_at && subscription?.trial_active && (
              <div style={{ fontSize: 11, color: "#854F0B", marginTop: 4 }}>
                Trial ends {new Date(subscription.trial_ends_at).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowGuide(g => !g)}
              style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--color-border-tertiary)", background: showGuide ? "var(--color-primary)" : "var(--color-background-secondary)", color: showGuide ? "#fff" : "var(--color-text-secondary)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>
              📖 Plan guide
            </button>
            {subscription?.subscription_status === "active" && !showCancel && (
              <button onClick={() => setShowCancel(true)}
                style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #A32D2D", background: "none", color: "#A32D2D", fontSize: 12, cursor: "pointer" }}>
                Cancel plan
              </button>
            )}
          </div>
        </div>

        {/* ── Plan guide ── */}
        {showGuide && (
          <div style={{ background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, padding: "18px 20px", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 14 }}>
              📖 Plan management guide
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {PLAN_GUIDE.map((item, i) => (
                <div key={i}>
                  <button
                    onClick={() => setActiveGuide(activeGuide === i ? null : i)}
                    style={{ width: "100%", textAlign: "left", background: activeGuide === i ? "var(--color-background-secondary)" : "none", border: "none", borderRadius: 8, padding: "10px 12px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>{item.q}</span>
                    <span style={{ fontSize: 14, color: "var(--color-text-tertiary)", flexShrink: 0, marginLeft: 8 }}>{activeGuide === i ? "▲" : "▼"}</span>
                  </button>
                  {activeGuide === i && (
                    <div style={{ padding: "4px 12px 12px", fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
                      {item.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Pending downgrade notice ── */}
        {hasPending && (
          <div style={{ background: "#FAEEDA", border: "1px solid rgba(133,79,11,0.3)", borderRadius: 10, padding: "12px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 13, color: "#854F0B" }}>
              <strong>Downgrade scheduled:</strong> Your plan will change to <strong>{PLANS.find(p=>p.key===subscription.pending_plan)?.name}</strong> on{" "}
              {subscription.current_period_end
                ? new Date(subscription.current_period_end).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })
                : "next renewal"}.
            </div>
            <button onClick={handleCancelDowngrade}
              style={{ padding: "6px 12px", borderRadius: 7, border: "1px solid #854F0B", background: "none", color: "#854F0B", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", fontWeight: 500 }}>
              Cancel downgrade
            </button>
          </div>
        )}

        {/* ── Cancel confirmation ── */}
        {showCancel && (
          <div style={{ background: "#FCEBEB", border: "1px solid rgba(163,45,45,0.3)", borderRadius: 10, padding: "14px 18px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#A32D2D", marginBottom: 6 }}>Cancel subscription?</div>
            <div style={{ fontSize: 12, color: "#A32D2D", marginBottom: 12, lineHeight: 1.6 }}>
              Access continues until {subscription?.current_period_end
                ? new Date(subscription.current_period_end).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })
                : "the end of your current period"}. Your data is kept for 90 days.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleCancelSubscription} disabled={cancelling}
                style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#A32D2D", color: "#fff", fontSize: 13, fontWeight: 500, cursor: cancelling ? "not-allowed" : "pointer", opacity: cancelling ? 0.7 : 1 }}>
                {cancelling ? "Cancelling..." : "Yes, cancel subscription"}
              </button>
              <button onClick={() => setShowCancel(false)}
                style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--color-border-tertiary)", background: "none", color: "var(--color-text-secondary)", fontSize: 13, cursor: "pointer" }}>
                Keep subscription
              </button>
            </div>
          </div>
        )}

        {/* ── Messages ── */}
        {successMsg && (
          <div style={{ background: "#EAF3DE", border: "1px solid rgba(59,109,17,0.3)", borderRadius: 10, padding: "14px 18px", marginBottom: 16, fontSize: 14, color: "#3B6D11", fontWeight: 500, textAlign: "center" }}>
            {successMsg}
            <div style={{ fontSize: 12, color: "#5a8a3a", marginTop: 4, fontWeight: 400 }}>Refreshing in a moment...</div>
          </div>
        )}
        {infoMsg && (
          <div style={{ background: "#E6F1FB", border: "1px solid rgba(24,95,165,0.3)", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#185FA5" }}>
            ℹ️ {infoMsg}
          </div>
        )}
        {error && (
          <div style={{ background: "var(--error-bg)", color: "var(--error-text)", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}
        {!branding?.email && (
          <div style={{ background: "#FAEEDA", border: "1px solid rgba(133,79,11,0.2)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#854F0B", marginBottom: 16 }}>
            ⚠️ Add your email in <strong>Branding & Settings</strong> before making a payment.
          </div>
        )}

        {/* ── Billing toggle ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: "var(--color-text-primary)", fontWeight: 500 }}>Billing:</span>
          <div style={{ display: "flex", background: "var(--color-background-secondary)", borderRadius: 8, padding: 3, border: "1px solid var(--color-border-tertiary)" }}>
            {["monthly", "annual"].map(b => (
              <button key={b} onClick={() => setBilling(b)} style={{
                padding: "6px 16px", borderRadius: 6, border: "none", fontSize: 12, fontWeight: 500, cursor: "pointer",
                background: billing === b ? "var(--color-primary)" : "transparent",
                color: billing === b ? "#fff" : "var(--color-text-secondary)", transition: "all 0.15s",
              }}>
                {b.charAt(0).toUpperCase() + b.slice(1)}
                {b === "annual" && <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.85 }}>2 months free</span>}
              </button>
            ))}
          </div>
        </div>

        {/* ── Plan cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 16 }}>
          {PLANS.map(plan => {
            const p       = billing === "annual" ? plan.annual : plan.monthly;
            const selected = selectedPlan === plan.key;
            const current  = subscription?.plan === plan.key && subscription?.subscription_status === "active";
            const isPending = subscription?.pending_plan === plan.key;

            return (
              <div key={plan.key} onClick={() => setSelectedPlan(plan.key)} style={{
                background: "var(--color-background-primary)",
                border: `${selected ? 2 : 1}px solid ${selected ? "var(--color-primary)" : "var(--color-border-tertiary)"}`,
                borderRadius: 12, padding: "16px 18px", cursor: "pointer", position: "relative", transition: "all 0.15s",
              }}>
                {plan.popular && (
                  <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: "var(--color-primary)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 12px", borderRadius: 20, whiteSpace: "nowrap" }}>
                    Most popular
                  </div>
                )}
                {current && !isPending && (
                  <div style={{ position: "absolute", top: 10, right: 10, background: "#EAF3DE", color: "#3B6D11", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6 }}>Current</div>
                )}
                {isPending && (
                  <div style={{ position: "absolute", top: 10, right: 10, background: "#FAEEDA", color: "#854F0B", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6 }}>Pending</div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)" }}>{plan.name}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>{plan.desc}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-primary)" }}>
                      {fmt(p)}<span style={{ fontSize: 11, color: "var(--color-text-tertiary)", fontWeight: 400 }}>/{billing === "annual" ? "yr" : "mo"}</span>
                    </div>
                    {billing === "annual" && (
                      <div style={{ fontSize: 10, color: "#3B6D11", fontWeight: 600 }}>Save {fmt((plan.monthly*12)-plan.annual)}</div>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {plan.features.map((f, i) => (
                    <div key={i} style={{ fontSize: 11, color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ color: "#3B6D11", fontSize: 10 }}>✓</span> {f}
                    </div>
                  ))}
                </div>

                {selected && (
                  <div style={{ position: "absolute", top: 10, left: 10, width: 16, height: 16, borderRadius: "50%", background: "var(--color-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>✓</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Payment summary ── */}
        <div style={{ background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, padding: "18px 20px" }}>

          {/* Change type notice */}
          {!isSamePlan && subscription?.subscription_status === "active" && (
            <div style={{
              marginBottom: 12, padding: "8px 12px", borderRadius: 8, fontSize: 12,
              background: isUpgrade ? "#E6F1FB" : "#FAEEDA",
              color: isUpgrade ? "#185FA5" : "#854F0B",
            }}>
              {isUpgrade
                ? `⬆️ Upgrade — ${chosenPlan?.name} activates immediately. You are charged ${fmt(price)} now.`
                : `⬇️ Downgrade — ${chosenPlan?.name} will activate at your next renewal. No charge today.`}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
                {chosenPlan?.name} — {billing === "annual" ? "Annual" : "Monthly"}
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>
                {billing === "annual" ? `${fmt(chosenPlan?.monthly)}/month billed annually` : "Billed every month · cancel anytime"}
              </div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--color-primary)" }}>{fmt(price)}</div>
          </div>

          {billing === "annual" && annualSaving > 0 && (
            <div style={{ background: "#EAF3DE", border: "1px solid rgba(59,109,17,0.2)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#3B6D11", marginBottom: 14 }}>
              🎉 You save {fmt(annualSaving)} compared to monthly billing
            </div>
          )}

          <button
            onClick={handlePay}
            disabled={btnState.disabled || !branding?.email}
            style={{
              width: "100%", padding: "13px 0", borderRadius: 10, border: "none",
              background: btnState.disabled || !branding?.email
                ? "var(--color-background-secondary)"
                : btnState.isSchedule ? "#854F0B" : "var(--color-primary)",
              color: btnState.disabled || !branding?.email ? "var(--color-text-tertiary)" : "#fff",
              fontSize: 15, fontWeight: 600,
              cursor: btnState.disabled || !branding?.email ? "not-allowed" : "pointer",
              transition: "all 0.2s",
            }}
          >
            {btnState.text}
          </button>

          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", textAlign: "center", marginTop: 10, lineHeight: 1.6 }}>
            Secured by Paystack · Card, bank transfer, or USSD · No hidden fees
          </div>
        </div>
      </div>
    </div>
  );
}

function Badge({ color, bg, children }) {
  return (
    <span style={{ background: bg, color, padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
      {children}
    </span>
  );
}
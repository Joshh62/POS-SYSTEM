import { useState, useEffect, useRef } from "react";
import api from "../api/api";

const PLANS = [
  {
    key:     "solo",
    name:    "Solo",
    monthly: 5000,
    annual:  50000,
    desc:    "1 branch · 1 user",
    features: ["Full POS checkout", "Inventory management", "Sales history", "Reports"],
  },
  {
    key:     "starter",
    name:    "Starter",
    monthly: 12000,
    annual:  120000,
    desc:    "1 branch · 3 users",
    features: ["Everything in Solo", "3 staff accounts", "Expense tracking", "Loyalty & credit", "Bulk import"],
    popular: true,
  },
  {
    key:     "business",
    name:    "Business",
    monthly: 25000,
    annual:  250000,
    desc:    "3 branches · 10 users",
    features: ["Everything in Starter", "Multi-branch", "Analytics dashboard", "WhatsApp reports"],
  },
  {
    key:     "enterprise",
    name:    "Enterprise",
    monthly: 50000,
    annual:  500000,
    desc:    "Unlimited branches & users",
    features: ["Everything in Business", "Unlimited branches", "White-label branding", "Priority support"],
  },
];

const fmt = (v) => `₦${parseFloat(v || 0).toLocaleString("en-NG")}`;

export default function PricingPage() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const [subscription,  setSubscription]  = useState(null);
  const [billing,       setBilling]       = useState("monthly");  // monthly | annual
  const [selectedPlan,  setSelectedPlan]  = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [paying,        setPaying]        = useState(false);
  const [error,         setError]         = useState(null);
  const [successMsg,    setSuccessMsg]    = useState(null);
  const [branding,      setBranding]      = useState(null);
  const paystackScriptLoaded = useRef(false);

  // ── Load subscription status and branding ─────────────────────────────────
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
      } catch (err) {
        setError("Failed to load subscription details.");
      } finally { setLoading(false); }
    };
    fetch();
    loadPaystackScript();
  }, []);

  // ── Load Paystack inline script ───────────────────────────────────────────
  const loadPaystackScript = () => {
    if (paystackScriptLoaded.current || window.PaystackPop) return;
    const script = document.createElement("script");
    script.src   = "https://js.paystack.co/v1/inline.js";
    script.async = true;
    script.onload = () => { paystackScriptLoaded.current = true; };
    document.head.appendChild(script);
  };

  // ── Handle payment ────────────────────────────────────────────────────────
  const handlePay = async () => {
    if (!selectedPlan) return;
    if (!branding?.email) {
      setError("Please add your email in Branding & Settings before subscribing.");
      return;
    }

    setPaying(true); setError(null);

    try {
      // Initialize payment on backend — get reference and amount
      const initRes = await api.post("/payments/initialize", {
        plan:    selectedPlan,
        billing: billing,
        email:   branding.email,
      });

      const { payment_url, reference, amount } = initRes.data;

      // Use Paystack inline popup
      if (!window.PaystackPop) {
        // Fallback — redirect to Paystack hosted page
        window.location.href = payment_url;
        return;
      }

      const PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || "";

      const handler = window.PaystackPop.setup({
        key:       PUBLIC_KEY,
        email:     branding.email,
        amount:    amount * 100,   // convert naira to kobo for inline
        ref:       reference,
        currency:  "NGN",
        channels:  ["card", "bank", "ussd", "bank_transfer"],
        metadata: {
          business_id:   user.business_id,
          plan:          selectedPlan,
          billing:       billing,
        },
        onSuccess: async (transaction) => {
          // Verify payment on backend
          try {
            const verifyRes = await api.get(`/payments/verify/${transaction.reference}`);
            setSuccessMsg(
              `🎉 Payment successful! Your ${verifyRes.data.plan} plan is now active.`
            );
            // Auto-refresh after 3 seconds
            setTimeout(() => {
              window.location.reload();
            }, 3000);
          } catch (err) {
            setError("Payment received but verification failed. Please contact support.");
          }
          setPaying(false);
        },
        onCancel: () => {
          setPaying(false);
          setError(null);
        },
      });

      handler.openIframe();

    } catch (err) {
      setError(err.response?.data?.detail || "Payment initialization failed. Please try again.");
      setPaying(false);
    }
  };

  // ── Status badge ──────────────────────────────────────────────────────────
  const statusBadge = () => {
    if (!subscription) return null;
    const { subscription_status, trial_active, trial_days_left } = subscription;
    if (trial_active) return (
      <span style={{ background: "#FAEEDA", color: "#854F0B", padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
        ⏰ Trial — {trial_days_left} day{trial_days_left !== 1 ? "s" : ""} left
      </span>
    );
    if (subscription_status === "active") return (
      <span style={{ background: "#EAF3DE", color: "#3B6D11", padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
        ✓ Active
      </span>
    );
    if (subscription_status === "past_due") return (
      <span style={{ background: "#FCEBEB", color: "#A32D2D", padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
        ⚠️ Payment failed
      </span>
    );
    if (subscription_status === "cancelled") return (
      <span style={{ background: "#F1EFE8", color: "#5F5E5A", padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
        Cancelled
      </span>
    );
    return (
      <span style={{ background: "#FCEBEB", color: "#A32D2D", padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
        Expired
      </span>
    );
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--color-text-tertiary)", fontSize: 13 }}>
      Loading subscription details...
    </div>
  );

  const currentPlanData = PLANS.find(p => p.key === subscription?.plan);
  const chosenPlan      = PLANS.find(p => p.key === selectedPlan);
  const price           = chosenPlan ? (billing === "annual" ? chosenPlan.annual : chosenPlan.monthly) : 0;
  const annualSaving    = chosenPlan ? (chosenPlan.monthly * 12) - chosenPlan.annual : 0;
  const isCurrentPlan   = selectedPlan === subscription?.plan && subscription?.subscription_status === "active";

  return (
    <div style={{ padding: "16px 24px", overflowY: "auto", height: "100%", boxSizing: "border-box", maxWidth: 860, margin: "0 auto" }}>

      {/* ── Current status card ── */}
      <div style={{ background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, padding: "16px 20px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 4 }}>Current subscription</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", textTransform: "capitalize" }}>
              {currentPlanData?.name || subscription?.plan || "—"} plan
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
        {!branding?.email && (
          <div style={{ fontSize: 12, color: "#854F0B", background: "#FAEEDA", borderRadius: 8, padding: "8px 12px" }}>
            ⚠️ Add your email in <strong>Branding & Settings</strong> to enable payments
          </div>
        )}
      </div>

      {/* ── Success message ── */}
      {successMsg && (
        <div style={{ background: "#EAF3DE", border: "1px solid rgba(59,109,17,0.3)", borderRadius: 10, padding: "14px 18px", marginBottom: 16, fontSize: 14, color: "#3B6D11", fontWeight: 500, textAlign: "center" }}>
          {successMsg}
          <div style={{ fontSize: 12, color: "#5a8a3a", marginTop: 4, fontWeight: 400 }}>Refreshing in a moment...</div>
        </div>
      )}

      {error && (
        <div style={{ background: "var(--error-bg)", color: "var(--error-text)", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* ── Billing toggle ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <span style={{ fontSize: 13, color: "var(--color-text-primary)", fontWeight: 500 }}>Billing:</span>
        <div style={{ display: "flex", background: "var(--color-background-secondary)", borderRadius: 8, padding: 3, border: "1px solid var(--color-border-tertiary)" }}>
          {["monthly", "annual"].map(b => (
            <button key={b} onClick={() => setBilling(b)} style={{
              padding: "6px 16px", borderRadius: 6, border: "none", fontSize: 12, fontWeight: 500, cursor: "pointer",
              background: billing === b ? "var(--color-primary)" : "transparent",
              color: billing === b ? "#fff" : "var(--color-text-secondary)",
              transition: "all 0.15s",
            }}>
              {b.charAt(0).toUpperCase() + b.slice(1)}
              {b === "annual" && <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.85 }}>2 months free</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ── Plan cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 20 }}>
        {PLANS.map(plan => {
          const price    = billing === "annual" ? plan.annual : plan.monthly;
          const selected = selectedPlan === plan.key;
          const current  = subscription?.plan === plan.key && subscription?.subscription_status === "active";

          return (
            <div key={plan.key} onClick={() => setSelectedPlan(plan.key)} style={{
              background: "var(--color-background-primary)",
              border: `${selected ? 2 : 1}px solid ${selected ? "var(--color-primary)" : "var(--color-border-tertiary)"}`,
              borderRadius: 12, padding: "16px 18px", cursor: "pointer",
              position: "relative", transition: "all 0.15s",
              opacity: 1,
            }}>
              {plan.popular && (
                <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: "var(--color-primary)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 12px", borderRadius: 20, whiteSpace: "nowrap" }}>
                  Most popular
                </div>
              )}
              {current && (
                <div style={{ position: "absolute", top: 10, right: 10, background: "#EAF3DE", color: "#3B6D11", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6 }}>
                  Current
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)" }}>{plan.name}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>{plan.desc}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-primary)" }}>
                    {fmt(price)}
                    <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", fontWeight: 400 }}>
                      /{billing === "annual" ? "yr" : "mo"}
                    </span>
                  </div>
                  {billing === "annual" && (
                    <div style={{ fontSize: 10, color: "#3B6D11", fontWeight: 600 }}>
                      Save {fmt(annualSaving)}
                    </div>
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

      {/* ── Payment summary + pay button ── */}
      <div style={{ background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, padding: "18px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
              {chosenPlan?.name} — {billing === "annual" ? "Annual" : "Monthly"}
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>
              {billing === "annual"
                ? `${fmt(chosenPlan?.monthly)}/month billed annually`
                : `Billed every month · cancel anytime`}
            </div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--color-primary)" }}>
            {fmt(price)}
          </div>
        </div>

        {billing === "annual" && annualSaving > 0 && (
          <div style={{ background: "#EAF3DE", border: "1px solid rgba(59,109,17,0.2)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#3B6D11", marginBottom: 14 }}>
            🎉 You save {fmt(annualSaving)} compared to monthly billing
          </div>
        )}

        <button
          onClick={handlePay}
          disabled={paying || isCurrentPlan || !branding?.email || !!successMsg}
          style={{
            width: "100%", padding: "13px 0", borderRadius: 10, border: "none",
            background: (paying || isCurrentPlan || !!successMsg) ? "var(--color-background-secondary)" : "var(--color-primary)",
            color: (paying || isCurrentPlan || !!successMsg) ? "var(--color-text-tertiary)" : "#fff",
            fontSize: 15, fontWeight: 600,
            cursor: (paying || isCurrentPlan || !!successMsg) ? "not-allowed" : "pointer",
            transition: "all 0.2s",
          }}
        >
          {paying
            ? "Opening payment..."
            : isCurrentPlan
              ? "✓ Already on this plan"
              : successMsg
                ? "Payment complete"
                : `Pay ${fmt(price)} via Paystack`}
        </button>

        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", textAlign: "center", marginTop: 10, lineHeight: 1.6 }}>
          Secured by Paystack · Card, bank transfer, or USSD · No hidden fees
        </div>
      </div>
    </div>
  );
}
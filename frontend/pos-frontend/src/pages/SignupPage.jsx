import { useState } from "react";
import api from "../api/api";

const PLANS = [
  {
    key: "solo", name: "Solo", price: "₦5,000", annual: "₦50,000/yr",
    desc: "1 branch · 1 user · Full POS & inventory",
    features: ["POS checkout", "Inventory", "Sales history", "Reports"],
  },
  {
    key: "starter", name: "Starter", price: "₦12,000", annual: "₦120,000/yr",
    desc: "1 branch · 3 users · All core features",
    features: ["Everything in Solo", "3 staff accounts", "Expense tracking", "Loyalty & credit", "Bulk import"],
    popular: true,
  },
  {
    key: "business", name: "Business", price: "₦25,000", annual: "₦250,000/yr",
    desc: "3 branches · 10 users · Full analytics",
    features: ["Everything in Starter", "Multi-branch", "Analytics dashboard", "WhatsApp reports"],
  },
  {
    key: "enterprise", name: "Enterprise", price: "₦50,000", annual: "₦500,000/yr",
    desc: "Unlimited branches & users",
    features: ["Everything in Business", "Unlimited branches", "White-label branding", "Priority support"],
  },
];

export default function SignupPage({ onSignupSuccess, onBack }) {
  const [step,       setStep]       = useState(1); // 1=plan, 2=details
  const [plan,       setPlan]       = useState("starter");
  const [form,       setForm]       = useState({
    business_name: "", address: "", phone: "",
    full_name: "", username: "", password: "", confirm_password: "", email: "",
  });
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);

  const selectedPlan = PLANS.find(p => p.key === plan);

  const handleSubmit = async () => {
    if (!form.business_name.trim()) { setError("Business name is required."); return; }
    if (!form.full_name.trim())     { setError("Your full name is required."); return; }
    if (!form.username.trim())      { setError("Username is required."); return; }
    if (!form.email.trim())         { setError("Email is required."); return; }
    if (form.password.length < 6)   { setError("Password must be at least 6 characters."); return; }
    if (form.password !== form.confirm_password) { setError("Passwords do not match."); return; }

    setLoading(true); setError(null);
    try {
      const res = await api.post("/payments/signup", {
        business_name: form.business_name.trim(),
        address:       form.address.trim() || null,
        phone:         form.phone.trim()   || null,
        full_name:     form.full_name.trim(),
        username:      form.username.trim().toLowerCase(),
        password:      form.password,
        email:         form.email.trim().toLowerCase(),
        plan,
      });
      onSignupSuccess(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Registration failed. Please try again.");
    } finally { setLoading(false); }
  };

  const f = (key) => ({
    value: form[key],
    onChange: (e) => setForm(f => ({ ...f, [key]: e.target.value })),
    style: inputS,
  });

  return (
    <div style={page}>
      {/* Header */}
      <div style={header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={logoBox}>📊</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a" }}>ProfitTrack POS</div>
            <div style={{ fontSize: 10, color: "#888" }}>Start your free trial</div>
          </div>
        </div>
        <button onClick={onBack} style={backBtn}>← Back to home</button>
      </div>

      <div style={container}>
        {/* Step indicator */}
        <div style={stepRow}>
          <StepDot n={1} label="Choose plan" active={step === 1} done={step > 1} />
          <div style={{ flex: 1, height: 1, background: step > 1 ? "#185FA5" : "#e0e0e0", margin: "0 8px", alignSelf: "center" }} />
          <StepDot n={2} label="Your details" active={step === 2} done={false} />
        </div>

        {/* Step 1 — Plan selection */}
        {step === 1 && (
          <>
            <div style={pageTitle}>Choose your plan</div>
            <div style={pageSub}>All plans include a <strong>14-day free trial</strong>. No credit card required to start.</div>

            <div style={planGrid}>
              {PLANS.map(p => (
                <div key={p.key} onClick={() => setPlan(p.key)} style={{
                  ...planCard,
                  border: plan === p.key ? "2px solid #185FA5" : "1.5px solid #e5e7eb",
                  background: plan === p.key ? "#F0F7FF" : "#fff",
                  position: "relative",
                  cursor: "pointer",
                }}>
                  {p.popular && <div style={popularBadge}>Most popular</div>}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{p.desc}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#185FA5" }}>{p.price}<span style={{ fontSize: 11, color: "#888", fontWeight: 400 }}>/mo</span></div>
                      <div style={{ fontSize: 10, color: "#3B6D11", fontWeight: 600 }}>{p.annual}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {p.features.map((f, i) => (
                      <div key={i} style={{ fontSize: 12, color: "#444", display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: "#3B6D11", fontSize: 11 }}>✓</span> {f}
                      </div>
                    ))}
                  </div>
                  {plan === p.key && (
                    <div style={{ position: "absolute", top: 10, right: 10, width: 18, height: 18, borderRadius: "50%", background: "#185FA5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ background: "#EAF3DE", border: "1px solid rgba(59,109,17,0.3)", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#3B6D11", marginTop: 8, textAlign: "center" }}>
              🎉 You selected <strong>{selectedPlan?.name}</strong> — 14 days free, then {selectedPlan?.price}/month. Cancel anytime.
            </div>

            <button onClick={() => setStep(2)} style={primaryBtn}>
              Continue with {selectedPlan?.name} →
            </button>
          </>
        )}

        {/* Step 2 — Details */}
        {step === 2 && (
          <>
            <div style={pageTitle}>Set up your account</div>
            <div style={pageSub}>
              <span style={{ background: "#E6F1FB", color: "#185FA5", padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                {selectedPlan?.name} plan
              </span>
              <button onClick={() => setStep(1)} style={{ background: "none", border: "none", color: "#888", fontSize: 12, cursor: "pointer", marginLeft: 8 }}>
                Change plan
              </button>
            </div>

            {error && <div style={errorBox}>{error}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <FieldLabel>Business name *</FieldLabel>
                <input placeholder="e.g. Wear Haus" {...f("business_name")} />
              </div>
              <div>
                <FieldLabel>Phone number</FieldLabel>
                <input placeholder="08012345678" {...f("phone")} />
              </div>
              <div>
                <FieldLabel>Business address</FieldLabel>
                <input placeholder="e.g. Wuse Market, Abuja" {...f("address")} />
              </div>

              <div style={{ gridColumn: "1 / -1", borderTop: "1px solid #eee", paddingTop: 14, marginTop: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", marginBottom: 10 }}>Your admin account</div>
              </div>

              <div>
                <FieldLabel>Your full name *</FieldLabel>
                <input placeholder="e.g. Alhaji Musa" {...f("full_name")} />
              </div>
              <div>
                <FieldLabel>Email address *</FieldLabel>
                <input type="email" placeholder="you@email.com" {...f("email")} />
              </div>
              <div>
                <FieldLabel>Username *</FieldLabel>
                <input placeholder="e.g. musa_wearhaus" {...f("username")} />
              </div>
              <div style={{ gridColumn: "1 / -1", height: 0 }} />
              <div>
                <FieldLabel>Password * (min 6 characters)</FieldLabel>
                <input type="password" placeholder="Create a password" {...f("password")} />
              </div>
              <div>
                <FieldLabel>Confirm password *</FieldLabel>
                <input type="password" placeholder="Repeat password" {...f("confirm_password")} />
              </div>
            </div>

            <div style={{ fontSize: 12, color: "#888", marginTop: 12, lineHeight: 1.6 }}>
              By creating an account you agree to our terms of service. Your 14-day free trial starts immediately — no credit card required. You'll be prompted to add payment details before your trial ends.
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={() => { setStep(1); setError(null); }} style={backBtnForm}>
                ← Back
              </button>
              <button onClick={handleSubmit} disabled={loading} style={{ ...primaryBtn, flex: 1, opacity: loading ? 0.7 : 1 }}>
                {loading ? "Creating your account..." : "Start free trial →"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StepDot({ n, label, active, done }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        background: done ? "#3B6D11" : active ? "#185FA5" : "#e0e0e0",
        color: done || active ? "#fff" : "#888",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 700,
      }}>
        {done ? "✓" : n}
      </div>
      <div style={{ fontSize: 10, color: active ? "#185FA5" : "#888", fontWeight: active ? 600 : 400, whiteSpace: "nowrap" }}>{label}</div>
    </div>
  );
}

function FieldLabel({ children }) {
  return <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#555", marginBottom: 5 }}>{children}</label>;
}

const page       = { minHeight: "100vh", background: "#F8FAFC", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" };
const header     = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 40px", background: "#fff", borderBottom: "1px solid #eee", position: "sticky", top: 0, zIndex: 100 };
const logoBox    = { width: 36, height: 36, background: "#185FA5", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 };
const backBtn    = { background: "none", border: "1px solid #e0e0e0", borderRadius: 8, padding: "7px 14px", fontSize: 13, cursor: "pointer", color: "#555" };
const backBtnForm = { padding: "11px 20px", borderRadius: 10, border: "1px solid #e0e0e0", background: "#fff", color: "#555", fontSize: 14, cursor: "pointer" };
const container  = { maxWidth: 680, margin: "40px auto", padding: "0 24px 60px" };
const stepRow    = { display: "flex", alignItems: "flex-start", marginBottom: 32 };
const pageTitle  = { fontSize: 22, fontWeight: 700, color: "#1a1a1a", marginBottom: 6 };
const pageSub    = { fontSize: 13, color: "#666", marginBottom: 24, lineHeight: 1.6 };
const planGrid   = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 };
const planCard   = { borderRadius: 12, padding: "16px 14px", transition: "all 0.15s" };
const popularBadge = { position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: "#185FA5", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 12px", borderRadius: 20, whiteSpace: "nowrap" };
const primaryBtn = { width: "100%", padding: "13px 0", borderRadius: 10, border: "none", background: "#185FA5", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", marginTop: 16 };
const inputS     = { display: "block", width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e0e0e0", fontSize: 13, background: "#fff", color: "#1a1a1a", boxSizing: "border-box", outline: "none", fontFamily: "inherit", marginTop: 0 };
const errorBox   = { background: "#FCEBEB", color: "#A32D2D", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 };
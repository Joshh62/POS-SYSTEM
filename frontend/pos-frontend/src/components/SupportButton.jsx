import { useState } from "react";

const WHATSAPP = "https://wa.me/2349012984122";
const AMBER    = "#C8820A";

const IN_SCOPE = [
  "App bugs or error messages",
  "Account and login issues",
  "Billing and subscription questions",
  "Feature guidance — how to use any part of the system",
  "Data questions — exports, restoring after cancellation",
  "Onboarding help for new businesses",
  "Staff setup and role configuration",
  "Product import and inventory setup",
];

const OUT_SCOPE = [
  "Hardware repair or physical device issues",
  "Your internet or WiFi connectivity problems",
  "WhatsApp delivery failures on the customer's end (Twilio issue)",
  "Tax advice or accounting interpretation of your reports",
  "Custom feature development for individual businesses",
  "Third-party integrations not built into ProfitTrack",
];

const FAQS = [
  { q: "How do I reset a staff password?", a: "Go to Users → click the staff member → Edit → set a new password. Only admins can reset passwords." },
  { q: "A sale was made but stock didn't deduct", a: "Check that the product has an inventory record for that branch. Go to Inventory → Stock levels and verify the product appears there." },
  { q: "My daily WhatsApp report didn't arrive", a: "Reports send at 8PM Lagos time. Check your phone number in Branding & Settings. On trial, make sure your Twilio number has opted in to the sandbox." },
  { q: "How do I add a new branch?", a: "Contact support via WhatsApp — branch creation is managed by superadmin for Business and Enterprise plan customers." },
  { q: "Can I export my sales data?", a: "Go to Reports → Sales summary. Export functionality is on the roadmap. Contact support for a manual data export." },
  { q: "How do I undo a sale?", a: "Go to Sales history → find the sale → click Refund. Stock is automatically returned to inventory." },
];

export default function SupportButton() {
  const [open,    setOpen]    = useState(false);
  const [tab,     setTab]     = useState("help"); // help | scope | faq
  const [faqOpen, setFaqOpen] = useState(null);

  return (
    <>
      {/* ── Floating button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Get help"
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9998,
          width: 52, height: 52, borderRadius: "50%",
          background: open ? "#333" : AMBER,
          border: "none", cursor: "pointer",
          boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, transition: "all 0.2s",
          color: "#fff",
        }}
      >
        {open ? "✕" : "?"}
      </button>

      {/* ── Panel ── */}
      {open && (
        <div style={{
          position: "fixed", bottom: 86, right: 24, zIndex: 9997,
          width: 340, maxHeight: "70vh",
          background: "var(--color-background-primary)",
          border: "1px solid var(--color-border-tertiary)",
          borderRadius: 16,
          boxShadow: "0 12px 48px rgba(0,0,0,0.25)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>

          {/* Header */}
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--color-border-tertiary)", background: AMBER }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>ProfitTrack Support</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>Mon–Sat · 9AM–6PM Lagos time</div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)" }}>
            {[["help","Help"],["faq","FAQ"],["scope","Scope"]].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)} style={{
                flex: 1, padding: "9px 0", border: "none", background: "none",
                fontSize: 12, fontWeight: tab === key ? 600 : 400, cursor: "pointer",
                color: tab === key ? AMBER : "var(--color-text-secondary)",
                borderBottom: tab === key ? `2px solid ${AMBER}` : "2px solid transparent",
                transition: "all 0.15s",
              }}>{label}</button>
            ))}
          </div>

          {/* Content */}
          <div style={{ overflowY: "auto", flex: 1 }}>

            {/* ── Help tab ── */}
            {tab === "help" && (
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6, margin: 0 }}>
                  Need help? Reach us on WhatsApp for the fastest response.
                </p>

                <a href={`${WHATSAPP}?text=${encodeURIComponent("Hi, I need help with ProfitTrack POS.")}`}
                  target="_blank" rel="noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, background: "#25D366", textDecoration: "none", transition: "opacity 0.15s" }}>
                  <span style={{ fontSize: 22 }}>💬</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Chat on WhatsApp</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)" }}>+234 901 298 4122 · Fastest response</div>
                  </div>
                </a>

                <a href="mailto:support@profittrack.ng"
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, background: "var(--color-background-secondary)", border: "1px solid var(--color-border-tertiary)", textDecoration: "none" }}>
                  <span style={{ fontSize: 22 }}>📧</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>Email support</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>support@profittrack.ng</div>
                  </div>
                </a>

                <div style={{ background: "var(--color-background-secondary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 6 }}>Quick links</div>
                  {[
                    ["📖 Getting started guide", `${WHATSAPP}?text=${encodeURIComponent("Hi, please send me the getting started guide.")}`],
                    ["📦 Hardware recommendations", `${WHATSAPP}?text=${encodeURIComponent("Hi, I need hardware recommendations for ProfitTrack.")}`],
                    ["💳 Billing & plan changes", null, "billing"],
                    ["⚙️ Branding & settings", null, "settings"],
                  ].map(([label, href, page], i) => (
                    href
                      ? <a key={i} href={href} target="_blank" rel="noreferrer" style={{ display: "block", fontSize: 12, color: AMBER, textDecoration: "none", padding: "4px 0", borderBottom: i < 3 ? "1px solid var(--color-border-tertiary)" : "none" }}>{label}</a>
                      : <button key={i} onClick={() => { setOpen(false); /* navigate handled by parent */ }} style={{ display: "block", width: "100%", textAlign: "left", fontSize: 12, color: AMBER, background: "none", border: "none", cursor: "pointer", padding: "4px 0", borderBottom: i < 3 ? "1px solid var(--color-border-tertiary)" : "none" }}>{label}</button>
                  ))}
                </div>
              </div>
            )}

            {/* ── FAQ tab ── */}
            {tab === "faq" && (
              <div style={{ padding: "8px 16px 16px" }}>
                {FAQS.map((item, i) => (
                  <div key={i} style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                    <button onClick={() => setFaqOpen(faqOpen === i ? null : i)} style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "12px 0", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", lineHeight: 1.4 }}>{item.q}</span>
                      <span style={{ fontSize: 16, color: AMBER, flexShrink: 0, transform: faqOpen === i ? "rotate(45deg)" : "none", transition: "transform 0.15s", display: "inline-block" }}>+</span>
                    </button>
                    {faqOpen === i && (
                      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.7, paddingBottom: 12 }}>{item.a}</div>
                    )}
                  </div>
                ))}
                <a href={`${WHATSAPP}?text=${encodeURIComponent("Hi, I have a question about ProfitTrack.")}`}
                  target="_blank" rel="noreferrer"
                  style={{ display: "block", marginTop: 14, textAlign: "center", fontSize: 13, color: "#fff", background: "#25D366", borderRadius: 8, padding: "10px 0", textDecoration: "none", fontWeight: 600 }}>
                  Ask on WhatsApp →
                </a>
              </div>
            )}

            {/* ── Scope tab ── */}
            {tab === "scope" && (
              <div style={{ padding: 16 }}>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#3B6D11", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
                    ✓ What we support
                  </div>
                  {IN_SCOPE.map((item, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 6, lineHeight: 1.5 }}>
                      <span style={{ color: "#3B6D11", flexShrink: 0 }}>✓</span>{item}
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: "1px solid var(--color-border-tertiary)", paddingTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#A32D2D", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
                    ✕ Outside our scope
                  </div>
                  {OUT_SCOPE.map((item, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 6, lineHeight: 1.5 }}>
                      <span style={{ color: "#A32D2D", flexShrink: 0 }}>✕</span>{item}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 14, fontSize: 11, color: "var(--color-text-tertiary)", background: "var(--color-background-secondary)", borderRadius: 8, padding: "10px 12px", lineHeight: 1.6 }}>
                  For out-of-scope issues, we'll do our best to point you in the right direction even if we can't resolve it directly.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
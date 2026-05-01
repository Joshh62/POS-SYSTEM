const WHATSAPP_NUMBER = "2348154586355"; // international format, no +
const WHATSAPP_MSG    = encodeURIComponent("Hi, I'd like to request a demo of ProfitTrack POS for my business.");
const WHATSAPP_URL    = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MSG}`;

export default function LandingPage({ onStart }) {
  return (
    <div style={page}>

      {/* ── Nav ── */}
      <nav style={nav}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={logoBox}>📊</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a", lineHeight: 1.2 }}>ProfitTrack POS</div>
            <div style={{ fontSize: 10, color: "#888" }}>Business management software</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" style={navWhatsapp}>
            💬 WhatsApp us
          </a>
          <button style={navLogin} onClick={onStart}>Login</button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={hero}>
        <div style={heroBadge}>Built for Nigerian retail · 2026</div>
        <h1 style={heroH1}>
          Stop losing money.<br />
          <span style={{ color: "#185FA5" }}>Take full control of your shop.</span>
        </h1>
        <p style={heroSub}>
          Track every sale, monitor your staff, manage inventory across branches,
          and get a WhatsApp report every night — all from one simple system.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button style={btnPrimary} onClick={onStart}>Get started →</button>
          <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" style={btnWhatsapp}>
            📱 Request a free demo
          </a>
        </div>
        <p style={heroNote}>Setup takes less than 24 hours. We handle everything.</p>
      </section>

      {/* ── Pain strip ── */}
      <section style={painStrip}>
        <div style={painInner}>
          {[
            { icon: "❌", text: "Staff selling items off-record" },
            { icon: "❌", text: "No visibility when you're away" },
            { icon: "❌", text: "Stock levels you can't trust" },
            { icon: "❌", text: "Expired products on shelves" },
          ].map((p, i) => (
            <div key={i} style={painItem}>
              <span style={{ fontSize: 14 }}>{p.icon}</span>
              <span style={{ fontSize: 13, color: "#444" }}>{p.text}</span>
            </div>
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#185FA5", fontWeight: 600 }}>
          This is not a staff problem. It's a system problem. ProfitTrack is the system.
        </div>
      </section>

      {/* ── Features ── */}
      <section style={section}>
        <div style={sectionLabel}>What you get</div>
        <h2 style={sectionH2}>Everything your shop needs in one place</h2>
        <div style={featureGrid}>
          {[
            { icon: "🧾", title: "Fast POS checkout", text: "Scan barcodes, select products, and complete sales in seconds. Cash, transfer, or card. PDF receipt every time." },
            { icon: "👁️", title: "Staff accountability", text: "Every sale, refund, and edit is recorded by name and time. Full audit log. Nothing gets deleted without a trace." },
            { icon: "📦", title: "Inventory you can trust", text: "Real-time stock levels. Low stock alerts. Batch-level expiry tracking with configurable alert windows." },
            { icon: "📊", title: "Daily visibility", text: "Dashboard shows today's sales, profit, top products, and cashier performance the moment you open it." },
            { icon: "💬", title: "WhatsApp daily report", text: "Sent automatically at 8PM every day. Sales, profit, low stock, and expiry alerts. No login needed." },
            { icon: "🏢", title: "Multi-branch ready", text: "Manage multiple shop locations from one account. Switch between branches on the dashboard instantly." },
          ].map((f, i) => (
            <div key={i} style={featCard}>
              <div style={featIcon}>{f.icon}</div>
              <div style={featTitle}>{f.title}</div>
              <div style={featText}>{f.text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── WhatsApp report preview ── */}
      <section style={{ ...section, background: "#F0F7FF", borderRadius: 0 }}>
        <div style={sectionLabel}>Daily WhatsApp report</div>
        <h2 style={sectionH2}>Know your numbers before you sleep</h2>
        <p style={sectionSub}>
          Every night at 8PM, ProfitTrack sends you a summary of the day directly on WhatsApp.
          No app to open. No login. Just a message.
        </p>
        <div style={waMockup}>
          <div style={waBubble}>
            <div style={waLine}><strong>📊 Daily Sales Report — WEAR HAUS</strong></div>
            <div style={waLine}>📅 Friday, 1 May 2026</div>
            <div style={{ height: 8 }} />
            <div style={waLine}>💰 <strong>Total Sales:</strong> ₦94,500.00</div>
            <div style={waLine}>🧾 <strong>Transactions:</strong> 7</div>
            <div style={waLine}>📈 <strong>Profit:</strong> ₦41,200.00</div>
            <div style={{ height: 8 }} />
            <div style={waLine}>🏆 <strong>Top Products Today:</strong></div>
            <div style={waLine}>  1. Men Vintage Shirt - Blue — 9 units</div>
            <div style={waLine}>  2. Denim Jacket — 2 units</div>
            <div style={{ height: 8 }} />
            <div style={waLine}>⚠️ <strong>Low Stock Alert:</strong></div>
            <div style={waLine}>  • Sports Bra: 2 remaining</div>
            <div style={{ height: 8 }} />
            <div style={{ ...waLine, color: "#888", fontStyle: "italic", fontSize: 11 }}>
              Sent automatically by ProfitTrack POS
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section style={section}>
        <div style={sectionLabel}>Pricing</div>
        <h2 style={sectionH2}>Simple, honest pricing</h2>
        <p style={sectionSub}>
          Most shops lose ₦20,000–₦100,000 monthly from untracked sales.
          ProfitTrack pays for itself by stopping that loss.
        </p>
        <div style={pricingGrid}>
          {[
            { name: "Solo", price: "₦5,000", period: "/month", annual: "₦50,000/year", setup: "No setup fee", desc: "1 owner login. Full POS, inventory, reports, WhatsApp summary. Perfect for solo shop owners.", hot: false },
            { name: "Starter", price: "₦10,000", period: "/month", annual: "₦100,000/year · save ₦20,000", setup: "+ ₦25,000 setup", desc: "1 branch, up to 3 staff. POS, inventory, reports, audit log, WhatsApp reports.", hot: false },
            { name: "Business", price: "₦18,000", period: "/month", annual: "₦180,000/year · save ₦36,000", setup: "+ ₦25,000 setup", desc: "Up to 3 branches, unlimited staff. Full audit log and branch-level reporting.", hot: true },
            { name: "Enterprise", price: "₦35,000", period: "/month", annual: "₦350,000/year · save ₦70,000", setup: "+ ₦50,000 setup", desc: "Unlimited branches and staff. Dedicated onboarding and priority support.", hot: false },
          ].map((p, i) => (
            <div key={i} style={{ ...planCard, border: p.hot ? "2px solid #185FA5" : "1px solid #e5e7eb", position: "relative" }}>
              {p.hot && <div style={hotBadge}>Most popular</div>}
              <div style={planName}>{p.name}</div>
              <div style={planPrice}>{p.price}<span style={planPeriod}>{p.period}</span></div>
              <div style={planAnnual}>{p.annual}</div>
              <div style={planSetup}>{p.setup}</div>
              <div style={planDesc}>{p.desc}</div>
            </div>
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "#888" }}>
          Annual plans include 2 months free. No setup fee on annual plans.
          7-day satisfaction guarantee on all plans.
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={ctaSection}>
        <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 10, color: "#fff" }}>
          Ready to stop the leakage?
        </h2>
        <p style={{ color: "#B5D4F4", marginBottom: 24, fontSize: 14 }}>
          Setup takes less than 24 hours. We handle product upload, staff setup, and training.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button style={btnPrimaryWhite} onClick={onStart}>Get started today</button>
          <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" style={btnWhatsappDark}>
            📱 WhatsApp: 08154586355
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={footerStyle}>
        <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>ProfitTrack POS</div>
        <div style={{ color: "#888", fontSize: 12 }}>profittrack.ng · Built for Nigerian retail · Cloud-based, no installation required</div>
        <div style={{ color: "#aaa", fontSize: 11, marginTop: 8 }}>© {new Date().getFullYear()} ProfitTrack POS. All rights reserved.</div>
      </footer>

    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const page        = { fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: "#F8FAFC", color: "#1a1a1a" };
const nav         = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 40px", background: "#fff", borderBottom: "1px solid #eee", position: "sticky", top: 0, zIndex: 100 };
const logoBox     = { width: 36, height: 36, background: "#185FA5", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 };
const navWhatsapp = { padding: "7px 14px", borderRadius: 8, border: "1px solid #25D366", color: "#25D366", fontSize: 13, textDecoration: "none", fontWeight: 500 };
const navLogin    = { padding: "7px 16px", borderRadius: 8, border: "none", background: "#185FA5", color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 500 };

const hero        = { textAlign: "center", padding: "80px 24px 60px", maxWidth: 780, margin: "0 auto" };
const heroBadge   = { display: "inline-block", background: "#E6F1FB", color: "#0C447C", fontSize: 12, fontWeight: 600, padding: "4px 14px", borderRadius: 20, marginBottom: 20 };
const heroH1      = { fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 700, lineHeight: 1.2, marginBottom: 16, margin: "0 auto 16px" };
const heroSub     = { fontSize: 16, color: "#555", maxWidth: 560, margin: "0 auto 28px", lineHeight: 1.7 };
const heroNote    = { marginTop: 14, fontSize: 12, color: "#888" };
const btnPrimary  = { padding: "13px 24px", borderRadius: 10, border: "none", background: "#185FA5", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" };
const btnWhatsapp = { padding: "13px 24px", borderRadius: 10, border: "2px solid #25D366", background: "#fff", color: "#128C7E", fontSize: 14, fontWeight: 600, textDecoration: "none", display: "inline-block" };

const painStrip   = { background: "#fff", padding: "28px 40px", borderTop: "1px solid #eee", borderBottom: "1px solid #eee" };
const painInner   = { display: "flex", justifyContent: "center", gap: 32, flexWrap: "wrap" };
const painItem    = { display: "flex", alignItems: "center", gap: 8 };

const section     = { padding: "64px 40px", maxWidth: 1100, margin: "0 auto" };
const sectionLabel = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#185FA5", marginBottom: 10, textAlign: "center" };
const sectionH2   = { fontSize: "clamp(20px, 3vw, 28px)", fontWeight: 700, textAlign: "center", marginBottom: 12 };
const sectionSub  = { textAlign: "center", color: "#555", maxWidth: 560, margin: "0 auto 40px", fontSize: 14, lineHeight: 1.7 };

const featureGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginTop: 40 };
const featCard    = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "20px 22px" };
const featIcon    = { fontSize: 22, marginBottom: 10 };
const featTitle   = { fontSize: 14, fontWeight: 600, marginBottom: 6, color: "#1a1a1a" };
const featText    = { fontSize: 13, color: "#555", lineHeight: 1.6 };

const waMockup    = { display: "flex", justifyContent: "center", marginTop: 32 };
const waBubble    = { background: "#DCF8C6", borderRadius: "0 16px 16px 16px", padding: "16px 20px", maxWidth: 340, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", textAlign: "left" };
const waLine      = { fontSize: 13, color: "#1a1a1a", lineHeight: 1.7 };

const pricingGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginTop: 40 };
const planCard    = { background: "#fff", borderRadius: 12, padding: "20px 18px" };
const hotBadge    = { position: "absolute", top: -11, left: "50%", transform: "translateX(-50%)", background: "#185FA5", color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 12px", borderRadius: 20, whiteSpace: "nowrap" };
const planName    = { fontSize: 14, fontWeight: 700, marginBottom: 6 };
const planPrice   = { fontSize: 22, fontWeight: 700, color: "#185FA5" };
const planPeriod  = { fontSize: 12, color: "#888", fontWeight: 400 };
const planAnnual  = { fontSize: 11, color: "#3B6D11", fontWeight: 600, marginTop: 2 };
const planSetup   = { fontSize: 11, color: "#888", margin: "6px 0 10px", paddingTop: 6, borderTop: "1px solid #eee" };
const planDesc    = { fontSize: 12, color: "#555", lineHeight: 1.6 };

const ctaSection      = { background: "#185FA5", padding: "64px 24px", textAlign: "center" };
const btnPrimaryWhite = { padding: "13px 24px", borderRadius: 10, border: "none", background: "#fff", color: "#185FA5", fontSize: 14, fontWeight: 700, cursor: "pointer" };
const btnWhatsappDark = { padding: "13px 24px", borderRadius: 10, border: "2px solid rgba(255,255,255,0.4)", background: "transparent", color: "#fff", fontSize: 14, fontWeight: 600, textDecoration: "none", display: "inline-block" };

const footerStyle = { textAlign: "center", padding: "32px 24px", borderTop: "1px solid #eee", background: "#fff" };
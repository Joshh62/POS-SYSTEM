import { useState, useEffect, useRef } from "react";
import SignupPage from "./SignupPage";

const WHATSAPP_NUMBER = "2348154586355";
const WHATSAPP_MSG    = encodeURIComponent("Hi, I'd like to learn more about ProfitTrack POS for my business.");
const WHATSAPP_URL    = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MSG}`;
const DEMO_MSG        = encodeURIComponent("Hi, I'd like to request a free demo of ProfitTrack POS.");
const DEMO_URL        = `https://wa.me/${WHATSAPP_NUMBER}?text=${DEMO_MSG}`;

const AMBER = "#C8820A";
const DARK  = "#111111";
const CREAM = "#F9F5EE";
const CREAM2= "#F2EBE0";

function PTIcon({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <rect width="64" height="64" rx="14" fill={AMBER} />
      <path d="M22 18h12c4.4 0 7 2.6 7 6.5S38.4 31 34 31h-5v11h-7V18z" fill="white" />
      <path d="M18 48l8-7 7 5 11-10" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="46" cy="36" r="2" fill="rgba(255,255,255,0.65)" />
    </svg>
  );
}

function Counter({ target, suffix = "", duration = 1800 }) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true;
        const start = performance.now();
        const tick = (now) => {
          const p = Math.min((now - start) / duration, 1);
          setVal(Math.floor(p * target));
          if (p < 1) requestAnimationFrame(tick); else setVal(target);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.4 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [target, duration]);
  return <span ref={ref}>{val}{suffix}</span>;
}

function VideoPlaceholder({ title, desc }) {
  const [hov, setHov] = useState(false);
  return (
    <a href={DEMO_URL} target="_blank" rel="noreferrer"
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: "block", textDecoration: "none",
        background: "#0f0f0f", borderRadius: 14, overflow: "hidden",
        border: `1px solid rgba(200,130,10,${hov ? 0.4 : 0.18})`,
        aspectRatio: "16/9", position: "relative",
        transition: "transform 0.2s, box-shadow 0.2s",
        transform: hov ? "scale(1.012)" : "scale(1)",
        boxShadow: hov ? `0 12px 40px rgba(200,130,10,0.2)` : "0 4px 16px rgba(0,0,0,0.3)",
      }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: `linear-gradient(rgba(200,130,10,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(200,130,10,0.05) 1px, transparent 1px)`, backgroundSize: "28px 28px" }} />
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 50%, rgba(200,130,10,0.1) 0%, transparent 70%)` }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", background: hov ? AMBER : "rgba(200,130,10,0.85)", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", boxShadow: `0 0 ${hov?36:16}px rgba(200,130,10,0.35)` }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
        </div>
        <div style={{ textAlign: "center", padding: "0 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 3 }}>{title}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{desc}</div>
        </div>
        <div style={{ position: "absolute", bottom: 12, right: 14, fontSize: 10, color: "rgba(200,130,10,0.7)", fontWeight: 600, background: "rgba(200,130,10,0.08)", padding: "2px 8px", borderRadius: 20, border: "1px solid rgba(200,130,10,0.15)" }}>Coming soon</div>
      </div>
    </a>
  );
}

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid rgba(200,130,10,0.12)" }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "18px 0", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: DARK, lineHeight: 1.4, fontFamily: "Georgia, serif" }}>{q}</span>
        <span style={{ fontSize: 22, color: AMBER, flexShrink: 0, fontWeight: 300, transform: open ? "rotate(45deg)" : "rotate(0)", transition: "transform 0.2s", display: "inline-block" }}>+</span>
      </button>
      {open && <div style={{ fontSize: 14, color: "#555", lineHeight: 1.8, paddingBottom: 18, maxWidth: 680 }}>{a}</div>}
    </div>
  );
}

function FeatureCard({ icon, title, text, tag }) {
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ background: hov ? "#fff" : CREAM, border: `1px solid ${hov ? "rgba(200,130,10,0.3)" : "rgba(200,130,10,0.1)"}`, borderRadius: 14, padding: "26px 22px", transition: "all 0.2s", boxShadow: hov ? "0 6px 28px rgba(200,130,10,0.1)" : "none" }}>
      <div style={{ fontSize: 30, marginBottom: 10 }}>{icon}</div>
      {tag && <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: AMBER, background: "rgba(200,130,10,0.1)", padding: "2px 9px", borderRadius: 20, display: "inline-block", marginBottom: 8 }}>{tag}</span>}
      <div style={{ fontSize: 14, fontWeight: 700, color: DARK, marginBottom: 7, fontFamily: "Georgia, serif" }}>{title}</div>
      <div style={{ fontSize: 13, color: "#555", lineHeight: 1.7 }}>{text}</div>
    </div>
  );
}

export default function LandingPage({ onStart }) {
  const [showSignup,   setShowSignup]   = useState(false);
  const [signupResult, setSignupResult] = useState(null);
  const [scrolled,     setScrolled]     = useState(false);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  if (signupResult) {
    return (
      <div style={{ minHeight: "100vh", background: CREAM, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Georgia, serif", padding: 24 }}>
        <div style={{ background: "#fff", borderRadius: 20, padding: "52px 44px", maxWidth: 480, width: "100%", textAlign: "center", boxShadow: "0 8px 48px rgba(200,130,10,0.1)", border: "1px solid rgba(200,130,10,0.12)" }}>
          <PTIcon size={52} />
          <h1 style={{ fontSize: 26, fontWeight: 700, color: DARK, margin: "20px 0 8px" }}>You're in.</h1>
          <p style={{ fontSize: 14, color: "#555", marginBottom: 24, lineHeight: 1.7 }}>
            <strong style={{ color: DARK }}>{signupResult.business_name}</strong> is on ProfitTrack.<br />Your <strong>14-day free trial</strong> has started.
          </p>
          <div style={{ background: "#FDF8F0", border: "1px solid rgba(200,130,10,0.18)", borderRadius: 12, padding: "16px 20px", marginBottom: 28, textAlign: "left" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: AMBER, marginBottom: 8 }}>Your login</div>
            <div style={{ fontSize: 14, color: DARK }}>Username: <strong style={{ fontFamily: "monospace", fontSize: 13 }}>{signupResult.username}</strong></div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 6 }}>Save this — you'll need it to log in</div>
          </div>
          <button onClick={onStart} style={{ ...btnAmber, width: "100%", fontSize: 15, padding: "14px 0" }}>Open my dashboard →</button>
          <div style={{ fontSize: 11, color: "#bbb", marginTop: 14 }}>
            Trial ends {new Date(signupResult.trial_ends_at).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>
      </div>
    );
  }

  if (showSignup) return <SignupPage onSignupSuccess={d => { setSignupResult(d); setShowSignup(false); }} onBack={() => setShowSignup(false)} />;

  return (
    <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", background: CREAM, color: DARK, overflowX: "hidden" }}>

      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 200, background: scrolled ? "rgba(249,245,238,0.96)" : CREAM, backdropFilter: "blur(12px)", borderBottom: scrolled ? "1px solid rgba(200,130,10,0.12)" : "1px solid transparent", padding: "0 40px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", transition: "all 0.3s" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <PTIcon size={30} />
          <span style={{ fontWeight: 700, fontSize: 15, color: DARK }}>ProfitTrack</span>
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {[["How it works", "#how"], ["Features", "#features"], ["Pricing", "#pricing"], ["FAQ", "#faq"]].map(([l, h]) => (
            <a key={l} href={h} style={navLink}>{l}</a>
          ))}
          <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" style={{ ...navLink, color: "#128C7E" }}>WhatsApp</a>
          <button onClick={onStart} style={navLoginBtn}>Login</button>
          <button onClick={() => setShowSignup(true)} style={{ ...btnAmber, padding: "8px 18px" }}>Start free trial</button>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: "90px 40px 70px", maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "center" }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(200,130,10,0.09)", border: "1px solid rgba(200,130,10,0.18)", borderRadius: 40, padding: "5px 14px", marginBottom: 26 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: AMBER, display: "inline-block" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: AMBER, letterSpacing: "0.07em", textTransform: "uppercase" }}>Built for Nigerian retail · 2026</span>
          </div>
          <h1 style={{ fontSize: "clamp(30px, 4vw, 50px)", fontWeight: 700, lineHeight: 1.15, marginBottom: 18, color: DARK }}>
            Stop losing money.<br /><span style={{ color: AMBER }}>Take full control</span><br />of your shop.
          </h1>
          <p style={{ fontSize: 16, color: "#555", lineHeight: 1.85, marginBottom: 30, maxWidth: 460 }}>
            Track every sale. Monitor your staff. Manage inventory across branches.
            Get a WhatsApp report every night — all from one system.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            <button onClick={() => setShowSignup(true)} style={{ ...btnAmber, fontSize: 14, padding: "13px 26px" }}>Start 14-day free trial →</button>
            <a href={DEMO_URL} target="_blank" rel="noreferrer" style={{ ...btnOutline, fontSize: 13, padding: "13px 22px" }}>📱 Request a demo</a>
          </div>
          <p style={{ fontSize: 12, color: "#aaa" }}>No credit card required · Setup in 5 minutes · Cancel anytime</p>
        </div>

        {/* Dashboard mockup */}
        <div style={{ position: "relative" }}>
          <div style={{ background: "#151515", borderRadius: 16, overflow: "hidden", border: "1px solid rgba(200,130,10,0.18)", boxShadow: "0 24px 80px rgba(0,0,0,0.22), 0 0 0 1px rgba(200,130,10,0.08)", aspectRatio: "4/3" }}>
            <div style={{ background: "#1a1a1a", padding: "9px 16px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <PTIcon size={18} />
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>ProfitTrack POS</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                {["#ff5f57","#febc2e","#28c840"].map(c => <div key={c} style={{ width: 9, height: 9, borderRadius: "50%", background: c }} />)}
              </div>
            </div>
            <div style={{ padding: 18, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[["Today's revenue","₦94,500","▲",true],["Transactions","7","▲",true],["Gross profit","₦41,200","▼",false]].map(([l,v,arrow,up],i) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 9, padding: "11px 12px", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5, fontFamily: "monospace" }}>{l}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{v}</div>
                  <div style={{ fontSize: 8, color: up ? "#4ade80" : "#f87171", marginTop: 3 }}>{arrow} vs yesterday</div>
                </div>
              ))}
            </div>
            <div style={{ padding: "0 18px 14px", display: "flex", alignItems: "flex-end", gap: 3, height: 70 }}>
              {[40,65,50,80,55,90,70].map((h,i) => (
                <div key={i} style={{ flex: 1, height: `${h}%`, background: i===5 ? AMBER : "rgba(200,130,10,0.28)", borderRadius: "3px 3px 0 0" }} />
              ))}
            </div>
            <div style={{ padding: "0 18px", display: "flex", flexDirection: "column", gap: 1 }}>
              {["Men Vintage Shirt × 3 — ₦12,500","Denim Jacket × 1 — ₦8,000","Sports Bra × 2 — ₦5,400"].map((item,i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 9px", background: "rgba(255,255,255,0.03)", borderRadius: 5, fontSize: 9, color: "rgba(255,255,255,0.5)", fontFamily: "monospace" }}>
                  <span>{item.split(" — ")[0]}</span><span style={{ color: AMBER }}>{item.split(" — ")[1]}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ position: "absolute", bottom: -18, left: -18, background: "#fff", borderRadius: 12, padding: "10px 14px", boxShadow: "0 6px 28px rgba(0,0,0,0.1)", border: "1px solid rgba(200,130,10,0.12)", display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ fontSize: 20 }}>📱</span>
            <div><div style={{ fontSize: 10, fontWeight: 700, color: DARK }}>WhatsApp report sent</div><div style={{ fontSize: 9, color: "#aaa" }}>Every night at 8PM automatically</div></div>
          </div>
        </div>
      </section>

      {/* Pain strip */}
      <section style={{ background: DARK, padding: "44px 40px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <p style={{ textAlign: "center", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: AMBER, marginBottom: 22 }}>Sound familiar?</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1 }}>
            {[["😤","Staff selling items off-record and pocketing cash"],["😰","No visibility of what's happening when you're away"],["📦","Stock levels you can never trust or verify"],["🗑️","Expired products quietly destroying your profit"]].map(([icon,text],i) => (
              <div key={i} style={{ padding: "22px 18px", background: "rgba(255,255,255,0.04)", textAlign: "center" }}>
                <div style={{ fontSize: 26, marginBottom: 9 }}>{icon}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.65 }}>{text}</div>
              </div>
            ))}
          </div>
          <p style={{ textAlign: "center", marginTop: 26, fontSize: 15, color: "#fff", fontWeight: 600 }}>
            This is not a staff problem. <span style={{ color: AMBER }}>It's a system problem.</span> ProfitTrack is the system.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section style={{ background: CREAM2, padding: "52px 40px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
          {[{n:14,s:" days",l:"Free trial — no card"},{n:30,s:" min",l:"Average setup time"},{n:99,s:"%",l:"Uptime target"},{n:5,s:" min",l:"Time to first sale"}].map((s,i) => (
            <div key={i} style={{ textAlign: "center", padding: "18px 8px", borderRight: i<3 ? "1px solid rgba(200,130,10,0.12)" : "none" }}>
              <div style={{ fontSize: 34, fontWeight: 700, color: AMBER, fontFamily: "Georgia, serif" }}><Counter target={s.n} suffix={s.s} /></div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" style={{ padding: "78px 40px", maxWidth: 1100, margin: "0 auto" }}>
        <p style={sL}>How it works</p>
        <h2 style={sH}>Up and running in 30 minutes</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2, marginTop: 44, border: "1px solid rgba(200,130,10,0.1)", borderRadius: 16, overflow: "hidden" }}>
          {[
            {n:"01",title:"Register your business",desc:"Visit profittrack.ng, choose your plan, fill in your business details. Your account and first branch are created in under 2 minutes. No paperwork, no waiting."},
            {n:"02",title:"Add products & staff",desc:"Import your product catalog from Excel or add products one by one. Create staff accounts with the right roles — cashier, manager, or admin. Set reorder levels."},
            {n:"03",title:"Start selling",desc:"Open the POS, scan a barcode, select a payment method, complete the sale. PDF receipt generated instantly. Stock updated automatically. Report sent tonight."},
          ].map((s,i) => (
            <div key={i} style={{ padding: "34px 30px", background: i===1 ? DARK : "#fff", borderRight: i<2 ? "1px solid rgba(200,130,10,0.08)" : "none" }}>
              <div style={{ fontSize: 44, fontWeight: 700, color: i===1 ? "rgba(200,130,10,0.25)" : "rgba(200,130,10,0.13)", fontFamily: "Georgia, serif", marginBottom: 14, lineHeight: 1 }}>{s.n}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: i===1 ? "#fff" : DARK, marginBottom: 9, fontFamily: "Georgia, serif" }}>{s.title}</div>
              <div style={{ fontSize: 13, color: i===1 ? "rgba(255,255,255,0.5)" : "#666", lineHeight: 1.8 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Videos */}
      <section style={{ background: DARK, padding: "78px 40px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <p style={{ ...sL, color: AMBER }}>See it in action</p>
          <h2 style={{ ...sH, color: "#fff" }}>Watch ProfitTrack work</h2>
          <p style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 44 }}>Video tutorials coming soon — request a live WhatsApp demo anytime.</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <VideoPlaceholder title="Making your first sale" desc="POS checkout · barcode scanning · payment methods · PDF receipt" />
            <VideoPlaceholder title="Setting up inventory" desc="Adding products · bulk import · receive stock · reorder alerts" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <VideoPlaceholder title="Analytics dashboard" desc="Revenue trends · peak hours · best sellers" />
            <VideoPlaceholder title="WhatsApp daily reports" desc="What you receive every night at 8PM" />
            <VideoPlaceholder title="Staff & branch management" desc="Roles · permissions · multi-branch" />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{ padding: "78px 40px", maxWidth: 1100, margin: "0 auto" }}>
        <p style={sL}>Features</p>
        <h2 style={sH}>Everything your shop needs</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 44 }}>
          <FeatureCard icon="🧾" title="Fast POS checkout" tag="All plans" text="Scan barcodes, add products, complete sales in seconds. Cash, transfer, card, or credit. Branded PDF invoice generated instantly." />
          <FeatureCard icon="👁️" title="Staff accountability" tag="All plans" text="Every sale, refund, and edit is recorded with the cashier's name and time. Full audit log that cannot be deleted or edited." />
          <FeatureCard icon="📦" title="Inventory management" tag="All plans" text="Real-time stock levels. Low stock alerts. Batch expiry tracking. Receive stock via barcode scanner. Bulk import from Excel." />
          <FeatureCard icon="📊" title="Analytics dashboard" tag="Business+" text="Revenue trends, peak hours, best sellers by margin, dead stock alerts, cashier performance. Actionable business intelligence." />
          <FeatureCard icon="💬" title="WhatsApp daily report" tag="Business+" text="Every night at 8PM: sales, profit, top products, low stock, expiry warnings. Sent to your phone automatically. No login needed." />
          <FeatureCard icon="🏢" title="Multi-branch" tag="Business+" text="Manage multiple locations from one dashboard. Each branch has its own inventory, staff, and sales history. Switch instantly." />
          <FeatureCard icon="🎁" title="Customer loyalty" tag="Starter+" text="Earn points on every purchase. Redeem at checkout with automatic discount. WhatsApp notification when points are earned." />
          <FeatureCard icon="💸" title="Expense tracking" tag="Starter+" text="Log operating expenses by category. Compare against revenue. See your true net profit — not just your sales figure." />
          <FeatureCard icon="🤝" title="Credit management" tag="Starter+" text="Set credit limits for trusted customers. Track outstanding balances. WhatsApp reminders when payments are due." />
        </div>
      </section>

      {/* WhatsApp preview */}
      <section style={{ background: CREAM2, padding: "78px 40px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "center" }}>
          <div>
            <p style={sL}>WhatsApp daily report</p>
            <h2 style={{ ...sH, textAlign: "left", fontSize: 26 }}>Know your numbers before you sleep</h2>
            <p style={{ fontSize: 14, color: "#555", lineHeight: 1.85, marginTop: 14, marginBottom: 24 }}>
              Every night at 8PM Lagos time, ProfitTrack automatically sends you a complete business summary on WhatsApp. No app, no login, no effort. Just the numbers.
            </p>
            {["Sales and profit for the day","Top selling products by units","Low stock alerts with quantities","Expiry warnings for perishable items","Outstanding credit balances"].map((item,i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#444", marginBottom: 10 }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(200,130,10,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 9, color: AMBER, fontWeight: 700 }}>✓</span>
                </div>
                {item}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{ background: "#DCF8C6", borderRadius: "4px 16px 16px 16px", padding: "18px 20px", maxWidth: 300, boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
              {[
                {b:true,t:"📊 Daily Sales Report — WEAR HAUS"},{t:"📅 Friday, 1 May 2026"},{sp:true},
                {b:true,t:"💰 Total Sales: ₦94,500.00"},{t:"🧾 Transactions: 7"},{t:"📈 Profit: ₦41,200.00"},{sp:true},
                {b:true,t:"🏆 Top Products:"},{t:"  1. Men Vintage Shirt — 9 units"},{t:"  2. Denim Jacket — 2 units"},{sp:true},
                {b:true,t:"⚠️ Low Stock:"},{t:"  • Sports Bra: 2 remaining"},{sp:true},
                {sm:true,t:"Sent automatically by ProfitTrack"},
              ].map((l,i) => l.sp ? <div key={i} style={{ height: 7 }} /> :
                <div key={i} style={{ fontSize: l.sm?10:12, color: l.sm?"#aaa":"#1a1a1a", fontWeight: l.b?600:400, lineHeight: 1.75, fontStyle: l.sm?"italic":"normal", fontFamily: l.sm?"monospace":"Georgia, serif" }}>{l.t}</div>)}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={{ padding: "78px 40px", maxWidth: 1100, margin: "0 auto" }}>
        <p style={sL}>Pricing</p>
        <h2 style={sH}>Simple, honest pricing</h2>
        <p style={{ textAlign: "center", color: "#666", fontSize: 14, maxWidth: 500, margin: "10px auto 12px", lineHeight: 1.7 }}>Most shops lose ₦20,000–₦100,000 monthly from untracked sales. ProfitTrack pays for itself within weeks.</p>
        <p style={{ textAlign: "center", fontSize: 13, color: AMBER, fontWeight: 600, marginBottom: 44 }}>14-day free trial on all plans. No credit card required.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", border: "1px solid rgba(200,130,10,0.14)", borderRadius: 16, overflow: "hidden" }}>
          {[
            {name:"Solo",price:"₦5,000",per:"/mo",annual:"₦50,000/yr",bg:"#fff",features:["1 branch","1 admin user","Full POS checkout","Inventory tracking","Sales history","Reports"]},
            {name:"Starter",price:"₦12,000",per:"/mo",annual:"₦120,000/yr",bg:"#fff",features:["1 branch","3 staff accounts","Everything in Solo","Expense tracking","Loyalty programme","Credit management","Bulk import"]},
            {name:"Business",price:"₦25,000",per:"/mo",annual:"₦250,000/yr",bg:DARK,hot:true,features:["3 branches","10 staff accounts","Everything in Starter","Analytics dashboard","WhatsApp reports","Multi-branch management"]},
            {name:"Enterprise",price:"₦50,000",per:"/mo",annual:"₦500,000/yr",bg:"#fff",features:["Unlimited branches","Unlimited staff","Everything in Business","White-label branding","Custom invoice design","Priority support"]},
          ].map((plan,i) => (
            <div key={i} style={{ background: plan.bg, padding: "30px 22px", position: "relative", borderRight: i<3 ? "1px solid rgba(200,130,10,0.1)" : "none" }}>
              {plan.hot && <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", background: AMBER, color: "#fff", fontSize: 9, fontWeight: 700, padding: "3px 12px", borderRadius: "0 0 7px 7px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Most popular</div>}
              <div style={{ fontSize: 13, fontWeight: 700, color: plan.hot?"#fff":DARK, marginBottom: 7, fontFamily: "Georgia, serif" }}>{plan.name}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: AMBER, lineHeight: 1 }}>{plan.price}<span style={{ fontSize: 11, color: plan.hot?"rgba(255,255,255,0.4)":"#bbb", fontWeight: 400 }}>{plan.per}</span></div>
              <div style={{ fontSize: 10, color: plan.hot?"rgba(255,255,255,0.4)":"#bbb", marginTop: 3, marginBottom: 18 }}>{plan.annual}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 22 }}>
                {plan.features.map((f,j) => (
                  <div key={j} style={{ fontSize: 12, color: plan.hot?"rgba(255,255,255,0.65)":"#555", display: "flex", alignItems: "flex-start", gap: 5, lineHeight: 1.4 }}>
                    <span style={{ color: AMBER, flexShrink: 0, fontSize: 10, marginTop: 1 }}>✓</span>{f}
                  </div>
                ))}
              </div>
              <button onClick={() => setShowSignup(true)} style={{ width: "100%", padding: "9px 0", borderRadius: 8, border: plan.hot ? "none" : `1px solid ${AMBER}`, background: plan.hot ? AMBER : "transparent", color: plan.hot ? "#fff" : AMBER, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Georgia, serif" }}>
                Start free trial
              </button>
            </div>
          ))}
        </div>
        <p style={{ textAlign: "center", fontSize: 11, color: "#bbb", marginTop: 14 }}>Annual plans save 2 months (≈17%). Prices in Nigerian Naira. Auto-renews — cancel anytime from Plan & Billing.</p>
      </section>

      {/* Resources */}
      <section style={{ background: DARK, padding: "78px 40px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <p style={{ ...sL, color: AMBER }}>Resources</p>
          <h2 style={{ ...sH, color: "#fff" }}>Everything you need to get started</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 44 }}>
            {[
              {icon:"📖",title:"Getting started guide",desc:"From registration to your first sale in 30 minutes. Step-by-step walkthrough.",link:null,label:"Coming soon"},
              {icon:"🖥️",title:"Hardware guide",desc:"Recommended barcode scanners, receipt printers, and counter setups for Nigerian retail.",link:null,label:"Coming soon"},
              {icon:"💳",title:"Plan comparison",desc:"Detailed side-by-side breakdown of what each plan includes and who it's for.",link:"#pricing",label:"View pricing ↓"},
              {icon:"🔒",title:"Security & privacy",desc:"How we protect your data: encryption, access control, NDPR compliance, audit logs.",link:null,label:"Coming soon"},
              {icon:"📱",title:"Video tutorials",desc:"Short screen recordings of each major feature. Making a sale, inventory, analytics.",link:DEMO_URL,label:"Request demo →",ext:true},
              {icon:"💬",title:"WhatsApp support",desc:"Talk to a real person. Monday–Saturday, 9AM–6PM Lagos time. Fast responses guaranteed.",link:WHATSAPP_URL,label:"Chat now →",ext:true},
            ].map((r,i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 13, padding: "22px 20px" }}>
                <div style={{ fontSize: 26, marginBottom: 10 }}>{r.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 6, fontFamily: "Georgia, serif" }}>{r.title}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.7, marginBottom: 14 }}>{r.desc}</div>
                {r.link
                  ? <a href={r.link} target={r.ext?"_blank":"_self"} rel="noreferrer" style={{ fontSize: 12, color: AMBER, fontWeight: 600, textDecoration: "none" }}>{r.label}</a>
                  : <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>{r.label}</span>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={{ padding: "78px 40px", maxWidth: 740, margin: "0 auto" }}>
        <p style={sL}>FAQ</p>
        <h2 style={sH}>Common questions</h2>
        <div style={{ marginTop: 36 }}>
          {[
            {q:"Do I need a Paystack account to use ProfitTrack?",a:"No. Paystack is only used to process your subscription payment to ProfitTrack. Your customers pay you using your existing methods — cash, bank transfer, or your bank's POS terminal. You don't need a Paystack account."},
            {q:"What happens after my 14-day free trial?",a:"You'll be prompted to add payment details to continue. Your data is never deleted immediately — access is suspended until you subscribe. If you don't subscribe, data is kept for 30 days after trial expiry then permanently deleted."},
            {q:"Can I change my plan after subscribing?",a:"Yes. Upgrades take effect immediately and you are charged the full new plan price right away. Downgrades are scheduled for your next renewal date — your current plan continues until then. Manage this from Plan & Billing in the app."},
            {q:"Does the system work without internet?",a:"Yes. ProfitTrack has offline mode for cash and transfer sales. If your internet drops, sales queue automatically and sync when connectivity returns. Reports, analytics, and credit sales require an internet connection."},
            {q:"How does the WhatsApp daily report work?",a:"Available on Business and Enterprise plans. Every night at 8PM Lagos time, ProfitTrack sends a complete daily summary to your registered phone number on WhatsApp. No setup required — it just works automatically."},
            {q:"Can I install ProfitTrack on my phone?",a:"Yes. On Android, open profittrack.ng in Chrome and tap the install icon in the address bar. It installs like a native app with its own home screen icon, full-screen mode, and offline support."},
            {q:"What hardware do I need?",a:"Any device with a browser. For a full POS setup, a USB barcode scanner (₦10,000–₦25,000) and a thermal receipt printer add a lot of efficiency. Hardware is optional — you can run the system on just a phone or laptop."},
            {q:"Is my business data safe?",a:"Yes. All data is encrypted in transit (TLS 1.2+) and at rest (AES-256). Passwords are hashed using bcrypt. Each business's data is completely isolated from other businesses. We are NDPR-compliant with full audit logs of every action."},
            {q:"What is your refund policy?",a:"No refunds after payment. The 14-day free trial exists specifically for evaluation — use it fully before subscribing. In exceptional circumstances within 48 hours of payment, contact us and we'll review your case."},
            {q:"How do I get support?",a:"WhatsApp is fastest — +234 815 458 6355, Monday–Saturday 9AM–6PM Lagos time. Email: profittrackng@gmail.com. For urgent issues, WhatsApp is monitored outside business hours."},
          ].map((item,i) => <FAQItem key={i} {...item} />)}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: DARK, padding: "78px 40px", textAlign: "center" }}>
        <PTIcon size={44} />
        <h2 style={{ fontSize: 34, fontWeight: 700, color: "#fff", margin: "22px 0 10px", fontFamily: "Georgia, serif" }}>Ready to take control?</h2>
        <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, marginBottom: 34 }}>14 days free. No credit card. Setup in 5 minutes.</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => setShowSignup(true)} style={{ ...btnAmber, fontSize: 15, padding: "14px 30px" }}>Start free trial today →</button>
          <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" style={{ padding: "14px 26px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "#fff", fontSize: 14, textDecoration: "none", display: "inline-block", fontFamily: "Georgia, serif" }}>📱 WhatsApp: 08154586355</a>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: "#0a0a0a", padding: "40px 40px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 40, marginBottom: 36 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
                <PTIcon size={26} />
                <span style={{ fontWeight: 700, fontSize: 14, color: "#fff", fontFamily: "Georgia, serif" }}>ProfitTrack</span>
              </div>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", lineHeight: 1.8, maxWidth: 260 }}>Point-of-sale and business management software built for Nigerian retail.</p>
              <div style={{ marginTop: 14, fontSize: 12, color: "rgba(255,255,255,0.3)", lineHeight: 2 }}>
                📧 profittrackng@gmail.com<br />📱 +234 815 458 6355<br />🌐 profittrack.ng
              </div>
            </div>
            <div>
              <div style={fH}>Product</div>
              {[["Features","#features"],["Pricing","#pricing"],["How it works","#how"],["FAQ","#faq"]].map(([l,h]) => <a key={l} href={h} style={fL}>{l}</a>)}
            </div>
            <div>
              <div style={fH}>Resources</div>
              {[["Getting started",DEMO_URL,true],["Hardware guide",DEMO_URL,true],["Video tutorials",DEMO_URL,true],["WhatsApp support",WHATSAPP_URL,true]].map(([l,h,e]) => <a key={l} href={h} target={e?"_blank":"_self"} rel="noreferrer" style={fL}>{l}</a>)}
            </div>
            <div>
              <div style={fH}>Legal</div>
              {[["Privacy Policy",DEMO_URL,true],["Terms of Service",DEMO_URL,true],["Security Overview",DEMO_URL,true]].map(([l,h,e]) => <a key={l} href={h} target={e?"_blank":"_self"} rel="noreferrer" style={fL}>{l}</a>)}
            </div>
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 22, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>© {new Date().getFullYear()} ProfitTrack. All rights reserved. Built for Nigerian retail.</span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.15)" }}>profittrack.ng · NDPR compliant</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

const btnAmber   = { padding: "9px 20px", borderRadius: 10, border: "none", background: AMBER, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "Georgia, serif" };
const btnOutline = { padding: "9px 20px", borderRadius: 10, border: `1.5px solid ${AMBER}`, background: "transparent", color: AMBER, fontSize: 13, fontWeight: 600, cursor: "pointer", textDecoration: "none", display: "inline-block", fontFamily: "Georgia, serif" };
const navLink    = { fontSize: 13, color: "#555", textDecoration: "none", padding: "5px 9px", borderRadius: 6, fontFamily: "Georgia, serif" };
const navLoginBtn = { padding: "7px 15px", borderRadius: 8, border: "1px solid rgba(200,130,10,0.25)", background: "transparent", color: AMBER, fontSize: 12, cursor: "pointer", fontFamily: "Georgia, serif" };
const sL = { fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: AMBER, textAlign: "center", marginBottom: 10 };
const sH = { fontSize: "clamp(20px, 3vw, 32px)", fontWeight: 700, textAlign: "center", marginBottom: 0, color: DARK, fontFamily: "Georgia, serif" };
const fH = { fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.35)", marginBottom: 12 };
const fL = { display: "block", fontSize: 12, color: "rgba(255,255,255,0.35)", textDecoration: "none", marginBottom: 8 };
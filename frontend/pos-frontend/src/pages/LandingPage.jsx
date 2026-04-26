export default function LandingPage({ onStart }) {

  return (
    <div style={pageStyle}>
      
      {/* NAV */}
      <nav style={navStyle}>
        <h2 style={{ margin: 0 }}>ProfitTrack</h2>
        <button style={navBtn} onClick={onStart}>
          Login
        </button>
      </nav>

      {/* HERO */}
      <section style={heroStyle}>
        <h1 style={heroTitle}>
          Run your business smarter with <span style={{ color: "#185FA5" }}>ProfitTrack POS</span>
        </h1>
        <p style={heroText}>
          Track sales, manage inventory, monitor staff, and grow your business — all in one simple system.
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button style={primaryBtn} onClick={onStart}>
            Get Started
          </button>
          <button style={secondaryBtn}>
            Request Demo
          </button>
        </div>
      </section>

      {/* FEATURES */}
      <section style={sectionStyle}>
        <h2 style={sectionTitle}>Everything you need to run your store</h2>

        <div style={grid}>
          <Feature title="📊 Sales Tracking" text="Monitor daily revenue and transactions in real-time." />
          <Feature title="📦 Inventory Control" text="Know exactly what’s in stock across branches." />
          <Feature title="👥 Staff Management" text="Track cashier performance and accountability." />
          <Feature title="📈 Reports & Insights" text="Understand profit, trends, and growth opportunities." />
          <Feature title="🏪 Multi-Branch Ready" text="Manage multiple store locations from one dashboard." />
          <Feature title="🔐 Secure & Reliable" text="Your data is protected and always accessible." />
        </div>
      </section>

      {/* VALUE */}
      <section style={valueSection}>
        <h2 style={sectionTitle}>Built for Nigerian businesses</h2>
        <p style={{ maxWidth: 600, textAlign: "center", color: "#555", margin: "0 auto" }}>
          Whether you run a supermarket, pharmacy, or retail store, ProfitTrack helps you reduce losses,
          increase profit, and stay in control — even with multiple branches.
        </p>
      </section>

      {/* CTA */}
      <section style={ctaSection}>
        <h2 style={{ marginBottom: 10 }}>Start managing your business better today</h2>
        <button style={primaryBtn} onClick={onStart}>
          Start Now
        </button>
      </section>

      {/* FOOTER */}
      <footer style={footer}>
        <span>© {new Date().getFullYear()} ProfitTrack POS</span>
      </footer>
    </div>
  );
}


// ---------------- COMPONENTS ----------------

function Feature({ title, text }) {
  return (
    <div style={card}>
      <h4 style={{ marginBottom: 6 }}>{title}</h4>
      <p style={{ fontSize: 13, color: "#555" }}>{text}</p>
    </div>
  );
}


// ---------------- STYLES ----------------

const pageStyle = {
  fontFamily: "system-ui",
  background: "#F8FAFC",
};

const navStyle = {
  display: "flex",
  justifyContent: "space-between",
  padding: "16px 40px",
  background: "#fff",
  borderBottom: "1px solid #eee",
};

const navBtn = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  background: "#185FA5",
  color: "#fff",
  cursor: "pointer",
};

const heroStyle = {
  textAlign: "center",
  padding: "80px 20px",
};

const heroTitle = {
  fontSize: 36,
  maxWidth: 700,
  margin: "0 auto",
};

const heroText = {
  marginTop: 14,
  color: "#555",
  maxWidth: 500,
  marginInline: "auto",
};

const primaryBtn = {
  padding: "12px 20px",
  borderRadius: 10,
  border: "none",
  background: "#185FA5",
  color: "#fff",
  fontSize: 14,
  cursor: "pointer",
};

const secondaryBtn = {
  padding: "12px 20px",
  borderRadius: 10,
  border: "1px solid #ccc",
  background: "#fff",
  cursor: "pointer",
};

const sectionStyle = {
  padding: "60px 40px",
  textAlign: "center",
};

const sectionTitle = {
  fontSize: 24,
  marginBottom: 30,
};

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 20,
};

const card = {
  background: "#fff",
  padding: 20,
  borderRadius: 12,
  border: "1px solid #eee",
};

const valueSection = {
  padding: "60px 20px",
  textAlign: "center",
};

const ctaSection = {
  textAlign: "center",
  padding: "60px 20px",
  background: "#185FA5",
  color: "#fff",
};

const footer = {
  textAlign: "center",
  padding: 20,
  fontSize: 12,
  color: "#777",
};
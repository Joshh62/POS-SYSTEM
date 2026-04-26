import { useState } from "react";
import { login } from "../api/api";

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!username || !password) {
      setError("Please enter your username and password.");
      return;
    }

    setLoading(true);
    setError(null);

    try {

      const data = await login(username, password);

      localStorage.setItem("token", data.access_token);
      localStorage.setItem("user", JSON.stringify(data.user));

      console.log("LOGIN DATA:", data);

      window.location.reload();


    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSubmit();
  };

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 30, marginBottom: 6 }}>📊</div>
          <h1 style={titleStyle}>ProfitTrack POS</h1>
          <p style={subtitleStyle}>Sign in to continue</p>
        </div>

        {/* Error */}
        {error && <div style={errorBox}>{error}</div>}

        {/* Username */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter username"
            autoFocus
            style={inputStyle}
          />
        </div>

        {/* Password */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter password"
            style={inputStyle}
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            ...buttonStyle,
            background: loading
              ? "var(--color-surface)"
              : "var(--color-primary)",
            color: loading
              ? "var(--color-text-secondary)"
              : "#fff",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>

      </div>
    </div>
  );
}

/* =========================
   STYLES (BRANDED)
========================= */

const pageStyle = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--bg)",
};

const cardStyle = {
  background: "var(--surface)",
  borderRadius: 16,
  padding: "36px 32px",
  width: "100%",
  maxWidth: 380,
  border: "1px solid var(--border)",
  boxShadow: "var(--shadow)",
};

const titleStyle = {
  fontSize: 20,
  fontWeight: 600,
  color: "var(--text-h)",
  margin: 0,
};

const subtitleStyle = {
  fontSize: 13,
  color: "var(--text)",
  marginTop: 4,
};

const errorBox = {
  background: "var(--error-bg)",
  color: "var(--error-text)",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 13,
  marginBottom: 16,
};

const labelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 500,
  color: "var(--text)",
  marginBottom: 6,
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text-h)",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

const buttonStyle = {
  width: "100%",
  padding: "12px 0",
  borderRadius: 10,
  border: "none",
  fontSize: 15,
  fontWeight: 500,
  transition: "all 0.2s ease",
};
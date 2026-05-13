import { useState } from "react";
import { login } from "../api/api";

const ICON = "data:image/png;base64,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";

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
          <img src={ICON} alt="ProfitTrack" style={{ width: 64, height: 64, borderRadius: 16, marginBottom: 10, display: "block", margin: "0 auto 10px" }} />
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
            background: loading ? "var(--color-surface)" : "var(--color-primary)",
            color: loading ? "var(--color-text-secondary)" : "#fff",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </div>
    </div>
  );
}

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
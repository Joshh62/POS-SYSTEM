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

      // Store token for api.js interceptor to pick up
      localStorage.setItem("token", data.access_token);

      // Decode payload to store user info (role, branch_id etc.)
      const payload = JSON.parse(atob(data.access_token.split(".")[1]));
      localStorage.setItem(
        "user",
        JSON.stringify({
          username: payload.sub,
          user_id: payload.user_id,
          role: payload.role,
        })
      );

      onLogin(); // notify App.jsx that login succeeded

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
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-background-tertiary)",
      }}
    >
      <div
        style={{
          background: "var(--color-background-primary)",
          borderRadius: 16,
          padding: "36px 32px",
          width: "100%",
          maxWidth: 380,
          border: "1px solid var(--color-border-tertiary)",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>🏪</div>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>
            POS System
          </h1>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 }}>
            Sign in to continue
          </p>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              background: "#FCEBEB",
              color: "#A32D2D",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

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
            width: "100%",
            padding: "12px 0",
            borderRadius: 10,
            border: "none",
            background: loading ? "var(--color-background-secondary)" : "#185FA5",
            color: loading ? "var(--color-text-tertiary)" : "#E6F1FB",
            fontSize: 15,
            fontWeight: 500,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </div>
    </div>
  );
}

const labelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 500,
  color: "var(--color-text-secondary)",
  marginBottom: 6,
};

const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--color-border-secondary)",
  background: "var(--color-background-primary)",
  color: "var(--color-text-primary)",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};
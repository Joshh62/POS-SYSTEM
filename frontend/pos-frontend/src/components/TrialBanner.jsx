import { useState, useEffect } from "react";
import api from "../api/api";

export default function TrialBanner({ onUpgrade }) {
  const [info,       setInfo]       = useState(null);
  const [dismissed,  setDismissed]  = useState(false);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get("/payments/subscription");
        setInfo(res.data);
      } catch { /* silent */ }
    };
    fetch();
    // Re-fetch when user returns to tab after payment
    const onFocus = () => fetch();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  if (!info)      return null;
  if (dismissed)  return null;

  const { trial_active, trial_days_left, subscription_status } = info;

  // Only show for trial or past_due
  if (!trial_active && subscription_status !== "past_due") return null;

  const isPastDue = subscription_status === "past_due";

  const bg      = isPastDue ? "#A32D2D" : trial_days_left <= 3 ? "#854F0B" : "#854F0B";
  const bgLight = isPastDue ? "#FCEBEB" : "#FAEEDA";
  const color   = isPastDue ? "#A32D2D" : "#854F0B";

  const message = isPastDue
    ? "⚠️ Your last payment failed. Please update your payment method to avoid service interruption."
    : trial_days_left === 0
      ? "⏰ Your free trial expires today."
      : `⏰ ${trial_days_left} day${trial_days_left !== 1 ? "s" : ""} left in your free trial.`;

  return (
    <div style={{
      background: bgLight,
      borderBottom: `1px solid ${color}30`,
      padding: "8px 20px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      flexShrink: 0,
    }}>
      <div style={{ fontSize: 12, color, fontWeight: 500, flex: 1 }}>
        {message}
        {!isPastDue && (
          <span style={{ color: "#666", fontWeight: 400, marginLeft: 8 }}>
            Add payment details to continue after trial.
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          onClick={onUpgrade}
          style={{
            padding: "5px 14px", borderRadius: 7, border: "none",
            background: color, color: "#fff",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {isPastDue ? "Update payment" : "Upgrade now"}
        </button>
        {!isPastDue && trial_days_left > 3 && (
          <button
            onClick={() => setDismissed(true)}
            style={{ background: "none", border: "none", color, fontSize: 16, cursor: "pointer", padding: "0 4px", lineHeight: 1 }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
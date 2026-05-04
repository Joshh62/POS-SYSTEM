// src/context/FeatureContext.jsx
//
// Fetches and provides feature flags for the logged-in user's business.
// Every component that needs to check a flag uses the useFeature() hook.
//
// Usage:
//   const { isEnabled } = useFeature();
//   if (!isEnabled("expiry_tracking")) return null;

import { createContext, useContext, useState, useEffect } from "react";
import api from "../api/api";

const FeatureContext = createContext(null);

// All features default to true so the UI never breaks if the API is slow
const FEATURE_DEFAULTS = {
  expiry_tracking:  true,
  loyalty_program:  true,
  debt_tracking:    true,
  whatsapp_reports: true,
  expense_tracking: true,
  bulk_import:      true,
  multi_branch:     true,
  reports:          true,
  inventory:        true,
};

export function FeatureProvider({ children }) {
  const [features, setFeatures] = useState(FEATURE_DEFAULTS);
  const [loaded, setLoaded]     = useState(false);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");

    // Superadmin always gets everything
    if (user.role === "superadmin") {
      setFeatures(FEATURE_DEFAULTS);
      setLoaded(true);
      return;
    }

    // Only fetch if logged in
    if (!user.user_id) {
      setLoaded(true);
      return;
    }

    api.get("/businesses/my/features")
      .then(res => {
        // Merge with defaults so any missing key still defaults to true
        setFeatures({ ...FEATURE_DEFAULTS, ...res.data });
      })
      .catch(() => {
        // On error keep defaults — never lock user out due to API failure
        setFeatures(FEATURE_DEFAULTS);
      })
      .finally(() => setLoaded(true));
  }, []);

  const isEnabled = (flag) => {
    return features[flag] !== false; // missing key = enabled
  };

  return (
    <FeatureContext.Provider value={{ features, isEnabled, loaded }}>
      {children}
    </FeatureContext.Provider>
  );
}

export function useFeature() {
  const ctx = useContext(FeatureContext);
  if (!ctx) throw new Error("useFeature must be inside <FeatureProvider>");
  return ctx;
}
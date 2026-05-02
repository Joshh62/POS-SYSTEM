import { createContext, useContext, useState, useEffect } from "react";
import api from "../api/api";

const BranchContext = createContext(null);

export function BranchProvider({ children }) {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const role = user.role || "cashier";

  // ── On mount: enforce correct activeBranchId for non-admin roles ──────────
  // If a manager or cashier logs in after an admin was using Branch 2,
  // localStorage may still have activeBranchId=2 which would cause 403 errors.
  // Always reset non-admin users to their own branch_id.
  const getInitialBranchId = () => {
    if (["admin", "superadmin"].includes(role)) {
      // Admin: use stored value or fall back to their own branch
      const stored = localStorage.getItem("activeBranchId");
      return stored ? parseInt(stored) : (user.branch_id || null);
    }
    // Manager/cashier: always locked to their own branch
    if (user.branch_id) {
      localStorage.setItem("activeBranchId", user.branch_id);
    } else {
      localStorage.removeItem("activeBranchId");
    }
    return user.branch_id || null;
  };

  const [branches, setBranches]                = useState([]);
  const [activeBranchId, setActiveBranchIdRaw] = useState(getInitialBranchId);

  // Keep localStorage in sync so api.js can read it without React context
  const setActiveBranchId = (id) => {
    setActiveBranchIdRaw(id);
    if (id) localStorage.setItem("activeBranchId", id);
    else     localStorage.removeItem("activeBranchId");
  };

  // Load branches for admin/superadmin so they can switch
  useEffect(() => {
    if (!["admin", "superadmin"].includes(role)) return;

    const load = async () => {
      try {
        if (role === "superadmin") {
          const res = await api.get("/businesses/");
          const all = [];
          for (const biz of res.data) {
            const br = await api.get(`/businesses/${biz.business_id}/branches`);
            br.data.forEach(b => all.push({ ...b, business_name: biz.name }));
          }
          setBranches(all);
        } else {
          // admin: load branches for their business
          const res = await api.get(`/businesses/${user.business_id}/branches`);
          setBranches(res.data);
          // Default to their own branch if no active branch set
          if (!activeBranchId) setActiveBranchId(user.branch_id);
        }
      } catch (err) {
        console.error("[BranchContext] Failed to load branches:", err);
      }
    };

    load();
  }, [role]);

  return (
    <BranchContext.Provider value={{ activeBranchId, setActiveBranchId, branches, role }}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranch must be inside <BranchProvider>");
  return ctx;
}
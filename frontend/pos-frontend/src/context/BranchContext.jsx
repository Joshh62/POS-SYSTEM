import { createContext, useContext, useState, useEffect } from "react";
import api from "../api/api";

const BranchContext = createContext(null);

export function BranchProvider({ children }) {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const role = user.role || "cashier";

  // Non-admin users are always locked to their own branch
  const [branches, setBranches]           = useState([]);
  const [activeBranchId, setActiveBranchIdRaw] = useState(
    role === "superadmin" ? null : (user.branch_id || null)
  );

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
          // superadmin fetches all branches across all businesses
          const res = await api.get("/businesses/");
          const all = [];
          for (const biz of res.data) {
            const br = await api.get(`/businesses/${biz.business_id}/branches`);
            br.data.forEach(b => all.push({ ...b, business_name: biz.name }));
          }
          setBranches(all);
        } else {
          // admin fetches branches for their business
          const res = await api.get(`/businesses/${user.business_id}/branches`);
          setBranches(res.data);
          // default to their own branch
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
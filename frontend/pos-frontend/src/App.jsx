import { useState, useEffect } from "react";
import api from "./api/api";
import { CartProvider }   from "./context/CartContext";
import { BranchProvider } from "./context/BranchContext";
import POSLayout          from "./components/layout/POSLayout";
import SplashScreen       from "./components/SplashScreen";

import LandingPage          from "./pages/LandingPage";
import LoginPage            from "./pages/LoginPage";
import DocsPage             from "./pages/DocsPage";
import POS                  from "./pages/POS";
import DashboardPage        from "./pages/DashboardPage";
import InventoryPage        from "./pages/InventoryPage";
import UsersPage            from "./pages/UsersPage";
import ProductsPage         from "./pages/ProductsPage";
import SalesPage            from "./pages/SalesPage";
import ReportsPage          from "./pages/ReportsPage";
import BusinessesPage       from "./pages/BusinessesPage";
import ProductImportPage    from "./pages/ProductImportPage";
import ExpensesPage         from "./pages/ExpensesPage";
import CustomersPage        from "./pages/CustomersPage";
import SuppliersPage        from "./pages/SuppliersPage";
import AnalyticsPage        from "./pages/AnalyticsPage";
import BusinessSettingsPage from "./pages/BusinessSettingsPage";
import PricingPage          from "./pages/PricingPage";

import TrialBanner from "./components/TrialBanner";

// ── Public route check — /docs loads before auth logic ───────────────────────
const IS_DOCS_ROUTE = window.location.pathname === "/docs";

export default function App() {
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 1200);
    return () => clearTimeout(t);
  }, []);

  // If an existing session expires while the browser remains signed in,
  // route it to billing instead of leaving the user on a blocked POS screen.
  useEffect(() => {
    if (!localStorage.getItem("token")) return;
    api.get("/payments/subscription")
      .then(({ data }) => {
        if (data.subscription_status === "expired") setActivePage("billing");
      })
      .catch(() => {});
  }, []);

  // Paystack hosted checkout returns a reference in the callback URL.
  // Verify it server-side, then return the customer to the billing screen.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference") || params.get("trxref");
    if (params.get("payment") !== "success" || !reference || !localStorage.getItem("token")) return;
    setActivePage("billing");
    api.get(`/payments/verify/${encodeURIComponent(reference)}`)
      .then(() => { window.history.replaceState({}, "", window.location.pathname); })
      .catch(() => { /* Billing page remains available for retry/support. */ });
  }, []);

  const [isLoggedIn, setIsLoggedIn] = useState(() => !!localStorage.getItem("token"));

  const [view, setView] = useState(() => {
    if (localStorage.getItem("token")) return "app";
    return "landing";
  });

  const [activePage, setActivePage] = useState("pos");
  const [lastScan,   setLastScan]   = useState(null);

  const handleLogin = (initialPage) => {
    setIsLoggedIn(true);
    setView("app");
    setActivePage(initialPage === "billing" ? "billing" : "pos");
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("activeBranchId");
    setIsLoggedIn(false);
    setView("login");
  };

  // ── Public route — no auth needed ────────────────────────────────────────
  if (IS_DOCS_ROUTE) return <DocsPage />;

  if (booting)            return <SplashScreen />;
  if (view === "landing") return <LandingPage onStart={() => setView("login")} />;
  if (!isLoggedIn)        return <LoginPage onLogin={handleLogin} />;

  const renderPage = () => {
    switch (activePage) {
      case "pos":        return <POS onScanResult={setLastScan} />;
      case "dashboard":  return <DashboardPage />;
      case "products":   return <ProductsPage />;
      case "sales":      return <SalesPage />;
      case "inventory":  return <InventoryPage />;
      case "reports":    return <ReportsPage />;
      case "users":      return <UsersPage />;
      case "businesses": return <BusinessesPage />;
      case "expenses":   return <ExpensesPage />;
      case "customers":  return <CustomersPage />;
      case "suppliers":  return <SuppliersPage />;
      case "analytics":  return <AnalyticsPage />;
      case "settings":   return <BusinessSettingsPage />;
      case "billing":    return <PricingPage />;
      default:           return <POS onScanResult={setLastScan} />;
    }
  };

  return (
    <BranchProvider>
      <CartProvider>
        <POSLayout
          activePage={activePage}
          onNavigate={setActivePage}
          onLogout={handleLogout}
          lastScan={lastScan}
        >
          <TrialBanner onUpgrade={() => setActivePage("billing")} />
          {renderPage()}
        </POSLayout>
      </CartProvider>
    </BranchProvider>
  );
}
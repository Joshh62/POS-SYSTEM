import { useState, useEffect } from "react";
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

  const [isLoggedIn, setIsLoggedIn] = useState(() => !!localStorage.getItem("token"));

  const [view, setView] = useState(() => {
    if (localStorage.getItem("token")) return "app";
    return "landing";
  });

  const [activePage, setActivePage] = useState("pos");
  const [lastScan,   setLastScan]   = useState(null);

  const handleLogin = () => {
    setIsLoggedIn(true);
    setView("app");
    setActivePage("pos");
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
import { useState } from "react";
import { CartProvider } from "./context/CartContext";
import { BranchProvider } from "./context/BranchContext";
import POSLayout from "./components/layout/POSLayout";

import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";

import POS from "./pages/POS";
import DashboardPage from "./pages/DashboardPage";
import InventoryPage from "./pages/InventoryPage";
import UsersPage from "./pages/UsersPage";
import ProductsPage from "./pages/ProductsPage";
import SalesPage from "./pages/SalesPage";
import ReportsPage from "./pages/ReportsPage";
import BusinessesPage from "./pages/BusinessesPage";
import ProductImportPage from "./pages/ProductImportPage";

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!localStorage.getItem("token"));

  // ✅ Fix: if already logged in on mount, skip landing and go straight to app
  const [view, setView] = useState(() => {
    if (localStorage.getItem("token")) return "app";
    return "landing";
  });

  const [activePage, setActivePage] = useState("pos");
  const [lastScan, setLastScan] = useState(null);

  const handleLogin = () => {
    setIsLoggedIn(true);
    setView("app");
    setActivePage("pos");
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setIsLoggedIn(false);
    setView("login");
  };

  // Landing page — only shown to users who have never logged in this session
  if (view === "landing") {
    return <LandingPage onStart={() => setView("login")} />;
  }

  // Login page
  if (!isLoggedIn) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // Main app
  const renderPage = () => {
    switch (activePage) {
      case "pos":       return <POS onScanResult={setLastScan} />;
      case "dashboard": return <DashboardPage />;
      case "products":  return <ProductsPage />;
      case "sales":     return <SalesPage />;
      case "inventory": return <InventoryPage />;
      case "reports":   return <ReportsPage />;
      case "users":     return <UsersPage />;
      case "businesses":  return <BusinessesPage />;
      case "import":      return <ProductImportPage />;
      default:          return <POS onScanResult={setLastScan} />;
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
          {renderPage()}
        </POSLayout>
      </CartProvider>
    </BranchProvider>
  );
}
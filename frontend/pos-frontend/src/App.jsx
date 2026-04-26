import { useState } from "react";
import { CartProvider } from "./context/CartContext";
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

export default function App() {

  const [isLoggedIn, setIsLoggedIn] = useState(() => !!localStorage.getItem("token"));

  // NEW: controls flow
  const [view, setView] = useState("landing"); // "landing" | "login" | "app"

  const [activePage, setActivePage] = useState("pos");
  const [lastScan, setLastScan] = useState(null);

  // LOGIN
  const handleLogin = () => {
    setIsLoggedIn(true);
    setView("app");
    setActivePage("pos");
  };

  // LOGOUT
  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setIsLoggedIn(false);
    setView("login");
  };

  // ----------- FLOW CONTROL -----------

  // Landing page first
  if (view === "landing") {
    return <LandingPage onStart={() => setView("login")} />;
  }

  // Login page
  if (!isLoggedIn) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // ----------- MAIN APP -----------

  const renderPage = () => {
    switch (activePage) {
      case "pos":       return <POS onScanResult={setLastScan} />;
      case "dashboard": return <DashboardPage />;
      case "products":  return <ProductsPage />;
      case "sales":     return <SalesPage />;
      case "inventory": return <InventoryPage />;
      case "reports":   return <ReportsPage />;
      case "users":     return <UsersPage />;
      default:          return <POS onScanResult={setLastScan} />;
    }
  };

  return (
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
  );
}
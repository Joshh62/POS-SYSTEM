import { useState } from "react";
import { CartProvider } from "./context/CartContext";
import POSLayout from "./components/layout/POSLayout";
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
  const [activePage, setActivePage] = useState("pos");

  const handleLogin  = () => { setIsLoggedIn(true); setActivePage("pos"); };
  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setIsLoggedIn(false);
  };

  if (!isLoggedIn) return <LoginPage onLogin={handleLogin} />;

  const renderPage = () => {
    switch (activePage) {
      case "pos":       return <POS />;
      case "dashboard": return <DashboardPage />;
      case "products":  return <ProductsPage />;
      case "sales":     return <SalesPage />;
      case "inventory": return <InventoryPage />;
      case "reports":   return <ReportsPage />;
      case "users":     return <UsersPage />;
      default:          return <POS />;
    }
  };

  return (
    <CartProvider>
      <POSLayout activePage={activePage} onNavigate={setActivePage} onLogout={handleLogout}>
        {renderPage()}
      </POSLayout>
    </CartProvider>
  );
}
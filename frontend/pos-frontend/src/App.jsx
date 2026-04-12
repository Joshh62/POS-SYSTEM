import { useState } from "react";
import { CartProvider } from "./context/CartContext";
import POSLayout from "./components/layout/POSLayout";
import LoginPage from "./pages/LoginPage";
import POS from "./pages/POS";
import DashboardPage from "./pages/DashboardPage";
import InventoryPage from "./pages/InventoryPage";
import UsersPage from "./pages/UsersPage";

export default function App() {
  // Check if a token already exists in localStorage on load
  const [isLoggedIn, setIsLoggedIn] = useState(
    () => !!localStorage.getItem("token")
  );
  const [activePage, setActivePage] = useState("pos");

  const handleLogin = () => {
    setIsLoggedIn(true);
    setActivePage("pos");
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setIsLoggedIn(false);
  };

  if (!isLoggedIn) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const renderPage = () => {
    switch (activePage) {
      case "pos":       return <POS />;
      case "dashboard": return <DashboardPage />;
      case "inventory": return <InventoryPage />;
      case "users":     return <UsersPage />;
      default:          return <POS />;
    }
  };

  return (
    <CartProvider>
      <POSLayout
        activePage={activePage}
        onNavigate={setActivePage}
        onLogout={handleLogout}
      >
        {renderPage()}
      </POSLayout>
    </CartProvider>
  );
}
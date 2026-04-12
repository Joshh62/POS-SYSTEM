import { createContext, useContext, useState, useCallback } from "react";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState([]);

  // Add product to cart — if already exists, increment quantity
  const addToCart = useCallback((product) => {
    setCartItems((prev) => {
      const existing = prev.find((item) => item.product_id === product.product_id);

      if (existing) {
        return prev.map((item) =>
          item.product_id === product.product_id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [
        ...prev,
        {
          product_id: product.product_id,
          product_name: product.product_name,
          selling_price: parseFloat(product.selling_price),
          quantity: 1,
        },
      ];
    });
  }, []);

  // Remove a product from cart entirely
  const removeFromCart = useCallback((productId) => {
    setCartItems((prev) => prev.filter((item) => item.product_id !== productId));
  }, []);

  // Set a specific quantity — removes if quantity reaches 0
  const updateQuantity = useCallback((productId, quantity) => {
    if (quantity <= 0) {
      setCartItems((prev) => prev.filter((item) => item.product_id !== productId));
      return;
    }
    setCartItems((prev) =>
      prev.map((item) =>
        item.product_id === productId ? { ...item, quantity } : item
      )
    );
  }, []);

  // Clear entire cart (called after successful sale)
  const clearCart = useCallback(() => {
    setCartItems([]);
  }, []);

  // Derived values
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const totalAmount = cartItems.reduce(
    (sum, item) => sum + item.selling_price * item.quantity,
    0
  );

  // Format cart for the sales API payload
  const getCartPayload = () =>
    cartItems.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
    }));

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        totalItems,
        totalAmount,
        getCartPayload,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

// Custom hook — use this in every component that needs cart access
export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used inside <CartProvider>");
  }
  return context;
}
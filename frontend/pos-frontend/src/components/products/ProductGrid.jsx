import { useState, useEffect, useCallback } from "react";
import { getProducts } from "../../api/api";
import ProductCard from "./ProductCard";

export default function ProductGrid() {
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const LIMIT = 20;

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getProducts(page, LIMIT, search);
      // Backend returns { total_products, page, limit, data: [...] }
      setProducts(result.data);
      setTotal(result.total_products);
    } catch (err) {
      setError("Failed to load products. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Debounce search — only fires 400ms after user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 10 }}>
      {/* Search bar */}
      <input
        type="text"
        placeholder="Search products..."
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid var(--color-border-secondary)",
          background: "var(--color-background-primary)",
          color: "var(--color-text-primary)",
          fontSize: 14,
          outline: "none",
          width: "100%",
        }}
      />

      {/* State messages */}
      {loading && (
        <div style={{ color: "var(--color-text-secondary)", fontSize: 13, textAlign: "center", padding: 20 }}>
          Loading products...
        </div>
      )}

      {error && (
        <div style={{ color: "#A32D2D", fontSize: 13, padding: "10px 12px", background: "#FCEBEB", borderRadius: 8 }}>
          {error}
        </div>
      )}

      {!loading && !error && products.length === 0 && (
        <div style={{ color: "var(--color-text-secondary)", fontSize: 13, textAlign: "center", padding: 20 }}>
          No products found.
        </div>
      )}

      {/* Product grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          gap: 10,
          overflowY: "auto",
          flex: 1,
          paddingRight: 2,
        }}
      >
        {products.map((product) => (
          <ProductCard key={product.product_id} product={product} />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", paddingTop: 4 }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={paginationBtn(page === 1)}
          >
            ← Prev
          </button>

          <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
            {page} / {totalPages}
          </span>

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={paginationBtn(page === totalPages)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

function paginationBtn(disabled) {
  return {
    padding: "5px 12px",
    borderRadius: 6,
    border: "1px solid var(--color-border-secondary)",
    background: disabled ? "var(--color-background-secondary)" : "var(--color-background-primary)",
    color: disabled ? "var(--color-text-tertiary)" : "var(--color-text-primary)",
    fontSize: 12,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}
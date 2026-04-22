import { useState, useEffect, useCallback } from "react";
import { getProducts } from "../../api/api";
import ProductCard from "./ProductCard";

export default function ProductGrid({ externalSearch = false }) {
  const [products, setProducts] = useState([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  const LIMIT = 20;

  // Listen for POS search
  useEffect(() => {
    if (!externalSearch) return;
    const handler = (e) => {
      setSearchInput(e.detail);
      setPage(1);
    };
    window.addEventListener("pos-search", handler);
    return () => window.removeEventListener("pos-search", handler);
  }, [externalSearch]);

  // Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getProducts(page, LIMIT, search);
      setProducts(result.data);
      setTotal(result.total);
    } catch {
      setError("Failed to load products.");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 12 }}>

      {/* Search (if standalone) */}
      {!externalSearch && (
        <input
          type="text"
          placeholder="Search products..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{
            padding: "9px 12px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text)",
            fontSize: 14,
            outline: "none",
            width: "100%",
          }}
        />
      )}

      {/* Loading */}
      {loading && (
        <div style={{
          color: "var(--text)",
          fontSize: 13,
          textAlign: "center",
          padding: 20,
        }}>
          Loading products...
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          background: "var(--error-bg)",
          color: "var(--error-text)",
          padding: "10px 12px",
          borderRadius: 8,
          fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && products.length === 0 && (
        <div style={{
          color: "var(--text)",
          fontSize: 13,
          textAlign: "center",
          padding: 20,
        }}>
          No products found.
        </div>
      )}

      {/* GRID */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", // 🔥 better spacing
        gap: 12,
        overflowY: "auto",
        flex: 1,
        paddingRight: 4,
        alignContent: "start",
      }}>
        {products.map((product) => (
          <ProductCard key={product.product_id} product={product} />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          justifyContent: "center",
          paddingTop: 6
        }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={paginationBtn(page === 1)}
          >
            ← Prev
          </button>

          <span style={{ fontSize: 12, color: "var(--text)" }}>
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
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: disabled ? "var(--bg)" : "var(--surface)",
    color: "var(--text)",
    fontSize: 12,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}
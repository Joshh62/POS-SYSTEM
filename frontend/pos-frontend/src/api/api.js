import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 35000,  // ✅ increased from 10s → 35s to survive Render cold starts (can take 30s)
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/";
    }
    return Promise.reject(error);
  }
);

// ── Retry helper ──────────────────────────────────────────────────────────────
// Retries a failed request once after a short delay.
// Handles Render cold-start: first request times out, server is now warm,
// second request succeeds.
const withRetry = async (fn, retries = 1, delayMs = 2000) => {
  try {
    return await fn();
  } catch (err) {
    // Only retry on network timeout / no response (not on 4xx/5xx errors)
    if (retries > 0 && !err.response) {
      await new Promise(r => setTimeout(r, delayMs));
      return withRetry(fn, retries - 1, delayMs);
    }
    throw err;
  }
};

// ── AUTH ──────────────────────────────────────────────────────────────────────
export const login = async (username, password) => {
  const formData = new URLSearchParams();
  formData.append("username", username);
  formData.append("password", password);
  const res = await api.post("/auth/login", formData, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return res.data;
};

export const register = async (userData) => (await api.post("/auth/register", userData)).data;

// ── PRODUCTS ──────────────────────────────────────────────────────────────────
export const getProducts = async (page = 1, limit = 20, search = "") => {
  const params = { page, limit };
  if (search) params.search = search;
  // ✅ wrapped in withRetry — fixes intermittent "No products found" on POS page
  return withRetry(() => api.get("/products/", { params }).then(r => r.data));
};

export const getProductByBarcode = async (barcode) =>
  (await api.get(`/products/barcode/${barcode}`)).data;

export const createProduct = async (data) => (await api.post("/products/", data)).data;

export const updateProduct = async (id, data) => (await api.put(`/products/${id}`, data)).data;

// ── CATEGORIES ────────────────────────────────────────────────────────────────
export const getCategories = async () => (await api.get("/categories/")).data;
export const createCategory = async (data) => (await api.post("/categories/", data)).data;

// ── SALES ─────────────────────────────────────────────────────────────────────
export const createSale  = async (data) => (await api.post("/sales/", data)).data;
export const getReceipt  = async (id)   => (await api.get(`/sales/${id}/receipt`)).data;
export const refundSale  = async (id, reason) =>
  (await api.post(`/sales/${id}/refund`, null, { params: { reason } })).data;
export const getInvoiceUrl = (saleId) => `${BASE_URL}/sales/${saleId}/invoice`;

// ── CUSTOMERS ─────────────────────────────────────────────────────────────────
export const getCustomers     = async () => (await api.get("/customers/")).data;
export const createCustomer   = async (data) => (await api.post("/customers/", data)).data;
export const getCustomerSales = async (id) => (await api.get(`/customers/${id}/sales`)).data;

// ── INVENTORY ─────────────────────────────────────────────────────────────────
export const getInventory = async (branchId = null) => {
  const params = branchId ? { branch_id: branchId } : {};
  return (await api.get("/inventory/", { params })).data;
};
export const restockProduct = async (data) => (await api.post("/inventory/restock", data)).data;
export const getLowStock    = async (threshold = 5, branchId = null) => {
  const params = { threshold };
  if (branchId) params.branch_id = branchId;
  return (await api.get("/inventory/low-stock", { params })).data;
};

// ── SUPPLIERS ─────────────────────────────────────────────────────────────────
export const getSuppliers    = async () => (await api.get("/suppliers/")).data;
export const createSupplier  = async (data) => (await api.post("/suppliers/", data)).data;

// ── PURCHASE ORDERS ───────────────────────────────────────────────────────────
export const getPurchaseOrders    = async () => (await api.get("/purchases/")).data;
export const createPurchaseOrder  = async (data) => (await api.post("/purchases/", data)).data;
export const receivePurchaseOrder = async (id) => (await api.post(`/purchases/${id}/receive`)).data;

// ── REPORTS ───────────────────────────────────────────────────────────────────
export const getDashboard      = async () => (await api.get("/reports/dashboard")).data;
export const getDailyDashboard = async () => (await api.get("/reports/daily-dashboard")).data;
export const getTopProducts    = async () => (await api.get("/reports/top-products")).data;
export const getSalesSummary   = async () => (await api.get("/reports/sales-summary")).data;
export const getSalesByCashier = async () => (await api.get("/reports/sales-by-cashier")).data;
export const getProfitReport   = async () => (await api.get("/reports/profit")).data;
export const getStockValuation = async () => (await api.get("/reports/stock-valuation")).data;
export const getAuditLogs      = async () => (await api.get("/reports/audit-logs")).data;

export default api;
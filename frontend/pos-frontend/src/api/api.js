import axios from "axios";

// ------------------------------------
// BASE URL
// Reads from .env.production in production
// Falls back to localhost in development
// ------------------------------------
const BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Global response error handler
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

// ------------------------------------
// AUTH
// ------------------------------------
export const login = async (username, password) => {
  const formData = new URLSearchParams();
  formData.append("username", username);
  formData.append("password", password);
  const response = await api.post("/auth/login", formData, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return response.data;
};

export const register = async (userData) => {
  const response = await api.post("/auth/register", userData);
  return response.data;
};

// ------------------------------------
// PRODUCTS
// ------------------------------------
export const getProducts = async (page = 1, limit = 20, search = "") => {
  const params = { page, limit };
  if (search) params.search = search;
  const response = await api.get("/products/", { params });
  return response.data;
};

export const getProductByBarcode = async (barcode) => {
  const response = await api.get(`/products/barcode/${barcode}`);
  return response.data;
};

export const createProduct = async (productData) => {
  const response = await api.post("/products/", productData);
  return response.data;
};

export const updateProduct = async (productId, productData) => {
  const response = await api.put(`/products/${productId}`, productData);
  return response.data;
};

// ------------------------------------
// CATEGORIES
// ------------------------------------
export const getCategories = async () => {
  const response = await api.get("/categories/");
  return response.data;
};

export const createCategory = async (categoryData) => {
  const response = await api.post("/categories/", categoryData);
  return response.data;
};

// ------------------------------------
// SALES
// ------------------------------------
export const createSale = async (saleData) => {
  const response = await api.post("/sales/", saleData);
  return response.data;
};

export const getReceipt = async (saleId) => {
  const response = await api.get(`/sales/${saleId}/receipt`);
  return response.data;
};

export const refundSale = async (saleId, reason) => {
  const response = await api.post(`/sales/${saleId}/refund`, null, {
    params: { reason },
  });
  return response.data;
};

export const getInvoiceUrl = (saleId) => {
  const token = localStorage.getItem("token");
  return `${BASE_URL}/sales/${saleId}/invoice?token=${token}`;
};

// ------------------------------------
// CUSTOMERS
// ------------------------------------
export const getCustomers = async () => {
  const response = await api.get("/customers/");
  return response.data;
};

export const createCustomer = async (customerData) => {
  const response = await api.post("/customers/", customerData);
  return response.data;
};

export const getCustomerSales = async (customerId) => {
  const response = await api.get(`/customers/${customerId}/sales`);
  return response.data;
};

// ------------------------------------
// INVENTORY
// ------------------------------------
export const getInventory = async (branchId = null) => {
  const params = branchId ? { branch_id: branchId } : {};
  const response = await api.get("/inventory/", { params });
  return response.data;
};

export const restockProduct = async (restockData) => {
  const response = await api.post("/inventory/restock", restockData);
  return response.data;
};

export const getLowStock = async (threshold = 5, branchId = null) => {
  const params = { threshold };
  if (branchId) params.branch_id = branchId;
  const response = await api.get("/inventory/low-stock", { params });
  return response.data;
};

// ------------------------------------
// SUPPLIERS
// ------------------------------------
export const getSuppliers = async () => {
  const response = await api.get("/suppliers/");
  return response.data;
};

export const createSupplier = async (supplierData) => {
  const response = await api.post("/suppliers/", supplierData);
  return response.data;
};

// ------------------------------------
// PURCHASE ORDERS
// ------------------------------------
export const createPurchaseOrder = async (poData) => {
  const response = await api.post("/purchases/", poData);
  return response.data;
};

export const receivePurchaseOrder = async (poId) => {
  const response = await api.post(`/purchases/${poId}/receive`);
  return response.data;
};

export const getPurchaseOrders = async () => {
  const response = await api.get("/purchases/");
  return response.data;
};

// ------------------------------------
// REPORTS
// ------------------------------------
export const getDashboard = async () => {
  const response = await api.get("/reports/dashboard");
  return response.data;
};

export const getDailyDashboard = async () => {
  const response = await api.get("/reports/daily-dashboard");
  return response.data;
};

export const getTopProducts = async () => {
  const response = await api.get("/reports/top-products");
  return response.data;
};

export const getSalesSummary = async () => {
  const response = await api.get("/reports/sales-summary");
  return response.data;
};

export const getSalesByCashier = async () => {
  const response = await api.get("/reports/sales-by-cashier");
  return response.data;
};

export const getProfitReport = async () => {
  const response = await api.get("/reports/profit");
  return response.data;
};

export const getStockValuation = async () => {
  const response = await api.get("/reports/stock-valuation");
  return response.data;
};

export const getAuditLogs = async () => {
  const response = await api.get("/reports/audit-logs");
  return response.data;
};

export default api;
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { insertUserSchema, insertCompanySchema, insertMarketplaceIntegrationSchema, insertWarehouseSchema, insertProductSchema } from "@shared/schema";
import { z } from "zod";
import crypto from "crypto";
import { syncYandexMarketStocksForCompany } from "./sync/yandex-market-stocks";
import { syncOzonStocksForCompany } from "./sync/ozon-stocks";
import { syncWildberriesStocksForCompany } from "./sync/wildberries-stocks";
import { syncWBSuppliesForCompany } from "./sync/wildberries-supplies";
import { syncThreeplStocksForCompany } from "./sync/threepl-stocks";

// Helper function to calculate volume and cargo size
function calculateProductDimensions(lengthCm: number, widthCm: number, heightCm: number, weightKg: number) {
  // Calculate volume in cubic meters
  const volumeM3 = (lengthCm * widthCm * heightCm) / 1000000; // Convert cm³ to m³
  
  // Calculate cargo size based on dimensions and weight
  let cargoSize: string;
  
  // Check for XL first (any dimension > 200cm OR weight > 50kg)
  if (lengthCm > 200 || widthCm > 200 || heightCm > 200 || weightKg > 50) {
    cargoSize = "XL";
  }
  // Check for M (≤60×40×30cm & ≤15kg)
  else if (lengthCm <= 60 && widthCm <= 40 && heightCm <= 30 && weightKg <= 15) {
    cargoSize = "M";
  }
  // Check for S (≤120×80×50cm & ≤30kg)
  else if (lengthCm <= 120 && widthCm <= 80 && heightCm <= 50 && weightKg <= 30) {
    cargoSize = "S";
  }
  // Otherwise L (>120×80×50cm & ≤50kg)
  else {
    cargoSize = "L";
  }
  
  return {
    skuVolumeM3: volumeM3,
    skuCargoSize: cargoSize
  };
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET env variable is required");
}

// Middleware to verify JWT token
const authenticateToken = async (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const user = await storage.getUser(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    // If user record has no companyId, resolve from junction table
    if (!user.companyId) {
      const companies = await storage.getUserCompanies(user.id);
      if (companies.length > 0) {
        user.companyId = companies[0].id;
      }
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid token' });
  }
};

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Auth routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, name } = req.body;
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user without company initially
      const user = await storage.createUser({
        email,
        password: hashedPassword,
        name,
        role: "admin",
        companyId: null,
      });

      // Generate JWT token
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          companyId: user.companyId,
        },
        company: null,
        token,
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const company = user.companyId ? await storage.getCompany(user.companyId) : null;

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          companyId: user.companyId,
        },
        company,
        token,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Protected routes
  app.get("/api/auth/me", authenticateToken, async (req: any, res) => {
    try {
      // Get the user's companies and determine current company
      const userCompanies = await storage.getUserCompanies(req.user.id);
      
      // If user has companies, use the first one as default (or from session if implemented)
      // For now, we'll use the user's companyId if it exists, otherwise the first available company
      let currentCompany = null;
      if (req.user.companyId) {
        currentCompany = await storage.getCompany(req.user.companyId);
      } else if (userCompanies.length > 0) {
        currentCompany = userCompanies[0];
      }
      
      res.json({
        user: {
          id: req.user.id,
          email: req.user.email,
          name: req.user.name,
          role: req.user.role,
          companyId: currentCompany?.id || null,
        },
        company: currentCompany,
      });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/change-password", authenticateToken, async (req: any, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current password and new password are required" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters long" });
      }

      // Verify current password
      const validPassword = await bcrypt.compare(currentPassword, req.user.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      // Check if new password is the same as current password
      if (currentPassword === newPassword) {
        return res.status(400).json({ message: "New password cannot be the same as current password" });
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);

      // Update user password
      const updatedUser = await storage.updateUser(req.user.id, { password: hashedNewPassword });

      if (!updatedUser) {
        return res.status(500).json({ message: "Failed to update password" });
      }

      res.json({ message: "Password changed successfully" });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Yandex OAuth SSO
  app.get("/api/auth/yandex", (req, res) => {
    const clientId = process.env.YANDEX_CLIENT_ID;
    if (!clientId) {
      return res.status(500).send("Yandex OAuth not configured (YANDEX_CLIENT_ID missing)");
    }
    const appUrl = process.env.APP_URL || `http://${req.headers.host}`;
    const redirectUri = `${appUrl}/api/auth/yandex/callback`;
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
    });
    res.redirect(`https://oauth.yandex.ru/authorize?${params}`);
  });

  app.get("/api/auth/yandex/callback", async (req, res) => {
    try {
      const { code, error } = req.query as Record<string, string>;
      const appUrl = process.env.APP_URL || `http://${req.headers.host}`;

      if (error || !code) {
        return res.redirect(`/?error=${encodeURIComponent(error || "oauth_failed")}`);
      }

      const clientId = process.env.YANDEX_CLIENT_ID!;
      const clientSecret = process.env.YANDEX_CLIENT_SECRET!;
      const redirectUri = `${appUrl}/api/auth/yandex/callback`;

      // Exchange code for Yandex access token
      const tokenRes = await fetch("https://oauth.yandex.ru/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
        }),
      });
      const tokenData = await tokenRes.json() as any;

      if (!tokenData.access_token) {
        return res.redirect("/?error=token_exchange_failed");
      }

      // Fetch Yandex user info
      const infoRes = await fetch("https://login.yandex.ru/info?format=json", {
        headers: { Authorization: `OAuth ${tokenData.access_token}` },
      });
      const yandexUser = await infoRes.json() as any;

      const yandexId = String(yandexUser.id);
      const email = String(yandexUser.default_email || "").toLowerCase().trim();
      const name = yandexUser.real_name || yandexUser.display_name || yandexUser.login;
      const avatarUrl = yandexUser.default_avatar_id
        ? `https://avatars.yandex.net/get-yapic/${yandexUser.default_avatar_id}/islands-200`
        : null;

      // Find or create user
      let user = await storage.getUserByYandexId(yandexId);
      if (!user) {
        user = await storage.getUserByEmail(email);
        if (user) {
          await storage.updateUser(user.id, { yandexId, ...(avatarUrl && { avatarUrl }) });
          user = (await storage.getUser(user.id))!;
        } else {
          user = await storage.createUser({
            email, name, password: crypto.randomUUID(), yandexId, role: "user",
            ...(avatarUrl && { avatarUrl }),
          });
        }
      } else if (avatarUrl && user.avatarUrl !== avatarUrl) {
        await storage.updateUser(user.id, { avatarUrl });
        user = (await storage.getUser(user.id))!;
      }

      // Resolve companyId from junction table if not on user record
      if (!user.companyId) {
        const companies = await storage.getUserCompanies(user.id);
        if (companies.length > 0) {
          user = { ...user, companyId: companies[0].id };
        }
      }

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
      res.redirect(`/auth/callback?token=${token}`);
    } catch (error) {
      console.error("Yandex OAuth error:", error);
      res.redirect("/?error=oauth_error");
    }
  });

  // Public config for frontend (non-secret values)
  app.get("/api/auth/config", (req, res) => {
    const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
    res.json({
      yandexClientId: process.env.YANDEX_CLIENT_ID || "",
      yandexTokenPageOrigin: appUrl,
      yandexRedirectUri: `${appUrl}/yandex-suggest-token.html`,
    });
  });

  // Validate Yandex access_token from SDK (implicit flow) and return our JWT
  app.post("/api/auth/yandex/token", async (req, res) => {
    try {
      const { access_token } = req.body;
      if (!access_token) {
        return res.status(400).json({ message: "access_token is required" });
      }

      const infoRes = await fetch("https://login.yandex.ru/info?format=json", {
        headers: { Authorization: `OAuth ${access_token}` },
      });
      if (!infoRes.ok) {
        return res.status(401).json({ message: "Invalid Yandex token" });
      }
      const yandexUser = await infoRes.json() as any;

      const yandexId = String(yandexUser.id);
      const email = String(yandexUser.default_email || "").toLowerCase().trim();
      const name = yandexUser.real_name || yandexUser.display_name || yandexUser.login;
      const avatarUrl = yandexUser.default_avatar_id
        ? `https://avatars.yandex.net/get-yapic/${yandexUser.default_avatar_id}/islands-200`
        : null;

      let user = await storage.getUserByYandexId(yandexId);
      if (!user) {
        user = await storage.getUserByEmail(email);
        if (user) {
          await storage.updateUser(user.id, { yandexId, ...(avatarUrl && { avatarUrl }) });
          user = (await storage.getUser(user.id))!;
        } else {
          user = await storage.createUser({
            email,
            name,
            password: crypto.randomUUID(),
            yandexId,
            role: "user",
            ...(avatarUrl && { avatarUrl }),
          });
        }
      } else if (avatarUrl && user.avatarUrl !== avatarUrl) {
        await storage.updateUser(user.id, { avatarUrl });
        user = (await storage.getUser(user.id))!;
      }

      if (!user.companyId) {
        const companies = await storage.getUserCompanies(user.id);
        if (companies.length > 0) {
          user = { ...user, companyId: companies[0].id };
        }
      }

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
      res.json({ token });
    } catch (error) {
      console.error("Yandex token auth error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Company routes
  app.get("/api/companies/user", authenticateToken, async (req: any, res) => {
    try {
      const companies = await storage.getUserCompanies(req.user.id);
      res.json(companies);
    } catch (error) {
      console.error("Get user companies error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/companies/switch", authenticateToken, async (req: any, res) => {
    try {
      const { companyId } = req.body;
      
      if (!companyId) {
        return res.status(400).json({ message: "Company ID is required" });
      }

      // Check if user has access to this company
      const userCompanies = await storage.getUserCompanies(req.user.id);
      const hasAccess = userCompanies.some(company => company.id === companyId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this company" });
      }

      // Update user's current company
      const updatedUser = await storage.updateUser(req.user.id, { companyId });
      
      if (!updatedUser) {
        return res.status(500).json({ message: "Failed to switch company" });
      }

      const company = await storage.getCompany(companyId);
      
      res.json({
        message: "Company switched successfully",
        company,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          role: updatedUser.role,
          companyId: updatedUser.companyId,
        }
      });
    } catch (error) {
      console.error("Switch company error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/companies/create", authenticateToken, async (req: any, res) => {
    try {
      const { name } = req.body;

      if (!name) {
        return res.status(400).json({ message: "Company name is required" });
      }

      const company = await storage.createCompanyWithOwner({
        name,
        subscriptionTier: "enterprise",
        subscriptionStatus: "active",
        maxSku: 999999,
        currentSku: 0,
      }, req.user.id);

      res.json({
        message: "Company created successfully",
        company,
      });
    } catch (error) {
      console.error("Create company error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/companies/:id", authenticateToken, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.id);
      if (req.user.companyId !== companyId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const updates = insertCompanySchema.partial().parse(req.body);
      const company = await storage.updateCompany(companyId, updates);
      
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }

      res.json(company);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/companies/:id", authenticateToken, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.id);
      
      // Get the company to check ownership
      const company = await storage.getCompany(companyId);
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }

      // Only company owners can delete companies
      if (company.ownerId !== req.user.id) {
        return res.status(403).json({ message: "Only company owners can delete companies" });
      }

      // If the deleted company was the user's current company, clear it first
      if (req.user.companyId === companyId) {
        await storage.updateUser(req.user.id, { companyId: null });
      }

      // Delete the company
      const deleted = await storage.deleteCompany(companyId);
      
      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete company" });
      }

      res.json({ message: "Company deleted successfully" });
    } catch (error) {
      console.error("Delete company error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Marketplace integrations
  app.get("/api/integrations/:companyId", authenticateToken, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      
      // Check if user has access to this company
      const userCompanies = await storage.getUserCompanies(req.user.id);
      const hasAccess = userCompanies.some(company => company.id === companyId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this company" });
      }

      const integrations = await storage.getCompanyIntegrations(companyId);
      res.json(integrations);
    } catch (error) {
      console.error("Get integrations error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/integrations", authenticateToken, async (req: any, res) => {
    try {
      if (!req.user.companyId) {
        return res.status(400).json({ message: "No company associated" });
      }

      const integrationData = {
        ...req.body,
        companyId: req.user.companyId,
      };

      const integration = await storage.createOrUpdateIntegration(integrationData);
      res.json(integration);
    } catch (error) {
      console.error("Create integration error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/integrations/:id", authenticateToken, async (req: any, res) => {
    try {
      if (!req.user.companyId) {
        return res.status(400).json({ message: "No company associated" });
      }

      const integrationId = parseInt(req.params.id);
      const integrationData = {
        ...req.body,
        companyId: req.user.companyId,
      };

      const integration = await storage.updateIntegration(integrationId, integrationData);
      if (!integration) {
        return res.status(404).json({ message: "Integration not found" });
      }
      
      res.json(integration);
    } catch (error) {
      console.error("Update integration error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/integrations/:id", authenticateToken, async (req: any, res) => {
    try {
      if (!req.user.companyId) {
        return res.status(400).json({ message: "No company associated" });
      }

      const integrationId = parseInt(req.params.id);
      
      // Verify integration belongs to user's company
      const integration = await storage.getIntegration(integrationId);
      if (!integration || integration.companyId !== req.user.companyId) {
        return res.status(404).json({ message: "Integration not found" });
      }

      const deleted = await storage.deleteIntegration(integrationId);
      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete integration" });
      }
      
      res.json({ message: "Integration deleted successfully" });
    } catch (error) {
      console.error("Delete integration error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Warehouse routes
  app.get("/api/warehouses/:companyId", authenticateToken, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      
      // Check if user has access to this company
      const userCompanies = await storage.getUserCompanies(req.user.id);
      const hasAccess = userCompanies.some(company => company.id === companyId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this company" });
      }

      const warehouses = await storage.getCompanyWarehouses(companyId);
      res.json(warehouses);
    } catch (error) {
      console.error("Get warehouses error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/warehouses", authenticateToken, async (req: any, res) => {
    try {
      if (!req.user.companyId) {
        return res.status(400).json({ message: "No company associated" });
      }

      const warehouseData = insertWarehouseSchema.parse({
        ...req.body,
        companyId: req.user.companyId,
        address: req.body.address || "Not specified", // Default address since it's required by schema
      });

      const warehouse = await storage.createWarehouse(warehouseData);
      res.json(warehouse);
    } catch (error) {
      console.error("Create warehouse error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/warehouses/:id", authenticateToken, async (req: any, res) => {
    try {
      const warehouseId = parseInt(req.params.id);
      const updates = insertWarehouseSchema.partial().parse(req.body);
      
      const warehouse = await storage.updateWarehouse(warehouseId, updates);
      if (!warehouse) {
        return res.status(404).json({ message: "Warehouse not found" });
      }

      res.json(warehouse);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/warehouses/:id", authenticateToken, async (req: any, res) => {
    try {
      const warehouseId = parseInt(req.params.id);
      const success = await storage.deleteWarehouse(warehouseId);
      
      if (!success) {
        return res.status(404).json({ message: "Warehouse not found" });
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Products
  app.get("/api/products", authenticateToken, async (req: any, res) => {
    try {
      if (!req.user.companyId) {
        return res.status(400).json({ message: "No company associated" });
      }

      // Check if user has access to this company
      const userCompanies = await storage.getUserCompanies(req.user.id);
      const hasAccess = userCompanies.some(company => company.id === req.user.companyId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this company" });
      }

      // Get pagination parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 30;
      const search = (req.query.search as string) || "";
      const sort = (req.query.sort as string) || "productName";
      const order = (req.query.order as string) || "asc";

      // Multi-value filters encoded as JSON arrays
      let statuses: string[] = [];
      let categoryFilters: string[] = [];
      let valueStreams: string[] = [];
      let brands: string[] = [];
      let suppliers: string[] = [];
      try {
        if (req.query.statuses) statuses = JSON.parse(req.query.statuses as string);
        if (req.query.cats) categoryFilters = JSON.parse(req.query.cats as string);
        if (req.query.valueStreams) valueStreams = JSON.parse(req.query.valueStreams as string);
        if (req.query.brands) brands = JSON.parse(req.query.brands as string);
        if (req.query.suppliers) suppliers = JSON.parse(req.query.suppliers as string);
      } catch { /* ignore malformed params */ }

      const result = await storage.getCompanyProductsPaginated(
        req.user.companyId,
        { page, limit, search, statuses, categoryFilters, valueStreams, brands, suppliers, sortField: sort, sortOrder: order as "asc" | "desc" }
      );
      
      res.json(result);
    } catch (error) {
      console.error("Get products error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/products/ssku-list", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const rows = await storage.getSskuList(req.user.companyId);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/products/metadata", authenticateToken, async (req: any, res) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const metadata = await storage.getCompanyProductsMetadata(req.user.companyId);
      res.json(metadata);
    } catch (error) {
      console.error("Get products metadata error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/products/statistics", authenticateToken, async (req: any, res) => {
    try {
      if (!req.user.companyId) {
        return res.status(400).json({ message: "No company associated" });
      }

      // Check if user has access to this company
      const userCompanies = await storage.getUserCompanies(req.user.id);
      const hasAccess = userCompanies.some(company => company.id === req.user.companyId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this company" });
      }

      const statistics = await storage.getCompanyProductsStatistics(req.user.companyId);
      res.json(statistics);
    } catch (error) {
      console.error("Get products statistics error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/products", authenticateToken, async (req: any, res) => {
    try {
      if (!req.user.companyId) {
        return res.status(400).json({ message: "No company associated" });
      }

      // Check if user has access to this company
      const userCompanies = await storage.getUserCompanies(req.user.id);
      const hasAccess = userCompanies.some(company => company.id === req.user.companyId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this company" });
      }

      let productData = {
        ...req.body,
        companyId: req.user.companyId,
      };

      // Calculate volume and cargo size if dimensions are provided
      if (productData.skuLengthCm && productData.skuWidthCm && productData.skuHeightCm && productData.skuWeightKg) {
        const calculations = calculateProductDimensions(
          parseFloat(productData.skuLengthCm),
          parseFloat(productData.skuWidthCm), 
          parseFloat(productData.skuHeightCm),
          parseFloat(productData.skuWeightKg)
        );
        productData.skuVolumeM3 = calculations.skuVolumeM3;
        productData.skuCargoSize = calculations.skuCargoSize;
      }

      // Convert numeric fields to strings for Drizzle decimal validation
      if (productData.skuLengthCm !== undefined && productData.skuLengthCm !== null) {
        productData.skuLengthCm = String(productData.skuLengthCm);
      }
      if (productData.skuWidthCm !== undefined && productData.skuWidthCm !== null) {
        productData.skuWidthCm = String(productData.skuWidthCm);
      }
      if (productData.skuHeightCm !== undefined && productData.skuHeightCm !== null) {
        productData.skuHeightCm = String(productData.skuHeightCm);
      }
      if (productData.skuWeightKg !== undefined && productData.skuWeightKg !== null) {
        productData.skuWeightKg = String(productData.skuWeightKg);
      }
      if (productData.skuVolumeM3 !== undefined && productData.skuVolumeM3 !== null) {
        productData.skuVolumeM3 = String(productData.skuVolumeM3);
      }
      if (productData.vat !== undefined && productData.vat !== null) {
        productData.vat = String(productData.vat);
      }
      if (productData.productionDays !== undefined && productData.productionDays !== null) {
        productData.productionDays = Number(productData.productionDays);
      }
      if (productData.minOrderQty !== undefined && productData.minOrderQty !== null) {
        productData.minOrderQty = Number(productData.minOrderQty);
      }
      if (productData.masterBoxQty !== undefined && productData.masterBoxQty !== null) {
        productData.masterBoxQty = Number(productData.masterBoxQty);
      }
      if (productData.palletQty !== undefined && productData.palletQty !== null) {
        productData.palletQty = Number(productData.palletQty);
      }
      if (productData.containerQty !== undefined && productData.containerQty !== null) {
        productData.containerQty = Number(productData.containerQty);
      }

      const validatedData = insertProductSchema.parse(productData);
      const product = await storage.createProduct(validatedData);
      res.json(product);
      storage.logActivity({ companyId: req.user.companyId, userId: req.user.id, actionType: "create", entityType: "product", entityId: product.id, description: `Created product: ${product.sku}` }).catch(console.error);
    } catch (error) {
      console.error("Product creation error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/products/:id", authenticateToken, async (req: any, res) => {
    try {
      if (!req.user.companyId) {
        return res.status(400).json({ message: "No company associated" });
      }

      // Check if user has access to this company
      const userCompanies = await storage.getUserCompanies(req.user.id);
      const hasAccess = userCompanies.some(company => company.id === req.user.companyId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this company" });
      }

      const productId = parseInt(req.params.id);
      let updates = { ...req.body };

      // Calculate volume and cargo size if dimensions are provided
      if (updates.skuLengthCm && updates.skuWidthCm && updates.skuHeightCm && updates.skuWeightKg) {
        const calculations = calculateProductDimensions(
          parseFloat(updates.skuLengthCm),
          parseFloat(updates.skuWidthCm), 
          parseFloat(updates.skuHeightCm),
          parseFloat(updates.skuWeightKg)
        );
        updates.skuVolumeM3 = calculations.skuVolumeM3;
        updates.skuCargoSize = calculations.skuCargoSize;
      }

      // Convert numeric fields to strings for Drizzle decimal validation
      if (updates.skuLengthCm !== undefined && updates.skuLengthCm !== null) {
        updates.skuLengthCm = String(updates.skuLengthCm);
      }
      if (updates.skuWidthCm !== undefined && updates.skuWidthCm !== null) {
        updates.skuWidthCm = String(updates.skuWidthCm);
      }
      if (updates.skuHeightCm !== undefined && updates.skuHeightCm !== null) {
        updates.skuHeightCm = String(updates.skuHeightCm);
      }
      if (updates.skuWeightKg !== undefined && updates.skuWeightKg !== null) {
        updates.skuWeightKg = String(updates.skuWeightKg);
      }
      if (updates.skuVolumeM3 !== undefined && updates.skuVolumeM3 !== null) {
        updates.skuVolumeM3 = String(updates.skuVolumeM3);
      }
      if (updates.vat !== undefined && updates.vat !== null) {
        updates.vat = String(updates.vat);
      }
      if (updates.productionDays !== undefined && updates.productionDays !== null) {
        updates.productionDays = Number(updates.productionDays);
      }
      if (updates.minOrderQty !== undefined && updates.minOrderQty !== null) {
        updates.minOrderQty = Number(updates.minOrderQty);
      }
      if (updates.masterBoxQty !== undefined && updates.masterBoxQty !== null) {
        updates.masterBoxQty = Number(updates.masterBoxQty);
      }
      if (updates.palletQty !== undefined && updates.palletQty !== null) {
        updates.palletQty = Number(updates.palletQty);
      }
      if (updates.containerQty !== undefined && updates.containerQty !== null) {
        updates.containerQty = Number(updates.containerQty);
      }

      const validatedUpdates = insertProductSchema.partial().parse(updates);
      const product = await storage.updateProduct(productId, validatedUpdates);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      res.json(product);
      storage.logActivity({ companyId: req.user.companyId, userId: req.user.id, actionType: "update", entityType: "product", entityId: productId, description: `Updated product: ${product.sku}` }).catch(console.error);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/products/:id", authenticateToken, async (req: any, res) => {
    try {
      if (!req.user.companyId) {
        return res.status(400).json({ message: "No company associated" });
      }

      // Check if user has access to this company
      const userCompanies = await storage.getUserCompanies(req.user.id);
      const hasAccess = userCompanies.some(company => company.id === req.user.companyId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this company" });
      }

      const productId = parseInt(req.params.id);
      const success = await storage.deleteProduct(productId);

      if (!success) {
        return res.status(404).json({ message: "Product not found" });
      }

      res.json({ success: true });
      storage.logActivity({ companyId: req.user.companyId, userId: req.user.id, actionType: "delete", entityType: "product", entityId: productId, description: `Deleted product id: ${productId}` }).catch(console.error);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Bulk import products
  app.post("/api/products/bulk-import", authenticateToken, async (req: any, res) => {
    try {
      const { products } = req.body;
      
      if (!Array.isArray(products)) {
        return res.status(400).json({ error: "Products must be an array" });
      }

      if (products.length > 50000) {
        return res.status(400).json({ error: "Maximum 50,000 products allowed per import" });
      }

      const user = req.user;
      if (!user || !user.companyId) {
        return res.status(400).json({ error: "No company associated" });
      }

      // Check if user has access to this company
      const userCompanies = await storage.getUserCompanies(user.id);
      const hasAccess = userCompanies.some(company => company.id === user.companyId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this company" });
      }

      // Process in batches of 500
      const batchSize = 500;
      const batches = [];
      for (let i = 0; i < products.length; i += batchSize) {
        batches.push(products.slice(i, i + batchSize));
      }

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const batch of batches) {
        try {
          const validatedBatch = [];
          
          for (let i = 0; i < batch.length; i++) {
            const product = batch[i];
            try {
              // Skip empty rows
              if (!product.sku || product.sku.trim() === '') {
                errorCount++;
                errors.push(`Row ${i + 1}: SKU is required`);
                continue;
              }



              // Convert string numbers to actual numbers
              const lengthCm = product.skuLengthCm ? parseFloat(product.skuLengthCm) : null;
              const widthCm = product.skuWidthCm ? parseFloat(product.skuWidthCm) : null;
              const heightCm = product.skuHeightCm ? parseFloat(product.skuHeightCm) : null;
              const weightKg = product.skuWeightKg ? parseFloat(product.skuWeightKg) : null;

              const toStr = (v: any) => (v != null && v !== '') ? String(v) : null;
              let processedProduct = {
                ...product,
                companyId: user.companyId,
                sku: toStr(product.sku)!,
                productName: toStr(product.productName) || toStr(product.sku)!,
                skuLengthCm: lengthCm ? String(lengthCm) : null,
                skuWidthCm: widthCm ? String(widthCm) : null,
                skuHeightCm: heightCm ? String(heightCm) : null,
                skuWeightKg: weightKg ? String(weightKg) : null,
                vat: product.vat ? String(parseFloat(product.vat)) : null,
                productionDays: product.productionDays ? parseInt(product.productionDays) : null,
                minOrderQty: product.minOrderQty ? parseInt(product.minOrderQty) : null,
                masterBoxQty: product.masterBoxQty ? parseInt(product.masterBoxQty) : null,
                palletQty: product.palletQty ? parseInt(product.palletQty) : null,
                containerQty: product.containerQty ? parseInt(product.containerQty) : null,
                seasonal: product.seasonal === 'true' || product.seasonal === true,
                status: product.status || 'new',
                category: toStr(product.category),
                valueStream: toStr(product.valueStream),
                brandName: toStr(product.brandName),
                barcode: toStr(product.barcode),
                hsCode: toStr(product.hsCode),
                ssdDate: product.ssdDate && product.ssdDate.trim() !== '' && product.ssdDate.match(/^\d{4}-\d{2}-\d{2}$/) ? product.ssdDate : null,
                edsDate: product.edsDate && product.edsDate.trim() !== '' && product.edsDate.match(/^\d{4}-\d{2}-\d{2}$/) ? product.edsDate : null,
                imageUrl: product.imageUrl || null,
                supplierName: product.supplierName || null
              };

              // Calculate volume and cargo size automatically if dimensions are provided
              if (lengthCm && widthCm && heightCm && weightKg) {
                const calculations = calculateProductDimensions(lengthCm, widthCm, heightCm, weightKg);
                processedProduct.skuVolumeM3 = String(calculations.skuVolumeM3);
                processedProduct.skuCargoSize = calculations.skuCargoSize;
              }

              // Validate with schema
              const validatedProduct = insertProductSchema.parse(processedProduct);
              validatedBatch.push(validatedProduct);
            } catch (productError) {
              errorCount++;
              const errorMsg = productError instanceof Error ? productError.message : 'Unknown error';
              errors.push(`Row ${i + 1}: ${errorMsg}`);
              console.error(`Product validation error for row ${i + 1}:`, productError);
            }
          }

          if (validatedBatch.length > 0) {
            await storage.createBulkProducts(validatedBatch);
            successCount += validatedBatch.length;
          }
        } catch (error) {
          console.error('Batch processing error:', error);
          errors.push(`Batch error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      res.json({
        success: true,
        imported: successCount,
        errors: errorCount,
        errorMessages: errors.slice(0, 10) // Limit error messages
      });
      storage.logActivity({ companyId: user.companyId, userId: user.id, actionType: "import", entityType: "product", description: `Bulk imported ${successCount} products from xlsx`, metadata: { successCount, errorCount } }).catch(console.error);
    } catch (error) {
      console.error("Bulk import error:", error);
      res.status(500).json({ error: "Failed to import products" });
    }
  });

  // Users management
  app.get("/api/users/:companyId", authenticateToken, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.companyId);
      
      // Check if user has access to this company
      const userCompanies = await storage.getUserCompanies(req.user.id);
      const hasAccess = userCompanies.some(company => company.id === companyId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this company" });
      }

      const users = await storage.getCompanyUsers(companyId);
      const company = await storage.getCompany(companyId);
      
      res.json(users.map(user => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: company?.ownerId === user.id ? 'admin' : user.role, // Company owner is always admin
        isActive: user.isActive,
        createdAt: user.createdAt,
      })));
    } catch (error) {
      console.error("Get company users error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update user profile (name, language) - self-service endpoint
  app.put("/api/users/:userId", authenticateToken, async (req: any, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const { name, language } = req.body;
      
      // Only allow users to update their own profile
      if (userId !== req.user.id) {
        return res.status(403).json({ message: "Can only update your own profile" });
      }
      
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (language !== undefined) updateData.language = language;
      
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }
      
      await storage.updateUser(userId, updateData);
      
      res.json({ message: "Profile updated successfully" });
    } catch (error) {
      console.error("Update profile error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update user role in a company
  app.put("/api/users/:userId/role", authenticateToken, async (req: any, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const { role } = req.body;
      
      if (!req.user.companyId) {
        return res.status(403).json({ message: "No company access" });
      }

      // Check if current user is admin or company owner
      const company = await storage.getCompany(req.user.companyId);
      if (req.user.role !== "admin" && company?.ownerId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Check if target user belongs to the same company
      const companyUsers = await storage.getCompanyUsers(req.user.companyId);
      const targetUser = companyUsers.find(user => user.id === userId);
      
      if (!targetUser) {
        return res.status(404).json({ message: "User not found in this company" });
      }

      // Prevent editing company owner
      if (company?.ownerId === userId) {
        return res.status(400).json({ message: "Cannot edit company owner" });
      }

      // Update user role in company if provided
      if (role && role !== targetUser.role) {
        await storage.updateUserCompanyRole(userId, req.user.companyId, role);
      }

      res.json({ message: "User updated successfully" });
      storage.logActivity({ companyId: req.user.companyId, userId: req.user.id, actionType: "update", entityType: "user_role", entityId: userId, description: `Changed role of user ${userId} to ${role}` }).catch(console.error);
    } catch (error) {
      console.error("Update user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Remove user from company
  app.delete("/api/users/:userId/company", authenticateToken, async (req: any, res) => {
    try {
      const userId = parseInt(req.params.userId);
      
      if (!req.user.companyId) {
        return res.status(403).json({ message: "No company access" });
      }

      // Check if current user is admin or company owner
      const company = await storage.getCompany(req.user.companyId);
      if (req.user.role !== "admin" && company?.ownerId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Check if target user belongs to the same company
      const companyUsers = await storage.getCompanyUsers(req.user.companyId);
      const targetUser = companyUsers.find(user => user.id === userId);
      
      if (!targetUser) {
        return res.status(404).json({ message: "User not found in this company" });
      }

      // Prevent removing company owner
      if (company?.ownerId === userId) {
        return res.status(400).json({ message: "Cannot remove company owner" });
      }

      // Prevent user from removing themselves
      if (userId === req.user.id) {
        return res.status(400).json({ message: "Cannot remove yourself" });
      }

      // Remove user from company
      await storage.removeUserFromCompany(userId, req.user.companyId);

      res.json({ message: "User removed from company successfully" });
    } catch (error) {
      console.error("Remove user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/invitations", authenticateToken, async (req: any, res) => {
    try {
      if (!req.user.companyId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const targetCompany = await storage.getCompany(req.user.companyId);
      if (req.user.role !== "admin" && targetCompany?.ownerId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      const email = String(req.body.email || "").toLowerCase().trim();
      const { role } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });

      // Check if user already exists with this email
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        // Add existing user to the company using junction table
        try {
          await storage.addUserToCompany(existingUser.id, req.user.companyId, role || "user");
        } catch (error) {
          return res.status(400).json({ message: "User is already a member of this company" });
        }
        
        res.json({
          success: true,
          user: {
            id: existingUser.id,
            email: existingUser.email,
            name: existingUser.name,
            role: role || "user",
            isActive: existingUser.isActive,
            createdAt: existingUser.createdAt,
          }
        });
        storage.logActivity({ companyId: req.user.companyId, userId: req.user.id, actionType: "create", entityType: "user_invitation", entityId: existingUser.id, description: `Added existing user ${email} to company with role ${role || "user"}` }).catch(console.error);
      } else {
        // Create new user with a default password
        const defaultPassword = email.split('@')[0] + "123"; // Simple default password
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);
        
        const newUser = await storage.createUser({
          email,
          password: hashedPassword,
          name: email.split('@')[0], // Derive name from email
          role: "user", // Default role for user table
          companyId: null, // Don't set companyId directly anymore
        });

        // Add user to company using junction table with specified role
        await storage.addUserToCompany(newUser.id, req.user.companyId, role || "user");

        res.json({
          success: true,
          user: {
            id: newUser.id,
            email: newUser.email,
            name: newUser.name,
            role: role || "user",
            isActive: newUser.isActive,
            createdAt: newUser.createdAt,
          },
        });
        storage.logActivity({ companyId: req.user.companyId, userId: req.user.id, actionType: "create", entityType: "user_invitation", entityId: newUser.id, description: `Invited new user ${email} with role ${role || "user"}` }).catch(console.error);
      }
    } catch (error) {
      console.error("Create user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Inventory / Stock endpoints ──────────────────────────────────────────

  // GET /api/inventory/summary  — availability stats for summary cards
  app.get("/api/inventory/summary", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      let statuses: string[] = [];
      let categoryFilters: string[] = [];
      let valueStreams: string[] = [];
      let brands: string[] = [];
      let suppliers: string[] = [];
      try {
        if (req.query.statuses) statuses = JSON.parse(req.query.statuses as string);
        if (req.query.cats) categoryFilters = JSON.parse(req.query.cats as string);
        if (req.query.valueStreams) valueStreams = JSON.parse(req.query.valueStreams as string);
        if (req.query.brands) brands = JSON.parse(req.query.brands as string);
        if (req.query.suppliers) suppliers = JSON.parse(req.query.suppliers as string);
      } catch { /* ignore */ }
      const summary = await storage.getInventorySummary(req.user.companyId, {
        search: (req.query.search as string) || "",
        statuses,
        categoryFilters,
        valueStreams,
        brands,
        suppliers,
      });
      res.json(summary);
    } catch (error) {
      console.error("Get inventory summary error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/inventory/stocks  — returns YM stock map keyed by SKU
  app.get("/api/inventory/stocks", authenticateToken, async (req: any, res) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const stocks = await storage.getYandexMarketStocks(req.user.companyId);
      res.json(stocks);
    } catch (error) {
      console.error("Get inventory stocks error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/inventory/stocks/:sku  — per-warehouse detail for modal
  app.get("/api/inventory/stocks/:sku", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const details = await storage.getYandexMarketStockDetails(req.user.companyId, req.params.sku);
      res.json(details);
    } catch (error) {
      console.error("Get stock details error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/inventory/sync/yandex-market  — manual trigger
  app.post("/api/inventory/sync/yandex-market", authenticateToken, async (req: any, res) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const result = await syncYandexMarketStocksForCompany(req.user.companyId);
      res.json(result);
      storage.logActivity({ companyId: req.user.companyId, userId: req.user.id, actionType: "sync", entityType: "sync_ym", description: "Manual Yandex Market sync", metadata: result }).catch(console.error);
    } catch (error) {
      console.error("Manual YM sync error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/inventory/ozon-stocks  — returns Ozon stock map keyed by SKU
  app.get("/api/inventory/ozon-stocks", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const stocks = await storage.getOzonStocks(req.user.companyId);
      res.json(stocks);
    } catch (error) {
      console.error("Get Ozon stocks error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/inventory/ozon-stocks/:sku  — per-warehouse detail for modal
  app.get("/api/inventory/ozon-stocks/:sku", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const details = await storage.getOzonStockDetails(req.user.companyId, req.params.sku);
      res.json(details);
    } catch (error) {
      console.error("Get Ozon stock details error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/inventory/sync/ozon  — manual trigger
  app.post("/api/inventory/sync/ozon", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const result = await syncOzonStocksForCompany(req.user.companyId);
      res.json(result);
      storage.logActivity({ companyId: req.user.companyId, userId: req.user.id, actionType: "sync", entityType: "sync_ozon", description: "Manual Ozon sync", metadata: result }).catch(console.error);
    } catch (error) {
      console.error("Manual Ozon sync error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/inventory/wb-stocks  — returns WB stock map keyed by SKU
  app.get("/api/inventory/wb-stocks", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const stocks = await storage.getWildberriesStocks(req.user.companyId);
      res.json(stocks);
    } catch (error) {
      console.error("Get WB stocks error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/inventory/wb-stocks/:sku  — per-warehouse detail for modal
  app.get("/api/inventory/wb-stocks/:sku", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const details = await storage.getWildberriesStockDetails(req.user.companyId, req.params.sku);
      res.json(details);
    } catch (error) {
      console.error("Get WB stock details error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/inventory/sync/wildberries  — manual trigger
  app.post("/api/inventory/sync/wildberries", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const result = await syncWildberriesStocksForCompany(req.user.companyId);
      res.json(result);
      storage.logActivity({ companyId: req.user.companyId, userId: req.user.id, actionType: "sync", entityType: "sync_wb", description: "Manual Wildberries sync", metadata: result }).catch(console.error);
    } catch (error) {
      console.error("Manual WB sync error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/inventory/wb-transit  — returns transit stock map keyed by SKU
  app.get("/api/inventory/wb-transit", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const stocks = await storage.getWBTransitStocks(req.user.companyId);
      res.json(stocks);
    } catch (error) {
      console.error("Get WB transit error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/inventory/wb-transit/:sku  — per-warehouse transit breakdown for one SKU
  app.get("/api/inventory/wb-transit/:sku", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const rows = await storage.getWBTransitByWarehouse(req.user.companyId, req.params.sku);
      res.json(rows);
    } catch (error) {
      console.error("Get WB transit by warehouse error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/inventory/sync/wb-transit  — manual trigger
  app.post("/api/inventory/sync/wb-transit", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const result = await syncWBSuppliesForCompany(req.user.companyId);
      res.json(result);
      storage.logActivity({ companyId: req.user.companyId, userId: req.user.id, actionType: "sync", entityType: "sync_wb_transit", description: "Manual WB transit sync", metadata: result }).catch(console.error);
    } catch (error) {
      console.error("Manual WB transit sync error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/inventory/3pl-stocks  — returns 3PL stock map keyed by SKU
  app.get("/api/inventory/3pl-stocks", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const stocks = await storage.getThreeplStocks(req.user.companyId);
      res.json(stocks);
    } catch (error) {
      console.error("Get 3PL stocks error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/inventory/3pl-stocks/:sku  — per-warehouse detail for modal
  app.get("/api/inventory/3pl-stocks/:sku", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const details = await storage.getThreeplStockDetails(req.user.companyId, req.params.sku);
      res.json(details);
    } catch (error) {
      console.error("Get 3PL stock details error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/inventory/sync/3pl  — manual trigger
  app.post("/api/inventory/sync/3pl", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const result = await syncThreeplStocksForCompany(req.user.companyId);
      res.json(result);
      storage.logActivity({ companyId: req.user.companyId, userId: req.user.id, actionType: "sync", entityType: "sync_3pl", description: "Manual 3PL sync", metadata: result }).catch(console.error);
    } catch (error) {
      console.error("Manual 3PL sync error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Inbound Orders
  app.get("/api/inbound/stats", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const { search, valueStreams, categories, productionStatuses, logisticStatuses, etaActualFrom, etaActualTo } = req.query as Record<string, string>;
      const parseList = (s?: string) => s ? s.split(",").filter(Boolean) : undefined;
      const stats = await storage.getInboundStats(req.user.companyId, {
        search,
        valueStreams: parseList(valueStreams),
        categories: parseList(categories),
        productionStatuses: parseList(productionStatuses),
        logisticStatuses: parseList(logisticStatuses),
        etaActualFrom, etaActualTo,
      });
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/inbound/ordered-summary", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const summary = await storage.getInboundOrderedSummary(req.user.companyId);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/inbound/orders-by-sku/:sku", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const orders = await storage.getInboundOrdersBySku(req.user.companyId, req.params.sku);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/inbound/meta", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const meta = await storage.getInboundMeta(req.user.companyId);
      res.json(meta);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/inbound", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const { page, limit, search, valueStreams, categories, productionStatuses, logisticStatuses, etaActualFrom, etaActualTo } = req.query as Record<string, string>;
      const parseList = (s?: string) => s ? s.split(",").filter(Boolean) : undefined;
      const result = await storage.getInboundOrders(req.user.companyId, {
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 100,
        search,
        valueStreams: parseList(valueStreams),
        categories: parseList(categories),
        productionStatuses: parseList(productionStatuses),
        logisticStatuses: parseList(logisticStatuses),
        etaActualFrom, etaActualTo,
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/inbound/import", authenticateToken, async (req: any, res: any) => {
    const t0 = Date.now();
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const { rows } = req.body;
      if (!Array.isArray(rows)) return res.status(400).json({ message: "rows must be an array" });
      console.log(`[inbound import] start company=${req.user.companyId} incoming=${rows.length}`);
      const summary = await storage.upsertInboundOrders(req.user.companyId, rows);
      console.log(`[inbound import] done in ${Date.now() - t0}ms`, summary);
      res.json(summary);
      storage.logActivity({
        companyId: req.user.companyId,
        userId: req.user.id,
        actionType: "import",
        entityType: "inbound",
        description: `Imported ${summary.imported} inbound rows (created ${summary.created}, updated ${summary.updated}, deleted ${summary.deleted})`,
        metadata: summary,
      }).catch(console.error);
    } catch (error) {
      console.error(`[inbound import] FAILED after ${Date.now() - t0}ms:`, error);
      res.status(500).json({ message: "Internal server error", error: String(error) });
    }
  });

  app.get("/api/inbound/po-summary", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const { page, limit, search, valueStreams, categories, productionStatuses, logisticStatuses, etaActualFrom, etaActualTo } = req.query as Record<string, string>;
      const parseList = (s?: string) => s ? s.split(",").filter(Boolean) : undefined;
      const result = await storage.getInboundPoSummary(req.user.companyId, {
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 100,
        search,
        valueStreams: parseList(valueStreams),
        categories: parseList(categories),
        productionStatuses: parseList(productionStatuses),
        logisticStatuses: parseList(logisticStatuses),
        etaActualFrom, etaActualTo,
      });
      res.json(result);
    } catch (error) {
      console.error("Inbound po-summary error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/inbound/po/:poNumber/lines", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const lines = await storage.getInboundPoLines(req.user.companyId, req.params.poNumber);
      res.json(lines);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/inbound/po/:poNumber/changes", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const days = req.query.days ? Number(req.query.days) : 14;
      const changes = await storage.getInboundPoChanges(req.user.companyId, req.params.poNumber, days);
      res.json(changes);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/inbound", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const data = { ...req.body, key: `clone_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` };
      const row = await storage.createInboundOrder(req.user.companyId, data);
      res.json(row);
      storage.logActivity({ companyId: req.user.companyId, userId: req.user.id, actionType: "create", entityType: "inbound", entityId: row?.id, description: `Created inbound order` }).catch(console.error);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/inbound/:id", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const id = Number(req.params.id);
      const { _before, ...updateData } = req.body;
      const row = await storage.updateInboundOrder(req.user.companyId, id, updateData);
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
      const changes: Record<string, { from: any; to: any }> = {};
      for (const key of Object.keys(updateData)) {
        const prev = _before?.[key] ?? null;
        const next = (row as any)[key] ?? null;
        if (String(prev ?? "") !== String(next ?? "")) changes[key] = { from: prev, to: next };
      }
      storage.logActivity({ companyId: req.user.companyId, userId: req.user.id, actionType: "update", entityType: "inbound", entityId: id, description: `Updated inbound order id: ${id}`, metadata: { changes } }).catch(console.error);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/inbound/:id", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const ok = await storage.deleteInboundOrder(req.user.companyId, Number(req.params.id));
      if (!ok) return res.status(404).json({ message: "Not found" });
      res.json({ deleted: true });
      storage.logActivity({ companyId: req.user.companyId, userId: req.user.id, actionType: "delete", entityType: "inbound", entityId: Number(req.params.id), description: `Deleted inbound order id: ${req.params.id}` }).catch(console.error);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Outbound Shipments
  app.get("/api/outbound/stats", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const { search, marketplaces } = req.query as Record<string, string>;
      const parseList = (s?: string) => s ? s.split(",").filter(Boolean) : undefined;
      const stats = await storage.getOutboundStats(req.user.companyId, {
        search,
        marketplaces: parseList(marketplaces),
      });
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/outbound/meta", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const meta = await storage.getOutboundMeta(req.user.companyId);
      res.json(meta);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/outbound", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const { page, limit, search, marketplaces } = req.query as Record<string, string>;
      const parseList = (s?: string) => s ? s.split(",").filter(Boolean) : undefined;
      const result = await storage.getOutboundShipments(req.user.companyId, {
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 100,
        search,
        marketplaces: parseList(marketplaces),
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/outbound/import", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const { rows } = req.body;
      if (!Array.isArray(rows)) return res.status(400).json({ message: "rows must be an array" });
      await storage.upsertOutboundShipments(req.user.companyId, rows);
      res.json({ imported: rows.length });
      storage.logActivity({ companyId: req.user.companyId, userId: req.user.id, actionType: "import", entityType: "outbound", description: `Bulk imported ${rows.length} outbound shipments from xlsx`, metadata: { rowCount: rows.length } }).catch(console.error);
    } catch (error) {
      console.error("Outbound import error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/outbound", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const data = { ...req.body, key: `clone_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` };
      const row = await storage.createOutboundShipment(req.user.companyId, data);
      res.json(row);
      storage.logActivity({ companyId: req.user.companyId, userId: req.user.id, actionType: "create", entityType: "outbound", entityId: row?.id, description: `Created outbound shipment` }).catch(console.error);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/outbound/:id", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const id = Number(req.params.id);
      const { _before, ...updateData } = req.body;
      const row = await storage.updateOutboundShipment(req.user.companyId, id, updateData);
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
      const changes: Record<string, { from: any; to: any }> = {};
      for (const key of Object.keys(updateData)) {
        const prev = _before?.[key] ?? null;
        const next = (row as any)[key] ?? null;
        if (String(prev ?? "") !== String(next ?? "")) changes[key] = { from: prev, to: next };
      }
      storage.logActivity({ companyId: req.user.companyId, userId: req.user.id, actionType: "update", entityType: "outbound", entityId: id, description: `Updated outbound shipment id: ${id}`, metadata: { changes } }).catch(console.error);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/outbound/:id", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const ok = await storage.deleteOutboundShipment(req.user.companyId, Number(req.params.id));
      if (!ok) return res.status(404).json({ message: "Not found" });
      res.json({ deleted: true });
      storage.logActivity({ companyId: req.user.companyId, userId: req.user.id, actionType: "delete", entityType: "outbound", entityId: Number(req.params.id), description: `Deleted outbound shipment id: ${req.params.id}` }).catch(console.error);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Sales Plans
  app.get("/api/sales-plans/meta", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const meta = await storage.getSalesPlansMeta(req.user.companyId);
      res.json(meta);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/sales-plans/stats", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const { search, valueStreams, categories, channels, year } = req.query as any;
      const stats = await storage.getSalesPlansStats(req.user.companyId, {
        search,
        valueStreams: valueStreams ? valueStreams.split(",") : undefined,
        categories: categories ? categories.split(",") : undefined,
        channels: channels ? channels.split(",") : undefined,
        years: year ? [Number(year)] : undefined,
      });
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/sales-plans", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const { page = "1", limit = "100", search, valueStreams, categories, channels, year } = req.query as any;
      const selectedYear = year ? Number(year) : new Date().getFullYear();
      const result = await storage.getSalesPlansMatrix(req.user.companyId, selectedYear, {
        page: Number(page),
        limit: Number(limit),
        search,
        valueStreams: valueStreams ? valueStreams.split(",") : undefined,
        categories: categories ? categories.split(",") : undefined,
        channels: channels ? channels.split(",") : undefined,
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/sales-plans/upsert-field", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const { ssku, channel, year, field, value, _before } = req.body;
      const row = await storage.upsertSalesPlanField(req.user.companyId, ssku, channel, year, field, value);
      res.json(row);
      const changes: Record<string, any> = {};
      if (String(_before?.[field] ?? "") !== String(value ?? "")) changes[field] = { from: _before?.[field] ?? null, to: value };
      storage.logActivity({ companyId: req.user.companyId, userId: req.user.id, actionType: "update", entityType: "sales_plan", entityId: row?.id, description: `Updated sales plan id: ${row?.id} (${ssku}/${channel}/${year})`, metadata: { changes } }).catch(console.error);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/sales-plans/import", authenticateToken, async (req: any, res: any) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ message: "No company associated" });
      const { rows } = req.body;
      if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ message: "rows required" });
      const count = await storage.upsertSalesPlans(req.user.companyId, rows);
      res.json({ imported: count });
      storage.logActivity({ companyId: req.user.companyId, userId: req.user.id, actionType: "import", entityType: "sales_plan", description: `Imported ${count} sales plan rows`, metadata: { rowCount: count } }).catch(console.error);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/activity/log  — client-side event logging (e.g. xlsx exports)
  app.post("/api/activity/log", authenticateToken, async (req: any, res: any) => {
    const { actionType, entityType, description, metadata } = req.body;
    if (!actionType || !entityType || !description) return res.status(400).json({ message: "actionType, entityType, description required" });
    storage.logActivity({ companyId: req.user.companyId, userId: req.user.id, actionType, entityType, description, metadata }).catch(console.error);
    res.json({ ok: true });
  });

  const httpServer = createServer(app);
  return httpServer;
}

import {
  users,
  companies,
  marketplaceIntegrations,
  warehouses,
  invitations,
  products,
  userCompanies,
  yandexMarketStocks,
  yandexMarketStockDetails,
  ozonStocks,
  ozonStockDetails,
  wildberriesStocks,
  wildberriesStockDetails,
  threeplStocks,
  threeplStockDetails,
  wbTransitStocks,
  wbSupplies,
  wbSupplyGoods,
  inboundOrders,
  type User,
  type InsertUser,
  type Company,
  type InsertCompany,
  type MarketplaceIntegration,
  type InsertMarketplaceIntegration,
  type Warehouse,
  type InsertWarehouse,
  type Invitation,
  type InsertInvitation,
  type Product,
  type InsertProduct,
  type UserCompany,
  type InsertUserCompany,
  activityLogs,
  type ActivityLog,
  type InsertActivityLog,
  salesPlans,
  outboundShipments,
  inboundChanges,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, ilike, desc, asc, sql, inArray, gte } from "drizzle-orm";

// pg returns TIMESTAMP (no tz) columns as strings without 'Z' — treat as UTC
function pgTs(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const s = String(v);
  if (!s.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(s)) return new Date(s.replace(" ", "T") + "Z");
  return new Date(s);
}

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByYandexId(yandexId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<InsertUser>): Promise<User | undefined>;
  
  // Companies
  getCompany(id: number): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: number, updates: Partial<InsertCompany>): Promise<Company | undefined>;
  deleteCompany(id: number): Promise<boolean>;
  getCompanyUsers(companyId: number): Promise<User[]>;
  getUserCompanies(userId: number): Promise<Company[]>;
  addUserToCompany(userId: number, companyId: number, role: string): Promise<UserCompany>;
  removeUserFromCompany(userId: number, companyId: number): Promise<boolean>;
  updateUserCompanyRole(userId: number, companyId: number, role: string): Promise<boolean>;
  createCompanyWithOwner(companyData: InsertCompany, userId: number): Promise<Company>;
  
  // Marketplace Integrations
  getCompanyIntegrations(companyId: number): Promise<MarketplaceIntegration[]>;
  getIntegration(companyId: number, marketplace: string): Promise<MarketplaceIntegration | undefined>;
  createOrUpdateIntegration(integration: InsertMarketplaceIntegration): Promise<MarketplaceIntegration>;
  
  // Warehouses
  getCompanyWarehouses(companyId: number): Promise<Warehouse[]>;
  createWarehouse(warehouse: InsertWarehouse): Promise<Warehouse>;
  updateWarehouse(id: number, updates: Partial<InsertWarehouse>): Promise<Warehouse | undefined>;
  deleteWarehouse(id: number): Promise<boolean>;
  
  // Invitations
  createInvitation(invitation: InsertInvitation): Promise<Invitation>;
  getInvitationByToken(token: string): Promise<Invitation | undefined>;
  markInvitationAsUsed(token: string): Promise<boolean>;
  getCompanyInvitations(companyId: number): Promise<Invitation[]>;
  
  // Products
  getCompanyProducts(companyId: number): Promise<Product[]>;
  getCompanyProductsStatistics(companyId: number): Promise<{
    total: number;
    activeProducts: number;
    uniqueCategories: number;
    activeSuppliers: number;
  }>;
  createProduct(product: InsertProduct): Promise<Product>;
  createBulkProducts(products: InsertProduct[]): Promise<Product[]>;
  updateProduct(id: number, updates: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<boolean>;

  // Activity Logs
  logActivity(log: InsertActivityLog): Promise<ActivityLog>;

  // Products SSKU list for selects
  getSskuList(companyId: number): Promise<{ sku: string; productName: string; valueStream: string | null; category: string | null }[]>;

  // Sales Plans
  getSalesPlansMatrix(companyId: number, year: number, opts: { page: number; limit: number; search?: string; valueStreams?: string[]; categories?: string[]; channels?: string[] }): Promise<{ rows: any[]; total: number; totalPages: number }>;
  getSalesPlansMeta(companyId: number): Promise<{ valueStreams: string[]; categories: string[]; channels: string[]; years: number[] }>;
  getSalesPlansStats(companyId: number, opts?: { search?: string; valueStreams?: string[]; categories?: string[]; channels?: string[]; years?: number[] }): Promise<{ totalRows: number; totalUnits: number; ymTotal: number; ozonTotal: number; wbTotal: number; otherTotal: number }>;
  upsertSalesPlanField(companyId: number, ssku: string, channel: string, year: number, field: string, value: number | null): Promise<any>;
  upsertSalesPlans(companyId: number, rows: Record<string, any>[]): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
    return user || undefined;
  }

  async getUserByYandexId(yandexId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.yandexId, yandexId));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const normalized = { ...insertUser, email: insertUser.email.toLowerCase().trim() };
    const [user] = await db.insert(users).values(normalized).returning();
    return user;
  }

  async updateUser(id: number, updates: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return user || undefined;
  }

  // Companies
  async getCompany(id: number): Promise<Company | undefined> {
    const [result] = await db.select({
      id: companies.id,
      name: companies.name,
      inn: companies.inn,
      address: companies.address,
      phone: companies.phone,
      email: companies.email,
      subscriptionTier: companies.subscriptionTier,
      subscriptionStatus: companies.subscriptionStatus,
      maxSku: companies.maxSku,
      currentSku: companies.currentSku,
      subscriptionEndsAt: companies.subscriptionEndsAt,
      createdAt: companies.createdAt,
      ownerId: companies.ownerId,
      ownerEmail: users.email
    })
    .from(companies)
    .leftJoin(users, eq(companies.ownerId, users.id))
    .where(eq(companies.id, id));
    
    if (!result) return undefined;
    
    // Return company with owner email merged into email field
    return {
      ...result,
      email: result.ownerEmail || result.email || ""
    } as Company;
  }

  async createCompany(insertCompany: InsertCompany): Promise<Company> {
    const [company] = await db.insert(companies).values(insertCompany).returning();
    return company;
  }

  async updateCompany(id: number, updates: Partial<InsertCompany>): Promise<Company | undefined> {
    const [company] = await db.update(companies).set(updates).where(eq(companies.id, id)).returning();
    return company || undefined;
  }

  async deleteCompany(id: number): Promise<boolean> {
    try {
      console.log(`Starting deletion of company ${id}`);
      
      // First, update all users who have this company as their current company
      console.log(`Clearing user references to company ${id}`);
      await db.update(users)
        .set({ companyId: null })
        .where(eq(users.companyId, id));
      
      // Delete related data (cascading deletes)
      console.log(`Deleting user-company relationships for company ${id}`);
      await db.delete(userCompanies).where(eq(userCompanies.companyId, id));
      
      console.log(`Deleting marketplace integrations for company ${id}`);
      await db.delete(marketplaceIntegrations).where(eq(marketplaceIntegrations.companyId, id));
      
      console.log(`Deleting warehouses for company ${id}`);
      await db.delete(warehouses).where(eq(warehouses.companyId, id));
      
      console.log(`Deleting products for company ${id}`);
      await db.delete(products).where(eq(products.companyId, id));
      
      console.log(`Deleting invitations for company ${id}`);
      await db.delete(invitations).where(eq(invitations.companyId, id));
      
      // Delete the company
      console.log(`Deleting company ${id}`);
      const result = await db.delete(companies).where(eq(companies.id, id));
      
      console.log(`Company deletion result:`, result);
      return result.rowCount > 0;
    } catch (error) {
      console.error("Error deleting company:", error);
      return false;
    }
  }

  async getCompanyUsers(companyId: number): Promise<User[]> {
    // Get users through junction table
    const result = await db.select({
      id: users.id,
      email: users.email,
      password: users.password,
      name: users.name,
      role: userCompanies.role, // Use role from junction table
      companyId: users.companyId,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
    .from(userCompanies)
    .innerJoin(users, eq(userCompanies.userId, users.id))
    .where(eq(userCompanies.companyId, companyId));
    
    return result;
  }

  async getUserCompanies(userId: number): Promise<Company[]> {
    // Get companies through junction table and owned companies
    const memberCompanies = await db.select({
      id: companies.id,
      name: companies.name,
      inn: companies.inn,
      address: companies.address,
      phone: companies.phone,
      email: companies.email,
      subscriptionTier: companies.subscriptionTier,
      subscriptionStatus: companies.subscriptionStatus,
      maxSku: companies.maxSku,
      currentSku: companies.currentSku,
      subscriptionEndsAt: companies.subscriptionEndsAt,
      createdAt: companies.createdAt,
      ownerId: companies.ownerId,
      ownerEmail: users.email
    })
    .from(userCompanies)
    .innerJoin(companies, eq(userCompanies.companyId, companies.id))
    .leftJoin(users, eq(companies.ownerId, users.id))
    .where(eq(userCompanies.userId, userId));
    
    // Get companies where user is the owner (if not already included)
    const ownedCompanies = await db.select({
      id: companies.id,
      name: companies.name,
      inn: companies.inn,
      address: companies.address,
      phone: companies.phone,
      email: companies.email,
      subscriptionTier: companies.subscriptionTier,
      subscriptionStatus: companies.subscriptionStatus,
      maxSku: companies.maxSku,
      currentSku: companies.currentSku,
      subscriptionEndsAt: companies.subscriptionEndsAt,
      createdAt: companies.createdAt,
      ownerId: companies.ownerId,
      ownerEmail: users.email
    })
    .from(companies)
    .leftJoin(users, eq(companies.ownerId, users.id))
    .where(eq(companies.ownerId, userId));
    
    // Combine and deduplicate
    const allCompanies = [...memberCompanies, ...ownedCompanies];
    const uniqueCompanies = allCompanies.filter((company, index, self) => 
      index === self.findIndex(c => c.id === company.id)
    );
    
    return uniqueCompanies.map(company => ({
      ...company,
      email: company.ownerEmail || company.email || ""
    })) as Company[];
  }

  async addUserToCompany(userId: number, companyId: number, role: string): Promise<UserCompany> {
    // Check if relationship already exists
    const [existing] = await db.select()
      .from(userCompanies)
      .where(and(eq(userCompanies.userId, userId), eq(userCompanies.companyId, companyId)));
    
    if (existing) {
      // Update existing relationship
      const [updated] = await db.update(userCompanies)
        .set({ role, isActive: true })
        .where(eq(userCompanies.id, existing.id))
        .returning();
      return updated;
    } else {
      // Create new relationship
      const [created] = await db.insert(userCompanies)
        .values({ userId, companyId, role, isActive: true })
        .returning();
      return created;
    }
  }

  async removeUserFromCompany(userId: number, companyId: number): Promise<boolean> {
    const result = await db.delete(userCompanies)
      .where(and(eq(userCompanies.userId, userId), eq(userCompanies.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  }

  async updateUserCompanyRole(userId: number, companyId: number, role: string): Promise<boolean> {
    const result = await db.update(userCompanies)
      .set({ role })
      .where(and(eq(userCompanies.userId, userId), eq(userCompanies.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  }

  async createCompanyWithOwner(companyData: InsertCompany, userId: number): Promise<Company> {
    // Create the company
    const [company] = await db.insert(companies).values({
      ...companyData,
      ownerId: userId,
    }).returning();

    // Update user's current company, set admin role, and add to junction table
    await this.updateUser(userId, { companyId: company.id, role: "admin" });
    await this.addUserToCompany(userId, company.id, "admin");

    return company;
  }

  // Marketplace Integrations
  async getCompanyIntegrations(companyId: number): Promise<MarketplaceIntegration[]> {
    return await db.select().from(marketplaceIntegrations).where(eq(marketplaceIntegrations.companyId, companyId));
  }

  async getIntegrationByMarketplace(companyId: number, marketplace: string): Promise<MarketplaceIntegration | undefined> {
    const [integration] = await db.select()
      .from(marketplaceIntegrations)
      .where(and(
        eq(marketplaceIntegrations.companyId, companyId),
        eq(marketplaceIntegrations.marketplace, marketplace)
      ));
    return integration || undefined;
  }

  async createOrUpdateIntegration(integration: any): Promise<MarketplaceIntegration> {
    const existing = await this.getIntegrationByMarketplace(integration.companyId, integration.marketplace);
    
    if (existing) {
      const [updated] = await db.update(marketplaceIntegrations)
        .set(integration)
        .where(eq(marketplaceIntegrations.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(marketplaceIntegrations).values(integration).returning();
      return created;
    }
  }

  async updateIntegration(id: number, updates: any): Promise<MarketplaceIntegration | null> {
    try {
      const [updated] = await db.update(marketplaceIntegrations)
        .set(updates)
        .where(eq(marketplaceIntegrations.id, id))
        .returning();
      return updated || null;
    } catch (error) {
      console.error("Update integration error:", error);
      return null;
    }
  }

  async getIntegration(id: number): Promise<MarketplaceIntegration | null> {
    try {
      const [integration] = await db.select()
        .from(marketplaceIntegrations)
        .where(eq(marketplaceIntegrations.id, id));
      return integration || null;
    } catch (error) {
      console.error("Get integration error:", error);
      return null;
    }
  }

  async deleteIntegration(id: number): Promise<boolean> {
    try {
      const result = await db.delete(marketplaceIntegrations)
        .where(eq(marketplaceIntegrations.id, id));
      return result.rowCount > 0;
    } catch (error) {
      console.error("Delete integration error:", error);
      return false;
    }
  }

  // Warehouses
  async getCompanyWarehouses(companyId: number): Promise<Warehouse[]> {
    return await db.select().from(warehouses).where(eq(warehouses.companyId, companyId));
  }

  async createWarehouse(warehouse: InsertWarehouse): Promise<Warehouse> {
    const [created] = await db.insert(warehouses).values(warehouse).returning();
    return created;
  }

  async updateWarehouse(id: number, updates: Partial<InsertWarehouse>): Promise<Warehouse | undefined> {
    const [warehouse] = await db.update(warehouses).set(updates).where(eq(warehouses.id, id)).returning();
    return warehouse || undefined;
  }

  async deleteWarehouse(id: number): Promise<boolean> {
    const result = await db.delete(warehouses).where(eq(warehouses.id, id));
    return result.rowCount > 0;
  }

  // Invitations
  async createInvitation(invitation: InsertInvitation): Promise<Invitation> {
    const [created] = await db.insert(invitations).values(invitation).returning();
    return created;
  }

  async getInvitationByToken(token: string): Promise<Invitation | undefined> {
    const [invitation] = await db.select().from(invitations).where(eq(invitations.token, token));
    return invitation || undefined;
  }

  async markInvitationAsUsed(token: string): Promise<boolean> {
    const result = await db.update(invitations)
      .set({ isUsed: true })
      .where(eq(invitations.token, token));
    return result.rowCount > 0;
  }

  async getCompanyInvitations(companyId: number): Promise<Invitation[]> {
    return await db.select().from(invitations).where(eq(invitations.companyId, companyId));
  }

  // Products
  async getCompanyProducts(companyId: number): Promise<Product[]> {
    return await db.select().from(products).where(eq(products.companyId, companyId));
  }

  async getCompanyProductsStatistics(companyId: number): Promise<{
    total: number;
    activeProducts: number;
    uniqueCategories: number;
    activeSuppliers: number;
  }> {
    // Get all products for the company
    const allProducts = await db.select().from(products).where(eq(products.companyId, companyId));
    
    // Calculate statistics
    const total = allProducts.length;
    const activeProducts = allProducts.filter(p => p.status === 'active').length;
    const uniqueCategories = new Set(allProducts.map(p => p.category).filter(Boolean)).size;
    const activeSuppliers = new Set(allProducts.map(p => p.supplierName).filter(Boolean)).size;
    
    return {
      total,
      activeProducts,
      uniqueCategories,
      activeSuppliers
    };
  }

  async getCompanyProductsPaginated(
    companyId: number,
    options: {
      page: number;
      limit: number;
      search?: string;
      statuses?: string[];
      categoryFilters?: string[];
      valueStreams?: string[];
      brands?: string[];
      suppliers?: string[];
      sortField?: string;
      sortOrder?: "asc" | "desc";
    }
  ): Promise<{ products: Product[]; total: number; totalPages: number }> {
    const { page, limit, search, statuses, categoryFilters, valueStreams, brands, suppliers, sortField = "productName", sortOrder = "asc" } = options;
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [eq(products.companyId, companyId)];

    if (search) {
      conditions.push(
        or(
          ilike(products.productName, `%${search}%`),
          ilike(products.sku, `%${search}%`),
          ilike(products.brandName, `%${search}%`),
          ilike(products.supplierName, `%${search}%`)
        )!
      );
    }

    if (statuses && statuses.length > 0) {
      conditions.push(inArray(products.status, statuses));
    }

    if (categoryFilters && categoryFilters.length > 0) {
      const catConditions = categoryFilters.map(filter => {
        if (filter.includes(" > ")) {
          const [vs, cat] = filter.split(" > ");
          return and(eq(products.valueStream, vs), eq(products.category, cat))!;
        } else {
          return or(eq(products.valueStream, filter), eq(products.category, filter))!;
        }
      });
      conditions.push(or(...catConditions)!);
    }

    if (valueStreams && valueStreams.length > 0) {
      conditions.push(inArray(products.valueStream, valueStreams));
    }

    if (brands && brands.length > 0) {
      conditions.push(inArray(products.brandName, brands));
    }

    if (suppliers && suppliers.length > 0) {
      conditions.push(inArray(products.supplierName, suppliers));
    }

    const whereClause = and(...conditions);

    // Get total count
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .where(whereClause);
    
    const total = totalResult[0].count;

    // Get products with pagination and sorting
    const sortColumn = sortField === "productName" ? products.productName :
                      sortField === "category" ? products.category :
                      sortField === "brandName" ? products.brandName :
                      sortField === "status" ? products.status :
                      products.productName;

    const productsResult = await db
      .select()
      .from(products)
      .where(whereClause)
      .orderBy(sortOrder === "desc" ? desc(sortColumn) : asc(sortColumn))
      .limit(limit)
      .offset(offset);

    const totalPages = Math.ceil(total / limit);

    return {
      products: productsResult,
      total,
      totalPages
    };
  }

  async getCompanyProductsMetadata(companyId: number): Promise<{
    categoryHierarchy: Record<string, string[]>;
    statuses: string[];
    brands: string[];
    suppliers: string[];
  }> {
    const rows = await db
      .select({ valueStream: products.valueStream, category: products.category, status: products.status, brandName: products.brandName, supplierName: products.supplierName })
      .from(products)
      .where(eq(products.companyId, companyId));

    const hierarchy: Record<string, string[]> = {};
    const statusSet = new Set<string>();
    const brandSet = new Set<string>();
    const supplierSet = new Set<string>();

    for (const row of rows) {
      if (row.status) statusSet.add(row.status);
      if (row.brandName) brandSet.add(row.brandName);
      if (row.supplierName) supplierSet.add(row.supplierName);
      const vs = row.valueStream || "Uncategorized";
      const cat = row.category || "Uncategorized";
      if (!hierarchy[vs]) hierarchy[vs] = [];
      if (!hierarchy[vs].includes(cat)) hierarchy[vs].push(cat);
    }

    Object.values(hierarchy).forEach(cats => cats.sort());

    return {
      categoryHierarchy: hierarchy,
      statuses: [...statusSet].sort(),
      brands: [...brandSet].sort(),
      suppliers: [...supplierSet].sort(),
    };
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [created] = await db.insert(products).values(product).returning();
    return created;
  }

  async createBulkProducts(productList: InsertProduct[]): Promise<Product[]> {
    const created = await db.insert(products).values(productList).returning();
    return created;
  }

  async updateProduct(id: number, updates: Partial<InsertProduct>): Promise<Product | undefined> {
    const [product] = await db.update(products).set({ ...updates, updatedAt: new Date() }).where(eq(products.id, id)).returning();
    return product || undefined;
  }

  async deleteProduct(id: number): Promise<boolean> {
    const result = await db.delete(products).where(eq(products.id, id));
    return result.rowCount > 0;
  }

  // Yandex Market Stocks
  async upsertYandexMarketStocks(
    companyId: number,
    stockRows: { sku: string; stockAvailable: number; stockInTransit: number }[]
  ): Promise<void> {
    if (stockRows.length === 0) return;
    const values = stockRows.map(r => ({
      companyId,
      sku: r.sku,
      stockAvailable: r.stockAvailable,
      stockInTransit: r.stockInTransit,
      syncedAt: new Date(),
    }));
    // Upsert in batches of 500
    const BATCH = 500;
    for (let i = 0; i < values.length; i += BATCH) {
      await db.insert(yandexMarketStocks)
        .values(values.slice(i, i + BATCH))
        .onConflictDoUpdate({
          target: [yandexMarketStocks.companyId, yandexMarketStocks.sku],
          set: {
            stockAvailable: sql`excluded.stock_available`,
            stockInTransit: sql`excluded.stock_in_transit`,
            syncedAt: sql`excluded.synced_at`,
          },
        });
    }
  }

  async getYandexMarketStocks(companyId: number): Promise<Record<string, { available: number; inTransit: number; freeze: number; quarantine: number; defect: number; syncedAt: Date | null }>> {
    const rows = await db
      .select({
        sku: yandexMarketStockDetails.sku,
        available: sql<number>`sum(case when ${yandexMarketStockDetails.stockType} = 'AVAILABLE' then ${yandexMarketStockDetails.count} else 0 end)`.as("available"),
        freeze: sql<number>`sum(case when ${yandexMarketStockDetails.stockType} = 'FREEZE' then ${yandexMarketStockDetails.count} else 0 end)`.as("freeze"),
        quarantine: sql<number>`sum(case when ${yandexMarketStockDetails.stockType} = 'QUARANTINE' then ${yandexMarketStockDetails.count} else 0 end)`.as("quarantine"),
        defect: sql<number>`sum(case when ${yandexMarketStockDetails.stockType} = 'DEFECT' then ${yandexMarketStockDetails.count} else 0 end)`.as("defect"),
        syncedAt: sql<Date>`max(${yandexMarketStockDetails.syncedAt})`.as("synced_at"),
      })
      .from(yandexMarketStockDetails)
      .where(eq(yandexMarketStockDetails.companyId, companyId))
      .groupBy(yandexMarketStockDetails.sku);
    const map: Record<string, { available: number; inTransit: number; freeze: number; quarantine: number; defect: number; syncedAt: Date | null }> = {};
    for (const row of rows) {
      map[row.sku] = { available: Number(row.available), inTransit: 0, freeze: Number(row.freeze), quarantine: Number(row.quarantine), defect: Number(row.defect), syncedAt: pgTs(row.syncedAt) };
    }
    return map;
  }

  async upsertYandexMarketStockDetails(
    companyId: number,
    details: { sku: string; warehouseId: number; warehouseName: string; stockType: string; count: number }[]
  ): Promise<void> {
    if (details.length === 0) return;
    const BATCH = 500;
    const now = new Date();
    for (let i = 0; i < details.length; i += BATCH) {
      const values = details.slice(i, i + BATCH).map(d => ({
        companyId,
        sku: d.sku,
        warehouseId: d.warehouseId,
        warehouseName: d.warehouseName,
        stockType: d.stockType,
        count: d.count,
        syncedAt: now,
      }));
      await db.insert(yandexMarketStockDetails)
        .values(values)
        .onConflictDoUpdate({
          target: [yandexMarketStockDetails.companyId, yandexMarketStockDetails.sku, yandexMarketStockDetails.warehouseId, yandexMarketStockDetails.stockType],
          set: {
            count: sql`excluded.count`,
            warehouseName: sql`excluded.warehouse_name`,
            syncedAt: sql`excluded.synced_at`,
          },
        });
    }
  }

  async getYandexMarketStockDetails(
    companyId: number,
    sku: string
  ): Promise<{ warehouseId: number; warehouseName: string | null; stockType: string; count: number }[]> {
    const rows = await db
      .select()
      .from(yandexMarketStockDetails)
      .where(
        and(
          eq(yandexMarketStockDetails.companyId, companyId),
          eq(yandexMarketStockDetails.sku, sku)
        )
      );
    return rows.map((r: typeof yandexMarketStockDetails.$inferSelect) => ({
      warehouseId: r.warehouseId,
      warehouseName: r.warehouseName,
      stockType: r.stockType,
      count: r.count,
    }));
  }

  // Ozon Stocks
  async upsertOzonStocks(
    companyId: number,
    stockRows: { sku: string; availableStockCount: number; transitStockCount: number }[]
  ): Promise<void> {
    if (stockRows.length === 0) return;
    const BATCH = 500;
    const now = new Date();
    for (let i = 0; i < stockRows.length; i += BATCH) {
      const values = stockRows.slice(i, i + BATCH).map(r => ({
        companyId,
        sku: r.sku,
        availableStockCount: r.availableStockCount,
        transitStockCount: r.transitStockCount,
        syncedAt: now,
      }));
      await db.insert(ozonStocks)
        .values(values)
        .onConflictDoUpdate({
          target: [ozonStocks.companyId, ozonStocks.sku],
          set: {
            availableStockCount: sql`excluded.available_stock_count`,
            transitStockCount: sql`excluded.transit_stock_count`,
            syncedAt: sql`excluded.synced_at`,
          },
        });
    }
  }

  async getOzonStocks(companyId: number): Promise<Record<string, { available: number; inTransit: number; quarantine: number; defect: number; syncedAt: Date | null }>> {
    const rows = await db
      .select({
        sku: ozonStockDetails.sku,
        available: sql<number>`sum(${ozonStockDetails.availableStockCount})`.as("available"),
        inTransit: sql<number>`sum(${ozonStockDetails.transitStockCount})`.as("in_transit"),
        quarantine: sql<number>`sum(${ozonStockDetails.waitingDocsStockCount} + ${ozonStockDetails.expiringStockCount} + ${ozonStockDetails.otherStockCount} + ${ozonStockDetails.returnFromCustomerStockCount} + ${ozonStockDetails.returnToSellerStockCount})`.as("quarantine"),
        defect: sql<number>`sum(${ozonStockDetails.stockDefectStockCount})`.as("defect"),
        syncedAt: sql<Date>`max(${ozonStockDetails.syncedAt})`.as("synced_at"),
      })
      .from(ozonStockDetails)
      .where(eq(ozonStockDetails.companyId, companyId))
      .groupBy(ozonStockDetails.sku);
    const map: Record<string, { available: number; inTransit: number; quarantine: number; defect: number; syncedAt: Date | null }> = {};
    for (const row of rows) {
      map[row.sku] = { available: Number(row.available), inTransit: Number(row.inTransit), quarantine: Number(row.quarantine), defect: Number(row.defect), syncedAt: pgTs(row.syncedAt) };
    }
    return map;
  }

  async upsertOzonStockDetails(
    companyId: number,
    details: {
      sku: string; ozonSku: string | undefined; warehouseId: string; warehouseName: string | undefined;
      clusterName: string | undefined; availableStockCount: number; validStockCount: number;
      waitingDocsStockCount: number; expiringStockCount: number; transitDefectStockCount: number;
      stockDefectStockCount: number; excessStockCount: number; otherStockCount: number;
      requestedStockCount: number; transitStockCount: number; returnFromCustomerStockCount: number;
      returnToSellerStockCount: number;
    }[]
  ): Promise<void> {
    if (details.length === 0) return;
    const BATCH = 500;
    const now = new Date();
    for (let i = 0; i < details.length; i += BATCH) {
      const values = details.slice(i, i + BATCH).map(d => ({
        companyId,
        sku: d.sku,
        ozonSku: d.ozonSku ?? null,
        warehouseId: d.warehouseId,
        warehouseName: d.warehouseName ?? null,
        clusterName: d.clusterName ?? null,
        availableStockCount: d.availableStockCount,
        validStockCount: d.validStockCount,
        waitingDocsStockCount: d.waitingDocsStockCount,
        expiringStockCount: d.expiringStockCount,
        transitDefectStockCount: d.transitDefectStockCount,
        stockDefectStockCount: d.stockDefectStockCount,
        excessStockCount: d.excessStockCount,
        otherStockCount: d.otherStockCount,
        requestedStockCount: d.requestedStockCount,
        transitStockCount: d.transitStockCount,
        returnFromCustomerStockCount: d.returnFromCustomerStockCount,
        returnToSellerStockCount: d.returnToSellerStockCount,
        syncedAt: now,
      }));
      await db.insert(ozonStockDetails)
        .values(values)
        .onConflictDoUpdate({
          target: [ozonStockDetails.companyId, ozonStockDetails.sku, ozonStockDetails.warehouseId],
          set: {
            ozonSku: sql`excluded.ozon_sku`,
            warehouseName: sql`excluded.warehouse_name`,
            clusterName: sql`excluded.cluster_name`,
            availableStockCount: sql`excluded.available_stock_count`,
            validStockCount: sql`excluded.valid_stock_count`,
            waitingDocsStockCount: sql`excluded.waiting_docs_stock_count`,
            expiringStockCount: sql`excluded.expiring_stock_count`,
            transitDefectStockCount: sql`excluded.transit_defect_stock_count`,
            stockDefectStockCount: sql`excluded.stock_defect_stock_count`,
            excessStockCount: sql`excluded.excess_stock_count`,
            otherStockCount: sql`excluded.other_stock_count`,
            requestedStockCount: sql`excluded.requested_stock_count`,
            transitStockCount: sql`excluded.transit_stock_count`,
            returnFromCustomerStockCount: sql`excluded.return_from_customer_stock_count`,
            returnToSellerStockCount: sql`excluded.return_to_seller_stock_count`,
            syncedAt: sql`excluded.synced_at`,
          },
        });
    }
  }

  async getOzonStockDetails(
    companyId: number,
    sku: string
  ): Promise<{
    warehouseId: string; warehouseName: string | null; clusterName: string | null;
    availableStockCount: number; validStockCount: number; waitingDocsStockCount: number;
    expiringStockCount: number; transitDefectStockCount: number; stockDefectStockCount: number;
    excessStockCount: number; otherStockCount: number; requestedStockCount: number;
    transitStockCount: number; returnFromCustomerStockCount: number; returnToSellerStockCount: number;
  }[]> {
    const rows = await db.select().from(ozonStockDetails).where(
      and(eq(ozonStockDetails.companyId, companyId), eq(ozonStockDetails.sku, sku))
    );
    return rows.map((r: typeof ozonStockDetails.$inferSelect) => ({
      warehouseId: r.warehouseId,
      warehouseName: r.warehouseName,
      clusterName: r.clusterName,
      availableStockCount: r.availableStockCount,
      validStockCount: r.validStockCount,
      waitingDocsStockCount: r.waitingDocsStockCount,
      expiringStockCount: r.expiringStockCount,
      transitDefectStockCount: r.transitDefectStockCount,
      stockDefectStockCount: r.stockDefectStockCount,
      excessStockCount: r.excessStockCount,
      otherStockCount: r.otherStockCount,
      requestedStockCount: r.requestedStockCount,
      transitStockCount: r.transitStockCount,
      returnFromCustomerStockCount: r.returnFromCustomerStockCount,
      returnToSellerStockCount: r.returnToSellerStockCount,
    }));
  }

  // Wildberries Stocks
  async upsertWildberriesStocks(
    companyId: number,
    stockRows: { sku: string; stockAvailable: number; stockInTransit: number }[]
  ): Promise<void> {
    if (stockRows.length === 0) return;
    const BATCH = 500;
    const now = new Date();
    for (let i = 0; i < stockRows.length; i += BATCH) {
      const values = stockRows.slice(i, i + BATCH).map(r => ({
        companyId,
        sku: r.sku,
        stockAvailable: r.stockAvailable,
        stockInTransit: r.stockInTransit,
        syncedAt: now,
      }));
      await db.insert(wildberriesStocks)
        .values(values)
        .onConflictDoUpdate({
          target: [wildberriesStocks.companyId, wildberriesStocks.sku],
          set: {
            stockAvailable: sql`excluded.stock_available`,
            stockInTransit: sql`excluded.stock_in_transit`,
            syncedAt: sql`excluded.synced_at`,
          },
        });
    }
  }

  async getWildberriesStocks(companyId: number): Promise<Record<string, { available: number; inTransit: number; reserve: number; quarantine: number; syncedAt: Date | null }>> {
    const rows = await db
      .select({
        sku: wildberriesStockDetails.sku,
        available: sql<number>`sum(greatest(0, ${wildberriesStockDetails.quantityFull} - ${wildberriesStockDetails.inWayToClient} - ${wildberriesStockDetails.inWayFromClient}))`.as("available"),
        inTransit: sql<number>`sum(${wildberriesStockDetails.inWayToClient})`.as("in_transit"),
        quarantine: sql<number>`sum(${wildberriesStockDetails.inWayFromClient})`.as("quarantine"),
        syncedAt: sql<Date>`max(${wildberriesStockDetails.syncedAt})`.as("synced_at"),
      })
      .from(wildberriesStockDetails)
      .where(eq(wildberriesStockDetails.companyId, companyId))
      .groupBy(wildberriesStockDetails.sku);
    const map: Record<string, { available: number; inTransit: number; reserve: number; quarantine: number; syncedAt: Date | null }> = {};
    for (const row of rows) {
      map[row.sku] = { available: Number(row.available), inTransit: Number(row.inTransit), reserve: Number(row.inTransit), quarantine: Number(row.quarantine), syncedAt: pgTs(row.syncedAt) };
    }
    return map;
  }

  async upsertWildberriesStockDetails(
    companyId: number,
    details: {
      sku: string; warehouseName: string;
      quantityFull: number; quantityNotInOrders: number;
      inWayToClient: number; inWayFromClient: number;
    }[]
  ): Promise<void> {
    if (details.length === 0) return;
    const BATCH = 500;
    const now = new Date();
    for (let i = 0; i < details.length; i += BATCH) {
      const values = details.slice(i, i + BATCH).map(d => ({
        companyId,
        sku: d.sku,
        warehouseName: d.warehouseName,
        quantityFull: d.quantityFull,
        quantityNotInOrders: d.quantityNotInOrders,
        inWayToClient: d.inWayToClient,
        inWayFromClient: d.inWayFromClient,
        syncedAt: now,
      }));
      await db.insert(wildberriesStockDetails)
        .values(values)
        .onConflictDoUpdate({
          target: [wildberriesStockDetails.companyId, wildberriesStockDetails.sku, wildberriesStockDetails.warehouseName],
          set: {
            quantityFull: sql`excluded.quantity_full`,
            quantityNotInOrders: sql`excluded.quantity_not_in_orders`,
            inWayToClient: sql`excluded.in_way_to_client`,
            inWayFromClient: sql`excluded.in_way_from_client`,
            syncedAt: sql`excluded.synced_at`,
          },
        });
    }
  }

  async getWildberriesStockDetails(
    companyId: number,
    sku: string
  ): Promise<{
    warehouseName: string;
    quantityFull: number;
    quantityNotInOrders: number;
    inWayToClient: number;
    inWayFromClient: number;
  }[]> {
    const rows = await db.select().from(wildberriesStockDetails).where(
      and(eq(wildberriesStockDetails.companyId, companyId), eq(wildberriesStockDetails.sku, sku))
    );
    return rows.map((r: typeof wildberriesStockDetails.$inferSelect) => ({
      warehouseName: r.warehouseName,
      quantityFull: r.quantityFull,
      quantityNotInOrders: r.quantityNotInOrders,
      inWayToClient: r.inWayToClient,
      inWayFromClient: r.inWayFromClient,
    }));
  }

  // 3PL Stocks
  async upsertThreeplStocks(
    companyId: number,
    stockRows: { sku: string; stockAvailable: number }[]
  ): Promise<void> {
    if (stockRows.length === 0) return;
    const BATCH = 500;
    const now = new Date();
    for (let i = 0; i < stockRows.length; i += BATCH) {
      const values = stockRows.slice(i, i + BATCH).map(r => ({
        companyId,
        sku: r.sku,
        stockAvailable: r.stockAvailable,
        syncedAt: now,
      }));
      await db.insert(threeplStocks)
        .values(values)
        .onConflictDoUpdate({
          target: [threeplStocks.companyId, threeplStocks.sku],
          set: {
            stockAvailable: sql`excluded.stock_available`,
            syncedAt: sql`excluded.synced_at`,
          },
        });
    }
  }

  async getThreeplStocks(companyId: number): Promise<Record<string, { available: number; reserve: number; defect: number; syncedAt: Date | null }>> {
    const rows = await db.select().from(threeplStocks).where(eq(threeplStocks.companyId, companyId));
    const map: Record<string, { available: number; reserve: number; defect: number; syncedAt: Date | null }> = {};
    for (const row of rows) {
      map[row.sku] = { available: row.stockAvailable, reserve: 0, defect: 0, syncedAt: row.syncedAt };
    }
    const detailAgg = await db
      .select({
        sku: threeplStockDetails.sku,
        reserve: sql<number>`sum(${threeplStockDetails.qtyReserved})`.as("reserve"),
        defect: sql<number>`sum(${threeplStockDetails.qtyDefect})`.as("defect"),
      })
      .from(threeplStockDetails)
      .where(eq(threeplStockDetails.companyId, companyId))
      .groupBy(threeplStockDetails.sku);
    for (const row of detailAgg) {
      if (map[row.sku]) {
        map[row.sku].reserve = Number(row.reserve);
        map[row.sku].defect = Number(row.defect);
      }
    }
    return map;
  }

  async upsertThreeplStockDetails(
    companyId: number,
    details: { sku: string; warehouseId: number | null; warehouseName: string; qtyNew: number; qtyDefect: number; qtyReserved: number; qtyExpected: number }[]
  ): Promise<void> {
    if (details.length === 0) return;
    const BATCH = 500;
    const now = new Date();
    for (let i = 0; i < details.length; i += BATCH) {
      const values = details.slice(i, i + BATCH).map(d => ({
        companyId,
        sku: d.sku,
        warehouseId: d.warehouseId,
        warehouseName: d.warehouseName,
        qtyNew: d.qtyNew,
        qtyDefect: d.qtyDefect,
        qtyReserved: d.qtyReserved,
        qtyExpected: d.qtyExpected,
        syncedAt: now,
      }));
      await db.insert(threeplStockDetails)
        .values(values)
        .onConflictDoUpdate({
          target: [threeplStockDetails.companyId, threeplStockDetails.sku, threeplStockDetails.warehouseName],
          set: {
            qtyNew: sql`excluded.qty_new`,
            qtyDefect: sql`excluded.qty_defect`,
            qtyReserved: sql`excluded.qty_reserved`,
            qtyExpected: sql`excluded.qty_expected`,
            warehouseId: sql`excluded.warehouse_id`,
            syncedAt: sql`excluded.synced_at`,
          },
        });
    }
  }

  async getThreeplStockDetails(
    companyId: number,
    sku: string
  ): Promise<{ warehouseId: number | null; warehouseName: string; qtyNew: number; qtyDefect: number; qtyReserved: number; qtyExpected: number }[]> {
    const rows = await db.select().from(threeplStockDetails).where(
      and(eq(threeplStockDetails.companyId, companyId), eq(threeplStockDetails.sku, sku))
    );
    return rows
      .filter((r: typeof threeplStockDetails.$inferSelect) => r.qtyNew + r.qtyDefect + r.qtyReserved + r.qtyExpected > 0)
      .sort((a: typeof threeplStockDetails.$inferSelect, b: typeof threeplStockDetails.$inferSelect) => b.qtyNew - a.qtyNew)
      .map((r: typeof threeplStockDetails.$inferSelect) => ({
        warehouseId: r.warehouseId,
        warehouseName: r.warehouseName,
        qtyNew: r.qtyNew,
        qtyDefect: r.qtyDefect,
        qtyReserved: r.qtyReserved,
        qtyExpected: r.qtyExpected,
      }));
  }

  async upsertWBTransitStocks(companyId: number, rows: { sku: string; qtyInTransit: number }[]): Promise<void> {
    await db.delete(wbTransitStocks).where(eq(wbTransitStocks.companyId, companyId));
    if (rows.length === 0) return;
    await db.insert(wbTransitStocks).values(
      rows.map((r) => ({ companyId, sku: r.sku, qtyInTransit: r.qtyInTransit, syncedAt: new Date() }))
    );
  }

  async getWBTransitStocks(companyId: number): Promise<Record<string, number>> {
    const rows = await db.select().from(wbTransitStocks).where(eq(wbTransitStocks.companyId, companyId));
    const map: Record<string, number> = {};
    for (const row of rows) map[row.sku] = row.qtyInTransit;
    return map;
  }

  async upsertWBSupplies(companyId: number, rows: {
    supplyId: number; preorderId: number | null; statusId: number; boxTypeId: number | null;
    phone: string | null;
    createDate: Date | null; supplyDate: Date | null; factDate: Date | null; updatedDate: Date | null;
    warehouseId: number | null; warehouseName: string | null;
    actualWarehouseId: number | null; actualWarehouseName: string | null;
    transitWarehouseId: number | null; transitWarehouseName: string | null;
    acceptanceCost: number | null; paidAcceptanceCoefficient: number | null;
    rejectReason: string | null; supplierAssignName: string | null;
    storageCoef: string | null; deliveryCoef: string | null;
    quantity: number; acceptedQuantity: number; readyForSaleQuantity: number; unloadingQuantity: number;
    depersonalizedQuantity: number; isBoxOnPallet: boolean | null;
  }[]): Promise<void> {
    await db.transaction(async (tx: any) => {
      await tx.delete(wbSupplies).where(eq(wbSupplies.companyId, companyId));
      if (rows.length > 0) {
        await tx.insert(wbSupplies).values(rows.map((r) => ({ companyId, ...r, syncedAt: new Date() })));
      }
    });
  }

  async upsertWBSupplyGoods(companyId: number, rows: {
    supplyId: number; warehouseName: string | null; vendorCode: string;
    barcode: string | null; nmId: number | null; techSize: string | null; color: string | null;
    needKiz: boolean | null; tnved: string | null; supplierBoxAmount: number | null;
    quantity: number; readyForSaleQuantity: number; unloadingQuantity: number; acceptedQuantity: number;
  }[]): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(wbSupplyGoods).where(eq(wbSupplyGoods.companyId, companyId));
      if (rows.length > 0) {
        const BATCH = 500;
        const now = new Date();
        for (let i = 0; i < rows.length; i += BATCH) {
          await tx.insert(wbSupplyGoods).values(rows.slice(i, i + BATCH).map((r) => ({ companyId, ...r, syncedAt: now })));
        }
      }
    });
  }

  async getWBTransitByWarehouse(companyId: number, sku: string): Promise<{
    warehouseName: string | null;
    qtyInTransit: number;
    qtyUnloading: number;
    qtyAccepted: number;
  }[]> {
    const safeSku = sku.replace(/'/g, "''");
    const rows = await db.execute(sql.raw(`
      SELECT
        warehouse_name AS "warehouseName",
        SUM(GREATEST(0, quantity - ready_for_sale_quantity))::int AS "qtyInTransit",
        SUM(unloading_quantity)::int AS "qtyUnloading",
        SUM(accepted_quantity)::int AS "qtyAccepted"
      FROM wb_supply_goods
      WHERE company_id = ${companyId}
        AND (
          vendor_code = '${safeSku}'
          OR barcode = (
            SELECT barcode FROM products
            WHERE company_id = ${companyId} AND sku = '${safeSku}' AND barcode IS NOT NULL
            LIMIT 1
          )
        )
      GROUP BY warehouse_name
    `)) as any;
    const rowsArr = (rows.rows ?? rows) as any[];
    return rowsArr.map((r: any) => ({
      warehouseName: r.warehouseName,
      qtyInTransit: Number(r.qtyInTransit),
      qtyUnloading: Number(r.qtyUnloading),
      qtyAccepted: Number(r.qtyAccepted),
    }));
  }

  async getInboundOrders(companyId: number, opts: {
    page?: number; limit?: number; search?: string;
    valueStreams?: string[]; categories?: string[];
    productionStatuses?: string[]; logisticStatuses?: string[];
    etaActualFrom?: string; etaActualTo?: string;
  } = {}) {
    const { page = 1, limit = 100, search, valueStreams, categories, productionStatuses, logisticStatuses, etaActualFrom, etaActualTo } = opts;
    const offset = (page - 1) * limit;

    const conditions = [eq(inboundOrders.companyId, companyId)];
    if (search) {
      const like = `%${search}%`;
      conditions.push(or(
        ilike(inboundOrders.ssku, like),
        ilike(inboundOrders.sskuName, like),
        ilike(inboundOrders.supplierName, like),
        ilike(inboundOrders.piNumber, like),
        ilike(inboundOrders.poNumber, like),
      )!);
    }
    if (valueStreams?.length) conditions.push(inArray(inboundOrders.valueStream, valueStreams));
    if (categories?.length) conditions.push(inArray(inboundOrders.category, categories));
    if (productionStatuses?.length) conditions.push(inArray(inboundOrders.productionStatus, productionStatuses));
    if (logisticStatuses?.length) conditions.push(inArray(inboundOrders.logisticStatus, logisticStatuses));
    if (etaActualFrom) conditions.push(sql`${inboundOrders.etaActual} >= ${etaActualFrom}::date`);
    if (etaActualTo) conditions.push(sql`${inboundOrders.etaActual} <= ${etaActualTo}::date`);

    const where = and(...conditions);
    const [rows, countResult] = await Promise.all([
      db.select().from(inboundOrders).where(where).orderBy(desc(inboundOrders.createdAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(inboundOrders).where(where),
    ]);
    const total = countResult[0]?.count ?? 0;
    return { rows, total, totalPages: Math.ceil(total / limit) };
  }

  async getInboundStats(companyId: number, opts: {
    search?: string;
    valueStreams?: string[]; categories?: string[];
    productionStatuses?: string[]; logisticStatuses?: string[];
    etaActualFrom?: string; etaActualTo?: string;
  } = {}) {
    const { search, valueStreams, categories, productionStatuses, logisticStatuses, etaActualFrom, etaActualTo } = opts;
    const conditions = [eq(inboundOrders.companyId, companyId)];
    if (search) {
      const like = `%${search}%`;
      conditions.push(or(
        ilike(inboundOrders.ssku, like),
        ilike(inboundOrders.sskuName, like),
        ilike(inboundOrders.supplierName, like),
        ilike(inboundOrders.piNumber, like),
        ilike(inboundOrders.poNumber, like),
      )!);
    }
    if (valueStreams?.length) conditions.push(inArray(inboundOrders.valueStream, valueStreams));
    if (categories?.length) conditions.push(inArray(inboundOrders.category, categories));
    if (productionStatuses?.length) conditions.push(inArray(inboundOrders.productionStatus, productionStatuses));
    if (logisticStatuses?.length) conditions.push(inArray(inboundOrders.logisticStatus, logisticStatuses));
    if (etaActualFrom) conditions.push(sql`${inboundOrders.etaActual} >= ${etaActualFrom}::date`);
    if (etaActualTo) conditions.push(sql`${inboundOrders.etaActual} <= ${etaActualTo}::date`);

    const where = and(...conditions);
    const [result] = await db.select({
      orders: sql<number>`count(distinct ${inboundOrders.poNumber}) FILTER (WHERE ${inboundOrders.poNumber} IS NOT NULL AND ${inboundOrders.poNumber} <> '')::int`,
      delivered: sql<number>`count(distinct ${inboundOrders.poNumber}) FILTER (WHERE ${inboundOrders.logisticStatus} = 'Доставлен' AND ${inboundOrders.poNumber} IS NOT NULL AND ${inboundOrders.poNumber} <> '')::int`,
      onTheWay: sql<number>`count(distinct ${inboundOrders.poNumber}) FILTER (WHERE ${inboundOrders.productionStatus} = 'Production is finished' AND ${inboundOrders.logisticStatus} IS DISTINCT FROM 'Доставлен' AND ${inboundOrders.poNumber} IS NOT NULL AND ${inboundOrders.poNumber} <> '')::int`,
    }).from(inboundOrders).where(where);

    const orders = result?.orders ?? 0;
    const delivered = result?.delivered ?? 0;
    const onTheWay = result?.onTheWay ?? 0;
    return {
      orders,
      delivered,
      onTheWay,
      inProduction: Math.max(0, orders - delivered - onTheWay),
    };
  }

  async getInboundMeta(companyId: number) {
    const rows = await db.select({
      valueStream: inboundOrders.valueStream,
      category: inboundOrders.category,
      productionStatus: inboundOrders.productionStatus,
      logisticStatus: inboundOrders.logisticStatus,
    }).from(inboundOrders).where(eq(inboundOrders.companyId, companyId));

    const uniq = (key: keyof typeof rows[0]) =>
      [...new Set(rows.map((r: typeof rows[0]) => r[key]).filter(Boolean))].sort() as string[];

    const hierarchy: Record<string, string[]> = {};
    rows.forEach((row: typeof rows[0]) => {
      const vs = row.valueStream;
      const cat = row.category;
      if (!vs || !cat) return;
      if (!hierarchy[vs]) hierarchy[vs] = [];
      if (!hierarchy[vs].includes(cat)) hierarchy[vs].push(cat);
    });
    Object.values(hierarchy).forEach(cats => cats.sort());

    return {
      valueStreams: uniq("valueStream"),
      categories: uniq("category"),
      categoryHierarchy: hierarchy,
      productionStatuses: uniq("productionStatus"),
      logisticStatuses: uniq("logisticStatus"),
    };
  }

  async createInboundOrder(companyId: number, data: Record<string, any>) {
    const [row] = await db.insert(inboundOrders)
      .values({ companyId, ...data })
      .returning();
    return row;
  }

  async getInboundOrderedSummary(companyId: number): Promise<Record<string, number>> {
    const rows = await db
      .select({ ssku: inboundOrders.ssku, qty: inboundOrders.quantityPlan })
      .from(inboundOrders)
      .where(and(
        eq(inboundOrders.companyId, companyId),
        sql`${inboundOrders.logisticStatus} IS DISTINCT FROM 'Доставлен'`,
        sql`${inboundOrders.etaActual} >= '2026-01-01'`,
      ));
    const result: Record<string, number> = {};
    for (const r of rows) {
      if (!r.ssku) continue;
      result[r.ssku] = (result[r.ssku] ?? 0) + (Number(r.qty) || 0);
    }
    return result;
  }

  async getInboundOrdersBySku(companyId: number, sku: string) {
    return db
      .select({
        poNumber: inboundOrders.poNumber,
        quantityPlan: inboundOrders.quantityPlan,
        quantityFact: inboundOrders.quantityFact,
        productionStatus: inboundOrders.productionStatus,
        logisticStatus: inboundOrders.logisticStatus,
        etaPlan: inboundOrders.etaPlan,
        etaActual: inboundOrders.etaActual,
      })
      .from(inboundOrders)
      .where(and(
        eq(inboundOrders.companyId, companyId),
        eq(inboundOrders.ssku, sku),
        sql`${inboundOrders.logisticStatus} IS DISTINCT FROM 'Доставлен'`,
        sql`${inboundOrders.etaActual} >= '2026-01-01'`,
      ))
      .orderBy(asc(inboundOrders.etaActual));
  }

  async getInboundOrder(companyId: number, id: number) {
    const [row] = await db.select().from(inboundOrders)
      .where(and(eq(inboundOrders.id, id), eq(inboundOrders.companyId, companyId)));
    return row;
  }

  async updateInboundOrder(companyId: number, id: number, data: Record<string, any>) {
    const [row] = await db.update(inboundOrders)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(inboundOrders.id, id), eq(inboundOrders.companyId, companyId)))
      .returning();
    return row;
  }

  async deleteInboundOrder(companyId: number, id: number): Promise<boolean> {
    const result = await db.delete(inboundOrders)
      .where(and(eq(inboundOrders.id, id), eq(inboundOrders.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  }

  async upsertInboundOrders(
    companyId: number,
    rows: Record<string, any>[]
  ): Promise<{ imported: number; created: number; updated: number; deleted: number; batchId: string }> {
    const batchId = `import_${Date.now()}`;
    const NUMERIC_SUM_FIELDS = ["quantityPlan", "quantityFact", "quantityFactYt", "quantityFactCheck"];
    // Все поля данных — используются для решения «менялась ли строка» (delete+insert) и для актуализации БД из файла.
    const ALL_FIELDS = [
      "valueStream", "category", "ssku", "modelId", "sskuName",
      "supplierId", "supplierName",
      "piNumber", "piDate", "poNumber", "poDate", "ciNumber",
      "poAxapta", "poAxaptaDate",
      "quantityPlan", "quantityFact", "quantityFactYt", "quantityFactCheck",
      "actualContractPrice", "purchasePrice", "currency", "currencyCalc",
      "purchasePriceCheck", "shipmentTerms", "amountSum",
      "etaPlan", "readinessDateActual", "rdaUpdate", "etdPlan", "etaActual",
      "productionStatus", "logisticStatus", "nonDelivery",
      "akTicket", "acPassDate", "plTicket", "glTicket", "replenTicket",
      "creationDate", "replenishmentManager",
    ];
    // Поля, по которым diff попадает в inbound_changes (модальное окно "Последние изменения").
    // Создание/удаление строк логируется отдельно (changeType: created/deleted).
    const TRACKED_FIELDS = new Set([
      "quantityPlan", "quantityFact",
      "etaPlan", "readinessDateActual", "etdPlan", "etaActual",
      "productionStatus", "logisticStatus",
      "replenTicket", "akTicket", "plTicket", "glTicket",
    ]);

    const norm = (s: any) => String(s ?? "").trim();
    const computeKey = (r: Record<string, any>, idx: number): string => {
      const po = norm(r.poNumber).toLowerCase();
      const ssku = norm(r.ssku).toLowerCase();
      if (po && ssku) return `${po}__${ssku}`;
      return `__norow_${idx}`;
    };

    // Aggregate dupes by key: sum numeric, last-wins for the rest
    const aggregated = new Map<string, Record<string, any>>();
    rows.forEach((r, idx) => {
      const key = computeKey(r, idx);
      const existing = aggregated.get(key);
      if (!existing) {
        aggregated.set(key, { ...r });
      } else {
        for (const [k, v] of Object.entries(r)) {
          if (NUMERIC_SUM_FIELDS.includes(k)) {
            const a = Number(existing[k] ?? 0) || 0;
            const b = Number(v ?? 0) || 0;
            existing[k] = a + b;
          } else if (v !== null && v !== undefined && v !== "") {
            existing[k] = v;
          }
        }
      }
    });

    const t1 = Date.now();
    const snapshot = await db.select().from(inboundOrders).where(eq(inboundOrders.companyId, companyId));
    console.log(`[upsertInbound] snapshot loaded ${snapshot.length} rows in ${Date.now() - t1}ms`);
    const snapshotByKey = new Map<string, typeof snapshot[number]>(snapshot.map((r: any) => [r.key, r]));
    const newKeys = new Set(aggregated.keys());
    const isInitialLoad = !snapshot.some((r: any) => !String(r.key).startsWith("row_"));

    const DATE_FIELDS = new Set([
      "piDate", "poDate", "poAxaptaDate", "etaPlan", "readinessDateActual",
      "rdaUpdate", "etdPlan", "etaActual", "acPassDate", "creationDate",
    ]);
    const DECIMAL_FIELDS = new Set([
      "actualContractPrice", "purchasePrice", "purchasePriceCheck", "amountSum",
    ]);

    const normForDiff = (val: any, field: string): string => {
      if (val === null || val === undefined || val === "") return "";
      if (val instanceof Date) {
        const y = val.getUTCFullYear();
        const m = String(val.getUTCMonth() + 1).padStart(2, "0");
        const d = String(val.getUTCDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
      if (DATE_FIELDS.has(field)) {
        const s = String(val).trim();
        const dm = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
        if (dm) {
          const [, d, mo, y] = dm;
          return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
        }
        return s.slice(0, 10);
      }
      if (DECIMAL_FIELDS.has(field) || NUMERIC_SUM_FIELDS.includes(field)) {
        const n = parseFloat(String(val).replace(",", "."));
        return Number.isNaN(n) ? String(val) : String(n);
      }
      return String(val).trim();
    };

    const insertsByKey = new Map<string, any>();   // brand-new rows
    const replacesByKey = new Map<string, any>();  // updated rows (DELETE+INSERT pattern)
    const deleteIds: number[] = [];
    const deleteKeys: string[] = [];
    const changeRows: any[] = [];

    for (const [key, newRow] of aggregated) {
      const old = snapshotByKey.get(key);
      if (!old) {
        insertsByKey.set(key, { companyId, key, ...newRow });
        if (!isInitialLoad) {
          changeRows.push({
            companyId,
            poNumber: newRow.poNumber ?? null,
            ssku: newRow.ssku ?? null,
            field: "*",
            oldValue: null,
            newValue: null,
            changeType: "created",
            importBatchId: batchId,
          });
        }
      } else {
        let anyChange = false;
        for (const f of ALL_FIELDS) {
          if (!(f in newRow)) continue;
          const oldNorm = normForDiff((old as any)[f], f);
          const newNorm = normForDiff(newRow[f], f);
          if (oldNorm !== newNorm) {
            anyChange = true;
            if (TRACKED_FIELDS.has(f)) {
              changeRows.push({
                companyId,
                poNumber: newRow.poNumber ?? old.poNumber ?? null,
                ssku: newRow.ssku ?? old.ssku ?? null,
                field: f,
                oldValue: oldNorm || null,
                newValue: newNorm || null,
                changeType: "updated",
                importBatchId: batchId,
              });
            }
          }
        }
        if (anyChange) {
          replacesByKey.set(key, { companyId, key, ...newRow });
          deleteIds.push(old.id);
          deleteKeys.push(key);
        }
      }
    }

    for (const [key, old] of snapshotByKey) {
      if (newKeys.has(key)) continue;
      deleteIds.push(old.id);
      const isLegacy = key.startsWith("row_");
      if (!isLegacy) {
        changeRows.push({
          companyId,
          poNumber: old.poNumber ?? null,
          ssku: old.ssku ?? null,
          field: "*",
          oldValue: null,
          newValue: null,
          changeType: "deleted",
          importBatchId: batchId,
        });
      }
    }

    const inserts = [...insertsByKey.values(), ...replacesByKey.values()];
    console.log(`[upsertInbound] diff: created=${insertsByKey.size} updated=${replacesByKey.size} deleted=${deleteIds.length - replacesByKey.size} changeRows=${changeRows.length}`);
    const t2 = Date.now();
    await db.transaction(async (tx: any) => {
      const BATCH = 500;
      // 1) bulk delete for both old-version-of-updated and removed rows
      for (let i = 0; i < deleteIds.length; i += BATCH) {
        await tx.delete(inboundOrders).where(inArray(inboundOrders.id, deleteIds.slice(i, i + BATCH)));
      }
      console.log(`[upsertInbound] delete done in ${Date.now() - t2}ms`);
      // 2) bulk insert (created + updated reinserted)
      const t3 = Date.now();
      for (let i = 0; i < inserts.length; i += BATCH) {
        await tx.insert(inboundOrders).values(inserts.slice(i, i + BATCH));
      }
      console.log(`[upsertInbound] insert done in ${Date.now() - t3}ms`);
      // 3) bulk insert change log
      const t4 = Date.now();
      for (let i = 0; i < changeRows.length; i += BATCH) {
        await tx.insert(inboundChanges).values(changeRows.slice(i, i + BATCH));
      }
      console.log(`[upsertInbound] changeRows done in ${Date.now() - t4}ms`);
    });
    console.log(`[upsertInbound] transaction committed in ${Date.now() - t2}ms`);

    return {
      imported: aggregated.size,
      created: insertsByKey.size,
      updated: replacesByKey.size,
      deleted: deleteIds.length - replacesByKey.size,
      batchId,
    };
  }

  async getInboundPoSummary(companyId: number, opts: {
    page?: number; limit?: number; search?: string;
    valueStreams?: string[]; categories?: string[];
    productionStatuses?: string[]; logisticStatuses?: string[];
    etaActualFrom?: string; etaActualTo?: string;
  } = {}) {
    const { page = 1, limit = 100, search, valueStreams, categories, productionStatuses, logisticStatuses, etaActualFrom, etaActualTo } = opts;
    const offset = (page - 1) * limit;

    const conditions = [eq(inboundOrders.companyId, companyId), sql`${inboundOrders.poNumber} IS NOT NULL AND ${inboundOrders.poNumber} <> ''`];
    if (search) {
      const like = `%${search}%`;
      conditions.push(or(
        ilike(inboundOrders.poNumber, like),
        ilike(inboundOrders.ssku, like),
        ilike(inboundOrders.sskuName, like),
        ilike(inboundOrders.supplierName, like),
      )!);
    }
    if (valueStreams?.length) conditions.push(inArray(inboundOrders.valueStream, valueStreams));
    if (categories?.length) conditions.push(inArray(inboundOrders.category, categories));
    if (productionStatuses?.length) conditions.push(inArray(inboundOrders.productionStatus, productionStatuses));
    if (logisticStatuses?.length) conditions.push(inArray(inboundOrders.logisticStatus, logisticStatuses));
    if (etaActualFrom) conditions.push(sql`${inboundOrders.etaActual} >= ${etaActualFrom}::date`);
    if (etaActualTo) conditions.push(sql`${inboundOrders.etaActual} <= ${etaActualTo}::date`);
    const where = and(...conditions);

    const rows = await db.selectDistinctOn([inboundOrders.poNumber], {
      poNumber: inboundOrders.poNumber,
      valueStream: inboundOrders.valueStream,
      category: inboundOrders.category,
      supplierId: inboundOrders.supplierId,
      supplierName: inboundOrders.supplierName,
      etaPlan: inboundOrders.etaPlan,
      readinessDateActual: inboundOrders.readinessDateActual,
      etdPlan: inboundOrders.etdPlan,
      etaActual: inboundOrders.etaActual,
      productionStatus: inboundOrders.productionStatus,
      logisticStatus: inboundOrders.logisticStatus,
      replenTicket: inboundOrders.replenTicket,
      akTicket: inboundOrders.akTicket,
      plTicket: inboundOrders.plTicket,
      glTicket: inboundOrders.glTicket,
    })
      .from(inboundOrders)
      .where(where)
      .orderBy(inboundOrders.poNumber, inboundOrders.id)
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db.select({
      total: sql<number>`count(distinct ${inboundOrders.poNumber})::int`,
    }).from(inboundOrders).where(where);

    return { rows, total: total ?? 0, totalPages: Math.ceil((total ?? 0) / limit) };
  }

  async getInboundPoLines(companyId: number, poNumber: string) {
    return db.select({
      ssku: inboundOrders.ssku,
      sskuName: inboundOrders.sskuName,
      quantityPlan: inboundOrders.quantityPlan,
      quantityFact: inboundOrders.quantityFact,
    })
      .from(inboundOrders)
      .where(and(eq(inboundOrders.companyId, companyId), eq(inboundOrders.poNumber, poNumber)))
      .orderBy(asc(inboundOrders.ssku));
  }

  async getInboundPoChanges(companyId: number, poNumber: string, days: number = 14) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    return db.select()
      .from(inboundChanges)
      .where(and(
        eq(inboundChanges.companyId, companyId),
        eq(inboundChanges.poNumber, poNumber),
        gte(inboundChanges.changedAt, since),
      ))
      .orderBy(desc(inboundChanges.changedAt));
  }

  // Outbound Shipments
  async getOutboundShipments(companyId: number, opts: {
    page?: number; limit?: number; search?: string; marketplaces?: string[];
  } = {}) {
    const { page = 1, limit = 100, search, marketplaces } = opts;
    const offset = (page - 1) * limit;
    const conditions = [eq(outboundShipments.companyId, companyId)];
    if (search) {
      const like = `%${search}%`;
      conditions.push(or(
        ilike(outboundShipments.orderNumber, like),
        ilike(outboundShipments.axaptaIntegrationNumber, like),
        ilike(outboundShipments.warehouseFrom, like),
        ilike(outboundShipments.warehouseTo, like),
        ilike(outboundShipments.carrier, like),
      )!);
    }
    if (marketplaces?.length) conditions.push(inArray(outboundShipments.marketplace, marketplaces));
    const where = and(...conditions);
    const [rows, countResult] = await Promise.all([
      db.select().from(outboundShipments).where(where).orderBy(desc(outboundShipments.createdAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(outboundShipments).where(where),
    ]);
    const total = countResult[0]?.count ?? 0;
    return { rows, total, totalPages: Math.ceil(total / limit) };
  }

  async getOutboundStats(companyId: number, opts: { search?: string; marketplaces?: string[] } = {}) {
    const { search, marketplaces } = opts;
    const conditions = [eq(outboundShipments.companyId, companyId)];
    if (search) {
      const like = `%${search}%`;
      conditions.push(or(
        ilike(outboundShipments.orderNumber, like),
        ilike(outboundShipments.axaptaIntegrationNumber, like),
        ilike(outboundShipments.warehouseFrom, like),
        ilike(outboundShipments.warehouseTo, like),
        ilike(outboundShipments.carrier, like),
      )!);
    }
    if (marketplaces?.length) conditions.push(inArray(outboundShipments.marketplace, marketplaces));
    const where = and(...conditions);
    const [result] = await db.select({
      total: sql<number>`count(*)::int`,
      shipped: sql<number>`count(case when lower(${outboundShipments.status}) like 'отгружено%' then 1 end)::int`,
      cancelled: sql<number>`count(case when lower(${outboundShipments.status}) like 'отмен%' then 1 end)::int`,
    }).from(outboundShipments).where(where);
    const total = result?.total ?? 0;
    const shipped = result?.shipped ?? 0;
    const cancelled = result?.cancelled ?? 0;
    return { total, shipped, cancelled, inProgress: Math.max(0, total - shipped - cancelled) };
  }

  async getOutboundMeta(companyId: number) {
    const rows = await db.select({
      marketplace: outboundShipments.marketplace,
      status: outboundShipments.status,
    }).from(outboundShipments).where(eq(outboundShipments.companyId, companyId));
    const uniq = (key: keyof typeof rows[0]) =>
      [...new Set(rows.map((r: typeof rows[0]) => r[key]).filter(Boolean))].sort() as string[];
    return {
      marketplaces: uniq("marketplace"),
      statuses: uniq("status"),
    };
  }

  async createOutboundShipment(companyId: number, data: Record<string, any>) {
    const [row] = await db.insert(outboundShipments)
      .values({ companyId, ...data })
      .returning();
    return row;
  }

  async updateOutboundShipment(companyId: number, id: number, data: Record<string, any>) {
    const [row] = await db.update(outboundShipments)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(outboundShipments.id, id), eq(outboundShipments.companyId, companyId)))
      .returning();
    return row;
  }

  async deleteOutboundShipment(companyId: number, id: number): Promise<boolean> {
    const result = await db.delete(outboundShipments)
      .where(and(eq(outboundShipments.id, id), eq(outboundShipments.companyId, companyId)));
    return (result.rowCount ?? 0) > 0;
  }

  async upsertOutboundShipments(companyId: number, rows: Record<string, any>[]): Promise<void> {
    if (rows.length === 0) return;
    await db.delete(outboundShipments).where(eq(outboundShipments.companyId, companyId));
    const BATCH = 500;
    const now = new Date();
    for (let i = 0; i < rows.length; i += BATCH) {
      const values = rows.slice(i, i + BATCH).map((r, idx) => ({
        companyId,
        key: `row_${i + idx}`,
        ...r,
        updatedAt: now,
      }));
      await db.insert(outboundShipments).values(values);
    }
  }

  async getInventorySummary(
    companyId: number,
    opts: { search?: string; statuses?: string[]; categoryFilters?: string[] } = {}
  ): Promise<{
    totalActive: number;
    totalAvailability: number;
    ymAvailability: number;
    ozonAvailability: number;
    wbAvailability: number;
    threeplAvailability: number;
  }> {
    const { search, statuses, categoryFilters } = opts;

    // Build dynamic WHERE clauses
    const conditions: string[] = [
      `p.company_id = ${companyId}`,
      `p.status = 'active'`,
    ];

    if (statuses && statuses.length > 0) {
      const list = statuses.map(s => `'${s.replace(/'/g, "''")}'`).join(", ");
      conditions.push(`p.status IN (${list})`);
    }

    if (search && search.trim()) {
      const term = search.trim().replace(/'/g, "''");
      conditions.push(
        `(p.product_name ILIKE '%${term}%' OR p.sku ILIKE '%${term}%' OR p.brand_name ILIKE '%${term}%')`
      );
    }

    if (categoryFilters && categoryFilters.length > 0) {
      const catClauses = categoryFilters.map(f => {
        const parts = f.split(" > ");
        if (parts.length === 1) {
          const vs = parts[0].replace(/'/g, "''");
          return `p.value_stream = '${vs}'`;
        } else {
          const vs = parts[0].replace(/'/g, "''");
          const cat = parts[1].replace(/'/g, "''");
          return `(p.value_stream = '${vs}' AND p.category = '${cat}')`;
        }
      });
      conditions.push(`(${catClauses.join(" OR ")})`);
    }

    const where = conditions.join(" AND ");
    const result = await db.execute(sql.raw(`
      SELECT
        COUNT(*) FILTER (WHERE p.value_stream NOT IN ('Fashion', 'Alice'))::int          AS total_active,
        COUNT(*) FILTER (WHERE
          p.value_stream NOT IN ('Fashion', 'Alice')
          AND (
            COALESCE(pl.stock_available, 0) > 0
            OR EXISTS (
              SELECT 1 FROM yandex_market_stock_details yd
              WHERE yd.company_id = p.company_id
                AND yd.sku = p.sku
                AND yd.warehouse_id = 313
                AND yd.stock_type = 'AVAILABLE'
                AND yd.count > 0
            )
            OR (
              COALESCE(ym.stock_available, 0) > 0
              AND COALESCE(oz.available_stock_count, 0) > 0
              AND COALESCE(wb.stock_available, 0) > 0
            )
          )
        )::int                                                                          AS total_availability,
        COUNT(*) FILTER (WHERE
          p.value_stream NOT IN ('Fashion', 'Alice')
          AND (
            COALESCE(pl.stock_available, 0) > 0
            OR EXISTS (SELECT 1 FROM yandex_market_stock_details yd WHERE yd.company_id = p.company_id AND yd.sku = p.sku AND yd.warehouse_id = 313 AND yd.stock_type = 'AVAILABLE' AND yd.count > 0)
            OR (COALESCE(ym.stock_available, 0) > 0 AND COALESCE(oz.available_stock_count, 0) > 0 AND COALESCE(wb.stock_available, 0) > 0)
          )
          AND COALESCE(ym.stock_available, 0) > 0)::int                                AS ym_availability,
        COUNT(*) FILTER (WHERE
          p.value_stream NOT IN ('Fashion', 'Alice')
          AND (
            COALESCE(pl.stock_available, 0) > 0
            OR EXISTS (SELECT 1 FROM yandex_market_stock_details yd WHERE yd.company_id = p.company_id AND yd.sku = p.sku AND yd.warehouse_id = 313 AND yd.stock_type = 'AVAILABLE' AND yd.count > 0)
            OR (COALESCE(ym.stock_available, 0) > 0 AND COALESCE(oz.available_stock_count, 0) > 0 AND COALESCE(wb.stock_available, 0) > 0)
          )
          AND COALESCE(oz.available_stock_count, 0) > 0)::int                          AS ozon_availability,
        COUNT(*) FILTER (WHERE
          p.value_stream NOT IN ('Fashion', 'Alice')
          AND (
            COALESCE(pl.stock_available, 0) > 0
            OR EXISTS (SELECT 1 FROM yandex_market_stock_details yd WHERE yd.company_id = p.company_id AND yd.sku = p.sku AND yd.warehouse_id = 313 AND yd.stock_type = 'AVAILABLE' AND yd.count > 0)
            OR (COALESCE(ym.stock_available, 0) > 0 AND COALESCE(oz.available_stock_count, 0) > 0 AND COALESCE(wb.stock_available, 0) > 0)
          )
          AND COALESCE(wb.stock_available, 0) > 0)::int                                AS wb_availability,
        COUNT(*) FILTER (WHERE COALESCE(pl.stock_available, 0) > 0)::int               AS threepl_availability
      FROM products p
      LEFT JOIN yandex_market_stocks ym
        ON ym.company_id = p.company_id AND ym.sku = p.sku
      LEFT JOIN ozon_stocks oz
        ON oz.company_id = p.company_id AND oz.sku = p.sku
      LEFT JOIN wildberries_stocks wb
        ON wb.company_id = p.company_id AND wb.sku = p.sku
      LEFT JOIN threepl_stocks pl
        ON pl.company_id = p.company_id AND pl.sku = p.sku
      WHERE ${where}
    `));
    const row = (result as any).rows?.[0] ?? result[0] ?? {};
    return {
      totalActive:          Number(row.total_active          ?? 0),
      totalAvailability:    Number(row.total_availability    ?? 0),
      ymAvailability:       Number(row.ym_availability       ?? 0),
      ozonAvailability:     Number(row.ozon_availability     ?? 0),
      wbAvailability:       Number(row.wb_availability       ?? 0),
      threeplAvailability:  Number(row.threepl_availability  ?? 0),
    };
  }
  async logActivity(log: InsertActivityLog): Promise<ActivityLog> {
    const [result] = await db.insert(activityLogs).values(log).returning();
    return result;
  }

  async getSskuList(companyId: number): Promise<{ sku: string; productName: string; valueStream: string | null; category: string | null }[]> {
    return await db.select({
      sku: products.sku,
      productName: products.productName,
      valueStream: products.valueStream,
      category: products.category,
    }).from(products)
      .where(and(eq(products.companyId, companyId), sql`${products.status} != 'archive'`))
      .orderBy(asc(products.sku));
  }

  // Sales Plans
  async getSalesPlansMatrix(
    companyId: number,
    year: number,
    opts: { page: number; limit: number; search?: string; valueStreams?: string[]; categories?: string[]; channels?: string[] }
  ): Promise<{ rows: any[]; total: number; totalPages: number }> {
    const { page, limit, search, valueStreams, categories, channels } = opts;
    const channelList = channels?.length
      ? channels.map(c => `'${c.replace(/'/g, "''")}'`).join(",")
      : "'ym','ozon','wb','other'";
    const conditions: string[] = [`p.company_id = ${companyId}`, `p.status != 'archive'`];
    if (search?.trim()) {
      const t = search.trim().replace(/'/g, "''");
      conditions.push(`(p.sku ILIKE '%${t}%' OR p.product_name ILIKE '%${t}%')`);
    }
    if (valueStreams?.length)
      conditions.push(`p.value_stream IN (${valueStreams.map(v => `'${v.replace(/'/g, "''")}'`).join(",")})`);
    if (categories?.length)
      conditions.push(`p.category IN (${categories.map(v => `'${v.replace(/'/g, "''")}'`).join(",")})`);
    const where = conditions.join(" AND ");
    const offset = (page - 1) * limit;
    const cntResult = await db.execute(sql.raw(`
      SELECT COUNT(*)::int AS total
      FROM products p
      CROSS JOIN (SELECT unnest(ARRAY[${channelList}]::text[]) AS channel) c
      WHERE ${where}
    `));
    const total = Number((cntResult as any).rows?.[0]?.total ?? (cntResult as any)[0]?.total ?? 0);
    const rows = await db.execute(sql.raw(`
      SELECT
        sp.id,
        p.sku AS ssku,
        p.product_name AS ssku_name,
        p.value_stream,
        p.category,
        c.channel,
        ${year} AS year,
        sp.jan, sp.feb, sp.mar, sp.apr, sp.may, sp.jun,
        sp.jul, sp.aug, sp.sep, sp.oct, sp.nov, sp.dec
      FROM products p
      CROSS JOIN (SELECT unnest(ARRAY[${channelList}]::text[]) AS channel) c
      LEFT JOIN sales_plans sp
        ON sp.company_id = p.company_id
       AND sp.ssku = p.sku
       AND sp.channel = c.channel
       AND sp.year = ${year}
      WHERE ${where}
      ORDER BY p.value_stream NULLS LAST, p.category NULLS LAST, p.sku,
        CASE c.channel WHEN 'ym' THEN 1 WHEN 'ozon' THEN 2 WHEN 'wb' THEN 3 WHEN 'other' THEN 4 ELSE 5 END
      LIMIT ${limit} OFFSET ${offset}
    `));
    const rowsArr = ((rows as any).rows ?? rows) as any[];
    return { rows: rowsArr, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  async getSalesPlansMeta(companyId: number): Promise<{ valueStreams: string[]; categories: string[]; categoryHierarchy: Record<string, string[]>; channels: string[]; years: number[] }> {
    const result = await db.execute(sql.raw(`
      SELECT
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT p.value_stream ORDER BY p.value_stream), NULL) AS value_streams,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT p.category ORDER BY p.category), NULL) AS categories,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT sp.year ORDER BY sp.year), NULL) AS years
      FROM products p
      LEFT JOIN sales_plans sp ON sp.company_id = p.company_id AND sp.ssku = p.sku
      WHERE p.company_id = ${companyId} AND p.status != 'archive'
    `));
    const row = (result as any).rows?.[0] ?? (result as any)[0] ?? {};

    const hierRows = await db.execute(sql.raw(`
      SELECT DISTINCT value_stream, category FROM products
      WHERE company_id = ${companyId} AND status != 'archive' AND value_stream IS NOT NULL AND category IS NOT NULL
      ORDER BY value_stream, category
    `));
    const hierarchy: Record<string, string[]> = {};
    ((hierRows as any).rows ?? hierRows as any[]).forEach((r: any) => {
      if (!hierarchy[r.value_stream]) hierarchy[r.value_stream] = [];
      hierarchy[r.value_stream].push(r.category);
    });

    return {
      valueStreams:      row.value_streams ?? [],
      categories:        row.categories ?? [],
      categoryHierarchy: hierarchy,
      channels:          ['ym', 'ozon', 'wb', 'other'],
      years:             row.years ?? [],
    };
  }

  async upsertSalesPlanField(
    companyId: number,
    ssku: string,
    channel: string,
    year: number,
    field: string,
    value: number | null
  ): Promise<any> {
    const ALLOWED = new Set(['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']);
    if (!ALLOWED.has(field)) throw new Error('Invalid field');
    const safeVal = value === null ? 'NULL' : Number(value);
    const safeSsku = ssku.replace(/'/g, "''");
    const safeCh = channel.replace(/'/g, "''");
    const result = await db.execute(sql.raw(`
      INSERT INTO sales_plans (company_id, ssku, channel, year, ${field}, updated_at)
      VALUES (${companyId}, '${safeSsku}', '${safeCh}', ${year}, ${safeVal}, NOW())
      ON CONFLICT (company_id, ssku, channel, year) DO UPDATE
      SET ${field} = EXCLUDED.${field}, updated_at = NOW()
      RETURNING *
    `));
    return (result as any).rows?.[0] ?? (result as any)[0];
  }

  async getSalesPlansStats(companyId: number, opts: { search?: string; valueStreams?: string[]; categories?: string[]; channels?: string[]; years?: number[] } = {}): Promise<{ totalRows: number; totalUnits: number; ymTotal: number; ozonTotal: number; wbTotal: number; otherTotal: number }> {
    const { search, valueStreams, categories, channels, years } = opts;
    const conditions: string[] = [`company_id = ${companyId}`];
    if (search?.trim()) {
      const term = search.trim().replace(/'/g, "''");
      conditions.push(`(ssku ILIKE '%${term}%' OR ssku_name ILIKE '%${term}%')`);
    }
    if (valueStreams?.length) conditions.push(`value_stream IN (${valueStreams.map(v => `'${v.replace(/'/g, "''")}'`).join(",")})`);
    if (categories?.length) conditions.push(`category IN (${categories.map(v => `'${v.replace(/'/g, "''")}'`).join(",")})`);
    if (channels?.length) conditions.push(`channel IN (${channels.map(v => `'${v.replace(/'/g, "''")}'`).join(",")})`);
    if (years?.length) conditions.push(`year IN (${years.join(",")})`);
    const where = conditions.join(" AND ");
    const result = await db.execute(sql.raw(`
      SELECT
        COUNT(*)::int AS total_rows,
        COALESCE(SUM(COALESCE(jan,0)+COALESCE(feb,0)+COALESCE(mar,0)+COALESCE(apr,0)+COALESCE(may,0)+COALESCE(jun,0)+COALESCE(jul,0)+COALESCE(aug,0)+COALESCE(sep,0)+COALESCE(oct,0)+COALESCE(nov,0)+COALESCE(dec,0)),0)::bigint AS total_units,
        COALESCE(SUM(CASE WHEN channel='ym' THEN COALESCE(jan,0)+COALESCE(feb,0)+COALESCE(mar,0)+COALESCE(apr,0)+COALESCE(may,0)+COALESCE(jun,0)+COALESCE(jul,0)+COALESCE(aug,0)+COALESCE(sep,0)+COALESCE(oct,0)+COALESCE(nov,0)+COALESCE(dec,0) END),0)::bigint AS ym_total,
        COALESCE(SUM(CASE WHEN channel='ozon' THEN COALESCE(jan,0)+COALESCE(feb,0)+COALESCE(mar,0)+COALESCE(apr,0)+COALESCE(may,0)+COALESCE(jun,0)+COALESCE(jul,0)+COALESCE(aug,0)+COALESCE(sep,0)+COALESCE(oct,0)+COALESCE(nov,0)+COALESCE(dec,0) END),0)::bigint AS ozon_total,
        COALESCE(SUM(CASE WHEN channel='wb' THEN COALESCE(jan,0)+COALESCE(feb,0)+COALESCE(mar,0)+COALESCE(apr,0)+COALESCE(may,0)+COALESCE(jun,0)+COALESCE(jul,0)+COALESCE(aug,0)+COALESCE(sep,0)+COALESCE(oct,0)+COALESCE(nov,0)+COALESCE(dec,0) END),0)::bigint AS wb_total,
        COALESCE(SUM(CASE WHEN channel='other' THEN COALESCE(jan,0)+COALESCE(feb,0)+COALESCE(mar,0)+COALESCE(apr,0)+COALESCE(may,0)+COALESCE(jun,0)+COALESCE(jul,0)+COALESCE(aug,0)+COALESCE(sep,0)+COALESCE(oct,0)+COALESCE(nov,0)+COALESCE(dec,0) END),0)::bigint AS other_total
      FROM sales_plans WHERE ${where}
    `));
    const row = (result as any).rows?.[0] ?? (result as any)[0] ?? {};
    return {
      totalRows:  Number(row.total_rows ?? 0),
      totalUnits: Number(row.total_units ?? 0),
      ymTotal:    Number(row.ym_total ?? 0),
      ozonTotal:  Number(row.ozon_total ?? 0),
      wbTotal:    Number(row.wb_total ?? 0),
      otherTotal: Number(row.other_total ?? 0),
    };
  }

  async upsertSalesPlans(companyId: number, rows: Record<string, any>[]): Promise<number> {
    if (rows.length === 0) return 0;
    const BATCH = 500;
    let count = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH).map(r => ({
        companyId,
        ssku: r.ssku ?? "",
        sskuName: r.sskuName ?? null,
        valueStream: r.valueStream ?? null,
        category: r.category ?? null,
        channel: r.channel ?? "other",
        year: r.year ?? new Date().getFullYear(),
        jan: r.jan ?? null, feb: r.feb ?? null, mar: r.mar ?? null,
        apr: r.apr ?? null, may: r.may ?? null, jun: r.jun ?? null,
        jul: r.jul ?? null, aug: r.aug ?? null, sep: r.sep ?? null,
        oct: r.oct ?? null, nov: r.nov ?? null, dec: r.dec ?? null,
        updatedAt: new Date(),
      }));
      await db.insert(salesPlans).values(batch).onConflictDoUpdate({
        target: [salesPlans.companyId, salesPlans.ssku, salesPlans.channel, salesPlans.year],
        set: {
          sskuName: sql`excluded.ssku_name`,
          valueStream: sql`excluded.value_stream`,
          category: sql`excluded.category`,
          jan: sql`excluded.jan`, feb: sql`excluded.feb`, mar: sql`excluded.mar`,
          apr: sql`excluded.apr`, may: sql`excluded.may`, jun: sql`excluded.jun`,
          jul: sql`excluded.jul`, aug: sql`excluded.aug`, sep: sql`excluded.sep`,
          oct: sql`excluded.oct`, nov: sql`excluded.nov`, dec: sql`excluded.dec`,
          updatedAt: sql`NOW()`,
        },
      });
      count += batch.length;
    }
    return count;
  }
}

export const storage = new DatabaseStorage();

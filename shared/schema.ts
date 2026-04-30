import { pgTable, text, serial, integer, boolean, timestamp, uuid, jsonb, decimal, date, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users: any = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("user"), // admin, user, manager, operator
  companyId: integer("company_id").references(() => companies.id),
  language: text("language").notNull().default("en"), // en, ru
  isActive: boolean("is_active").notNull().default(true),
  yandexId: text("yandex_id").unique(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const companies: any = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  inn: text("inn"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  subscriptionTier: text("subscription_tier").notNull().default("starter"), // starter, professional, enterprise
  subscriptionStatus: text("subscription_status").notNull().default("trial"), // trial, active, expired, cancelled
  maxSku: integer("max_sku").notNull().default(100),
  currentSku: integer("current_sku").notNull().default(0),
  subscriptionEndsAt: timestamp("subscription_ends_at"),
  createdAt: timestamp("created_at").defaultNow(),
  ownerId: integer("owner_id").references(() => users.id),
});

export const marketplaceIntegrations = pgTable("marketplace_integrations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  marketplace: text("marketplace").notNull(), // ozon, wildberries, yandex_market
  isEnabled: boolean("is_enabled").notNull().default(false),
  apiKey: text("api_key"),
  clientId: text("client_id"),
  businessId: text("business_id"), // for Yandex Market
  campaignId: text("campaign_id"),
  settings: jsonb("settings"),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const warehouses = pgTable("warehouses", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  name: text("name").notNull(),
  address: text("address").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  productCount: integer("product_count").notNull().default(0),
  settings: jsonb("settings"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const invitations = pgTable("invitations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  email: text("email").notNull(),
  role: text("role").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  isUsed: boolean("is_used").notNull().default(false),
  invitedById: integer("invited_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Junction table for many-to-many user-company relationships
export const userCompanies = pgTable("user_companies", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  companyId: integer("company_id").notNull().references(() => companies.id),
  role: text("role").notNull().default("user"), // admin, user, manager, operator
  isActive: boolean("is_active").notNull().default(true),
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  sku: text("sku").notNull(),
  productName: text("product_name").notNull(),
  barcode: text("barcode"),
  valueStream: text("value_stream"),
  category: text("category"),
  brandName: text("brand_name"),
  productManager: text("product_manager"),
  skuLengthCm: decimal("sku_length_cm", { precision: 10, scale: 2 }),
  skuWidthCm: decimal("sku_width_cm", { precision: 10, scale: 2 }),
  skuHeightCm: decimal("sku_height_cm", { precision: 10, scale: 2 }),
  skuWeightKg: decimal("sku_weight_kg", { precision: 10, scale: 3 }),
  skuVolumeM3: decimal("sku_volume_m3", { precision: 10, scale: 6 }),
  skuCargoSize: text("sku_cargo_size"),
  vat: decimal("vat", { precision: 5, scale: 2 }),
  hsCode: text("hs_code"),
  ssdDate: date("ssd_date"),
  edsDate: date("eds_date"),
  seasonal: boolean("seasonal").default(false),
  minOrderQty: integer("min_order_qty"),
  masterBoxQty: integer("master_box_qty"),
  palletQty: integer("pallet_qty"),
  containerQty: integer("container_qty"),
  productionDays: integer("production_days"),
  status: text("status").notNull().default("active"), // active, inactive, draft
  imageUrl: text("image_url"),
  supplierName: text("supplier_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const yandexMarketStocks = pgTable("yandex_market_stocks", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  sku: text("sku").notNull(),
  stockAvailable: integer("stock_available").notNull().default(0),
  stockInTransit: integer("stock_in_transit").notNull().default(0),
  syncedAt: timestamp("synced_at").defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("ym_stocks_company_sku_idx").on(t.companyId, t.sku),
}));

export const yandexMarketStockDetails = pgTable("yandex_market_stock_details", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  sku: text("sku").notNull(),
  warehouseId: integer("warehouse_id").notNull(),
  warehouseName: text("warehouse_name"),
  stockType: text("stock_type").notNull(), // FIT, AVAILABLE, FREEZE, QUARANTINE, etc.
  count: integer("count").notNull().default(0),
  syncedAt: timestamp("synced_at").defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("ym_stock_details_idx").on(t.companyId, t.sku, t.warehouseId, t.stockType),
}));

export const ozonStocks = pgTable("ozon_stocks", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  sku: text("sku").notNull(), // offer_id from Ozon (matches products.sku)
  availableStockCount: integer("available_stock_count").notNull().default(0),
  transitStockCount: integer("transit_stock_count").notNull().default(0),
  syncedAt: timestamp("synced_at").defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("ozon_stocks_company_sku_idx").on(t.companyId, t.sku),
}));

export const ozonStockDetails = pgTable("ozon_stock_details", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  sku: text("sku").notNull(), // offer_id
  ozonSku: text("ozon_sku"),
  warehouseId: text("warehouse_id").notNull(),
  warehouseName: text("warehouse_name"),
  clusterName: text("cluster_name"),
  availableStockCount: integer("available_stock_count").notNull().default(0),
  validStockCount: integer("valid_stock_count").notNull().default(0),
  waitingDocsStockCount: integer("waiting_docs_stock_count").notNull().default(0),
  expiringStockCount: integer("expiring_stock_count").notNull().default(0),
  transitDefectStockCount: integer("transit_defect_stock_count").notNull().default(0),
  stockDefectStockCount: integer("stock_defect_stock_count").notNull().default(0),
  excessStockCount: integer("excess_stock_count").notNull().default(0),
  otherStockCount: integer("other_stock_count").notNull().default(0),
  requestedStockCount: integer("requested_stock_count").notNull().default(0),
  transitStockCount: integer("transit_stock_count").notNull().default(0),
  returnFromCustomerStockCount: integer("return_from_customer_stock_count").notNull().default(0),
  returnToSellerStockCount: integer("return_to_seller_stock_count").notNull().default(0),
  syncedAt: timestamp("synced_at").defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("ozon_stock_details_idx").on(t.companyId, t.sku, t.warehouseId),
}));

export const wildberriesStocks = pgTable("wildberries_stocks", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  sku: text("sku").notNull(),
  stockAvailable: integer("stock_available").notNull().default(0),
  stockInTransit: integer("stock_in_transit").notNull().default(0),
  syncedAt: timestamp("synced_at").defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("wb_stocks_company_sku_idx").on(t.companyId, t.sku),
}));

export const wildberriesStockDetails = pgTable("wildberries_stock_details", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  sku: text("sku").notNull(),
  warehouseName: text("warehouse_name").notNull(),
  quantityFull: integer("quantity_full").notNull().default(0),
  quantityNotInOrders: integer("quantity_not_in_orders").notNull().default(0),
  inWayToClient: integer("in_way_to_client").notNull().default(0),
  inWayFromClient: integer("in_way_from_client").notNull().default(0),
  syncedAt: timestamp("synced_at").defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("wb_stock_details_idx").on(t.companyId, t.sku, t.warehouseName),
}));

export const wbTransitStocks = pgTable("wb_transit_stocks", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  sku: text("sku").notNull(),
  qtyInTransit: integer("qty_in_transit").notNull().default(0),
  syncedAt: timestamp("synced_at").defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("wb_transit_stocks_idx").on(t.companyId, t.sku),
}));

export const wbSupplies = pgTable("wb_supplies", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  supplyId: integer("supply_id").notNull(),
  preorderId: integer("preorder_id"),
  statusId: integer("status_id").notNull(),
  boxTypeId: integer("box_type_id"),
  phone: text("phone"),
  createDate: timestamp("create_date"),
  supplyDate: timestamp("supply_date"),
  factDate: timestamp("fact_date"),
  updatedDate: timestamp("updated_date"),
  warehouseId: integer("warehouse_id"),
  warehouseName: text("warehouse_name"),
  actualWarehouseId: integer("actual_warehouse_id"),
  actualWarehouseName: text("actual_warehouse_name"),
  transitWarehouseId: integer("transit_warehouse_id"),
  transitWarehouseName: text("transit_warehouse_name"),
  acceptanceCost: integer("acceptance_cost"),
  paidAcceptanceCoefficient: integer("paid_acceptance_coefficient"),
  rejectReason: text("reject_reason"),
  supplierAssignName: text("supplier_assign_name"),
  storageCoef: text("storage_coef"),
  deliveryCoef: text("delivery_coef"),
  quantity: integer("quantity").default(0),
  acceptedQuantity: integer("accepted_quantity").default(0),
  readyForSaleQuantity: integer("ready_for_sale_quantity").default(0),
  unloadingQuantity: integer("unloading_quantity").default(0),
  depersonalizedQuantity: integer("depersonalized_quantity").default(0),
  isBoxOnPallet: boolean("is_box_on_pallet"),
  syncedAt: timestamp("synced_at").defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("wb_supplies_company_supply_idx").on(t.companyId, t.supplyId),
}));

export const wbSupplyGoods = pgTable("wb_supply_goods", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  supplyId: integer("supply_id").notNull(),
  warehouseName: text("warehouse_name"),
  vendorCode: text("vendor_code").notNull(),
  barcode: text("barcode"),
  nmId: integer("nm_id"),
  techSize: text("tech_size"),
  color: text("color"),
  needKiz: boolean("need_kiz"),
  tnved: text("tnved"),
  supplierBoxAmount: integer("supplier_box_amount"),
  quantity: integer("quantity").notNull().default(0),
  readyForSaleQuantity: integer("ready_for_sale_quantity").notNull().default(0),
  unloadingQuantity: integer("unloading_quantity").notNull().default(0),
  acceptedQuantity: integer("accepted_quantity").notNull().default(0),
  syncedAt: timestamp("synced_at").defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("wb_supply_goods_company_supply_barcode_idx").on(t.companyId, t.supplyId, t.barcode),
}));

export const inboundOrders = pgTable("inbound_orders", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  key: text("key").notNull(),
  valueStream: text("value_stream"),
  category: text("category"),
  ssku: text("ssku"),
  modelId: text("model_id"),
  sskuName: text("ssku_name"),
  supplierId: text("supplier_id"),
  supplierName: text("supplier_name"),
  piNumber: text("pi_number"),
  piDate: date("pi_date"),
  poNumber: text("po_number"),
  poDate: date("po_date"),
  ciNumber: text("ci_number"),
  poAxapta: text("po_axapta"),
  poAxaptaDate: date("po_axapta_date"),
  quantityPlan: integer("quantity_plan"),
  quantityFact: integer("quantity_fact"),
  quantityFactYt: integer("quantity_fact_yt"),
  quantityFactCheck: integer("quantity_fact_check"),
  actualContractPrice: decimal("actual_contract_price", { precision: 15, scale: 4 }),
  purchasePrice: decimal("purchase_price", { precision: 15, scale: 4 }),
  currency: text("currency"),
  currencyCalc: text("currency_calc"),
  purchasePriceCheck: decimal("purchase_price_check", { precision: 15, scale: 4 }),
  shipmentTerms: text("shipment_terms"),
  amountSum: decimal("amount_sum", { precision: 18, scale: 4 }),
  etaPlan: date("eta_plan"),
  readinessDateActual: date("readiness_date_actual"),
  rdaUpdate: date("rda_update"),
  etdPlan: date("etd_plan"),
  etaActual: date("eta_actual"),
  productionStatus: text("production_status"),
  logisticStatus: text("logistic_status"),
  nonDelivery: text("non_delivery"),
  akTicket: text("ak_ticket"),
  acPassDate: date("ac_pass_date"),
  plTicket: text("pl_ticket"),
  glTicket: text("gl_ticket"),
  replenTicket: text("replen_ticket"),
  creationDate: date("creation_date"),
  replenishmentManager: text("replenishment_manager"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("inbound_orders_company_key_idx").on(t.companyId, t.key),
}));

export const inboundChanges = pgTable("inbound_changes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  poNumber: text("po_number"),
  ssku: text("ssku"),
  field: text("field").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changeType: text("change_type").notNull(), // 'updated' | 'created' | 'deleted'
  importBatchId: text("import_batch_id"),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
});

export const outboundShipments = pgTable("outbound_shipments", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  key: text("key").notNull(),
  status: text("status"),
  orderNumber: text("order_number"),
  axaptaIntegrationNumber: text("axapta_integration_number"),
  marketplace: text("marketplace"),
  warehouseFrom: text("warehouse_from"),
  warehouseTo: text("warehouse_to"),
  orderDataTransferAt: text("order_data_transfer_at"),
  initialSlotAt: text("initial_slot_at"),
  currentSlotDate: text("current_slot_date"),
  currentSlotTime: text("current_slot_time"),
  quantityUnits: text("quantity_units"),
  plannedPallets: text("planned_pallets"),
  loadingLogist: text("loading_logist"),
  loaded: text("loaded"),
  loadedAt: text("loaded_at"),
  kitu: text("kitu"),
  cargoType: text("cargo_type"),
  finalCorrection: text("final_correction"),
  packagingSent: text("packaging_sent"),
  ticket: text("ticket"),
  marketplaceWarehouseNotes: text("marketplace_warehouse_notes"),
  packagingSentAt: text("packaging_sent_at"),
  palletsActual: text("pallets_actual"),
  shipmentPlannedDate: text("shipment_planned_date"),
  shipmentPlannedTime: text("shipment_planned_time"),
  shipmentLogist: text("shipment_logist"),
  driverData: text("driver_data"),
  driverDataActualized: text("driver_data_actualized"),
  shkPidPackagingSent: text("shk_pid_packaging_sent"),
  shkPidSentAt: text("shk_pid_sent_at"),
  orderTaped: text("order_taped"),
  tapedAt: text("taped_at"),
  truckArrived: text("truck_arrived"),
  truckArrivedAt: text("truck_arrived_at"),
  ttnSent: text("ttn_sent"),
  ttnSentAt: text("ttn_sent_at"),
  truckDeparted: text("truck_departed"),
  shippedAt: text("shipped_at"),
  gateNumber: text("gate_number"),
  comment: text("comment"),
  isReturn: text("is_return"),
  truckLeftNoLoading: text("truck_left_no_loading"),
  isCancelled: text("is_cancelled"),
  departureWarehouse: text("departure_warehouse"),
  tzper: text("tzper"),
  puo: text("puo"),
  pdo: text("pdo"),
  driverInfo: text("driver_info"),
  axaptaSalesTicket: text("axapta_sales_ticket"),
  tklzNumber: text("tklz_number"),
  accountingComment: text("accounting_comment"),
  carrier: text("carrier"),
  trip: text("trip"),
  idleHours: text("idle_hours"),
  carrierReturn: text("carrier_return"),
  idleReason: text("idle_reason"),
  returnReason: text("return_reason"),
  returnFine: text("return_fine"),
  idleFine: text("idle_fine"),
  tripCost: text("trip_cost"),
  totalCost: text("total_cost"),
  carrierComments: text("carrier_comments"),
  approved: text("approved"),
  archivePending: text("archive_pending"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("outbound_shipments_company_key_idx").on(t.companyId, t.key),
}));

export const threeplStocks = pgTable("threepl_stocks", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  sku: text("sku").notNull(),
  stockAvailable: integer("stock_available").notNull().default(0),
  syncedAt: timestamp("synced_at").defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("threepl_stocks_company_sku_idx").on(t.companyId, t.sku),
}));

export const threeplStockDetails = pgTable("threepl_stock_details", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  sku: text("sku").notNull(),
  warehouseId: integer("warehouse_id").references(() => warehouses.id), // nullable — YM-attributed warehouses have no FK
  warehouseName: text("warehouse_name").notNull(),
  qtyNew: integer("qty_new").notNull().default(0),       // active, itemCondition=1 (Кондиция)
  qtyDefect: integer("qty_defect").notNull().default(0), // active, itemCondition≠1 (некондиция)
  qtyReserved: integer("qty_reserved").notNull().default(0),
  qtyExpected: integer("qty_expected").notNull().default(0),
  syncedAt: timestamp("synced_at").defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("threepl_stock_details_idx").on(t.companyId, t.sku, t.warehouseName),
}));

export const salesPlans = pgTable("sales_plans", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  ssku: text("ssku").notNull(),
  sskuName: text("ssku_name"),
  valueStream: text("value_stream"),
  category: text("category"),
  channel: text("channel").notNull(), // ym | ozon | wb | other
  year: integer("year").notNull(),
  jan: integer("jan"),
  feb: integer("feb"),
  mar: integer("mar"),
  apr: integer("apr"),
  may: integer("may"),
  jun: integer("jun"),
  jul: integer("jul"),
  aug: integer("aug"),
  sep: integer("sep"),
  oct: integer("oct"),
  nov: integer("nov"),
  dec: integer("dec"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  uniq: uniqueIndex("sales_plans_uniq_idx").on(t.companyId, t.ssku, t.channel, t.year),
}));

export const insertSalesPlanSchema = createInsertSchema(salesPlans).omit({ id: true, createdAt: true, updatedAt: true });

// Relations
export const usersRelations: any = relations(users, ({ one, many }) => ({
  company: one(companies, {
    fields: [users.companyId],
    references: [companies.id],
  }),
  ownedCompany: one(companies, {
    fields: [users.id],
    references: [companies.ownerId],
  }),
  sentInvitations: many(invitations, {
    relationName: "inviter",
  }),
  userCompanies: many(userCompanies),
}));

export const companiesRelations: any = relations(companies, ({ one, many }) => ({
  owner: one(users, {
    fields: [companies.ownerId],
    references: [users.id],
  }),
  users: many(users),
  integrations: many(marketplaceIntegrations),
  warehouses: many(warehouses),
  invitations: many(invitations),
  products: many(products),
  userCompanies: many(userCompanies),
}));

export const marketplaceIntegrationsRelations = relations(marketplaceIntegrations, ({ one }) => ({
  company: one(companies, {
    fields: [marketplaceIntegrations.companyId],
    references: [companies.id],
  }),
}));

export const warehousesRelations = relations(warehouses, ({ one }) => ({
  company: one(companies, {
    fields: [warehouses.companyId],
    references: [companies.id],
  }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  company: one(companies, {
    fields: [invitations.companyId],
    references: [companies.id],
  }),
  inviter: one(users, {
    fields: [invitations.invitedById],
    references: [users.id],
    relationName: "inviter",
  }),
}));

export const productsRelations = relations(products, ({ one }) => ({
  company: one(companies, {
    fields: [products.companyId],
    references: [companies.id],
  }),
}));

export const userCompaniesRelations = relations(userCompanies, ({ one }) => ({
  user: one(users, {
    fields: [userCompanies.userId],
    references: [users.id],
  }),
  company: one(companies, {
    fields: [userCompanies.companyId],
    references: [companies.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
  ownerId: true,
});

export const insertMarketplaceIntegrationSchema = createInsertSchema(marketplaceIntegrations).omit({
  id: true,
  createdAt: true,
  lastSyncAt: true,
});

export const insertWarehouseSchema = createInsertSchema(warehouses).omit({
  id: true,
  createdAt: true,
});

export const insertInvitationSchema = createInsertSchema(invitations).omit({
  id: true,
  createdAt: true,
  isUsed: true,
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserCompanySchema = createInsertSchema(userCompanies).omit({
  id: true,
  joinedAt: true,
});

// Activity Logs
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  userId: integer("user_id").references(() => users.id),
  actionType: text("action_type").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  description: text("description").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({ id: true, createdAt: true });
export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = typeof activityLogs.$inferInsert;

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type MarketplaceIntegration = typeof marketplaceIntegrations.$inferSelect;
export type InsertMarketplaceIntegration = z.infer<typeof insertMarketplaceIntegrationSchema>;
export type Warehouse = typeof warehouses.$inferSelect;
export type InsertWarehouse = z.infer<typeof insertWarehouseSchema>;
export type UserCompany = typeof userCompanies.$inferSelect;
export type InsertUserCompany = z.infer<typeof insertUserCompanySchema>;
export type Invitation = typeof invitations.$inferSelect;
export type InsertInvitation = z.infer<typeof insertInvitationSchema>;
export type SalesPlan = typeof salesPlans.$inferSelect;
export type InsertSalesPlan = typeof salesPlans.$inferInsert;
export type OutboundShipment = typeof outboundShipments.$inferSelect;
export type InsertOutboundShipment = typeof outboundShipments.$inferInsert;
export type InboundChange = typeof inboundChanges.$inferSelect;
export type InsertInboundChange = typeof inboundChanges.$inferInsert;
export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;

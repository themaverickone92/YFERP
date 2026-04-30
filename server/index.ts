import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { syncAllCompaniesYandexMarket, hasActiveYMIntegrations } from "./sync/yandex-market-stocks";
import { syncAllCompaniesOzon, hasActiveOzonIntegrations } from "./sync/ozon-stocks";
import { syncAllCompaniesWildberries, hasActiveWBIntegrations } from "./sync/wildberries-stocks";
import { syncAllCompaniesThreepl, hasActiveThreeplWarehouses } from "./sync/threepl-stocks";
import { syncAllCompaniesWBTransit } from "./sync/wildberries-supplies";

const app = express();
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: false, limit: '100mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);

    // Yandex Market stock sync: dynamic scheduler based on integration status
    const SYNC_INTERVAL = 15 * 60 * 1000;
    const WATCHDOG_INTERVAL = 5 * 60 * 1000;
    let ymSyncTimer: ReturnType<typeof setInterval> | null = null;

    async function checkAndManageYMSync() {
      try {
        const active = await hasActiveYMIntegrations();
        if (active && ymSyncTimer === null) {
          log("[YM sync] Integration connected — starting scheduler");
          await syncAllCompaniesYandexMarket();
          ymSyncTimer = setInterval(syncAllCompaniesYandexMarket, SYNC_INTERVAL);
        } else if (!active && ymSyncTimer !== null) {
          log("[YM sync] Integration disconnected — stopping scheduler");
          clearInterval(ymSyncTimer);
          ymSyncTimer = null;
        }
      } catch (err: any) {
        log(`[YM sync] Watchdog error: ${err.message}`);
      }
    }

    setTimeout(async () => {
      await checkAndManageYMSync();
      setInterval(checkAndManageYMSync, WATCHDOG_INTERVAL);
    }, 30_000);

    // Ozon stock sync: same dynamic watchdog pattern, hourly interval
    const OZON_SYNC_INTERVAL = 60 * 60 * 1000;
    let ozonSyncTimer: ReturnType<typeof setInterval> | null = null;

    async function checkAndManageOzonSync() {
      try {
        const active = await hasActiveOzonIntegrations();
        if (active && ozonSyncTimer === null) {
          log("[Ozon sync] Integration connected — starting scheduler");
          await syncAllCompaniesOzon();
          ozonSyncTimer = setInterval(syncAllCompaniesOzon, OZON_SYNC_INTERVAL);
        } else if (!active && ozonSyncTimer !== null) {
          log("[Ozon sync] Integration disconnected — stopping scheduler");
          clearInterval(ozonSyncTimer);
          ozonSyncTimer = null;
        }
      } catch (err: any) {
        log(`[Ozon sync] Watchdog error: ${err.message}`);
      }
    }

    setTimeout(async () => {
      await checkAndManageOzonSync();
      setInterval(checkAndManageOzonSync, WATCHDOG_INTERVAL);
    }, 45_000); // stagger 15s after YM watchdog

    // Wildberries stock sync: every 15 minutes, same watchdog pattern
    const WB_SYNC_INTERVAL = 15 * 60 * 1000;
    let wbSyncTimer: ReturnType<typeof setInterval> | null = null;

    async function checkAndManageWBSync() {
      try {
        const active = await hasActiveWBIntegrations();
        if (active && wbSyncTimer === null) {
          log("[WB sync] Integration connected — starting scheduler");
          await syncAllCompaniesWildberries();
          wbSyncTimer = setInterval(syncAllCompaniesWildberries, WB_SYNC_INTERVAL);
        } else if (!active && wbSyncTimer !== null) {
          log("[WB sync] Integration disconnected — stopping scheduler");
          clearInterval(wbSyncTimer);
          wbSyncTimer = null;
        }
      } catch (err: any) {
        log(`[WB sync] Watchdog error: ${err.message}`);
      }
    }

    setTimeout(async () => {
      await checkAndManageWBSync();
      setInterval(checkAndManageWBSync, WATCHDOG_INTERVAL);
    }, 60_000); // stagger 15s after Ozon watchdog

    // 3PL stock sync: every 15 minutes, same watchdog pattern
    const THREEPL_SYNC_INTERVAL = 15 * 60 * 1000;
    let threeplSyncTimer: ReturnType<typeof setInterval> | null = null;

    async function checkAndManageThreeplSync() {
      try {
        const active = await hasActiveThreeplWarehouses();
        if (active && threeplSyncTimer === null) {
          log("[3PL sync] Warehouses connected — starting scheduler");
          await syncAllCompaniesThreepl();
          threeplSyncTimer = setInterval(syncAllCompaniesThreepl, THREEPL_SYNC_INTERVAL);
        } else if (!active && threeplSyncTimer !== null) {
          log("[3PL sync] No active warehouses — stopping scheduler");
          clearInterval(threeplSyncTimer);
          threeplSyncTimer = null;
        }
      } catch (err: any) {
        log(`[3PL sync] Watchdog error: ${err.message}`);
      }
    }

    setTimeout(async () => {
      await checkAndManageThreeplSync();
      setInterval(checkAndManageThreeplSync, WATCHDOG_INTERVAL);
    }, 75_000); // stagger 15s after WB watchdog

    // WB transit sync (supplies API): every 60 min, same watchdog pattern
    const WB_TRANSIT_SYNC_INTERVAL = 60 * 60 * 1000;
    let wbTransitSyncTimer: ReturnType<typeof setInterval> | null = null;

    async function checkAndManageWBTransitSync() {
      try {
        const active = await hasActiveWBIntegrations();
        if (active && wbTransitSyncTimer === null) {
          log("[WB transit] Integration connected — starting scheduler");
          await syncAllCompaniesWBTransit();
          wbTransitSyncTimer = setInterval(syncAllCompaniesWBTransit, WB_TRANSIT_SYNC_INTERVAL);
        } else if (!active && wbTransitSyncTimer !== null) {
          log("[WB transit] Integration disconnected — stopping scheduler");
          clearInterval(wbTransitSyncTimer);
          wbTransitSyncTimer = null;
        }
      } catch (err: any) {
        log(`[WB transit] Watchdog error: ${err.message}`);
      }
    }

    setTimeout(async () => {
      await checkAndManageWBTransitSync();
      setInterval(checkAndManageWBTransitSync, WATCHDOG_INTERVAL);
    }, 90_000); // stagger 15s after 3PL watchdog
  });
})();

import { Switch, Route, Router } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Login from "@/pages/login";
import AuthCallback from "@/pages/auth-callback";
import NoAccess from "@/pages/no-access";
import Dashboard from "@/pages/dashboard";
import Settings from "@/pages/settings";
import Products from "@/pages/products";
import Inbound from "@/pages/inbound";
import Pricing from "@/pages/pricing";
import Finance from "@/pages/finance";
import Analytics from "@/pages/analytics";
import Inventory from "@/pages/inventory";
import Outbound from "@/pages/outbound";
import SalesPlanning from "@/pages/sales-planning";
import NotFound from "@/pages/not-found";
import { AuthProvider } from "@/lib/auth";
import { LanguageProvider } from "@/components/language-provider";
import CompanyGuard from "@/components/company-guard";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/auth/callback" component={AuthCallback} />
      <Route path="/dashboard">
        <CompanyGuard>
          <Dashboard />
        </CompanyGuard>
      </Route>
      <Route path="/products">
        <CompanyGuard>
          <Products />
        </CompanyGuard>
      </Route>
      <Route path="/inventory">
        <CompanyGuard>
          <Inventory />
        </CompanyGuard>
      </Route>
      <Route path="/outbound">
        <CompanyGuard>
          <Outbound />
        </CompanyGuard>
      </Route>
      <Route path="/inbound">
        <CompanyGuard>
          <Inbound />
        </CompanyGuard>
      </Route>
      <Route path="/sales-planning">
        <CompanyGuard>
          <SalesPlanning />
        </CompanyGuard>
      </Route>
      <Route path="/pricing">
        <CompanyGuard>
          <Pricing />
        </CompanyGuard>
      </Route>
      <Route path="/finance">
        <CompanyGuard>
          <Finance />
        </CompanyGuard>
      </Route>
      <Route path="/analytics">
        <CompanyGuard>
          <Analytics />
        </CompanyGuard>
      </Route>
      <Route path="/settings" component={Settings} />
      <Route path="/no-access" component={NoAccess} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <LanguageProvider>
            <Router>
              <Toaster />
              <AppRouter />
            </Router>
          </LanguageProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

import { Link, useLocation } from "wouter";
import {
  Home,
  Package,
  ShoppingCart,
  BarChart3,
  Settings,
  LogOut,
  Users,
  Truck,
  Archive,
  Ship,
  DollarSign,
  CreditCard,
  PieChart,
  Menu,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";

type Company = {
  id: number;
  name: string;
  inn?: string;
  address?: string;
  phone?: string;
  email?: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  maxSku: number;
  currentSku: number;
  subscriptionEndsAt?: string;
  createdAt?: string;
  ownerId?: number;
};

export default function Sidebar() {
  const [location, setLocation] = useLocation();
  const { logout, user } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    setIsMobileOpen(false);
  }, [location]);

  // Check if user has companies
  const { data: userCompanies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies/user"],
    enabled: true,
  });

  const hasCompanies = userCompanies.length > 0;

  const navigation = hasCompanies ? [
    { name: "Dashboard", href: "/dashboard", icon: Home },
    { name: "Products", href: "/products", icon: Package },
  ] : [];

  const additionalNavigation = hasCompanies ? [
    { name: "Pricing", href: "/pricing", icon: DollarSign },
    { name: "Finance", href: "/finance", icon: CreditCard },
    { name: "Analytics", href: "/analytics", icon: PieChart },
  ] : [];

  const bottomNavigation = [
    { name: "Settings", href: "/settings", icon: Settings },
  ];

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  return (
    <>
      {/* Hamburger button — mobile only */}
      <button
        className="md:hidden fixed top-0 left-0 z-50 flex items-center justify-center h-16 w-14 text-gray-700 bg-white border-r border-b border-gray-200"
        onClick={() => setIsMobileOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Backdrop */}
      {isMobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed left-0 top-0 w-64 bg-slate-800 text-white h-screen flex flex-col z-50 transition-transform duration-300 ease-in-out ${isMobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}>
      {/* Logo */}
      <div className="p-6">
        <Link href={hasCompanies ? "/dashboard" : "/settings"}>
          <h1 className="text-xl font-bold text-white cursor-pointer">ERP: Yandex Factory</h1>
        </Link>
      </div>

      {/* Main Navigation */}
      <nav className="px-4 flex-1 flex flex-col">
        <ul className="space-y-1">
          {navigation.map((item) => {
            const isActive = location === item.href;
            return (
              <li key={item.name}>
                <Link href={item.href}>
                  <div
                    className={`
                      flex items-center px-3 py-2 text-sm font-medium rounded cursor-pointer transition-colors
                      ${isActive
                        ? "bg-slate-700 text-white"
                        : "text-slate-300 hover:bg-slate-700 hover:text-white"
                      }
                    `}
                  >
                    <item.icon className="w-4 h-4 mr-3" />
                    {item.name}
                  </div>
                </Link>
              </li>
            );
          })}
          
          {/* Inventory */}
          {hasCompanies && (
            <li>
              <Link href="/inventory">
                <div
                  className={`
                    flex items-center px-3 py-2 text-sm font-medium rounded cursor-pointer transition-colors
                    ${location.startsWith('/inventory')
                      ? "bg-slate-700 text-white"
                      : "text-slate-300 hover:bg-slate-700 hover:text-white"
                    }
                  `}
                >
                  <Archive className="w-4 h-4 mr-3" />
                  Inventory
                </div>
              </Link>
            </li>
          )}

          {/* Inbound */}
          {hasCompanies && (
            <li>
              <Link href="/inbound">
                <div
                  className={`
                    flex items-center px-3 py-2 text-sm font-medium rounded cursor-pointer transition-colors
                    ${location.startsWith('/inbound')
                      ? "bg-slate-700 text-white"
                      : "text-slate-300 hover:bg-slate-700 hover:text-white"
                    }
                  `}
                >
                  <Ship className="w-4 h-4 mr-3" />
                  Inbound
                </div>
              </Link>
            </li>
          )}

          {/* Outbound */}
          {hasCompanies && (
            <li>
              <Link href="/outbound">
                <div
                  className={`
                    flex items-center px-3 py-2 text-sm font-medium rounded cursor-pointer transition-colors
                    ${location.startsWith('/outbound')
                      ? "bg-slate-700 text-white"
                      : "text-slate-300 hover:bg-slate-700 hover:text-white"
                    }
                  `}
                >
                  <Truck className="w-4 h-4 mr-3" />
                  Outbound
                </div>
              </Link>
            </li>
          )}

          {/* Planning */}
          {hasCompanies && (
            <li>
              <Link href="/sales-planning">
                <div
                  className={`
                    flex items-center px-3 py-2 text-sm font-medium rounded cursor-pointer transition-colors
                    ${location.startsWith('/sales-planning')
                      ? "bg-slate-700 text-white"
                      : "text-slate-300 hover:bg-slate-700 hover:text-white"
                    }
                  `}
                >
                  <BarChart3 className="w-4 h-4 mr-3" />
                  Planning
                </div>
              </Link>
            </li>
          )}

          {/* Additional Navigation Items */}
          {additionalNavigation.map((item) => {
            const isActive = location === item.href;
            return (
              <li key={item.name}>
                <Link href={item.href}>
                  <div
                    className={`
                      flex items-center px-3 py-2 text-sm font-medium rounded cursor-pointer transition-colors
                      ${isActive
                        ? "bg-slate-700 text-white"
                        : "text-slate-300 hover:bg-slate-700 hover:text-white"
                      }
                    `}
                  >
                    <item.icon className="w-4 h-4 mr-3" />
                    {item.name}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Bottom Navigation */}
        <div className="mt-auto pb-6">
          <div className="border-t border-slate-700 pt-4">
            <ul className="space-y-1">
              {bottomNavigation.map((item) => {
                const isActive = location === item.href;
                return (
                  <li key={item.name}>
                    <Link href={item.href}>
                      <div
                        className={`
                          flex items-center px-3 py-2 text-sm font-medium rounded cursor-pointer transition-colors
                          ${isActive
                            ? "bg-slate-700 text-white"
                            : "text-slate-300 hover:bg-slate-700 hover:text-white"
                          }
                        `}
                      >
                        <item.icon className="w-4 h-4 mr-3" />
                        {item.name}
                      </div>
                    </Link>
                  </li>
                );
              })}
              <li>
                <div
                  className="flex items-center px-3 py-2 text-sm font-medium rounded cursor-pointer transition-colors text-slate-300 hover:bg-slate-700 hover:text-white"
                  onClick={handleLogout}
                >
                  <LogOut className="w-4 h-4 mr-3" />
                  Logout
                </div>
              </li>
            </ul>
          </div>
        </div>
      </nav>
    </div>
    </>
  );
}

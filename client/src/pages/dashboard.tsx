import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import Sidebar from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Bell, Settings, MoreHorizontal, Download, Plus, Package, ShoppingCart, Warehouse, BarChart3, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  fulfillmentFee: number;
  soldOrders: number;
  inbound: number;
  dtcFulfillment: number;
  reserveStorage: number;
  unavailable: number;
  amazonFbaQty: number;
  status: "active" | "inactive" | "estimate";
}

const mockProducts: Product[] = [
  {
    id: "1",
    name: "Wireless headset CLEMM AMBIENCE, Ivory",
    sku: "CWH-LAR-IVY",
    category: "Electronics",
    fulfillmentFee: 9.69,
    soldOrders: 894,
    inbound: 2,
    dtcFulfillment: 896,
    reserveStorage: 0,
    unavailable: 0,
    amazonFbaQty: 1019,
    status: "active"
  },
  {
    id: "2", 
    name: "charger",
    sku: "CWC-CC-CGR",
    category: "Electronics",
    fulfillmentFee: 7.65,
    soldOrders: 0,
    inbound: 2,
    dtcFulfillment: 0,
    reserveStorage: 0,
    unavailable: 0,
    amazonFbaQty: 1019,
    status: "active"
  },
  {
    id: "3",
    name: "Wireless headset CLEMM PRESET, Gray",
    sku: "CWH-PST-GRE",
    category: "Electronics", 
    fulfillmentFee: 9.69,
    soldOrders: 896,
    inbound: 1,
    dtcFulfillment: 888,
    reserveStorage: 0,
    unavailable: 0,
    amazonFbaQty: 0,
    status: "active"
  },
  {
    id: "4",
    name: "Clemm Nylon Cable 60W USB-C - USB-C Length 1.2m, Gray",
    sku: "CBNC-USB-C-120",
    category: "Accessories",
    fulfillmentFee: 0,
    soldOrders: 0,
    inbound: 0,
    dtcFulfillment: 0,
    reserveStorage: 0,
    unavailable: 0,
    amazonFbaQty: 0,
    status: "estimate"
  },
  {
    id: "5",
    name: "Clemm Chain Cable 60W USB-C - USB-C, 3.0ft Light Gray",
    sku: "CBCH-USB-C-3FT",
    category: "Accessories",
    fulfillmentFee: 0,
    soldOrders: 0,
    inbound: 0,
    dtcFulfillment: 0,
    reserveStorage: 0,
    unavailable: 0,
    amazonFbaQty: 0,
    status: "estimate"
  }
];

export default function Dashboard() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/");
    }
  }, [user, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const filteredProducts = mockProducts.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         product.sku.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || product.status === statusFilter;
    const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="md:ml-64">
        {/* Top Header */}
        <header className="bg-white border-b border-gray-200">
          <div className="pl-14 pr-6 py-4 md:px-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-semibold text-gray-800">Dashboard</h1>
                <p className="text-gray-600 mt-1">Overview of your marketplace operations</p>
              </div>
              
            </div>
          </div>
        </header>

        {/* Summary Cards */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Link href="/products">
              <Card className="cursor-pointer hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Products</CardTitle>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">1,247</div>
                  <p className="text-xs text-muted-foreground">
                    <span className="text-green-600 flex items-center">
                      <TrendingUp className="w-3 h-3 mr-1" />
                      +12% from last month
                    </span>
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Card className="cursor-pointer hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Orders</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">856</div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-green-600 flex items-center">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    +8% from last week
                  </span>
                </p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Inventory Value</CardTitle>
                <Warehouse className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">₽2.4M</div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-green-600 flex items-center">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    +5% from last month
                  </span>
                </p>
              </CardContent>
            </Card>

            <Card className="border-red-200 bg-red-50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-red-700">Low Stock Alert</CardTitle>
                <AlertTriangle className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-700">23</div>
                <p className="text-xs text-red-600">
                  Products below minimum stock
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import Sidebar from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus, MoreHorizontal, Edit, Trash2, Eye, Package, TrendingUp, AlertCircle, ExternalLink, Download, Upload, ChevronDown, ChevronUp, Factory, Grid3X3, ChevronsLeft, ChevronsRight } from "lucide-react";
import * as XLSX from 'xlsx';
import type { Product } from "@shared/schema";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { CategoryFilter } from "@/components/ui/category-filter";

export default function Products() {
  const { user, isLoading } = useAuth();
  const canEdit = user?.role !== "user";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State management
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [sortField, setSortField] = useState<string>("productName");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [vsFilters, setVsFilters] = useState<string[]>([]);
  const [brandFilters, setBrandFilters] = useState<string[]>([]);
  const [supplierFilters, setSupplierFilters] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 30;
  const [showSelectAllDialog, setShowSelectAllDialog] = useState(false);
  
  // Debounced search — only fires API call 400ms after user stops typing
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, categoryFilters, statusFilters, vsFilters, brandFilters, supplierFilters]);

  useEffect(() => {
    if (!lightboxUrl) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setLightboxUrl(null); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [lightboxUrl]);

  const [newProduct, setNewProduct] = useState({
    sku: "",
    productName: "",
    barcode: "",
    valueStream: "",
    category: "",
    brandName: "",
    productManager: "",
    skuLengthCm: "",
    skuWidthCm: "",
    skuHeightCm: "",
    skuWeightKg: "",
    vat: "",
    hsCode: "",
    ssdDate: "",
    edsDate: "",
    seasonal: false,
    minOrderQty: "",
    masterBoxQty: "",
    palletQty: "",
    containerQty: "",
    productionDays: "",
    status: "new" as const,
    imageUrl: "",
    supplierName: "",
  });

  // Server-side paginated fetch — only 30 rows per request
  const { data: productsData = { products: [], total: 0, totalPages: 0 }, isLoading: productsLoading } = useQuery({
    queryKey: ["/api/products", currentPage, debouncedSearch, statusFilters, categoryFilters, vsFilters, brandFilters, supplierFilters, sortField, sortDirection],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(itemsPerPage),
        search: debouncedSearch,
        sort: sortField,
        order: sortDirection,
      });
      if (statusFilters.length > 0) params.set("statuses", JSON.stringify(statusFilters));
      if (categoryFilters.length > 0) params.set("cats", JSON.stringify(categoryFilters));
      if (vsFilters.length > 0) params.set("valueStreams", JSON.stringify(vsFilters));
      if (brandFilters.length > 0) params.set("brands", JSON.stringify(brandFilters));
      if (supplierFilters.length > 0) params.set("suppliers", JSON.stringify(supplierFilters));
      const response = await fetch(`/api/products?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!response.ok) throw new Error("Failed to fetch products");
      return response.json();
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const allProducts: Product[] = productsData.products || [];
  const totalProducts: number = productsData.total || 0;
  const totalPages: number = productsData.totalPages || 0;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalProducts);
  const paginatedProducts: Product[] = allProducts;
  const products: Product[] = allProducts;

  // Metadata for filter dropdowns (tiny query — just unique cats + statuses)
  const { data: metadata = { categoryHierarchy: {}, statuses: [] } } = useQuery({
    queryKey: ["/api/products/metadata"],
    enabled: !!user,
    staleTime: 60_000,
  });

  // Fetch product statistics
  const { data: statisticsData } = useQuery({
    queryKey: ["/api/products/statistics"],
    enabled: !!user,
  });

  // File parsing function (supports CSV and XLSX)
  const parseFile = async (file: File): Promise<any[]> => {
    if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
      // CSV parsing
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length < 2) return [];
      
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const rows = lines.slice(1);
      
      return rows.map(row => {
        const values = row.split(',').map(v => v.trim().replace(/"/g, ''));
        const obj: any = {};
        headers.forEach((header, index) => {
          obj[header] = values[index] || '';
        });
        return obj;
      });
    } else {
      // XLSX/XLS parsing
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      if (data.length < 2) return [];
      
      const headers = data[0] as string[];
      const rows = data.slice(1) as any[][];
      
      return rows.map(row => {
        const obj: any = {};
        headers.forEach((header, index) => {
          obj[header] = row[index] || '';
        });
        return obj;
      });
    }
  };

  // Handle file import
  const handleImport = async () => {
    if (!importFile) return;
    
    setIsImporting(true);
    
    try {
      const products = await parseFile(importFile);
      
      if (products.length === 0) {
        toast({
          title: "Error",
          description: "No valid products found in file",
          variant: "destructive",
        });
        setIsImporting(false);
        return;
      }
      
      if (products.length > 50000) {
        toast({
          title: "Error",
          description: "Maximum 50,000 products allowed per import",
          variant: "destructive",
        });
        setIsImporting(false);
        return;
      }
      
      bulkImportMutation.mutate(products);
    } catch (error) {
      setIsImporting(false);
      toast({
        title: "Error",
        description: "Failed to parse file",
        variant: "destructive",
      });
    }
  };

  // Mutations
  const bulkImportMutation = useMutation({
    mutationFn: async (products: any[]) => {
      const response = await apiRequest("POST", "/api/products/bulk-import", { products });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsImporting(false);
      setImportFile(null);
      
      if (data.errors > 0 && data.errorMessages && data.errorMessages.length > 0) {
        console.log("Import errors:", data.errorMessages);
        toast({
          title: data.imported > 0 ? "Import Partially Complete" : "Import Failed",
          description: `${data.imported} products imported successfully. ${data.errors} errors encountered. Check console for details.`,
          variant: data.imported > 0 ? "default" : "destructive",
        });
      } else {
        toast({
          title: "Import Complete",
          description: `Successfully imported ${data.imported} products.`,
        });
      }
      
      setIsImportDialogOpen(false);
    },
    onError: () => {
      setIsImporting(false);
      toast({
        title: "Import Failed",
        description: "Failed to import products",
        variant: "destructive",
      });
    },
  });

  const createProductMutation = useMutation({
    mutationFn: async (productData: any) => {
      const response = await apiRequest("POST", "/api/products", productData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsAddDialogOpen(false);
      setActiveTab("basic");
      setNewProduct({
        sku: "",
        productName: "",
        barcode: "",
        valueStream: "",
        category: "",
        brandName: "",
        productManager: "",
        skuLengthCm: "",
        skuWidthCm: "",
        skuHeightCm: "",
        skuWeightKg: "",
        vat: "",
        hsCode: "",
        ssdDate: "",
        edsDate: "",
        seasonal: false,
        minOrderQty: "",
        masterBoxQty: "",
        palletQty: "",
        containerQty: "",
        productionDays: "",
        status: "new",
        imageUrl: "",
        supplierName: "",
      });
      toast({
        title: "Product created",
        description: "Product has been successfully added",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create product",
        variant: "destructive",
      });
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await apiRequest("PUT", `/api/products/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsEditDialogOpen(false);
      setSelectedProduct(null);
      toast({
        title: "Product updated",
        description: "Product has been successfully updated",
      });
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/products/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: "Product deleted",
        description: "Product has been successfully deleted",
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(
        ids.map(id => apiRequest("DELETE", `/api/products/${id}`))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setSelectedProducts(new Set());
      setSelectAll(false);
      toast({
        title: "Products deleted",
        description: `${selectedProducts.size} products have been successfully deleted`,
      });
    },
  });

  // Fetch all products for total selection
  const { data: allProductsData } = useQuery({
    queryKey: ["/api/products/all"],
    queryFn: async () => {
      const response = await fetch(`/api/products?limit=50000`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch all products');
      return response.json();
    },
    enabled: false, // Only fetch when needed
  });

  // Checkbox handlers
  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedProducts(new Set());
      setSelectAll(false);
    } else {
      setShowSelectAllDialog(true);
    }
  };

  const handleSelectCurrentPage = () => {
    const currentPageIds = new Set(products.map((p: Product) => p.id));
    setSelectedProducts(currentPageIds);
    setSelectAll(true);
    setShowSelectAllDialog(false);
  };

  const handleSelectAllProducts = async () => {
    try {
      // Fetch all products
      const response = await fetch(`/api/products?limit=50000`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch all products');
      const allData = await response.json();
      
      const allProductIds = new Set(allData.products.map((p: Product) => p.id));
      setSelectedProducts(allProductIds);
      setSelectAll(true);
      setShowSelectAllDialog(false);
      
      toast({
        title: "Success",
        description: `Selected ${allProductIds.size} products across all pages`,
      });
    } catch (error) {
      console.error("Error selecting all products:", error);
      toast({
        title: "Error",
        description: "Failed to select all products",
        variant: "destructive",
      });
    }
  };

  const handleSelectProduct = (productId: number) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
    setSelectAll(newSelected.size === totalProducts);
  };

  // Event handlers
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.sku) {
      toast({
        title: "Error",
        description: "SKU is required",
        variant: "destructive",
      });
      return;
    }
    
    // Convert empty strings to null for optional fields and numbers
    const productData = {
      ...newProduct,
      productName: newProduct.productName || null,
      barcode: newProduct.barcode || null,
      category: newProduct.category || null,
      brandName: newProduct.brandName || null,
      skuLengthCm: newProduct.skuLengthCm ? parseFloat(newProduct.skuLengthCm) : null,
      skuWidthCm: newProduct.skuWidthCm ? parseFloat(newProduct.skuWidthCm) : null,
      skuHeightCm: newProduct.skuHeightCm ? parseFloat(newProduct.skuHeightCm) : null,
      skuWeightKg: newProduct.skuWeightKg ? parseFloat(newProduct.skuWeightKg) : null,
      skuVolumeM3: newProduct.skuVolumeM3 ? parseFloat(newProduct.skuVolumeM3) : null,
      skuCargoSize: newProduct.skuCargoSize || null,
      vat: newProduct.vat ? parseFloat(newProduct.vat) : null,
      hsCode: newProduct.hsCode || null,
      ssdDate: newProduct.ssdDate || null,
      edsDate: newProduct.edsDate || null,
      minOrderQty: newProduct.minOrderQty ? parseInt(newProduct.minOrderQty) : null,
      masterBoxQty: newProduct.masterBoxQty ? parseInt(newProduct.masterBoxQty) : null,
      palletQty: newProduct.palletQty ? parseInt(newProduct.palletQty) : null,
      containerQty: newProduct.containerQty ? parseInt(newProduct.containerQty) : null,
      productionDays: newProduct.productionDays ? parseInt(newProduct.productionDays) : null,
      imageUrl: newProduct.imageUrl || null,
      supplierName: newProduct.supplierName || null,
    };
    
    await createProductMutation.mutateAsync(productData);
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    await updateProductMutation.mutateAsync({
      id: selectedProduct.id,
      data: selectedProduct,
    });
  };

  const handleDeleteProduct = async (id: number) => {
    if (confirm("Are you sure you want to delete this product?")) {
      await deleteProductMutation.mutateAsync(id);
    }
  };

  const handleBulkDelete = async () => {
    const count = selectedProducts.size;
    if (confirm(`Are you sure you want to delete ${count} selected product${count > 1 ? 's' : ''}?`)) {
      await bulkDeleteMutation.mutateAsync(Array.from(selectedProducts));
    }
  };

  const handleExport = async () => {
    const params = new URLSearchParams({ page: "1", limit: "100000", search: debouncedSearch, sort: sortField, order: sortDirection });
    if (statusFilters.length > 0) params.set("statuses", JSON.stringify(statusFilters));
    if (categoryFilters.length > 0) params.set("cats", JSON.stringify(categoryFilters));
    if (vsFilters.length > 0) params.set("valueStreams", JSON.stringify(vsFilters));
    if (brandFilters.length > 0) params.set("brands", JSON.stringify(brandFilters));
    if (supplierFilters.length > 0) params.set("suppliers", JSON.stringify(supplierFilters));
    const res = await fetch(`/api/products?${params}`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
    const data = await res.json();
    const rows = (data.products as Product[]).map(p => ({
      SKU: p.sku,
      "Product Name": p.productName ?? "",
      "Value Stream": p.valueStream ?? "",
      Category: p.category ?? "",
      Brand: p.brandName ?? "",
      Status: p.status ?? "",
      Supplier: p.supplierName ?? "",
      Barcode: p.barcode ?? "",
      "Length (cm)": p.skuLengthCm ?? "",
      "Width (cm)": p.skuWidthCm ?? "",
      "Height (cm)": p.skuHeightCm ?? "",
      "Weight (kg)": p.skuWeightKg ?? "",
      "Volume (m³)": p.skuVolumeM3 ?? "",
      "MOQ": p.minOrderQty ?? "",
      "Box Qty": p.masterBoxQty ?? "",
      "Pallet Qty": p.palletQty ?? "",
      "Container Qty": p.containerQty ?? "",
      "Production Days": p.productionDays ?? "",
      "VAT (%)": p.vat ?? "",
      "HS Code": p.hsCode ?? "",
      "SSD Date": p.ssdDate ?? "",
      "EDS Date": p.edsDate ?? "",
      Seasonal: p.seasonal ? "Yes" : "No",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb2 = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb2, ws, "Products");
    XLSX.writeFile(wb2, "products.xlsx");
    fetch("/api/activity/log", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("token")}` }, body: JSON.stringify({ actionType: "export", entityType: "product", description: `Exported ${rows.length} products to xlsx`, metadata: { rowCount: rows.length } }) }).catch(() => {});
  };

  // Sorting handler
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Utility functions
  const getStatusColor = (status: string) => {
    switch (status) {
      case "new": return "bg-blue-100 text-blue-800";
      case "active": return "bg-green-100 text-green-800";
      case "inactive": return "bg-red-100 text-red-800";
      case "spare_parts": return "bg-gray-100 text-gray-800";
      case "multiple": return "bg-yellow-100 text-yellow-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  // Authentication check only - don't wait for products to load
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

  const categoryHierarchy: Record<string, string[]> = (metadata as any).categoryHierarchy || {};
  const availableStatuses: string[] = (metadata as any).statuses || [];
  const availableValueStreams: string[] = Object.keys(categoryHierarchy).sort();
  const availableBrands: string[] = (metadata as any).brands || [];
  const availableSuppliers: string[] = (metadata as any).suppliers || [];




  // Sortable header component
  const SortableHeader = ({ field, children, className = "" }: { field: string; children: React.ReactNode; className?: string }) => (
    <th 
      className={`cursor-pointer ${className}`}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center justify-between">
        <span>{children}</span>
        <div className="ml-1">
          {sortField === field ? (
            sortDirection === "asc" ? (
              <ChevronUp className="w-3 h-3 text-gray-600" />
            ) : (
              <ChevronDown className="w-3 h-3 text-gray-600" />
            )
          ) : (
            <div className="w-3 h-3" />
          )}
        </div>
      </div>
    </th>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt="Preview"
            className="max-w-[90vw] max-h-[90vh] rounded-xl shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      <Sidebar />
      
      <div className="md:ml-64">
        {/* Top Header */}
        <header className="bg-white border-b border-gray-200">
          <div className="pl-14 pr-6 py-4 md:px-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-semibold text-gray-800">Products</h1>
                <p className="text-gray-600 mt-1">Manage your product catalog across all marketplaces</p>
              </div>
              <div className="flex items-center space-x-3">
                {selectedProducts.size > 0 && (
                  <>
                    <span className="text-sm text-gray-600">
                      {selectedProducts.size} item{selectedProducts.size > 1 ? 's' : ''} selected
                    </span>
                    <Button 
                      size="sm" 
                      variant="destructive"
                      onClick={handleBulkDelete}
                      disabled={bulkDeleteMutation.isPending}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete Products
                    </Button>
                  </>
                )}
                
                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                  <DialogTrigger asChild>
                    <div style={{ display: 'none' }} />
                  </DialogTrigger>
                  <DialogContent className="max-w-xl h-[700px] p-0 flex flex-col">
                    <div className="p-6 border-b bg-white shrink-0">
                      <DialogHeader>
                        <DialogTitle>Add New Product</DialogTitle>
                        <DialogDescription>
                          Create a new product to sync across your marketplaces
                        </DialogDescription>
                      </DialogHeader>
                    </div>
                    
                    <form onSubmit={handleCreateProduct} className="flex flex-col flex-1 min-h-0">
                      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1">
                        <TabsList className="h-auto p-0 bg-white border-b border-gray-200 w-full grid grid-cols-4 rounded-none shrink-0">
                          <TabsTrigger 
                            value="basic"
                            className="data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:shadow-none rounded-none px-2 py-3 font-medium text-gray-500 hover:text-gray-700 text-sm"
                          >
                            Basic Info
                          </TabsTrigger>
                          <TabsTrigger 
                            value="dimensions"
                            className="data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:shadow-none rounded-none px-2 py-3 font-medium text-gray-500 hover:text-gray-700 text-sm"
                          >
                            Dimensions
                          </TabsTrigger>
                          <TabsTrigger 
                            value="compliance"
                            className="data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:shadow-none rounded-none px-2 py-3 font-medium text-gray-500 hover:text-gray-700 text-sm"
                          >
                            Compliance
                          </TabsTrigger>
                          <TabsTrigger 
                            value="supply"
                            className="data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:shadow-none rounded-none px-2 py-3 font-medium text-gray-500 hover:text-gray-700 text-sm"
                          >
                            Supply Chain
                          </TabsTrigger>
                        </TabsList>
                        
                        <div className="h-[450px] overflow-y-auto px-6 py-6">
                          <TabsContent value="basic" className="space-y-4 pr-2">
                            <div>
                              <Label htmlFor="sku">SKU *</Label>
                              <Input 
                                id="sku" 
                                value={newProduct.sku}
                                onChange={(e) => setNewProduct({...newProduct, sku: e.target.value})}
                                placeholder="Enter SKU" 
                                required
                              />
                            </div>
                            <div>
                              <Label htmlFor="productName">Product Name</Label>
                              <Input 
                                id="productName" 
                                value={newProduct.productName}
                                onChange={(e) => setNewProduct({...newProduct, productName: e.target.value})}
                                placeholder="Enter product name" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="barcode">Barcode</Label>
                              <Input 
                                id="barcode" 
                                value={newProduct.barcode}
                                onChange={(e) => setNewProduct({...newProduct, barcode: e.target.value})}
                                placeholder="Enter barcode" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="valueStream">Value Stream</Label>
                              <Input 
                                id="valueStream" 
                                value={newProduct.valueStream}
                                onChange={(e) => setNewProduct({...newProduct, valueStream: e.target.value})}
                                placeholder="e.g., Kids, Electronics, Home" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="category">Category</Label>
                              <Input 
                                id="category" 
                                value={newProduct.category}
                                onChange={(e) => setNewProduct({...newProduct, category: e.target.value})}
                                placeholder="e.g., Toys, Tablets, Furniture" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="status">Status</Label>
                              <Select 
                                value={newProduct.status} 
                                onValueChange={(value: "new" | "active" | "inactive" | "spare_parts" | "multiple") => setNewProduct({...newProduct, status: value})}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="new">New</SelectItem>
                                  <SelectItem value="active">Active</SelectItem>
                                  <SelectItem value="inactive">Inactive</SelectItem>
                                  <SelectItem value="spare_parts">Spare parts</SelectItem>
                                  <SelectItem value="multiple">Multiple</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label htmlFor="brandName">Brand Name</Label>
                              <Input 
                                id="brandName" 
                                value={newProduct.brandName}
                                onChange={(e) => setNewProduct({...newProduct, brandName: e.target.value})}
                                placeholder="Enter brand name" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="productManager">Product Manager</Label>
                              <Input 
                                id="productManager" 
                                value={newProduct.productManager}
                                onChange={(e) => setNewProduct({...newProduct, productManager: e.target.value})}
                                placeholder="Enter product manager name" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="imageUrl">Image URL</Label>
                              <Input 
                                id="imageUrl" 
                                value={newProduct.imageUrl}
                                onChange={(e) => setNewProduct({...newProduct, imageUrl: e.target.value})}
                                placeholder="Enter image URL" 
                              />
                            </div>
                          </TabsContent>

                          <TabsContent value="dimensions" className="space-y-4 pr-2">
                            <div>
                              <Label htmlFor="skuLengthCm">Length (cm)</Label>
                              <Input 
                                id="skuLengthCm" 
                                type="number"
                                step="0.01"
                                value={newProduct.skuLengthCm}
                                onChange={(e) => setNewProduct({...newProduct, skuLengthCm: e.target.value})}
                                placeholder="0.00" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="skuWidthCm">Width (cm)</Label>
                              <Input 
                                id="skuWidthCm" 
                                type="number"
                                step="0.01"
                                value={newProduct.skuWidthCm}
                                onChange={(e) => setNewProduct({...newProduct, skuWidthCm: e.target.value})}
                                placeholder="0.00" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="skuHeightCm">Height (cm)</Label>
                              <Input 
                                id="skuHeightCm" 
                                type="number"
                                step="0.01"
                                value={newProduct.skuHeightCm}
                                onChange={(e) => setNewProduct({...newProduct, skuHeightCm: e.target.value})}
                                placeholder="0.00" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="skuWeightKg">Weight (kg)</Label>
                              <Input 
                                id="skuWeightKg" 
                                type="number"
                                step="0.001"
                                value={newProduct.skuWeightKg}
                                onChange={(e) => setNewProduct({...newProduct, skuWeightKg: e.target.value})}
                                placeholder="0.000" 
                              />
                            </div>

                          </TabsContent>

                          <TabsContent value="compliance" className="space-y-4 pr-2">
                            <div>
                              <Label htmlFor="vat">VAT (%)</Label>
                              <Input 
                                id="vat" 
                                type="number"
                                step="0.01"
                                value={newProduct.vat}
                                onChange={(e) => setNewProduct({...newProduct, vat: e.target.value})}
                                placeholder="0.00" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="hsCode">HS Code</Label>
                              <Input 
                                id="hsCode" 
                                value={newProduct.hsCode}
                                onChange={(e) => setNewProduct({...newProduct, hsCode: e.target.value})}
                                placeholder="Enter HS code" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="ssdDate">SSD Date</Label>
                              <Input 
                                id="ssdDate" 
                                type="date"
                                value={newProduct.ssdDate}
                                onChange={(e) => setNewProduct({...newProduct, ssdDate: e.target.value})}
                              />
                            </div>
                            <div>
                              <Label htmlFor="edsDate">EDS Date</Label>
                              <Input 
                                id="edsDate" 
                                type="date"
                                value={newProduct.edsDate}
                                onChange={(e) => setNewProduct({...newProduct, edsDate: e.target.value})}
                              />
                            </div>
                            <div className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                id="seasonal"
                                checked={newProduct.seasonal}
                                onChange={(e) => setNewProduct({...newProduct, seasonal: e.target.checked})}
                                className="rounded border-gray-300"
                              />
                              <Label htmlFor="seasonal" className="text-sm">Seasonal Product</Label>
                            </div>
                          </TabsContent>

                          <TabsContent value="supply" className="space-y-4 pr-2">
                            <div>
                              <Label htmlFor="supplierName">Supplier Name</Label>
                              <Input 
                                id="supplierName" 
                                value={newProduct.supplierName}
                                onChange={(e) => setNewProduct({...newProduct, supplierName: e.target.value})}
                                placeholder="Enter supplier name" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="productionDays">Production Days</Label>
                              <Input 
                                id="productionDays" 
                                type="number"
                                value={newProduct.productionDays}
                                onChange={(e) => setNewProduct({...newProduct, productionDays: e.target.value})}
                                placeholder="Enter production days" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="minOrderQty">Min Order Qty</Label>
                              <Input 
                                id="minOrderQty" 
                                type="number"
                                value={newProduct.minOrderQty}
                                onChange={(e) => setNewProduct({...newProduct, minOrderQty: e.target.value})}
                                placeholder="0" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="masterBoxQty">Master Box Qty</Label>
                              <Input 
                                id="masterBoxQty" 
                                type="number"
                                value={newProduct.masterBoxQty}
                                onChange={(e) => setNewProduct({...newProduct, masterBoxQty: e.target.value})}
                                placeholder="0" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="palletQty">Pallet Qty</Label>
                              <Input 
                                id="palletQty" 
                                type="number"
                                value={newProduct.palletQty}
                                onChange={(e) => setNewProduct({...newProduct, palletQty: e.target.value})}
                                placeholder="0" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="containerQty">Container Qty</Label>
                              <Input 
                                id="containerQty" 
                                type="number"
                                value={newProduct.containerQty}
                                onChange={(e) => setNewProduct({...newProduct, containerQty: e.target.value})}
                                placeholder="0" 
                              />
                            </div>
                          </TabsContent>
                        </div>
                      </Tabs>
                      
                      <div className="p-6 border-t bg-white shrink-0 flex justify-end space-x-3">
                        <Button type="button" variant="outline" onClick={() => {
                          setIsAddDialogOpen(false);
                          setActiveTab("basic");
                        }}>
                          Cancel
                        </Button>
                        <Button 
                          type="submit" 
                          className="bg-blue-600 hover:bg-blue-700"
                          disabled={createProductMutation.isPending}
                        >
                          {createProductMutation.isPending ? "Creating..." : "Create Product"}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>

                {/* Import Products Dialog */}
                <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Import Products</DialogTitle>
                      <DialogDescription>
                        Import up to 50,000 products at once using our XLSX template
                      </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-6 py-4">
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <h4 className="text-sm font-medium text-blue-900 mb-2">Step 1: Download Template</h4>
                        <Button 
                          type="button" 
                          variant="outline" 
                          className="w-full"
                          onClick={() => {
                            // Create and download XLSX template
                            const headers = [
                              'sku', 'productName', 'barcode', 'valueStream', 'category', 'status', 'brandName', 'productManager', 'imageUrl',
                              'skuLengthCm', 'skuWidthCm', 'skuHeightCm', 'skuWeightKg',
                              'vat', 'hsCode', 'ssdDate', 'edsDate', 'seasonal',
                              'supplierName', 'productionDays', 'minOrderQty', 'masterBoxQty', 'palletQty', 'containerQty'
                            ];
                            const sampleData = [
                              'EXAMPLE-SKU-001', 'Sample Product Name', '1234567890123', 'Kids', 'Toys', 'new', 'Sample Brand', 'John Smith', 'https://example.com/image.jpg',
                              '10.5', '5.2', '3.1', '0.5',
                              '20', '8471300000', '2024-01-01', '2024-12-31', 'false',
                              'Sample Supplier', '30', '100', '500', '2000', '40000'
                            ];
                            
                            const worksheet = XLSX.utils.aoa_to_sheet([headers, sampleData]);
                            const workbook = XLSX.utils.book_new();
                            XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
                            
                            // Generate buffer and download
                            const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
                            const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'product_import_template.xlsx';
                            a.click();
                            window.URL.revokeObjectURL(url);
                          }}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download Template (XLSX)
                        </Button>
                      </div>
                      
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 mb-2">Step 2: Upload Filled Template</h4>
                        <input
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setImportFile(file);
                            }
                          }}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Supports CSV, XLS, XLSX files up to 50,000 rows
                        </p>
                        
                        {importFile && (
                          <div className="mt-2 p-2 bg-blue-50 rounded text-sm text-blue-700">
                            Selected: {importFile.name} ({Math.round(importFile.size / 1024)} KB)
                          </div>
                        )}
                      </div>
                      
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <h4 className="text-sm font-medium text-gray-900 mb-2">Import Guidelines:</h4>
                        <ul className="text-xs text-gray-600 space-y-1">
                          <li>• SKU field is required and must be unique</li>
                          <li>• Products are imported in batches of 500</li>
                          <li>• Volume and cargo size are calculated automatically from dimensions</li>
                          <li>• Status options: new, active, inactive, spare_parts, multiple</li>
                          <li>• Dates should be in YYYY-MM-DD format</li>
                          <li>• Numeric fields should use decimal notation (e.g., 10.5)</li>
                          <li>• XLSX format provides better data integrity than CSV</li>
                        </ul>
                      </div>
                    </div>
                    
                    <div className="flex justify-end space-x-3 pt-4 border-t">
                      <Button type="button" variant="outline" onClick={() => {
                        setIsImportDialogOpen(false);
                        setImportFile(null);
                      }}>
                        Cancel
                      </Button>
                      <Button 
                        className="bg-green-600 hover:bg-green-700"
                        disabled={!importFile || isImporting}
                        onClick={handleImport}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        {isImporting ? "Importing..." : "Import Products"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Edit Product Dialog */}
                <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                  <DialogContent className="max-w-xl h-[700px] p-0 flex flex-col overflow-hidden">
                    <div className="p-6 border-b bg-white shrink-0">
                      <DialogHeader>
                        <DialogTitle>Edit Product</DialogTitle>
                        <DialogDescription>
                          Update product information and sync across your marketplaces
                        </DialogDescription>
                      </DialogHeader>
                    </div>
                    
                    <form onSubmit={handleUpdateProduct} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                        <TabsList className="h-auto p-0 bg-white border-b border-gray-200 w-full grid grid-cols-4 rounded-none shrink-0">
                          <TabsTrigger 
                            value="basic"
                            className="data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:shadow-none rounded-none px-2 py-3 font-medium text-gray-500 hover:text-gray-700 text-sm"
                          >
                            Basic Info
                          </TabsTrigger>
                          <TabsTrigger 
                            value="dimensions"
                            className="data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:shadow-none rounded-none px-2 py-3 font-medium text-gray-500 hover:text-gray-700 text-sm"
                          >
                            Dimensions
                          </TabsTrigger>
                          <TabsTrigger 
                            value="marketplace"
                            className="data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:shadow-none rounded-none px-2 py-3 font-medium text-gray-500 hover:text-gray-700 text-sm"
                          >
                            Marketplace
                          </TabsTrigger>
                          <TabsTrigger 
                            value="supply"
                            className="data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:shadow-none rounded-none px-2 py-3 font-medium text-gray-500 hover:text-gray-700 text-sm"
                          >
                            Supply Chain
                          </TabsTrigger>
                        </TabsList>
                        
                        <div className="h-[450px] overflow-y-auto px-6 py-6">
                          <TabsContent value="basic" className="space-y-4 pr-2">
                            <div>
                              <Label htmlFor="edit-sku">SKU *</Label>
                              <Input 
                                id="edit-sku" 
                                value={selectedProduct?.sku || ""}
                                onChange={(e) => setSelectedProduct(selectedProduct ? {...selectedProduct, sku: e.target.value} : null)}
                                placeholder="Enter product SKU" 
                                required 
                              />
                            </div>
                            <div>
                              <Label htmlFor="edit-productName">Product Name *</Label>
                              <Input 
                                id="edit-productName" 
                                value={selectedProduct?.productName || ""}
                                onChange={(e) => setSelectedProduct(selectedProduct ? {...selectedProduct, productName: e.target.value} : null)}
                                placeholder="Enter product name" 
                                required 
                              />
                            </div>
                            <div>
                              <Label htmlFor="edit-barcode">Barcode</Label>
                              <Input 
                                id="edit-barcode" 
                                value={selectedProduct?.barcode || ""}
                                onChange={(e) => setSelectedProduct(selectedProduct ? {...selectedProduct, barcode: e.target.value} : null)}
                                placeholder="Enter barcode" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="edit-valueStream">Value Stream</Label>
                              <Input 
                                id="edit-valueStream" 
                                value={selectedProduct?.valueStream || ""}
                                onChange={(e) => setSelectedProduct(selectedProduct ? {...selectedProduct, valueStream: e.target.value} : null)}
                                placeholder="e.g., Kids, Electronics, Home" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="edit-category">Category</Label>
                              <Input 
                                id="edit-category" 
                                value={selectedProduct?.category || ""}
                                onChange={(e) => setSelectedProduct(selectedProduct ? {...selectedProduct, category: e.target.value} : null)}
                                placeholder="e.g., Toys, Tablets, Furniture" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="edit-brandName">Brand Name</Label>
                              <Input 
                                id="edit-brandName" 
                                value={selectedProduct?.brandName || ""}
                                onChange={(e) => setSelectedProduct(selectedProduct ? {...selectedProduct, brandName: e.target.value} : null)}
                                placeholder="Enter brand name" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="edit-productManager">Product Manager</Label>
                              <Input 
                                id="edit-productManager" 
                                value={selectedProduct?.productManager || ""}
                                onChange={(e) => setSelectedProduct(selectedProduct ? {...selectedProduct, productManager: e.target.value} : null)}
                                placeholder="Enter product manager name" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="edit-status">Status</Label>
                              <Select value={selectedProduct?.status || ""} onValueChange={(value) => setSelectedProduct(selectedProduct ? {...selectedProduct, status: value as any} : null)}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="new">New</SelectItem>
                                  <SelectItem value="active">Active</SelectItem>
                                  <SelectItem value="inactive">Inactive</SelectItem>
                                  <SelectItem value="spare_parts">Spare Parts</SelectItem>
                                  <SelectItem value="multiple">Multiple</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label htmlFor="edit-imageUrl">Image URL</Label>
                              <Input 
                                id="edit-imageUrl" 
                                value={selectedProduct?.imageUrl || ""}
                                onChange={(e) => setSelectedProduct(selectedProduct ? {...selectedProduct, imageUrl: e.target.value} : null)}
                                placeholder="Enter image URL" 
                              />
                            </div>
                          </TabsContent>

                          <TabsContent value="dimensions" className="space-y-4 pr-2">
                            <div>
                              <Label htmlFor="edit-length">Length (cm)</Label>
                              <Input 
                                id="edit-length" 
                                type="number"
                                step="0.01"
                                value={selectedProduct?.skuLengthCm || ""}
                                onChange={(e) => setSelectedProduct(selectedProduct ? {...selectedProduct, skuLengthCm: parseFloat(e.target.value) || null} : null)}
                                placeholder="0.00" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="edit-width">Width (cm)</Label>
                              <Input 
                                id="edit-width" 
                                type="number"
                                step="0.01"
                                value={selectedProduct?.skuWidthCm || ""}
                                onChange={(e) => setSelectedProduct(selectedProduct ? {...selectedProduct, skuWidthCm: parseFloat(e.target.value) || null} : null)}
                                placeholder="0.00" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="edit-height">Height (cm)</Label>
                              <Input 
                                id="edit-height" 
                                type="number"
                                step="0.01"
                                value={selectedProduct?.skuHeightCm || ""}
                                onChange={(e) => setSelectedProduct(selectedProduct ? {...selectedProduct, skuHeightCm: parseFloat(e.target.value) || null} : null)}
                                placeholder="0.00" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="edit-weight">Weight (kg)</Label>
                              <Input 
                                id="edit-weight" 
                                type="number"
                                step="0.001"
                                value={selectedProduct?.skuWeightKg || ""}
                                onChange={(e) => setSelectedProduct(selectedProduct ? {...selectedProduct, skuWeightKg: parseFloat(e.target.value) || null} : null)}
                                placeholder="0.000" 
                              />
                            </div>

                          </TabsContent>

                          <TabsContent value="marketplace" className="space-y-4 pr-2">
                            <div>
                              <Label htmlFor="edit-vat">VAT (%)</Label>
                              <Input 
                                id="edit-vat" 
                                type="number"
                                step="0.01"
                                value={selectedProduct?.vat || ""}
                                onChange={(e) => setSelectedProduct(selectedProduct ? {...selectedProduct, vat: parseFloat(e.target.value) || null} : null)}
                                placeholder="0.00" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="edit-hsCode">HS Code</Label>
                              <Input 
                                id="edit-hsCode" 
                                value={selectedProduct?.hsCode || ""}
                                onChange={(e) => setSelectedProduct(selectedProduct ? {...selectedProduct, hsCode: e.target.value} : null)}
                                placeholder="Enter HS code" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="edit-ssdDate">SSD Date</Label>
                              <Input 
                                id="edit-ssdDate" 
                                type="date"
                                value={selectedProduct?.ssdDate || ""}
                                onChange={(e) => setSelectedProduct(selectedProduct ? {...selectedProduct, ssdDate: e.target.value} : null)}
                              />
                            </div>
                            <div>
                              <Label htmlFor="edit-edsDate">EDS Date</Label>
                              <Input 
                                id="edit-edsDate" 
                                type="date"
                                value={selectedProduct?.edsDate || ""}
                                onChange={(e) => setSelectedProduct(selectedProduct ? {...selectedProduct, edsDate: e.target.value} : null)}
                              />
                            </div>
                            <div className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                id="edit-seasonal"
                                checked={selectedProduct?.seasonal || false}
                                onChange={(e) => setSelectedProduct(selectedProduct ? {...selectedProduct, seasonal: e.target.checked} : null)}
                                className="rounded border-gray-300"
                              />
                              <Label htmlFor="edit-seasonal" className="text-sm">Seasonal Product</Label>
                            </div>
                          </TabsContent>

                          <TabsContent value="supply" className="space-y-4 pr-2">
                            <div>
                              <Label htmlFor="edit-supplierName">Supplier Name</Label>
                              <Input 
                                id="edit-supplierName" 
                                value={selectedProduct?.supplierName || ""}
                                onChange={(e) => setSelectedProduct(selectedProduct ? {...selectedProduct, supplierName: e.target.value} : null)}
                                placeholder="Enter supplier name" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="edit-productionDays">Production Days</Label>
                              <Input 
                                id="edit-productionDays" 
                                type="number"
                                value={selectedProduct?.productionDays || ""}
                                onChange={(e) => setSelectedProduct(selectedProduct ? {...selectedProduct, productionDays: parseInt(e.target.value) || null} : null)}
                                placeholder="Enter production days" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="edit-minOrderQty">Min Order Qty</Label>
                              <Input 
                                id="edit-minOrderQty" 
                                type="number"
                                value={selectedProduct?.minOrderQty || ""}
                                onChange={(e) => setSelectedProduct(selectedProduct ? {...selectedProduct, minOrderQty: parseInt(e.target.value) || null} : null)}
                                placeholder="0" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="edit-masterBoxQty">Master Box Qty</Label>
                              <Input 
                                id="edit-masterBoxQty" 
                                type="number"
                                value={selectedProduct?.masterBoxQty || ""}
                                onChange={(e) => setSelectedProduct(selectedProduct ? {...selectedProduct, masterBoxQty: parseInt(e.target.value) || null} : null)}
                                placeholder="0" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="edit-palletQty">Pallet Qty</Label>
                              <Input 
                                id="edit-palletQty" 
                                type="number"
                                value={selectedProduct?.palletQty || ""}
                                onChange={(e) => setSelectedProduct(selectedProduct ? {...selectedProduct, palletQty: parseInt(e.target.value) || null} : null)}
                                placeholder="0" 
                              />
                            </div>
                            <div>
                              <Label htmlFor="edit-containerQty">Container Qty</Label>
                              <Input 
                                id="edit-containerQty" 
                                type="number"
                                value={selectedProduct?.containerQty || ""}
                                onChange={(e) => setSelectedProduct(selectedProduct ? {...selectedProduct, containerQty: parseInt(e.target.value) || null} : null)}
                                placeholder="0" 
                              />
                            </div>
                          </TabsContent>
                        </div>
                      </Tabs>
                      
                      <div className="p-6 border-t bg-white shrink-0 flex justify-end space-x-3">
                        <Button type="button" variant="outline" onClick={() => {
                          setIsEditDialogOpen(false);
                          setSelectedProduct(null);
                          setActiveTab("basic");
                        }}>
                          Cancel
                        </Button>
                        <Button 
                          type="submit" 
                          className="bg-blue-600 hover:bg-blue-700"
                          disabled={updateProductMutation.isPending}
                        >
                          {updateProductMutation.isPending ? "Updating..." : "Update Product"}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>

                {/* Select All Dialog */}
                <Dialog open={showSelectAllDialog} onOpenChange={setShowSelectAllDialog}>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Select Products</DialogTitle>
                      <DialogDescription>
                        Choose which products you want to select
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <Button 
                        onClick={handleSelectCurrentPage}
                        className="w-full justify-start"
                        variant="outline"
                      >
                        <Package className="w-4 h-4 mr-2" />
                        Select Current Page ({products.length} products)
                      </Button>
                      <Button 
                        onClick={handleSelectAllProducts}
                        className="w-full justify-start"
                        variant="outline"
                      >
                        <Package className="w-4 h-4 mr-2" />
                        Select All Products ({statisticsData?.total || 0} products)
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
        </header>

        {/* Summary Stats */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Products</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{statisticsData?.total ?? 0}</div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-green-600 flex items-center">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    Total in catalog
                  </span>
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Products</CardTitle>
                <Package className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {statisticsData?.activeProducts || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {allProducts.length > 0 && statisticsData ? Math.round((statisticsData.activeProducts / statisticsData.total) * 100) : 0}% of total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Categories</CardTitle>
                <Grid3X3 className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {statisticsData?.uniqueCategories || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Unique categories
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Suppliers</CardTitle>
                <Factory className="h-4 w-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {statisticsData?.activeSuppliers || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Active suppliers
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Filter Controls */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search products by name, SKU, category, brand, or supplier..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <MultiSelectFilter
              label="Filter by status"
              options={availableStatuses}
              values={statusFilters}
              onChange={setStatusFilters}
              formatLabel={s => s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}
            />
            <CategoryFilter
              categoryHierarchy={categoryHierarchy}
              values={categoryFilters}
              onChange={setCategoryFilters}
            />
            <MultiSelectFilter label="Value Stream" options={availableValueStreams} values={vsFilters} onChange={setVsFilters} />
            <MultiSelectFilter label="Brand" options={availableBrands} values={brandFilters} onChange={setBrandFilters} />
            <MultiSelectFilter label="Supplier" options={availableSuppliers} values={supplierFilters} onChange={setSupplierFilters} />
          </div>


          {/* Products Table */}
          <Card className="relative group">
            <div className="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
              <Popover open={exportMenuOpen} onOpenChange={setExportMenuOpen}>
                <PopoverTrigger asChild>
                  <button className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-black outline-none" onMouseDown={e => e.preventDefault()}>
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-1" align="end" onCloseAutoFocus={e => e.preventDefault()}>
                  {canEdit && (
                    <>
                      <button
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-100"
                        onClick={() => { setIsAddDialogOpen(true); setExportMenuOpen(false); }}
                      >
                        <Plus className="h-4 w-4" />
                        Add Single Product
                      </button>
                      <button
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-100"
                        onClick={() => { setIsImportDialogOpen(true); setExportMenuOpen(false); }}
                      >
                        <Upload className="h-4 w-4" />
                        Import Products
                      </button>
                      <div className="my-1 border-t border-gray-100" />
                    </>
                  )}
                  <button
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-100"
                    onClick={() => { handleExport(); setExportMenuOpen(false); }}
                  >
                    <Download className="h-4 w-4" />
                    Export XLSX
                  </button>
                </PopoverContent>
              </Popover>
            </div>
            <CardContent className="pt-6">
              {productsLoading ? (
                <div className="text-center py-20">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-4 text-sm text-gray-500">Loading products...</p>
                </div>
              ) : totalProducts === 0 ? (
                <div className="text-center py-12">
                  <Package className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No products found</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {allProducts.length === 0 
                      ? "Get started by creating your first product."
                      : "Try adjusting your search or filter criteria."
                    }
                  </p>
                  {allProducts.length === 0 && (
                    <div className="mt-6 flex flex-col items-center space-y-3">
                      <Button onClick={() => setIsAddDialogOpen(true)}>
                        <Plus className="w-4 h-4 mr-1" />
                        Add Product
                      </Button>
                      <span className="text-sm text-muted-foreground">or</span>
                      <Button variant="outline" onClick={() => setIsImportDialogOpen(true)}>
                        <Upload className="w-4 h-4 mr-1" />
                        Import by file
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto border border-gray-200 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-white sticky top-0 z-10">
                      <tr className="border-b border-gray-200">
                        {canEdit && (
                          <th className="text-center py-3 px-2 font-medium text-black uppercase text-xs w-12">
                            <input
                              type="checkbox"
                              className="rounded"
                              checked={selectAll}
                              onChange={handleSelectAll}
                            />
                          </th>
                        )}
                        <th className="text-center py-3 px-2 font-medium text-black uppercase text-xs">Image</th>
                        <SortableHeader field="productName" className="text-left py-3 px-2 font-medium text-black uppercase text-xs">
                          Product
                        </SortableHeader>
                        <SortableHeader field="valueStream" className="text-left py-3 px-2 font-medium text-black uppercase text-xs">
                          Category
                        </SortableHeader>
                        <SortableHeader field="brandName" className="text-left py-3 px-2 font-medium text-black uppercase text-xs">
                          Brand
                        </SortableHeader>
                        <th className="text-left py-3 px-2 font-medium text-black uppercase text-xs w-40">Dimensions</th>
                        <th className="text-left py-3 px-2 font-medium text-black uppercase text-xs w-40">Quantities</th>
                        <SortableHeader field="supplierName" className="text-left py-3 px-2 font-medium text-black uppercase text-xs">
                          Supplier
                        </SortableHeader>
                        <SortableHeader field="status" className="text-center py-3 px-2 font-medium text-black uppercase text-xs">
                          Status
                        </SortableHeader>
                        {canEdit && (
                          <th className="text-center py-3 px-2 font-medium text-black uppercase text-xs">Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedProducts.map((product: Product) => (
                        <tr key={product.id} className="border-b border-gray-100 hover:bg-gray-50">
                          {/* Checkbox */}
                          {canEdit && (
                            <td className="py-4 px-2 text-center">
                              <input
                                type="checkbox"
                                className="rounded"
                                checked={selectedProducts.has(product.id)}
                                onChange={() => handleSelectProduct(product.id)}
                              />
                            </td>
                          )}
                          
                          {/* Image */}
                          <td className="py-4 px-2">
                            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                              {product.imageUrl ? (
                                <img src={product.imageUrl} alt={product.productName || ''} className="w-12 h-12 rounded-lg object-cover cursor-pointer" onClick={() => setLightboxUrl(product.imageUrl!)} />
                              ) : (
                                <Package className="w-6 h-6 text-blue-500" />
                              )}
                            </div>
                          </td>
                          
                          {/* Product (name and SKU) */}
                          <td className="py-4 px-2">
                            <div>
                              <div className="font-medium text-gray-900 text-sm">{product.productName || "Untitled Product"}</div>
                              <div className="text-xs text-gray-500">{product.sku}</div>
                            </div>
                          </td>
                          
                          {/* Category (value_stream on top, category below) */}
                          <td className="py-4 px-2">
                            <div>
                              <div className="text-sm text-gray-900">{product.valueStream || "-"}</div>
                              <div className="text-xs text-gray-500">{product.category || "-"}</div>
                            </div>
                          </td>
                          
                          {/* Brand */}
                          <td className="py-4 px-2 text-gray-600 text-sm">{product.brandName || "-"}</td>
                          
                          {/* Dimensions */}
                          <td className="py-4 px-2 text-gray-600 text-sm">
                            {product.skuLengthCm && product.skuWidthCm && product.skuHeightCm ? (
                              <div className="text-xs">
                                <div>{parseFloat(product.skuLengthCm).toFixed(1)}×{parseFloat(product.skuWidthCm).toFixed(1)}×{parseFloat(product.skuHeightCm).toFixed(1)} cm</div>
                                <div>{product.skuWeightKg ? `${parseFloat(product.skuWeightKg).toFixed(2)} kg` : ""}</div>
                                {product.skuVolumeM3 && (
                                  <div>{parseFloat(product.skuVolumeM3).toFixed(2)} m³</div>
                                )}
                                {product.skuCargoSize && (
                                  <div>Size: {product.skuCargoSize}</div>
                                )}
                              </div>
                            ) : "-"}
                          </td>
                          
                          {/* Quantities */}
                          <td className="py-4 px-2 text-gray-600 text-sm">
                            {product.minOrderQty || product.masterBoxQty || product.palletQty ? (
                              <div className="text-xs">
                                {product.minOrderQty && <div>Moq: {product.minOrderQty} pcs</div>}
                                {product.masterBoxQty && <div>Box: {product.masterBoxQty} pcs</div>}
                                {product.palletQty && <div>Pallet: {product.palletQty} pcs</div>}
                                {product.containerQty && <div>Container: {product.containerQty} pcs</div>}
                              </div>
                            ) : "-"}
                          </td>
                          
                          {/* Supplier */}
                          <td className="py-4 px-2 text-gray-600 text-sm">{product.supplierName || "-"}</td>
                          
                          {/* Status */}
                          <td className="py-4 px-2 text-center">
                            <Badge className={getStatusColor(product.status)}>
                              {product.status}
                            </Badge>
                          </td>
                          
                          {/* Actions */}
                          {canEdit && (
                            <td className="py-4 px-2">
                              <div className="flex items-center justify-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="action-button h-8 w-8 p-0 hover:bg-blue-100"
                                  onClick={() => {
                                    setSelectedProduct(product);
                                    setIsEditDialogOpen(true);
                                  }}
                                >
                                  <Edit className="h-4 w-4 text-blue-600" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="action-button h-8 w-8 p-0 hover:bg-red-100"
                                  onClick={() => handleDeleteProduct(product.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-red-600" />
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              
              {/* Pagination */}
              {totalProducts > 0 && (
                <div className="flex items-center justify-between mt-6 px-4">
                  <div className="text-sm font-normal text-muted-foreground">
                    Showing {startIndex + 1} to {Math.min(endIndex, totalProducts)} of {totalProducts} products
                  </div>
                  <div className="flex items-center space-x-2">
                    <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} onMouseDown={e => e.preventDefault()}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-black outline-none disabled:opacity-30 disabled:pointer-events-none">
                      <ChevronsLeft className="h-4 w-4" />
                    </button>
                    <button onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage === 1} onMouseDown={e => e.preventDefault()}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-black outline-none disabled:opacity-30 disabled:pointer-events-none text-sm font-normal">
                      &lt;
                    </button>
                    <div className="flex space-x-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const pageNum = currentPage <= 3 ? i + 1 : currentPage - 2 + i;
                        if (pageNum > totalPages) return null;
                        return (
                          <button key={pageNum} onClick={() => setCurrentPage(pageNum)} onMouseDown={e => e.preventDefault()}
                            className={`h-8 w-8 inline-flex items-center justify-center rounded-md outline-none text-sm font-normal ${pageNum === currentPage ? 'text-black' : 'text-muted-foreground hover:text-black'}`}>
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                    <button onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage === totalPages} onMouseDown={e => e.preventDefault()}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-black outline-none disabled:opacity-30 disabled:pointer-events-none text-sm font-normal">
                      &gt;
                    </button>
                    <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} onMouseDown={e => e.preventDefault()}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-black outline-none disabled:opacity-30 disabled:pointer-events-none">
                      <ChevronsRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
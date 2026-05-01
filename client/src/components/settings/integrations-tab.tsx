import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Plus, CheckCircle, XCircle, Warehouse, Settings, Trash2, X } from "lucide-react";
import ozonIcon from "@assets/ozon-icon.gif";
import wildberriesIcon from "@assets/wildberries-icon.png";
import yandexMarketIcon from "@assets/yandex-market-icon.png";
import warehouseIcon from "@assets/warehouse-icon.png";

type Integration = {
  id: number;
  companyId: number;
  marketplace: string;
  isEnabled: boolean;
  apiKey?: string;
  clientId?: string;
  businessId?: string;
  campaignId?: string;
  settings?: { campaignIds?: string[]; [k: string]: any } | null;
  lastSyncAt?: string;
  createdAt?: string;
};

type Company = {
  id: number;
  name: string;
  ownerId?: number;
};

const marketplaces = [
  {
    id: "ozon",
    name: "Ozon",
    description: "Интеграция с маркетплейсом Ozon",
    color: "bg-blue-600",
    letter: "O",
    icon: ozonIcon,
    fields: [
      { key: "apiKey", label: "API Key", type: "password" },
      { key: "clientId", label: "Client ID", type: "text" },
    ],
  },
  {
    id: "wildberries",
    name: "Wildberries",
    description: "Интеграция с маркетплейсом Wildberries",
    color: "bg-purple-600",
    letter: "W",
    icon: wildberriesIcon,
    fields: [
      { key: "apiKey", label: "API Key", type: "password" },
    ],
  },
  {
    id: "yandex_market",
    name: "Яндекс.Маркет",
    description: "Интеграция с Яндекс.Маркет",
    color: "bg-red-600",
    letter: "Я",
    icon: yandexMarketIcon,
    fields: [
      { key: "businessId", label: "Business ID", type: "text" },
      { key: "campaignIds", label: "Campaign IDs", type: "multi-text" },
      { key: "apiKey", label: "API Key", type: "password" },
    ],
  },
];

function fieldHasValue(integration: any, field: any): boolean {
  if (field.type === "multi-text") {
    const arr = integration?.settings?.[field.key];
    if (Array.isArray(arr) && arr.some((v: any) => v && String(v).trim() !== "")) return true;
    if (field.key === "campaignIds") {
      const legacy = integration?.campaignId;
      return !!(legacy && String(legacy).trim() !== "");
    }
    return false;
  }
  const value = integration?.[field.key];
  return !!(value && String(value).trim() !== "");
}

function IntegrationDialog({ marketplace, integration, onSave }: {
  marketplace: any;
  integration?: any;
  onSave: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const buildInitialFormData = () => {
    const initial: any = {};
    marketplace.fields.forEach((field: any) => {
      if (field.type === "multi-text") {
        const fromSettings = integration?.settings?.[field.key];
        if (Array.isArray(fromSettings) && fromSettings.length > 0) {
          initial[field.key] = fromSettings.map((v: any) => String(v ?? ""));
        } else if (field.key === "campaignIds" && integration?.campaignId) {
          initial[field.key] = [integration.campaignId];
        } else {
          initial[field.key] = [""];
        }
      } else {
        initial[field.key] = integration?.[field.key] || "";
      }
    });
    return initial;
  };
  const [formData, setFormData] = useState(buildInitialFormData);

  // Reset form data when dialog opens and integration changes
  useEffect(() => {
    if (isOpen) {
      setFormData(buildInitialFormData());
    }
  }, [isOpen, integration, marketplace.fields]);
  const { toast } = useToast();

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const endpoint = integration
        ? `/api/integrations/${integration.id}`
        : "/api/integrations";
      const method = integration ? "PUT" : "POST";

      // Transform multi-text fields into shape expected by backend:
      // - settings.<fieldKey> stores the array
      // - for campaignIds, also mirror first value into the legacy `campaignId` column
      const transformed: any = { ...data };
      const settings: any = { ...(integration?.settings || {}) };
      marketplace.fields.forEach((field: any) => {
        if (field.type === "multi-text") {
          const arr = (data[field.key] || [])
            .map((v: string) => (v ?? "").trim())
            .filter((v: string) => v.length > 0);
          settings[field.key] = arr;
          delete transformed[field.key];
          if (field.key === "campaignIds") {
            transformed.campaignId = arr[0] || "";
          }
        }
      });
      transformed.settings = settings;

      const payload = {
        marketplace: marketplace.id,
        ...transformed,
        isEnabled: transformed.isEnabled !== false ? true : false,
      };

      return await apiRequest(method, endpoint, payload);
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: `${marketplace.name} integration ${integration ? 'updated' : 'added'} successfully`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      setIsOpen(false);
      onSave();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save integration",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/integrations/${integration.id}`);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: `${marketplace.name} integration removed successfully`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      setIsOpen(false);
      onSave();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove integration",
        variant: "destructive",
      });
    },
  });

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to remove the ${marketplace.name} integration? This action cannot be undone.`)) {
      deleteMutation.mutate();
    }
  };

  const isFieldEmpty = (field: any) => {
    if (field.type === "multi-text") {
      const arr = formData[field.key];
      return !Array.isArray(arr) || arr.every((v: string) => !v?.trim());
    }
    return !formData[field.key]?.trim();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Check if all fields are empty (user wants to disconnect)
    const allFieldsEmpty = marketplace.fields.every(isFieldEmpty);

    if (allFieldsEmpty && integration) {
      // User cleared all fields - treat as disconnection
      updateMutation.mutate({
        ...formData,
        isEnabled: false,
      });
      return;
    }

    // Validate required fields for connection
    const emptyFields = marketplace.fields.filter(isFieldEmpty);
    if (emptyFields.length > 0) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    updateMutation.mutate(formData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button className="text-blue-600 hover:text-blue-700 text-xs font-medium">
          {integration && marketplace.fields.every((field: any) => fieldHasValue(integration, field)) ? 'Edit Integration' : 'Add Integration'}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            {marketplace.icon ? (
              <img src={marketplace.icon} alt={marketplace.name} className="w-6 h-6 mr-2" />
            ) : (
              <div className={`w-6 h-6 ${marketplace.color} rounded mr-2 flex items-center justify-center`}>
                <span className="text-white text-xs font-bold">{marketplace.letter}</span>
              </div>
            )}
            {integration ? 'Edit' : 'Add'} {marketplace.name} Integration
          </DialogTitle>
          <DialogDescription>
            {integration ? 'Update your integration settings below.' : 'Enter your API credentials to connect with ' + marketplace.name + '.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {marketplace.fields.map((field: any) => {
            if (field.type === "multi-text") {
              const values: string[] = Array.isArray(formData[field.key]) ? formData[field.key] : [""];
              const updateAt = (idx: number, val: string) => {
                setFormData((prev: any) => {
                  const next = [...(prev[field.key] || [])];
                  next[idx] = val;
                  return { ...prev, [field.key]: next };
                });
              };
              const removeAt = (idx: number) => {
                setFormData((prev: any) => {
                  const next = [...(prev[field.key] || [])];
                  next.splice(idx, 1);
                  return { ...prev, [field.key]: next.length ? next : [""] };
                });
              };
              const addRow = () => {
                setFormData((prev: any) => ({
                  ...prev,
                  [field.key]: [...(prev[field.key] || []), ""],
                }));
              };
              return (
                <div key={field.key} className="space-y-2">
                  <Label>{field.label}</Label>
                  <div className="space-y-2">
                    {values.map((v, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          type="text"
                          value={v}
                          onChange={(e) => updateAt(idx, e.target.value)}
                          placeholder={`Enter ${field.label.slice(0, -1).toLowerCase()}`}
                        />
                        {values.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeAt(idx)}
                            aria-label="Remove"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addRow}>
                    <Plus className="w-3 h-3 mr-1" /> Add Campaign ID
                  </Button>
                </div>
              );
            }
            return (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key}>{field.label}</Label>
                <Input
                  id={field.key}
                  type={field.type}
                  value={formData[field.key]}
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={`Enter ${field.label.toLowerCase()}`}
                  required
                />
              </div>
            );
          })}
          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            {integration && (
              <Button 
                type="button" 
                variant="destructive" 
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="mr-auto"
              >
                {deleteMutation.isPending ? "Removing..." : "Remove Integration"}
              </Button>
            )}
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : (integration ? "Update" : "Save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function WarehouseIntegrationDialog({ warehouse, onSave }: {
  warehouse?: any;
  onSave: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: warehouse?.name || "",
    integrationType: warehouse?.settings?.integrationType || "manual",
    username: warehouse?.settings?.username || "",
    password: warehouse?.settings?.password || ""
  });
  const { toast } = useToast();
  const { user } = useAuth();

  const createWarehouseMutation = useMutation({
    mutationFn: async (data: any) => {
      const endpoint = warehouse ? `/api/warehouses/${warehouse.id}` : "/api/warehouses";
      const method = warehouse ? "PUT" : "POST";
      
      const payload = warehouse 
        ? {
            name: data.name,
            isActive: true,
            settings: {
              integrationType: data.integrationType,
              username: data.integrationType === "api" ? data.username : undefined,
              password: data.integrationType === "api" ? data.password : undefined
            }
          }
        : {
            companyId: user?.companyId,
            name: data.name,
            isActive: true,
            settings: {
              integrationType: data.integrationType,
              username: data.integrationType === "api" ? data.username : undefined,
              password: data.integrationType === "api" ? data.password : undefined
            }
          };
      
      return await apiRequest(method, endpoint, payload);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: `Warehouse integration ${warehouse ? 'updated' : 'added'} successfully`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses", user?.companyId] });
      if (!warehouse) {
        setFormData({
          name: "",
          integrationType: "manual",
          username: "",
          password: ""
        });
      }
      setIsOpen(false);
      onSave();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || `Failed to ${warehouse ? 'update' : 'add'} warehouse integration`,
        variant: "destructive",
      });
    },
  });

  const deleteWarehouseMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/warehouses/${warehouse.id}`);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Warehouse integration removed successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses", user?.companyId] });
      setIsOpen(false);
      onSave();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove warehouse integration",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Warehouse name is required",
        variant: "destructive",
      });
      return;
    }

    if (formData.integrationType === "api" && (!formData.username.trim() || !formData.password.trim())) {
      toast({
        title: "Error",
        description: "Username and password are required for API integration",
        variant: "destructive",
      });
      return;
    }

    createWarehouseMutation.mutate(formData);
  };

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to remove the ${warehouse.name} integration? This action cannot be undone.`)) {
      deleteWarehouseMutation.mutate();
    }
  };

  // Reset form when opening dialog
  const handleOpenChange = (open: boolean) => {
    if (open && warehouse) {
      setFormData({
        name: warehouse.name || "",
        integrationType: warehouse.settings?.integrationType || "manual",
        username: warehouse.settings?.username || "",
        password: warehouse.settings?.password || ""
      });
    } else if (open && !warehouse) {
      setFormData({
        name: "",
        integrationType: "manual",
        username: "",
        password: ""
      });
    }
    setIsOpen(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button className="text-blue-600 hover:text-blue-700 text-xs font-medium">
          {warehouse ? "Edit Integration" : "Add Integration"}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{warehouse ? 'Edit' : 'Add'} Warehouse Integration</DialogTitle>
          <DialogDescription>
            {warehouse ? 'Update your' : 'Configure your'} warehouse integration settings
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="warehouse-name">Name of the warehouse</Label>
            <Input
              id="warehouse-name"
              type="text"
              placeholder="Enter warehouse name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            />
          </div>
          
          <div className="space-y-2">
            <Label>Integration Type</Label>
            <Select
              value={formData.integrationType}
              onValueChange={(value) => setFormData(prev => ({ 
                ...prev, 
                integrationType: value,
                // Clear credentials when switching to API mode
                username: value === "api" ? "" : prev.username,
                password: value === "api" ? "" : prev.password
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="api">API</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.integrationType === "api" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter username"
                  value={formData.username}
                  onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter password"
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                />
              </div>
            </>
          )}

          <div className="flex gap-2 pt-4">
            {warehouse && (
              <Button 
                type="button" 
                variant="destructive" 
                onClick={handleDelete}
                disabled={deleteWarehouseMutation.isPending}
                className="mr-auto"
              >
                {deleteWarehouseMutation.isPending ? "Removing..." : "Remove Integration"}
              </Button>
            )}
            <Button type="submit" disabled={createWarehouseMutation.isPending}>
              {createWarehouseMutation.isPending 
                ? (warehouse ? "Updating..." : "Adding...") 
                : (warehouse ? "Update Warehouse" : "Add Warehouse")
              }
            </Button>
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function IntegrationsTab() {
  const { user, company } = useAuth();
  
  // Invalidate queries when company changes
  useEffect(() => {
    if (company?.id) {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
    }
  }, [company?.id]);
  
  const { data: integrations = [], isLoading } = useQuery<Integration[]>({
    queryKey: ["/api/integrations", company?.id],
    enabled: !!company?.id,
  });

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies/user"],
  });

  // Fetch warehouses for current company
  const { data: warehouses = [] } = useQuery<any[]>({
    queryKey: ["/api/warehouses", company?.id],
    enabled: !!company?.id,
  });

  const getIntegration = (marketplace: string) => {
    return integrations.find((int: Integration) => int.marketplace === marketplace);
  };

  // Check if current user is the owner of the company
  const isOwner = () => {
    if (!user || !companies || companies.length === 0) return false;
    const currentCompany = companies.find((c: Company) => c.id === user.companyId);
    return currentCompany?.ownerId === user.id;
  };

  if (isLoading) {
    return <div>Загрузка...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Choose an Integration</h2>
        <p className="text-sm text-gray-600">
          Add an integration to import your product catalog. You can add more integrations later.{' '}
          <a href="#" className="text-blue-600 hover:text-blue-700">Learn more.</a>
        </p>
      </div>

      {/* Sales Channels Section */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Sales Channels</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          {marketplaces.map((marketplace) => {
            const integration = getIntegration(marketplace.id);
            
            // Check if integration has all required credentials
            const hasValidCredentials = integration?.isEnabled &&
              marketplace.fields.every((field: any) => fieldHasValue(integration, field));
            
            const isConnected = hasValidCredentials;

            return (
              <Card key={marketplace.id} className="bg-white border border-gray-200 hover:border-gray-300 transition-all duration-200 shadow-sm hover:shadow-md rounded-lg">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      {marketplace.icon ? (
                        <div className="w-10 h-10 mr-3 flex-shrink-0">
                          <img 
                            src={marketplace.icon} 
                            alt={marketplace.name} 
                            className="w-full h-full object-contain rounded"
                          />
                        </div>
                      ) : (
                        <div className={`w-10 h-10 ${marketplace.color} rounded flex items-center justify-center mr-3 flex-shrink-0`}>
                          <span className="text-white font-bold text-sm">{marketplace.letter}</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-gray-900 truncate">{marketplace.name}</h4>
                        <div className="flex items-center mt-1">
                          {isConnected ? (
                            <>
                              <CheckCircle className="w-3 h-3 text-green-500 mr-1 flex-shrink-0" />
                              <span className="text-green-600 text-xs">Connected</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3 text-red-500 mr-1 flex-shrink-0" />
                              <span className="text-red-600 text-xs">Disconnected</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    {isOwner() && (
                      <div className="ml-2">
                        <IntegrationDialog 
                          marketplace={marketplace} 
                          integration={integration}
                          onSave={() => {}} 
                        />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Warehouses Section */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h3 className="text-lg font-semibold text-gray-900">Warehouses</h3>
          {isOwner() && (
            <WarehouseIntegrationDialog onSave={() => {}} />
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          {warehouses.length > 0 ? (
            warehouses.map((warehouse: any) => (
              <Card key={warehouse.id} className="bg-white border border-gray-200 hover:border-gray-300 transition-all duration-200 shadow-sm hover:shadow-md rounded-lg">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="w-10 h-10 mr-3 flex-shrink-0">
                        <Warehouse className="w-10 h-10 text-gray-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-gray-900 truncate">{warehouse.name}</h4>
                        <div className="flex items-center mt-1">
                          {warehouse.isActive ? (
                            <>
                              <CheckCircle className="w-3 h-3 text-green-500 mr-1 flex-shrink-0" />
                              <span className="text-green-600 text-xs">Connected</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3 text-red-500 mr-1 flex-shrink-0" />
                              <span className="text-red-600 text-xs">Disconnected</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    {isOwner() && (
                      <div className="ml-2 text-right">
                        <div className="text-xs text-gray-500 mb-1">
                          {warehouse.settings?.integrationType === "api" ? "API" : "Manual"}
                        </div>
                        <WarehouseIntegrationDialog warehouse={warehouse} onSave={() => {}} />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="bg-white border border-gray-200 border-dashed rounded-lg">
              <CardContent className="p-8 text-center">
                <Warehouse className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 text-sm mb-4">No warehouses configured</p>
                {isOwner() && (
                  <WarehouseIntegrationDialog onSave={() => {}} />
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

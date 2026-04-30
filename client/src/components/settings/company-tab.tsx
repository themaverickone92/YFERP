import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Building2, CheckCircle, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import CreateCompanyDialog from "./create-company-dialog";

export default function CompanyTab() {
  const { toast } = useToast();
  const { company, user, refreshAuth } = useAuth();
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    inn: "",
    address: "",
    phone: "",
    email: "",
  });
  
  const [originalName, setOriginalName] = useState("");
  const [nameChanged, setNameChanged] = useState(false);
  const [originalEmail, setOriginalEmail] = useState("");
  const [emailChanged, setEmailChanged] = useState(false);

  // Get user's companies
  const { data: userCompanies = [], isLoading: companiesLoading } = useQuery<any[]>({
    queryKey: ["/api/companies/user"],
  });

  useEffect(() => {
    if (company) {
      setSelectedCompanyId(company.id);
      const companyName = company.name || "";
      const companyEmail = (company as any).email || "";
      setOriginalName(companyName);
      setOriginalEmail(companyEmail);
      setFormData({
        name: companyName,
        inn: (company as any).inn || "",
        address: (company as any).address || "",
        phone: (company as any).phone || "",
        email: companyEmail,
      });
      setNameChanged(false);
      setEmailChanged(false);
    }
  }, [company]);

  const switchCompanyMutation = useMutation({
    mutationFn: async (companyId: number) => {
      return apiRequest("POST", "/api/companies/switch", { companyId }).then(res => res.json());
    },
    onSuccess: async (data) => {
      // Update auth context immediately
      await refreshAuth();
      
      // Update form data immediately with the new company data
      const companyName = data.company.name || "";
      const companyEmail = data.company.email || "";
      setOriginalName(companyName);
      setOriginalEmail(companyEmail);
      setFormData({
        name: companyName,
        inn: data.company.inn || "",
        address: data.company.address || "",
        phone: data.company.phone || "",
        email: companyEmail,
      });
      setNameChanged(false);
      setEmailChanged(false);
      
      // Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies/user"] });
      
      toast({
        title: "Компания переключена",
        description: `Вы переключились на компанию "${data.company.name}"`,
      });
    },
    onError: () => {
      toast({
        title: "Ошибка",
        description: "Не удалось переключить компанию",
        variant: "destructive",
      });
    },
  });

  const updateCompanyMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PUT", `/api/companies/${company?.id}`, data).then(res => res.json());
    },
    onSuccess: () => {
      toast({
        title: "Компания обновлена",
        description: "Данные компании успешно сохранены",
      });
    },
    onError: () => {
      toast({
        title: "Ошибка",
        description: "Не удалось обновить данные компании",
        variant: "destructive",
      });
    },
  });

  const deleteCompanyMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/companies/${company?.id}`).then(res => res.json());
    },
    onSuccess: () => {
      toast({
        title: "Компания удалена",
        description: "Компания была окончательно удалена",
      });
      setShowDeleteDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/companies/user"] });
      refreshAuth();
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось удалить компанию",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateCompanyMutation.mutateAsync(formData);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Track name changes specifically
    if (field === "name") {
      setNameChanged(value !== originalName);
    }
    
    // Track email changes specifically
    if (field === "email") {
      setEmailChanged(value !== originalEmail);
    }
  };

  const handleNameSave = async () => {
    if (company && formData.name !== originalName) {
      await updateCompanyMutation.mutateAsync({ name: formData.name });
      setOriginalName(formData.name);
      setNameChanged(false);
    }
  };

  const handleEmailSave = async () => {
    if (company && formData.email !== originalEmail) {
      await updateCompanyMutation.mutateAsync({ email: formData.email });
      setOriginalEmail(formData.email);
      setEmailChanged(false);
    }
  };

  const handleCompanySwitch = async (companyId: string) => {
    const id = parseInt(companyId);
    if (id !== selectedCompanyId) {
      // Find the selected company in the userCompanies list
      const selectedCompany = userCompanies.find((comp: any) => comp.id === id);
      if (selectedCompany) {
        // Update form data immediately for better UX
        const companyName = selectedCompany.name || "";
        const companyEmail = selectedCompany.email || "";
        setOriginalName(companyName);
        setOriginalEmail(companyEmail);
        setFormData({
          name: companyName,
          inn: selectedCompany.inn || "",
          address: selectedCompany.address || "",
          phone: selectedCompany.phone || "",
          email: companyEmail,
        });
        setNameChanged(false);
        setEmailChanged(false);
      }
      
      setSelectedCompanyId(id);
      await switchCompanyMutation.mutateAsync(id);
    }
  };

  const handleCompanyCreated = () => {
    // Refresh the companies list and auth context
    queryClient.invalidateQueries({ queryKey: ["/api/companies/user"] });
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
  };

  const handleDeleteCompany = async () => {
    if (company?.ownerId === user?.id) {
      await deleteCompanyMutation.mutateAsync(company.id);
    }
  };

  if (companiesLoading) {
    return <div className="text-center py-8">Загрузка...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Company Selection Section */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Выбор компании</h2>
        
        <Card>
          <CardContent className="pt-6">
            {userCompanies.length === 0 ? (
              <div className="text-center py-8">
                <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">У вас нет компаний</h3>
                <p className="text-gray-600 mb-6">
                  Создайте первую компанию для работы с платформой
                </p>
                <CreateCompanyDialog onSuccess={handleCompanyCreated}>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Создать компанию
                  </Button>
                </CreateCompanyDialog>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label htmlFor="company-select" className="text-sm font-medium text-gray-700">
                      Выберите компанию для работы
                    </Label>
                    <CreateCompanyDialog onSuccess={handleCompanyCreated}>
                      <Button variant="outline" size="sm">
                        <Plus className="w-4 h-4 mr-2" />
                        Создать компанию
                      </Button>
                    </CreateCompanyDialog>
                  </div>
                  <Select 
                    value={selectedCompanyId?.toString() || ""} 
                    onValueChange={handleCompanySwitch}
                    disabled={switchCompanyMutation.isPending}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите компанию" />
                    </SelectTrigger>
                    <SelectContent>
                      {userCompanies.map((comp: any) => (
                        <SelectItem key={comp.id} value={comp.id.toString()}>
                          <div className="flex items-center space-x-2">
                            <Building2 className="w-4 h-4 text-gray-500" />
                            <span>{comp.name}</span>
                            {comp.id === selectedCompanyId && (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {userCompanies.length > 1 && (
                  <div className="text-sm text-gray-600">
                    У вас есть доступ к {userCompanies.length} компаниям. Выберите компанию для работы.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Organization Information Section - Only show if user has companies */}
      {userCompanies.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Информация о компании</h2>
          
          <div className="space-y-6">
            <div>
              <Label htmlFor="name" className="text-sm font-medium text-gray-700">
                Название компании
              </Label>
              <div className="flex items-center gap-3 mt-1">
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  placeholder="Your Company Ltd"
                  className="flex-1"
                  disabled={company?.ownerId !== user?.id}
                  required
                />
                {nameChanged && company?.ownerId === user?.id && (
                  <Button 
                    onClick={handleNameSave}
                    disabled={updateCompanyMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 shrink-0"
                  >
                    {updateCompanyMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {company?.ownerId === user?.id 
                  ? "Your business name may be used on shipping labels, order tracking pages, and more."
                  : "Only the company owner can modify the company name."
                }
              </p>
            </div>

            <div>
              <Label htmlFor="ownerEmail" className="text-sm font-medium text-gray-700">
                Owner Email
              </Label>
              <div className="flex items-center gap-3 mt-1">
                <Input
                  id="ownerEmail"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  placeholder="owner@company.com"
                  className="flex-1"
                  disabled={company?.ownerId !== user?.id}
                />
                {emailChanged && company?.ownerId === user?.id && (
                  <Button 
                    onClick={handleEmailSave}
                    disabled={updateCompanyMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 shrink-0"
                  >
                    {updateCompanyMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {company?.ownerId === user?.id 
                  ? "Owner email address for company communications and notifications."
                  : "Only the company owner can modify this email address."
                }
              </p>
            </div>
          </div>

          {/* Danger Zone - Delete Company */}
          {company?.ownerId === user?.id && (
            <div className="pt-8 border-t border-red-200">
              <h3 className="text-lg font-semibold text-red-900 mb-4">Опасная зона</h3>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-red-900 mb-1">Удалить компанию</h4>
                    <p className="text-sm text-red-700">
                      Действие нельзя отменить. Все данные компании будут удалены навсегда.
                    </p>
                  </div>
                  <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                    <DialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Удалить компанию
                      </Button>
                    </DialogTrigger>
                    <DialogContent aria-describedby="delete-company-description">
                      <DialogHeader>
                        <DialogTitle>Удалить компанию</DialogTitle>
                        <DialogDescription id="delete-company-description">
                          Вы уверены, что хотите удалить компанию "{company?.name}"?
                        </DialogDescription>
                      </DialogHeader>
                      
                      <div className="space-y-4 py-4">
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                          <h4 className="font-semibold text-red-900 mb-2">⚠️ Важное предупреждение:</h4>
                          <ul className="text-sm text-red-700 space-y-1">
                            <li>• Все данные компании будут удалены навсегда</li>
                            <li>• Активная подписка будет немедленно отменена</li>
                            <li>• Подписку нельзя передать другой компании</li>
                            <li>• Возврат средств за оставшийся период не предусмотрен</li>
                            <li>• Восстановление данных после удаления невозможно</li>
                          </ul>
                        </div>
                        
                        <p className="text-sm text-gray-600">
                          Если вы хотите продолжить использовать сервис, создайте новую компанию 
                          и оформите новую подписку после удаления текущей компании.
                        </p>
                      </div>
                      
                      <div className="flex justify-end space-x-2 mt-4">
                        <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                          Отмена
                        </Button>
                        <Button 
                          variant="destructive" 
                          onClick={handleDeleteCompany}
                          disabled={deleteCompanyMutation.isPending}
                        >
                          {deleteCompanyMutation.isPending ? "Удаление..." : "Удалить компанию"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

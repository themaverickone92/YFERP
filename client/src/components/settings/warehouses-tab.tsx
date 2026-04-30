import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Edit, Trash2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

export default function WarehousesTab() {
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    address: "",
  });

  const { data: warehouses = [], isLoading } = useQuery({
    queryKey: ["/api/warehouses"],
  });

  const createWarehouseMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/warehouses", data).then(res => res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
      setShowAddDialog(false);
      setFormData({ name: "", address: "" });
      toast({
        title: "Склад создан",
        description: "Новый склад успешно добавлен",
      });
    },
    onError: () => {
      toast({
        title: "Ошибка",
        description: "Не удалось создать склад",
        variant: "destructive",
      });
    },
  });

  const updateWarehouseMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest("PUT", `/api/warehouses/${id}`, data).then(res => res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
      setEditingWarehouse(null);
      setFormData({ name: "", address: "" });
      toast({
        title: "Склад обновлен",
        description: "Данные склада успешно сохранены",
      });
    },
    onError: () => {
      toast({
        title: "Ошибка",
        description: "Не удалось обновить склад",
        variant: "destructive",
      });
    },
  });

  const deleteWarehouseMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/warehouses/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
      toast({
        title: "Склад удален",
        description: "Склад успешно удален",
      });
    },
    onError: () => {
      toast({
        title: "Ошибка",
        description: "Не удалось удалить склад",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingWarehouse) {
      await updateWarehouseMutation.mutateAsync({
        id: editingWarehouse.id,
        data: formData,
      });
    } else {
      await createWarehouseMutation.mutateAsync(formData);
    }
  };

  const handleEdit = (warehouse: any) => {
    setEditingWarehouse(warehouse);
    setFormData({
      name: warehouse.name,
      address: warehouse.address,
    });
  };

  const handleDelete = async (id: number) => {
    if (confirm("Вы уверены, что хотите удалить этот склад?")) {
      await deleteWarehouseMutation.mutateAsync(id);
    }
  };

  if (isLoading) {
    return <div>Загрузка...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-neutral-900">Склады</h2>
        <Dialog open={showAddDialog || !!editingWarehouse} onOpenChange={(open) => {
          if (!open) {
            setShowAddDialog(false);
            setEditingWarehouse(null);
            setFormData({ name: "", address: "" });
          }
        }}>
          <DialogTrigger asChild>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Добавить склад
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingWarehouse ? "Редактировать склад" : "Добавить склад"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Название склада</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Основной склад"
                  required
                />
              </div>
              <div>
                <Label htmlFor="address">Адрес</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="г. Москва, ул. Складская, д. 1"
                  required
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => {
                  setShowAddDialog(false);
                  setEditingWarehouse(null);
                  setFormData({ name: "", address: "" });
                }}>
                  Отмена
                </Button>
                <Button type="submit" disabled={createWarehouseMutation.isPending || updateWarehouseMutation.isPending}>
                  {editingWarehouse ? "Сохранить" : "Создать"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {warehouses.map((warehouse: any) => (
          <Card key={warehouse.id} className="bg-white border-neutral-200">
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold text-neutral-900 mb-2">
                    {warehouse.name}
                  </h3>
                  <p className="text-neutral-600 mb-2">{warehouse.address}</p>
                  <div className="flex space-x-4 text-sm text-neutral-500">
                    <span>Товаров: {warehouse.productCount}</span>
                    <span>{warehouse.isActive ? "Активен" : "Неактивен"}</span>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(warehouse)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(warehouse.id)}
                    disabled={deleteWarehouseMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {warehouses.length === 0 && (
          <Card className="bg-white border-neutral-200">
            <CardContent className="p-6 text-center">
              <p className="text-neutral-500">Нет добавленных складов</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

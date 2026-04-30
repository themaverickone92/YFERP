import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { RussianRuble, ShoppingCart, Package, Store } from "lucide-react";

export default function StatsGrid() {
  const { company } = useAuth();

  const stats = [
    {
      title: "Общий доход",
      value: "₽124,567",
      icon: RussianRuble,
      color: "bg-accent/10 text-accent",
    },
    {
      title: "Заказы",
      value: "1,234",
      icon: ShoppingCart,
      color: "bg-primary/10 text-primary",
    },
    {
      title: "SKU в системе",
      value: company?.currentSku?.toString() || "0",
      icon: Package,
      color: "bg-primary/10 text-primary",
    },
    {
      title: "Маркетплейсы",
      value: "3",
      icon: Store,
      color: "bg-accent/10 text-accent",
    },
  ];

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat, index) => (
        <Card key={index} className="bg-white border-neutral-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-600">{stat.title}</p>
                <p className="text-2xl font-bold text-neutral-900">{stat.value}</p>
              </div>
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${stat.color}`}>
                <stat.icon className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

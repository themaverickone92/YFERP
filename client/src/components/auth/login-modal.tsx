import { useState } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

export default function LoginModal({ open, onClose }: LoginModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login, adminDemo } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await login(email, password);
      onClose();
      navigate("/dashboard");
      toast({
        title: "Успешный вход",
        description: "Добро пожаловать в MarketPro!",
      });
    } catch (error) {
      toast({
        title: "Ошибка входа",
        description: "Неверный email или пароль",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdminDemo = async () => {
    setIsLoading(true);
    try {
      await adminDemo();
      onClose();
      navigate("/dashboard");
      toast({
        title: "Демо доступ",
        description: "Вы вошли как администратор",
      });
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось войти в демо режим",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-bold">Вход в систему</DialogTitle>
          <p className="text-center text-neutral-600">Войдите в свой аккаунт</p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              type="password"
              placeholder="Введите пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Входим..." : "Войти"}
          </Button>
        </form>

        <div className="mt-6 p-4 bg-neutral-50 rounded-lg">
          <h3 className="text-sm font-semibold text-neutral-700 mb-2">
            Демо доступ для тестирования:
          </h3>
          <Button 
            onClick={handleAdminDemo} 
            className="w-full bg-accent hover:bg-accent/90 mb-2"
            disabled={isLoading}
          >
            Войти как Администратор
          </Button>
          <p className="text-xs text-neutral-500">
            Email: admin@marketpro.ru | Пароль: admin123
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
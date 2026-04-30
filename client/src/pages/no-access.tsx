import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ShieldOff } from "lucide-react";

export default function NoAccess() {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 px-10 py-12 flex flex-col items-center gap-5 w-full max-w-sm text-center">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
          <ShieldOff className="w-8 h-8 text-red-400" />
        </div>

        <div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Нет доступа</h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            Ваш аккаунт ещё не добавлен в систему. Обратитесь к администратору для получения доступа.
          </p>
        </div>

        {user && (
          <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-4 py-2 w-full truncate">
            {user.email}
          </p>
        )}

        <Button variant="outline" className="w-full" onClick={handleLogout}>
          Выйти
        </Button>
      </div>
    </div>
  );
}

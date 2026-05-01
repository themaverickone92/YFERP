import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { apiRequest, queryClient } from "./queryClient";

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  companyId?: number;
}

interface Company {
  id: number;
  name: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  maxSku: number;
  currentSku: number;
  ownerId?: number;
  email?: string;
  inn?: string;
  address?: string;
  phone?: string;
}

interface AuthContextType {
  user: User | null;
  company: Company | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  refreshAuth: () => Promise<void>;
  setTokenAndUser: (token: string) => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      checkAuth();
    } else {
      setIsLoading(false);
    }
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setIsLoading(false);
        return;
      }

      const response = await fetch("/api/auth/me", {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setCompany(data.company);
      } else {
        localStorage.removeItem("token");
      }
    } catch (error) {
      localStorage.removeItem("token");
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    // Clear cache before logging in to ensure fresh data
    queryClient.clear();
    
    const response = await apiRequest("POST", "/api/auth/login", { email, password });
    const data = await response.json();
    
    localStorage.setItem("token", data.token);
    setUser(data.user);
    setCompany(data.company);
  };

  const register = async (email: string, password: string, name: string) => {
    // Clear cache before registering to ensure fresh data
    queryClient.clear();
    
    const response = await apiRequest("POST", "/api/auth/register", {
      email,
      password,
      name,
    });
    const data = await response.json();
    
    localStorage.setItem("token", data.token);
    setUser(data.user);
    setCompany(data.company);
  };

  const setTokenAndUser = async (token: string) => {
    queryClient.clear();
    localStorage.setItem("token", token);
    await checkAuth();
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
    setCompany(null);
    queryClient.clear();
  };

  return (
    <AuthContext.Provider value={{
      user,
      company,
      login,
      register,
      logout,
      refreshAuth: checkAuth,
      setTokenAndUser,
      isLoading,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
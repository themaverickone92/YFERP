import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect } from "react";

interface CompanyGuardProps {
  children: React.ReactNode;
}

export default function CompanyGuard({ children }: CompanyGuardProps) {
  const [location, setLocation] = useLocation();
  
  const { data: userCompanies = [], isLoading } = useQuery({
    queryKey: ["/api/companies/user"],
    enabled: true,
  });

  useEffect(() => {
    if (!isLoading && userCompanies.length === 0) {
      setLocation("/no-access");
    }
  }, [isLoading, userCompanies, setLocation]);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (userCompanies.length === 0) {
    return null;
  }

  return <>{children}</>;
}
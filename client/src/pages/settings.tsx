import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Sidebar from "@/components/dashboard/sidebar";
import IntegrationsTab from "@/components/settings/integrations-tab";
import UsersTab from "@/components/settings/users-tab";
import CompanyTab from "@/components/settings/company-tab";
import UserInfoTab from "@/components/settings/user-info-tab";

export default function Settings() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  // Get user's companies
  const { data: companies = [] } = useQuery({
    queryKey: ["/api/companies/user"],
    enabled: !!user,
  });

  const hasCompanies = (companies as any[]).length > 0;

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

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="md:ml-64">
        {/* Main Content */}
        <div className="bg-white min-h-screen">
          {/* Header */}
          <div className="border-b border-gray-200 pl-14 pr-8 py-6 md:px-8">
            <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
          </div>

          {/* Tabs */}
          <div className="px-4 md:px-8">
            <Tabs defaultValue="company" className="w-full">
              <TabsList className="h-auto p-0 bg-transparent border-b border-gray-200 w-full justify-start rounded-none">
                <TabsTrigger 
                  value="company" 
                  className="data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:shadow-none border-none rounded-none px-6 py-3 font-medium text-gray-500 hover:text-gray-700"
                >
                  Company
                </TabsTrigger>
                <TabsTrigger 
                  value="account" 
                  className="data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:shadow-none border-none rounded-none px-6 py-3 font-medium text-gray-500 hover:text-gray-700"
                >
                  Account Information
                </TabsTrigger>
                {hasCompanies && (
                  <TabsTrigger 
                    value="integrations" 
                    className="data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:shadow-none border-none rounded-none px-6 py-3 font-medium text-gray-500 hover:text-gray-700"
                  >
                    Integrations
                  </TabsTrigger>
                )}
                {hasCompanies && (
                  <TabsTrigger 
                    value="users" 
                    className="data-[state=active]:bg-transparent data-[state=active]:text-blue-600 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:shadow-none border-none rounded-none px-6 py-3 font-medium text-gray-500 hover:text-gray-700"
                  >
                    Users
                  </TabsTrigger>
                )}
              </TabsList>

              <div className="py-8 pr-8">
                <TabsContent value="company" className="mt-0">
                  <CompanyTab />
                </TabsContent>

                <TabsContent value="account" className="mt-0">
                  <UserInfoTab />
                </TabsContent>

                {hasCompanies && (
                  <TabsContent value="integrations" className="mt-0">
                    <IntegrationsTab />
                  </TabsContent>
                )}

                {hasCompanies && (
                  <TabsContent value="users" className="mt-0">
                    <UsersTab />
                  </TabsContent>
                )}
              </div>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/lib/i18n";

export default function UserInfoTab() {
  const { toast } = useToast();
  const { user, refreshAuth } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    language: "en",
  });
  const [originalName, setOriginalName] = useState("");
  const [originalLanguage, setOriginalLanguage] = useState("en");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    if (user) {
      const name = user.name || "";
      const userLanguage = (user as any).language || "en";
      setFormData({
        name,
        email: user.email || "",
        language: userLanguage,
      });
      setOriginalName(name);
      setOriginalLanguage(userLanguage);
    }
  }, [user]);

  const updateUserMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PUT", `/api/users/${user?.id}`, data).then(res => res.json());
    },
    onSuccess: async () => {
      toast({
        title: t("message.profileUpdated"),
        description: t("message.profileUpdateSuccess"),
      });
      // Update original values after successful save
      setOriginalName(formData.name);
      setOriginalLanguage(formData.language);
      // Force refresh auth context to get updated user data first
      await refreshAuth();
      // Invalidate all queries to ensure fresh data
      queryClient.invalidateQueries();
      
      // Update global language state after auth refresh
      setLanguage(formData.language as "en" | "ru");
    },
    onError: () => {
      toast({
        title: t("message.error"),
        description: t("message.profileUpdateError"),
        variant: "destructive",
      });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: any) => {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers,
        body: JSON.stringify(data),
        credentials: "include",
      });

      const responseData = await response.json();

      if (!response.ok) {
        return { error: responseData.message || "Failed to change password" };
      }
      return { success: true, data: responseData };
    },
    onSuccess: (result) => {
      if (result.error) {
        // Handle error case
        let errorMessage = t("message.passwordChangeError");
        
        if (result.error.includes("Current password is incorrect")) {
          errorMessage = t("message.passwordWrong");
        } else {
          errorMessage = result.error;
        }
        
        toast({
          title: t("message.error"),
          description: errorMessage,
          variant: "destructive",
        });
      } else {
        // Handle success case
        toast({
          title: t("message.passwordChanged"),
          description: t("message.passwordChanged"),
        });
        // Reset form and exit password change mode
        setPasswordData({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
        setIsChangingPassword(false);
      }
    },
    onError: (error: any) => {
      toast({
        title: t("message.error"),
        description: t("message.passwordChangeError"),
        variant: "destructive",
      });
    },
  });

  const handleSaveName = async () => {
    // Only send name field since email is read-only
    await updateUserMutation.mutateAsync({ name: formData.name });
  };

  const handleSaveLanguage = async () => {
    await updateUserMutation.mutateAsync({ language: formData.language });
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePasswordInputChange = (field: string, value: string) => {
    setPasswordData(prev => ({ ...prev, [field]: value }));
  };

  const handleChangePassword = () => {
    setIsChangingPassword(true);
  };

  const handleCancelPasswordChange = () => {
    setPasswordData({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    setIsChangingPassword(false);
  };

  const handleSavePassword = async () => {
    // Validate passwords
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      toast({
        title: t("message.error"),
        description: t("message.fillAllFields"),
        variant: "destructive",
      });
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({
        title: t("message.error"),
        description: t("message.passwordMismatch"),
        variant: "destructive",
      });
      return;
    }

    if (passwordData.newPassword.length < 6) {
      toast({
        title: t("message.error"),
        description: t("message.passwordTooShort"),
        variant: "destructive",
      });
      return;
    }

    if (passwordData.currentPassword === passwordData.newPassword) {
      toast({
        title: t("message.error"),
        description: t("message.passwordSame"),
        variant: "destructive",
      });
      return;
    }

    await changePasswordMutation.mutateAsync({
      currentPassword: passwordData.currentPassword,
      newPassword: passwordData.newPassword,
    });
  };

  const hasNameChanged = formData.name !== originalName;

  return (
    <div className="space-y-8">
      {/* User Information Section */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-6">User Information</h2>
        
        <div className="space-y-6">
          <div>
            <Label htmlFor="name" className="text-sm font-medium text-gray-700">
              {t("user.name")}
            </Label>
            <div className="flex items-center gap-3 mt-1">
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                placeholder="Your full name"
                className="flex-1"
                required
              />
              {hasNameChanged && (
                <Button 
                  onClick={handleSaveName}
                  disabled={updateUserMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 flex-shrink-0"
                >
                  {updateUserMutation.isPending ? t("common.loading") : t("user.save")}
                </Button>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="email" className="text-sm font-medium text-gray-700">
              {t("user.email")}
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              placeholder="your.email@example.com"
              className="mt-1 bg-gray-50 cursor-not-allowed"
              disabled
              readOnly
            />
            <p className="text-sm text-gray-500 mt-1">
              Email address cannot be changed. Contact support if you need to update your email.
            </p>
          </div>

          <div>
            <Label htmlFor="language" className="text-sm font-medium text-gray-700">
              {t("user.language")}
            </Label>
            <div className="flex items-center gap-3 mt-1">
              <Select 
                value={formData.language} 
                onValueChange={(value) => handleInputChange("language", value)}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">{t("language.english")}</SelectItem>
                  <SelectItem value="ru">{t("language.russian")}</SelectItem>
                </SelectContent>
              </Select>
              {formData.language !== originalLanguage && (
                <Button 
                  onClick={handleSaveLanguage}
                  disabled={updateUserMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 flex-shrink-0"
                >
                  {updateUserMutation.isPending ? t("common.loading") : t("user.save")}
                </Button>
              )}
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
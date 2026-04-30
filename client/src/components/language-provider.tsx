import { useState, useEffect, ReactNode } from "react";
import { LanguageContext, Language, getTranslation } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";

interface LanguageProviderProps {
  children: ReactNode;
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const { user } = useAuth();
  const isAuthenticated = !!user;
  const [language, setLanguageState] = useState<Language>("ru");

  // Set language based on authentication status and user preference
  useEffect(() => {
    console.log('Language effect triggered:', { isAuthenticated, userLanguage: (user as any)?.language, currentLanguage: language });
    
    if (isAuthenticated && (user as any)?.language) {
      // For authenticated users, use their selected language
      const userLanguage = (user as any).language as Language;
      console.log('Setting language to user preference:', userLanguage);
      setLanguageState(userLanguage);
    } else if (isAuthenticated) {
      // For authenticated users without language preference, default to English
      console.log('Setting language to default English for authenticated user');
      setLanguageState("en");
    } else {
      // For unauthenticated users (landing page, registration), always use Russian
      console.log('Setting language to Russian for unauthenticated user');
      setLanguageState("ru");
    }
  }, [user, isAuthenticated]);

  const setLanguage = async (newLanguage: Language) => {
    setLanguageState(newLanguage);
    
    // Update user preference in database if user is logged in
    if (user && isAuthenticated) {
      try {
        await apiRequest("PUT", `/api/users/${user.id}`, { language: newLanguage });
      } catch (error) {
        console.error("Failed to update language preference:", error);
      }
    }
  };

  const t = (key: string): string => {
    // For unauthenticated users, return the key itself since landing/auth pages use hardcoded Russian
    if (!isAuthenticated) {
      return key;
    }
    return getTranslation(language, key);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}
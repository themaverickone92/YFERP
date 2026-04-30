import { createContext, useContext } from "react";

export type Language = "en" | "ru";

export interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

export const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};

export const translations = {
  en: {
    // Navigation
    "nav.dashboard": "Dashboard",
    "nav.products": "Products",
    "nav.inbound": "Inbound",
    "nav.inventory": "Inventory",
    "nav.outbound": "Outbound",
    "nav.pricing": "Pricing",
    "nav.finance": "Finance",
    "nav.analytics": "Analytics",
    "nav.settings": "Settings",
    "nav.logout": "Logout",

    // Settings tabs
    "settings.company": "Company",
    "settings.account": "Account Information",
    "settings.integrations": "Integrations",
    "settings.users": "Users",

    // User Info
    "user.name": "Name",
    "user.email": "Email",
    "user.language": "Language",
    "user.password": "Password",
    "user.currentPassword": "Current Password",
    "user.newPassword": "New Password",
    "user.confirmPassword": "Confirm Password",
    "user.changePassword": "Change Password",
    "user.save": "Save",
    "user.cancel": "Cancel",

    // Languages
    "language.english": "English",
    "language.russian": "Russian",

    // User management
    "users.addUser": "Add User",
    "users.editUser": "Edit User",
    "users.deleteUser": "Delete User",
    "users.role": "Role",
    "users.status": "Status",
    "users.active": "Active",
    "users.invited": "Invited",

    // Roles
    "role.user": "User",
    "role.operator": "Operator",
    "role.manager": "Manager",
    "role.admin": "Administrator",

    // Common
    "common.edit": "Edit",
    "common.delete": "Delete",
    "common.close": "Close",
    "common.submit": "Submit",
    "common.loading": "Loading...",

    // Messages
    "message.error": "Error",
    "message.profileUpdated": "Profile Updated",
    "message.profileUpdateSuccess": "Profile updated successfully",
    "message.profileUpdateError": "Failed to update user data",
    "message.passwordChanged": "Password changed successfully",
    "message.passwordChangeError": "Failed to change password",
    "message.passwordWrong": "Current password is incorrect",
    "message.passwordMismatch": "Passwords do not match",
    "message.passwordTooShort": "Password must be at least 6 characters",
    "message.passwordSame": "New password cannot be same as current",
    "message.fillAllFields": "Please fill in all fields",
    "message.passwordSaved": "Password saved successfully",
  },
  ru: {
    // Navigation
    "nav.dashboard": "Панель управления",
    "nav.products": "Товары",
    "nav.inbound": "Поступления",
    "nav.inventory": "Склад",
    "nav.outbound": "Отгрузки",
    "nav.pricing": "Ценообразование",
    "nav.finance": "Финансы",
    "nav.analytics": "Аналитика",
    "nav.settings": "Настройки",
    "nav.logout": "Выйти",

    // Settings tabs
    "settings.company": "Компания",
    "settings.account": "Информация об аккаунте",
    "settings.integrations": "Интеграции",
    "settings.users": "Пользователи",

    // User Info
    "user.name": "Имя",
    "user.email": "Email",
    "user.language": "Язык",
    "user.password": "Пароль",
    "user.currentPassword": "Текущий пароль",
    "user.newPassword": "Новый пароль",
    "user.confirmPassword": "Подтвердите пароль",
    "user.changePassword": "Изменить пароль",
    "user.save": "Сохранить",
    "user.cancel": "Отмена",

    // Languages
    "language.english": "Английский",
    "language.russian": "Русский",

    // User management
    "users.addUser": "Добавить пользователя",
    "users.editUser": "Редактировать пользователя",
    "users.deleteUser": "Удалить пользователя",
    "users.role": "Роль",
    "users.status": "Статус",
    "users.active": "Активен",
    "users.invited": "Приглашен",

    // Roles
    "role.user": "Пользователь",
    "role.operator": "Оператор",
    "role.manager": "Менеджер",
    "role.admin": "Администратор",

    // Common
    "common.edit": "Редактировать",
    "common.delete": "Удалить",
    "common.close": "Закрыть",
    "common.submit": "Отправить",
    "common.loading": "Загрузка...",

    // Messages
    "message.error": "Ошибка",
    "message.profileUpdated": "Профиль обновлен",
    "message.profileUpdateSuccess": "Профиль успешно обновлен",
    "message.profileUpdateError": "Не удалось обновить данные пользователя",
    "message.passwordChanged": "Пароль успешно изменен",
    "message.passwordChangeError": "Не удалось изменить пароль",
    "message.passwordWrong": "Неверный текущий пароль",
    "message.passwordMismatch": "Пароли не совпадают",
    "message.passwordTooShort": "Пароль должен содержать не менее 6 символов",
    "message.passwordSame": "Новый пароль не может совпадать с текущим",
    "message.fillAllFields": "Пожалуйста, заполните все поля",
    "message.passwordSaved": "Пароль успешно сохранен",
  },
};

export const getTranslation = (language: Language, key: string): string => {
  return translations[language][key as keyof typeof translations.en] || key;
};
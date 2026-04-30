import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Store, Warehouse, TrendingUp, Users, RefreshCw, Shield, Check } from "lucide-react";
import LoginModal from "@/components/auth/login-modal";
import RegisterModal from "@/components/auth/register-modal";
import { useAuth } from "@/lib/auth";
import heroImage from "@assets/orig_1753038152779.jpeg";
import ozonIcon from "@assets/ozon-icon.gif";
import wildberriesIcon from "@assets/wildberries-icon.png";
import yandexMarketIcon from "@assets/yandex-market-icon.png";

export default function Landing() {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [pricingVisible, setPricingVisible] = useState(false);
  const pricingRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (user) {
      navigate("/dashboard");
    }
  }, [user, navigate]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPricingVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (pricingRef.current) {
      observer.observe(pricingRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Animated counter component
  const AnimatedPrice = ({ price, delay = 0 }: { price: string; delay?: number }) => {
    const [displayPrice, setDisplayPrice] = useState("0₽");
    
    useEffect(() => {
      if (pricingVisible) {
        const timeout = setTimeout(() => {
          setDisplayPrice(price);
        }, delay);
        return () => clearTimeout(timeout);
      }
    }, [pricingVisible, price, delay]);

    return (
      <div className="pricing-price text-4xl font-bold mb-2">
        {displayPrice}
      </div>
    );
  };

  const features = [
    {
      icon: Store,
      title: "Мультиплатформенность",
      description: "Подключите Ozon, Wildberries, Яндекс.Маркет и другие площадки через API",
      color: "bg-primary/10 text-primary",
    },
    {
      icon: Warehouse,
      title: "Управление складами",
      description: "Контролируйте остатки, резервы и движение товаров по всем складам",
      color: "bg-accent/10 text-accent",
    },
    {
      icon: TrendingUp,
      title: "Аналитика продаж",
      description: "Детальная отчётность по прибыли, оборачиваемости и эффективности",
      color: "bg-primary/10 text-primary",
    },
    {
      icon: Users,
      title: "Командная работа",
      description: "Гибкая система ролей и прав доступа для вашей команды",
      color: "bg-accent/10 text-accent",
    },
    {
      icon: RefreshCw,
      title: "Автоматизация",
      description: "Автоматическое обновление остатков, цен и статусов заказов",
      color: "bg-primary/10 text-primary",
    },
    {
      icon: Shield,
      title: "Безопасность",
      description: "Шифрование данных, безопасное хранение API ключей, резервные копии",
      color: "bg-accent/10 text-accent",
    },
  ];

  const integrations = [
    {
      name: "Ozon",
      color: "bg-blue-600",
      letter: "O",
      icon: ozonIcon,
      features: ["Синхронизация товаров", "Управление заказами", "Аналитика продаж", "Обновление остатков"],
    },
    {
      name: "Wildberries",
      color: "bg-purple-600",
      letter: "W", 
      icon: wildberriesIcon,
      features: ["Управление карточками", "Отслеживание продаж", "Финансовая отчётность", "Логистика"],
    },
    {
      name: "Яндекс.Маркет",
      color: "bg-red-600",
      letter: "Я",
      icon: yandexMarketIcon,
      features: ["Каталог товаров", "Обработка заказов", "Управление ценами", "Статистика"],
    },
  ];

  const plans = [
    {
      name: "Базовый",
      price: "1 990₽",
      period: "в месяц",
      features: ["До 100 SKU", "2 маркетплейса", "1 пользователь", "Базовая аналитика", "Email поддержка", "Базовая автоматизация"],
      popular: false,
    },
    {
      name: "Бизнес",
      price: "4 990₽",
      period: "в месяц",
      features: ["До 1000 SKU", "Все маркетплейсы", "5 пользователей", "Расширенная аналитика", "Приоритетная поддержка", "AI автоматизация"],
      popular: true,
    },
    {
      name: "Премиум",
      price: "От 9 990₽",
      period: "в месяц",
      features: ["Безлимитные SKU", "Все маркетплейсы", "Неограниченно пользователей", "Персональная аналитика", "Персональный менеджер", "Кастомные интеграции"],
      popular: false,
    },
  ];

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Navigation */}
      <nav className="bg-slate-800 border-b border-slate-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <a href="#" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="text-2xl font-bold text-white hover:text-slate-200 transition-colors cursor-pointer">
                  MarketPro
                </a>
              </div>
              <div className="hidden md:block ml-10">
                <div className="flex items-baseline space-x-8">
                  <a href="#features" className="text-slate-300 hover:text-white px-3 py-2 text-sm font-medium transition-colors">
                    Возможности
                  </a>
                  <a href="#pricing" className="text-slate-300 hover:text-white px-3 py-2 text-sm font-medium transition-colors">
                    Тарифы
                  </a>
                  <a href="#integration" className="text-slate-300 hover:text-white px-3 py-2 text-sm font-medium transition-colors">
                    Интеграции
                  </a>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-transparent" onClick={() => setShowLoginModal(true)}>
                Войти
              </Button>
              <Button className="bg-primary hover:bg-primary/90 text-white" onClick={() => setShowRegisterModal(true)}>
                Регистрация
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative text-white min-h-[600px]">
        <div 
          className="absolute inset-0" 
          style={{ 
            backgroundImage: `url(${heroImage})`, 
            backgroundSize: 'cover', 
            backgroundPosition: 'center top', 
            backgroundRepeat: 'no-repeat',
            filter: 'brightness(0.5) contrast(0.9)'
          }}
        ></div>
        <div className="absolute inset-0 bg-gradient-to-r from-primary/95 to-blue-700/90"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 flex items-center justify-center min-h-[600px]">
          <div className="text-center">
            <h1 className="text-3xl md:text-5xl font-bold mb-6 text-white">
              Управляйте бизнесом на<br />
              всех маркетплейсах
            </h1>
            <p className="text-lg md:text-xl text-white max-w-3xl mx-auto">
              Современная облачная платформа для продавцов на Ozon, Wildberries и Яндекс.Маркет
            </p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-4">
              Все инструменты в одном месте
            </h2>
            <p className="text-xl text-neutral-600 max-w-2xl mx-auto">
              Управляйте товарами, заказами, складами и аналитикой со всех маркетплейсов в единой системе
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="feature-card bg-neutral-50 border-none">
                <CardContent className="p-8">
                  <div className="flex items-center mb-6">
                    <div className={`w-16 h-16 rounded-lg flex items-center justify-center mr-4 ${feature.color}`}>
                      <feature.icon className="w-12 h-12" />
                    </div>
                    <h3 className="text-xl font-semibold text-neutral-900">{feature.title}</h3>
                  </div>
                  <p className="text-neutral-600">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Integration Section */}
      <section id="integration" className="py-20 bg-neutral-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-4">
              Интеграции с популярными маркетплейсами
            </h2>
            <p className="text-xl text-neutral-600">
              Подключите все ваши торговые площадки за несколько кликов
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {integrations.map((integration, index) => (
              <Card key={index} className="bg-white border-neutral-200">
                <CardContent className="p-8">
                  <div className="flex items-center mb-6">
                    <div className="w-16 h-16 rounded-lg flex items-center justify-center mr-4">
                      <img src={integration.icon} alt={integration.name} className="w-12 h-12 object-contain" />
                    </div>
                    <h3 className="text-xl font-semibold text-neutral-900">{integration.name}</h3>
                  </div>
                  <ul className="space-y-2">
                    {integration.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-center text-neutral-600">
                        <Check className="w-4 h-4 text-accent mr-2" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section ref={pricingRef} id="pricing" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-4">
              Прозрачные тарифы
            </h2>
            <p className="text-xl text-neutral-600">
              Платите только за количество SKU в системе
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {plans.map((plan, index) => (
              <Card 
                key={index} 
                className={`relative pricing-card ${plan.popular ? 'pricing-card-popular border-primary' : 'bg-neutral-50 border-neutral-200'} ${pricingVisible ? 'animate-in' : 'opacity-0'}`}
                style={{ animationDelay: `${0.1 + index * 0.1}s` }}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-accent text-white pricing-badge">Популярный</Badge>
                  </div>
                )}
                <CardContent className={`p-8 ${plan.popular ? 'text-white' : ''}`}>
                  <div className="text-center mb-8">
                    <h3 className={`text-2xl font-bold mb-2 ${plan.popular ? 'text-white' : 'text-neutral-900'}`}>
                      {plan.name}
                    </h3>
                    <div className={plan.popular ? 'text-white' : 'text-primary'}>
                      <AnimatedPrice price={plan.price} delay={index * 200} />
                    </div>
                    <p className={plan.popular ? 'text-blue-200' : 'text-neutral-600'}>{plan.period}</p>
                  </div>
                  <ul className="space-y-4 mb-8">
                    {plan.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-center pricing-feature">
                        <Check className={`w-4 h-4 mr-3 ${plan.popular ? 'text-accent' : 'text-accent'}`} />
                        <span className={plan.popular ? 'text-white' : 'text-neutral-700'}>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button 
                    className={`w-full pricing-button ${plan.popular ? 'bg-white text-primary hover:bg-neutral-100' : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'}`}
                    onClick={() => setShowRegisterModal(true)}
                  >
                    {plan.name === "Премиум" ? "Связаться с нами" : "Выбрать план"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-800 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-xl font-bold mb-4">MarketPro</h3>
              <p className="text-slate-400">Современная ERP система для продавцов маркетплейсов</p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Продукт</h4>
              <ul className="space-y-2 text-slate-400">
                <li><a href="#features" className="hover:text-white">Возможности</a></li>
                <li><a href="#pricing" className="hover:text-white">Тарифы</a></li>
                <li><a href="#integration" className="hover:text-white">Интеграции</a></li>
                <li><a href="#" className="hover:text-white">API</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Поддержка</h4>
              <ul className="space-y-2 text-slate-400">
                <li><a href="#" className="hover:text-white">Документация</a></li>
                <li><a href="#" className="hover:text-white">Помощь</a></li>
                <li><a href="#" className="hover:text-white">Контакты</a></li>
                <li><a href="#" className="hover:text-white">Статус системы</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Компания</h4>
              <ul className="space-y-2 text-slate-400">
                <li><a href="#" className="hover:text-white">О нас</a></li>
                <li><a href="#" className="hover:text-white">Блог</a></li>
                <li><a href="#" className="hover:text-white">Карьера</a></li>
                <li><a href="#" className="hover:text-white">Пресса</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-700 mt-8 pt-8 text-center text-slate-400">
            <p>&copy; 2024 MarketPro. Все права защищены.</p>
          </div>
        </div>
      </footer>

      <LoginModal open={showLoginModal} onClose={() => setShowLoginModal(false)} />
      <RegisterModal open={showRegisterModal} onClose={() => setShowRegisterModal(false)} />
    </div>
  );
}

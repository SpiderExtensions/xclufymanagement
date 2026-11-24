import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Barcode,
  Bell,
  BellRing,
  Boxes,
  Clock,
  CreditCard,
  FileSpreadsheet,
  FolderTree,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Package,
  PieChart,
  Plus,
  Receipt,
  Search,
  Settings,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Truck,
  User as UserIcon,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { apiFetch, setAuthToken } from './lib/api';
import { getActiveServiceWorkerRegistration } from './lib/swRegister';
import { formatBDT } from './shared/erpMath';
import type { BusinessSettings, Customer, ModuleKey, Order, Product, UserProfile } from './shared/types';
import { Avatar, Modal, OfflineIndicator, PWAInstallButton } from './components/ui/Primitives';

import { AuthPage } from './pages/AuthPage';
import { PendingApprovalPage } from './pages/PendingApprovalPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProductsPage } from './pages/ProductsPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { InventoryPage } from './pages/InventoryPage';
import { PosPage } from './pages/PosPage';
import { OrdersPage } from './pages/OrdersPage';
import { CustomersPage } from './pages/CustomersPage';
import { PreordersPage } from './pages/PreordersPage';
import { WaitlistPage } from './pages/WaitlistPage';
import { ShareholdersPage } from './pages/ShareholdersPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { FinancePage } from './pages/FinancePage';
import { ReportsPage } from './pages/ReportsPage';
import { BarcodeManagementPage } from './pages/BarcodeManagementPage';
import { CsvImportPage } from './pages/CsvImportPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { UsersPage } from './pages/UsersPage';
import { ActivityLogsPage } from './pages/ActivityLogsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ProfilePage } from './pages/ProfilePage';

interface NavItem {
  key: ModuleKey;
  label: string;
  group: 'Core' | 'Catalog & Supply' | 'Finance & Equity' | 'Administration';
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Overview Dashboard', group: 'Core', icon: LayoutDashboard },
  { key: 'pos', label: 'New Order / POS', group: 'Core', icon: ShoppingBag },
  { key: 'orders', label: 'All Orders', group: 'Core', icon: Receipt },
  { key: 'customers', label: 'Customers CRM', group: 'Core', icon: Users },

  { key: 'products', label: 'Products', group: 'Catalog & Supply', icon: Package },
  { key: 'categories', label: 'Categories', group: 'Catalog & Supply', icon: FolderTree },
  { key: 'inventory', label: 'Inventory', group: 'Catalog & Supply', icon: Boxes },
  { key: 'preorders', label: 'Pre-orders', group: 'Catalog & Supply', icon: Clock },
  { key: 'waitlist', label: 'Customer Waitlist', group: 'Catalog & Supply', icon: ListChecks },
  { key: 'suppliers', label: 'Suppliers & PO', group: 'Catalog & Supply', icon: Truck },
  { key: 'barcodes', label: 'Barcode Management', group: 'Catalog & Supply', icon: Barcode },
  { key: 'import_export', label: 'Import / Export', group: 'Catalog & Supply', icon: FileSpreadsheet },

  { key: 'income', label: 'Income', group: 'Finance & Equity', icon: TrendingUp },
  { key: 'expenses', label: 'Expenses', group: 'Finance & Equity', icon: TrendingDown },
  { key: 'transactions', label: 'Financial Ledger', group: 'Finance & Equity', icon: CreditCard },
  { key: 'reports', label: 'Financial Reports', group: 'Finance & Equity', icon: BarChart3 },
  { key: 'shareholders', label: 'Shareholders', group: 'Finance & Equity', icon: PieChart },

  { key: 'notifications', label: 'Notifications', group: 'Administration', icon: Bell },
  { key: 'users', label: 'User Management', group: 'Administration', icon: UserCheck },
  { key: 'activity_logs', label: 'Activity Logs', group: 'Administration', icon: Activity },
  { key: 'settings', label: 'Settings', group: 'Administration', icon: Settings },
  { key: 'profile', label: 'My Profile', group: 'Administration', icon: UserIcon },
];

const GROUPS: Array<NavItem['group']> = ['Core', 'Catalog & Supply', 'Finance & Equity', 'Administration'];

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [pendingVerificationToken, setPendingVerificationToken] = useState<string | null>(null);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);

  const [activeModule, setActiveModule] = useState<ModuleKey>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [unreadCount, setUnreadCount] = useState(0);
  const [showPushBanner, setShowPushBanner] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const [quickActionOpen, setQuickActionOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [globalQuery, setGlobalQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{
    products: Product[];
    orders: Order[];
    customers: Customer[];
  }>({ products: [], orders: [], customers: [] });
  const [searching, setSearching] = useState(false);

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    return localStorage.getItem('xclufy_theme') === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('xclufy_theme', theme);
  }, [theme]);

  const permittedNavItems = useMemo(() => {
    if (!user) return [];
    const allowed = new Set<ModuleKey>(user.permissions || []);
    return NAV_ITEMS.filter((item) => allowed.has(item.key));
  }, [user]);

  const selectInitialModule = useCallback((u: UserProfile) => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('module') as ModuleKey | null;
    const allowed = new Set<ModuleKey>(u.permissions || []);
    if (requested && allowed.has(requested)) {
      setActiveModule(requested);
      return;
    }
    if (allowed.has('dashboard')) {
      setActiveModule('dashboard');
    } else if (allowed.has('shareholders')) {
      setActiveModule('shareholders');
    } else if (u.permissions?.length) {
      setActiveModule(u.permissions[0]);
    } else {
      setActiveModule('profile');
    }
  }, []);

  const loadWorkspaceData = useCallback(async () => {
    try {
      const [settingsRes, notifRes] = await Promise.all([
        apiFetch<{ settings: BusinessSettings }>('/api/settings'),
        apiFetch<{ unread_count: number; push_subscription_count: number }>('/api/notifications'),
      ]);
      setSettings(settingsRes.settings);
      setUnreadCount(notifRes.unread_count);

      let isTopLevel = false;
      try {
        isTopLevel = window.self === window.top;
      } catch {
        isTopLevel = false;
      }
      const pushSupported =
        typeof window !== 'undefined' &&
        isTopLevel &&
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window;
      const dismissed = localStorage.getItem('xclufy_push_banner_dismissed') === '1';
      if (
        pushSupported &&
        Notification.permission === 'default' &&
        notifRes.push_subscription_count === 0 &&
        !dismissed
      ) {
        setShowPushBanner(true);
      }
    } catch {
      // Non-fatal if background fetch is interrupted
    }
  }, []);

  const fetchSession = useCallback(async () => {
    setBooting(true);
    try {
      const res = await apiFetch<{ authenticated: boolean; user: UserProfile | null }>('/api/auth/session');
      setUser(res.user);
      if (res.user && res.user.approval_status === 'approved') {
        selectInitialModule(res.user);
        await loadWorkspaceData();
      }
    } catch {
      setUser(null);
    } finally {
      setBooting(false);
    }
  }, [loadWorkspaceData, selectInitialModule]);

  useEffect(() => {
    void fetchSession();
  }, [fetchSession]);

  // Service worker deep-link handler
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OPEN_MODULE' && event.data?.module && user) {
        const mod = event.data.module as ModuleKey;
        if (user.permissions.includes(mod)) {
          setActiveModule(mod);
        }
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [user]);

  // Global search keyboard shortcut Cmd/Ctrl + K
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && user?.approval_status === 'approved') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [user]);

  // Global search query runner
  useEffect(() => {
    if (!searchOpen || !user || user.approval_status !== 'approved') return;
    const q = globalQuery.trim();
    if (q.length < 2) {
      setSearchResults({ products: [], orders: [], customers: [] });
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const perms = new Set(user.permissions);
        const [prodRes, ordRes, custRes] = await Promise.all([
          perms.has('products')
            ? apiFetch<{ products: Product[] }>(`/api/products?search=${encodeURIComponent(q)}`).catch(() => ({
                products: [],
              }))
            : Promise.resolve({ products: [] }),
          perms.has('orders')
            ? apiFetch<{ orders: Order[] }>(`/api/orders?search=${encodeURIComponent(q)}`).catch(() => ({
                orders: [],
              }))
            : Promise.resolve({ orders: [] }),
          perms.has('customers')
            ? apiFetch<{ customers: Customer[] }>(`/api/customers?search=${encodeURIComponent(q)}`).catch(() => ({
                customers: [],
              }))
            : Promise.resolve({ customers: [] }),
        ]);
        setSearchResults({
          products: prodRes.products.slice(0, 5),
          orders: ordRes.orders.slice(0, 5),
          customers: custRes.customers.slice(0, 5),
        });
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [globalQuery, searchOpen, user]);

  const handleAuthSuccess = async (
    loggedInUser: UserProfile,
    meta?: { isFirstAdmin?: boolean; verificationToken?: string | null }
  ) => {
    setUser(loggedInUser);
    setPendingVerificationToken(meta?.verificationToken || null);
    if (loggedInUser.approval_status === 'approved') {
      selectInitialModule(loggedInUser);
      await loadWorkspaceData();
    }
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setAuthToken(null);
    setUser(null);
    setUserMenuOpen(false);
    setShowPushBanner(false);
  };

  const handleEnablePushFromBanner = async () => {
    setPushBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setShowPushBanner(false);
        localStorage.setItem('xclufy_push_banner_dismissed', '1');
        return;
      }
      const reg = await getActiveServiceWorkerRegistration();
      if (!reg) {
        setShowPushBanner(false);
        return;
      }
      const { publicKey } = await apiFetch<{ publicKey: string }>('/api/push/vapid-key');
      const keyBytes = urlBase64ToUint8Array(publicKey);
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes as BufferSource,
        });
      }
      await apiFetch('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({ subscription: sub.toJSON(), device_label: navigator.platform || 'Web Browser' }),
      });
      setShowPushBanner(false);
    } catch {
      setShowPushBanner(false);
    } finally {
      setPushBusy(false);
    }
  };

  const navigateTo = (mod: ModuleKey) => {
    if (!user?.permissions.includes(mod)) return;
    setActiveModule(mod);
    setMobileMenuOpen(false);
    setQuickActionOpen(false);
    setSearchOpen(false);
    apiFetch<{ unread_count: number }>('/api/notifications')
      .then((res) => setUnreadCount(res.unread_count))
      .catch(() => {});
  };

  if (booting) {
    return (
      <div className="min-h-screen bg-[#080808] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 rounded-lg border border-white/20 bg-[#141414] flex items-center justify-center font-display font-bold text-lg">
            X
          </div>
          <p className="text-xs font-mono tracking-widest text-zinc-400 uppercase">Loading XCLUFY</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <AuthPage onSuccess={handleAuthSuccess} />
        <OfflineIndicator />
      </>
    );
  }

  if (user.approval_status !== 'approved') {
    return (
      <>
        <PendingApprovalPage
          user={user}
          verificationToken={pendingVerificationToken}
          onRefresh={fetchSession}
          onLogout={handleLogout}
        />
        <OfflineIndicator />
      </>
    );
  }

  const brandName = settings?.business_name || 'XCLUFY';
  const filteredModules = globalQuery.trim()
    ? permittedNavItems.filter((item) => item.label.toLowerCase().includes(globalQuery.trim().toLowerCase()))
    : permittedNavItems.slice(0, 6);

  const renderModule = () => {
    if (!user.permissions.includes(activeModule)) {
      return <ProfilePage user={user} onUserUpdated={setUser} />;
    }
    switch (activeModule) {
      case 'dashboard':
        return <DashboardPage onNavigate={navigateTo} />;
      case 'products':
        return <ProductsPage />;
      case 'categories':
        return <CategoriesPage />;
      case 'inventory':
        return <InventoryPage />;
      case 'pos':
        return <PosPage settings={settings} />;
      case 'orders':
        return <OrdersPage settings={settings} />;
      case 'customers':
        return <CustomersPage onNavigate={navigateTo} />;
      case 'preorders':
        return <PreordersPage />;
      case 'waitlist':
        return <WaitlistPage onNavigate={navigateTo} />;
      case 'shareholders':
        return <ShareholdersPage />;
      case 'suppliers':
        return <SuppliersPage />;
      case 'income':
        return <FinancePage mode="income" />;
      case 'expenses':
        return <FinancePage mode="expenses" />;
      case 'transactions':
        return <FinancePage mode="transactions" />;
      case 'reports':
        return <ReportsPage isSuperAdmin={user.role === 'super_admin'} />;
      case 'barcodes':
        return <BarcodeManagementPage />;
      case 'import_export':
        return <CsvImportPage />;
      case 'notifications':
        return (
          <NotificationsPage
            user={user}
            onUserUpdated={setUser}
            onNavigate={navigateTo}
            onUnreadChange={setUnreadCount}
          />
        );
      case 'users':
        return <UsersPage />;
      case 'activity_logs':
        return <ActivityLogsPage />;
      case 'settings':
        return (
          <SettingsPage
            settings={settings}
            onSettingsUpdated={setSettings}
            theme={theme}
            onThemeChange={setTheme}
            onNavigate={navigateTo}
            user={user}
          />
        );
      case 'profile':
        return <ProfilePage user={user} onUserUpdated={setUser} />;
      default:
        return <DashboardPage onNavigate={navigateTo} />;
    }
  };

  const SidebarNavContent = ({ compact }: { compact: boolean }) => (
    <nav aria-label="Primary navigation" className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
      {GROUPS.map((group) => {
        const items = permittedNavItems.filter((item) => item.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group} className="space-y-1">
            {!compact && (
              <p className="px-2.5 pb-1 text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                {group}
              </p>
            )}
            {items.map((item) => {
              const Icon = item.icon;
              const active = activeModule === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => navigateTo(item.key)}
                  title={compact ? item.label : undefined}
                  aria-current={active ? 'page' : undefined}
                  className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                    active
                      ? 'bg-zinc-900 dark:bg-white text-white dark:text-[#080808]'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.06] hover:text-zinc-900 dark:hover:text-white'
                  } ${compact ? 'justify-center' : ''}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!compact && <span className="truncate">{item.label}</span>}
                  {!compact && item.key === 'notifications' && unreadCount > 0 && (
                    <span className="ml-auto font-mono text-[11px] tabular-nums opacity-80">{unreadCount}</span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#080808] text-zinc-900 dark:text-white flex">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex lg:flex-col lg:shrink-0 border-r border-zinc-200 dark:border-white/10 bg-white dark:bg-[#0D0D0D] transition-[width] duration-200 no-print ${
          sidebarCollapsed ? 'lg:w-[72px]' : 'lg:w-64'
        }`}
      >
        <div className="flex h-16 items-center gap-3 border-b border-zinc-200 dark:border-white/10 px-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-300 dark:border-white/15 bg-zinc-900 dark:bg-[#161616] text-white font-display font-bold">
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt={brandName} className="h-full w-full object-cover" />
            ) : (
              brandName.slice(0, 1)
            )}
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <p className="font-display text-sm font-bold tracking-wider truncate">{brandName}</p>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">Enterprise ERP</p>
            </div>
          )}
        </div>
        <SidebarNavContent compact={sidebarCollapsed} />
      </aside>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden no-print" role="dialog" aria-modal="true" aria-label="Navigation menu">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 flex w-72 max-w-[85vw] flex-col border-r border-zinc-200 dark:border-white/10 bg-white dark:bg-[#0D0D0D]"
            >
              <div className="flex h-16 items-center justify-between border-b border-zinc-200 dark:border-white/10 px-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 dark:border-white/15 bg-zinc-900 dark:bg-[#161616] text-white font-display font-bold">
                    {brandName.slice(0, 1)}
                  </div>
                  <span className="font-display text-sm font-bold tracking-wider">{brandName}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close navigation menu"
                  className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <SidebarNavContent compact={false} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-zinc-200 dark:border-white/10 bg-white/90 dark:bg-[#080808]/90 px-4 sm:px-6 backdrop-blur-md no-print">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="rounded-lg border border-zinc-200 dark:border-white/12 p-2 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10 lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setSidebarCollapsed((c) => !c)}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden lg:inline-flex rounded-lg border border-zinc-200 dark:border-white/12 p-2 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10"
            >
              <Menu className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Open global search"
              className="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-white/12 bg-zinc-50 dark:bg-[#121212] px-3 py-1.5 text-xs text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-white/25 transition-colors sm:w-64"
            >
              <Search className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline truncate">Search products, orders, modules...</span>
              <span className="ml-auto hidden sm:inline font-mono text-[10px] opacity-70">⌘K</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <PWAInstallButton compact />

            {/* Quick Action */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setQuickActionOpen((v) => !v);
                  setUserMenuOpen(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-white px-3 py-1.5 text-xs font-medium text-white dark:text-[#080808] hover:opacity-90 whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Quick Action</span>
              </button>
              {quickActionOpen && (
                <div className="absolute right-0 mt-2 w-52 rounded-xl border border-zinc-200 dark:border-white/12 bg-white dark:bg-[#141414] p-1.5 shadow-xl z-40">
                  {user.permissions.includes('pos') && (
                    <button
                      type="button"
                      onClick={() => navigateTo('pos')}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10"
                    >
                      <ShoppingBag className="h-3.5 w-3.5" />
                      <span>New POS Order</span>
                    </button>
                  )}
                  {user.permissions.includes('products') && (
                    <button
                      type="button"
                      onClick={() => navigateTo('products')}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10"
                    >
                      <Package className="h-3.5 w-3.5" />
                      <span>Manage Products</span>
                    </button>
                  )}
                  {user.permissions.includes('customers') && (
                    <button
                      type="button"
                      onClick={() => navigateTo('customers')}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10"
                    >
                      <Users className="h-3.5 w-3.5" />
                      <span>Customers CRM</span>
                    </button>
                  )}
                  {user.permissions.includes('expenses') && (
                    <button
                      type="button"
                      onClick={() => navigateTo('expenses')}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10"
                    >
                      <TrendingDown className="h-3.5 w-3.5" />
                      <span>Record Expense</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Notification Bell */}
            <button
              type="button"
              onClick={() => navigateTo('notifications')}
              aria-label={`Notifications (${unreadCount} unread)`}
              className="relative rounded-lg border border-zinc-200 dark:border-white/12 p-2 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-zinc-900 dark:bg-white px-1 font-mono text-[10px] font-semibold text-white dark:text-[#080808]">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {/* User Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen((v) => !v);
                  setQuickActionOpen(false);
                }}
                aria-label="Open account menu"
                className="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-white/12 py-1 pl-1.5 pr-2.5 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
              >
                <Avatar src={user.avatar_url} name={user.full_name} size="sm" />
                <div className="hidden md:block text-left">
                  <p className="text-xs font-medium leading-tight max-w-[120px] truncate">{user.full_name}</p>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 capitalize">
                    {user.role === 'super_admin' ? 'Main Admin' : user.role.replace('_', ' ')}
                  </p>
                </div>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-zinc-200 dark:border-white/12 bg-white dark:bg-[#141414] p-1.5 shadow-xl z-40">
                  <div className="border-b border-zinc-200 dark:border-white/10 px-3 py-2 mb-1">
                    <p className="text-xs font-medium truncate">{user.full_name}</p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{user.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);
                      navigateTo('profile');
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10"
                  >
                    <UserIcon className="h-3.5 w-3.5" />
                    <span>My Profile &amp; Biometrics</span>
                  </button>
                  {user.permissions.includes('settings') && (
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        navigateTo('settings');
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10"
                    >
                      <Settings className="h-3.5 w-3.5" />
                      <span>System Settings</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleLogout()}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-red-500 hover:bg-red-500/10"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Post-login non-blocking Push Notification opt-in banner */}
        {showPushBanner && (
          <div className="border-b border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-[#121212] px-4 py-2.5 sm:px-6 no-print">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs">
                <BellRing className="h-4 w-4 text-zinc-900 dark:text-white shrink-0" />
                <span>
                  <strong>Stay Updated with XCLUFY:</strong> Enable real-time mobile &amp; desktop alerts for orders, low stock, and admin notices.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={() => void handleEnablePushFromBanner()}
                  className="rounded-lg bg-zinc-900 dark:bg-white px-3 py-1.5 text-xs font-medium text-white dark:text-[#080808] hover:opacity-90"
                >
                  {pushBusy ? 'Enabling...' : 'Enable Alerts'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPushBanner(false);
                    localStorage.setItem('xclufy_push_banner_dismissed', '1');
                  }}
                  className="rounded-lg px-2.5 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                >
                  Not now
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Active Module Workspace */}
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeModule}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16 }}
            >
              {renderModule()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Global Search Modal */}
      <Modal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        title="Global Workspace Search"
        subtitle="Jump to permitted modules or search products, orders, and customers."
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              autoFocus
              value={globalQuery}
              onChange={(e) => setGlobalQuery(e.target.value)}
              placeholder="Type a module name, SKU, order #, or customer phone..."
              className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] pl-10 pr-4 py-2.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-500 dark:focus:border-white/40"
            />
          </div>

          <div className="space-y-4 max-h-[55vh] overflow-y-auto">
            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Modules</p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {filteredModules.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => navigateTo(item.key)}
                      className="flex items-center gap-2.5 rounded-lg border border-zinc-200 dark:border-white/10 px-3 py-2 text-left text-xs font-medium hover:bg-zinc-100 dark:hover:bg-white/10"
                    >
                      <Icon className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {searching && <p className="text-xs text-zinc-500">Searching business records...</p>}

            {searchResults.products.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Products</p>
                <div className="space-y-1">
                  {searchResults.products.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => navigateTo('products')}
                      className="flex w-full items-center justify-between rounded-lg border border-zinc-200 dark:border-white/10 px-3 py-2 text-left text-xs hover:bg-zinc-100 dark:hover:bg-white/10"
                    >
                      <span>
                        <strong className="font-medium">{p.name}</strong> · <span className="font-mono text-zinc-500">{p.sku}</span>
                      </span>
                      <span className="font-mono">{formatBDT(p.selling_price)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {searchResults.orders.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Orders</p>
                <div className="space-y-1">
                  {searchResults.orders.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => navigateTo('orders')}
                      className="flex w-full items-center justify-between rounded-lg border border-zinc-200 dark:border-white/10 px-3 py-2 text-left text-xs hover:bg-zinc-100 dark:hover:bg-white/10"
                    >
                      <span>
                        <strong className="font-mono">{o.order_number}</strong> · {o.customer_name}
                      </span>
                      <span className="font-mono">{formatBDT(o.grand_total)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {searchResults.customers.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Customers</p>
                <div className="space-y-1">
                  {searchResults.customers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => navigateTo('customers')}
                      className="flex w-full items-center justify-between rounded-lg border border-zinc-200 dark:border-white/10 px-3 py-2 text-left text-xs hover:bg-zinc-100 dark:hover:bg-white/10"
                    >
                      <span className="font-medium">{c.name}</span>
                      <span className="font-mono text-zinc-500">{c.phone}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      <OfflineIndicator />
    </div>
  );
}

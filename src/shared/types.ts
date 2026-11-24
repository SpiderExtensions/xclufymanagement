export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'manager'
  | 'sales_staff'
  | 'inventory_manager'
  | 'accountant'
  | 'shareholder_viewer';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export type ModuleKey =
  | 'dashboard'
  | 'products'
  | 'categories'
  | 'inventory'
  | 'pos'
  | 'orders'
  | 'customers'
  | 'preorders'
  | 'waitlist'
  | 'shareholders'
  | 'suppliers'
  | 'income'
  | 'expenses'
  | 'transactions'
  | 'reports'
  | 'barcodes'
  | 'import_export'
  | 'notifications'
  | 'users'
  | 'activity_logs'
  | 'settings'
  | 'profile';

export interface NotificationPrefs {
  in_app_enabled: boolean;
  push_enabled: boolean;
  account_events: boolean;
  business_events: boolean;
  shareholder_events: boolean;
  admin_events: boolean;
}

export interface UserProfile {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  avatar_url: string | null;
  role: UserRole;
  approval_status: ApprovalStatus;
  email_verified: number;
  is_active: number;
  biometric_enabled: boolean;
  passkey_count: number;
  last_login_at: string | null;
  created_at: string;
  permissions: ModuleKey[];
  notification_prefs: NotificationPrefs;
}

export interface PasskeyCredentialInfo {
  id: string;
  device_name: string;
  device_type: string;
  backed_up: number;
  created_at: string;
  last_used_at: string | null;
}

export interface Category {
  id: number;
  name: string;
  description: string;
  image_url: string | null;
  status: 'active' | 'inactive';
  product_count?: number;
  created_at: string;
}

export interface ProductVariant {
  id: number;
  product_id: number;
  size: string;
  color: string;
  material: string;
  style: string;
  sku: string;
  barcode: string;
  price: number;
  stock: number;
}

export interface Product {
  id: number;
  name: string;
  sku: string;
  category_id: number | null;
  category_name?: string;
  description: string;
  image_url: string | null;
  purchase_price: number;
  selling_price: number;
  discount_price: number | null;
  available_stock: number;
  reserved_stock: number;
  sold_stock: number;
  damaged_stock: number;
  returned_stock: number;
  min_stock: number;
  barcode: string;
  status: 'active' | 'archived' | 'out_of_stock';
  tags: string;
  variants: ProductVariant[];
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  division: string;
  district: string;
  upazila: string;
  notes: string;
  total_orders?: number;
  total_spent?: number;
  outstanding_due?: number;
  created_at: string;
}

export type PaymentMethod =
  | 'Cash'
  | 'bKash'
  | 'Nagad'
  | 'Rocket'
  | 'Bank Transfer'
  | 'Card'
  | 'Cash on Delivery'
  | 'Partial Payment'
  | 'Due Payment';

export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'completed' | 'cancelled';

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  variant_id: number | null;
  product_name: string;
  variant_label: string;
  sku: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
  line_total: number;
}

export interface Order {
  id: number;
  order_number: string;
  customer_id: number | null;
  customer_name: string;
  customer_phone: string;
  subtotal: number;
  discount_amount: number;
  delivery_charge: number;
  grand_total: number;
  amount_paid: number;
  due_amount: number;
  payment_method: string;
  payment_status: 'unpaid' | 'partial' | 'paid';
  order_status: OrderStatus;
  notes: string;
  created_by: number | null;
  created_by_name?: string;
  created_at: string;
  items?: OrderItem[];
}

export interface Preorder {
  id: number;
  preorder_number: string;
  customer_id: number | null;
  customer_name: string;
  customer_phone: string;
  product_id: number | null;
  product_name: string;
  variant_id: number | null;
  variant_label: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  advance_payment: number;
  remaining_payment: number;
  expected_arrival: string;
  supplier_id: number | null;
  supplier_name?: string;
  status:
    | 'Pending'
    | 'Advance Received'
    | 'Ordered'
    | 'In Transit'
    | 'Arrived'
    | 'Customer Notified'
    | 'Ready for Delivery'
    | 'Completed'
    | 'Cancelled';
  notes: string;
  created_at: string;
}

export interface WaitlistEntry {
  id: number;
  customer_id: number | null;
  customer_name: string;
  phone: string;
  product_id: number;
  product_name?: string;
  variant_id: number | null;
  variant_label: string;
  quantity: number;
  priority: 'Low' | 'Normal' | 'High' | 'Urgent';
  expected_availability: string;
  status:
    | 'Waiting'
    | 'Product Available'
    | 'Contacted'
    | 'Interested'
    | 'Converted to Pre-order'
    | 'Converted to Order'
    | 'Cancelled';
  notes: string;
  created_at: string;
}

export interface Supplier {
  id: number;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  total_purchased?: number;
  total_paid?: number;
  outstanding_balance?: number;
  created_at: string;
}

export interface Shareholder {
  id: number;
  full_name: string;
  avatar_url: string | null;
  phone: string;
  email: string;
  address: string;
  total_investment: number;
  ownership_bps: number; // 10000 bps = 100.00%
  ownership_percent: number;
  linked_user_id: number | null;
  linked_user_name?: string | null;
  can_view_own_portal: number;
  status: 'active' | 'inactive';
  notes: string;
  created_at: string;
}

export interface ShareholderInvestment {
  id: number;
  shareholder_id: number | null; // null = Main Admin capital contribution
  shareholder_name: string;
  amount: number;
  investment_date: string;
  investment_type: 'equity_contribution' | 'additional_capital' | 'capital_withdrawal' | 'loan_advance';
  payment_method: string;
  reference_number: string;
  description: string;
  proof_url: string | null;
  created_at: string;
}

export interface OwnershipHistoryRecord {
  id: number;
  entity_label: string;
  shareholder_id: number | null;
  previous_bps: number;
  new_bps: number;
  previous_equity: number;
  new_equity: number;
  effective_date: string;
  reason: string;
  authorized_by_name: string;
  supporting_doc: string | null;
  created_at: string;
}

export interface ProfitDistribution {
  id: number;
  period_label: string;
  period_start: string;
  period_end: string;
  distributable_profit: number;
  distributed_amount: number;
  status: 'approved' | 'paid';
  notes: string;
  authorized_by_name: string;
  created_at: string;
  items?: Array<{
    id: number;
    shareholder_id: number | null;
    recipient_name: string;
    ownership_bps: number;
    allocated_amount: number;
  }>;
}

export interface BusinessSettings {
  id: number;
  business_name: string;
  tagline: string;
  logo_url: string | null;
  address: string;
  phone: string;
  email: string;
  currency_code: string;
  currency_symbol: string;
  opening_balance: number;
  default_delivery_charge: number;
  low_stock_threshold: number;
  receipt_header: string;
  receipt_footer: string;
  admin_ownership_bps: number;
  admin_equity_capital: number;
}

export interface AppNotification {
  id: number;
  user_id: number;
  category: 'account' | 'business' | 'shareholder' | 'admin';
  title: string;
  message: string;
  link_module: string | null;
  is_read: number;
  created_at: string;
}

export interface AuditLog {
  id: number;
  user_id: number | null;
  user_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  previous_values: string | null;
  new_values: string | null;
  created_at: string;
}

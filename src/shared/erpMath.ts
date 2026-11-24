export const TOTAL_OWNERSHIP_BPS = 10000; // 100.00%

export function roundMoney(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export function formatBDT(amount: number, symbol = '৳'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: safe % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(safe));
  return safe < 0 ? `-${symbol}${formatted}` : `${symbol}${formatted}`;
}

export function bpsToPercent(bps: number): number {
  return Math.round(bps) / 100;
}

export function percentToBps(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.round(percent * 100);
}

export interface EquityParticipant {
  id: number | null; // null = Main Admin
  name: string;
  equityCapital: number;
}

export interface EquityAllocationResult {
  id: number | null;
  name: string;
  equityCapital: number;
  ownershipBps: number;
  ownershipPercent: number;
}

/**
 * Computes exact basis-point (10,000 = 100.00%) ownership percentages from equity capital
 * using largest-remainder (Hamilton) allocation so the sum ALWAYS equals 10,000 bps (100.00%).
 * If total equity capital is 0, Main Admin (id: null) holds 100.00% (10,000 bps).
 */
export function calculateInvestmentOwnershipBps(
  adminCapital: number,
  shareholders: Array<{ id: number; name: string; equityCapital: number }>,
  adminName = 'Main Admin'
): EquityAllocationResult[] {
  const safeAdminCap = Math.max(0, roundMoney(adminCapital));
  const participants: EquityParticipant[] = [
    { id: null, name: adminName, equityCapital: safeAdminCap },
    ...shareholders.map((s) => ({
      id: s.id,
      name: s.name,
      equityCapital: Math.max(0, roundMoney(s.equityCapital)),
    })),
  ];

  const totalCapital = participants.reduce((acc, p) => acc + p.equityCapital, 0);

  if (totalCapital <= 0) {
    return participants.map((p, idx) => ({
      ...p,
      ownershipBps: idx === 0 ? TOTAL_OWNERSHIP_BPS : 0,
      ownershipPercent: idx === 0 ? 100 : 0,
    }));
  }

  const exacts = participants.map((p) => (p.equityCapital / totalCapital) * TOTAL_OWNERSHIP_BPS);
  const floors = exacts.map((v) => Math.floor(v));
  let remainder = TOTAL_OWNERSHIP_BPS - floors.reduce((a, b) => a + b, 0);

  const ranked = exacts
    .map((v, idx) => ({ idx, frac: v - floors[idx] }))
    .sort((a, b) => b.frac - a.frac);

  for (let i = 0; i < ranked.length && remainder > 0; i++) {
    floors[ranked[i].idx] += 1;
    remainder -= 1;
  }

  return participants.map((p, idx) => ({
    ...p,
    ownershipBps: floors[idx],
    ownershipPercent: bpsToPercent(floors[idx]),
  }));
}

/**
 * Validates that manual ownership allocations are non-negative and sum strictly to 10,000 bps (100.00%).
 */
export function validateManualOwnershipBps(
  allocations: Array<{ id: number | null; ownershipBps: number }>
): { valid: boolean; totalBps: number; error?: string } {
  for (const item of allocations) {
    if (!Number.isInteger(item.ownershipBps) || item.ownershipBps < 0 || item.ownershipBps > TOTAL_OWNERSHIP_BPS) {
      return {
        valid: false,
        totalBps: 0,
        error: 'Each ownership percentage must be between 0.00% and 100.00%.',
      };
    }
  }
  const totalBps = allocations.reduce((sum, item) => sum + item.ownershipBps, 0);
  if (totalBps !== TOTAL_OWNERSHIP_BPS) {
    return {
      valid: false,
      totalBps,
      error: `Total active ownership must equal 100.00% (currently ${bpsToPercent(totalBps).toFixed(2)}%).`,
    };
  }
  return { valid: true, totalBps };
}

export interface DistributionParticipant {
  shareholderId: number | null;
  recipientName: string;
  ownershipBps: number;
}

export interface DistributionAllocation extends DistributionParticipant {
  allocatedAmount: number;
}

/**
 * Distributes profit down to integer Taka (or paisa) proportionally by approved ownership_bps,
 * reconciling rounding differences cleanly so distributed total === distributableAmount.
 */
export function calculateProfitDistribution(
  distributableAmount: number,
  participants: DistributionParticipant[]
): DistributionAllocation[] {
  const totalAmount = Math.max(0, roundMoney(distributableAmount));
  const totalPaisa = Math.round(totalAmount * 100);
  const totalBps = participants.reduce((acc, p) => acc + p.ownershipBps, 0);

  if (totalPaisa === 0 || totalBps <= 0) {
    return participants.map((p) => ({ ...p, allocatedAmount: 0 }));
  }

  const exacts = participants.map((p) => (totalPaisa * p.ownershipBps) / totalBps);
  const floors = exacts.map((v) => Math.floor(v));
  let remainder = totalPaisa - floors.reduce((a, b) => a + b, 0);

  const ranked = exacts
    .map((v, idx) => ({ idx, frac: v - floors[idx] }))
    .sort((a, b) => b.frac - a.frac);

  for (let i = 0; i < ranked.length && remainder > 0; i++) {
    floors[ranked[i].idx] += 1;
    remainder -= 1;
  }

  return participants.map((p, idx) => ({
    ...p,
    allocatedAmount: floors[idx] / 100,
  }));
}

export interface OrderCalcItem {
  quantity: number;
  unitPrice: number;
}

export interface OrderCalcResult {
  subtotal: number;
  discountAmount: number;
  deliveryCharge: number;
  grandTotal: number;
  amountPaid: number;
  dueAmount: number;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
}

export function calculateOrderTotals(
  items: OrderCalcItem[],
  discountAmount: number,
  deliveryCharge: number,
  amountPaid: number
): OrderCalcResult {
  const subtotal = roundMoney(
    items.reduce((sum, item) => sum + Math.max(0, item.quantity) * Math.max(0, item.unitPrice), 0)
  );
  const safeDiscount = Math.min(subtotal, Math.max(0, roundMoney(discountAmount)));
  const safeDelivery = Math.max(0, roundMoney(deliveryCharge));
  const grandTotal = roundMoney(Math.max(0, subtotal - safeDiscount + safeDelivery));
  const safePaid = Math.min(grandTotal, Math.max(0, roundMoney(amountPaid)));
  const dueAmount = roundMoney(Math.max(0, grandTotal - safePaid));

  let paymentStatus: 'unpaid' | 'partial' | 'paid' = 'unpaid';
  if (dueAmount <= 0 && grandTotal >= 0) {
    paymentStatus = 'paid';
  } else if (safePaid > 0) {
    paymentStatus = 'partial';
  }

  return {
    subtotal,
    discountAmount: safeDiscount,
    deliveryCharge: safeDelivery,
    grandTotal,
    amountPaid: safePaid,
    dueAmount,
    paymentStatus,
  };
}

export interface FinancialSummaryInput {
  openingBalance: number;
  orderRevenue: number;
  otherIncome: number;
  actualCashFromOrders: number;
  preorderAdvancesReceived: number;
  actualExpenses: number;
  cogs: number;
  outstandingReceivables: number;
  totalBusinessEquity: number;
  capitalWithdrawals: number;
}

export interface FinancialSummaryOutput {
  totalRevenue: number;
  actualMoneyReceived: number;
  totalExpenses: number;
  cogs: number;
  grossProfit: number;
  netProfit: number;
  availableBalance: number;
  outstandingReceivables: number;
  totalBusinessEquity: number;
}

/**
 * Computes financial statement figures strictly distinguishing:
 * - Revenue (recognized product sales + other operating income, excluding equity investments)
 * - Actual Money Received (cash collected from orders + due collections + preorder advances + other income)
 * - Available Balance = Opening Balance + Actual Money Received - Actual Expenses
 * - Gross Profit = Total Revenue - COGS
 * - Net Profit = Gross Profit - Operating Expenses
 */
export function calculateFinancialSummary(input: FinancialSummaryInput): FinancialSummaryOutput {
  const totalRevenue = roundMoney(input.orderRevenue + input.otherIncome);
  const actualMoneyReceived = roundMoney(
    input.actualCashFromOrders + input.preorderAdvancesReceived + input.otherIncome
  );
  const totalExpenses = roundMoney(input.actualExpenses);
  const cogs = roundMoney(input.cogs);
  const grossProfit = roundMoney(totalRevenue - cogs);
  const netProfit = roundMoney(grossProfit - totalExpenses);
  const availableBalance = roundMoney(
    input.openingBalance + actualMoneyReceived - totalExpenses
  );

  return {
    totalRevenue,
    actualMoneyReceived,
    totalExpenses,
    cogs,
    grossProfit,
    netProfit,
    availableBalance,
    outstandingReceivables: roundMoney(input.outstandingReceivables),
    totalBusinessEquity: roundMoney(Math.max(0, input.totalBusinessEquity - input.capitalWithdrawals)),
  };
}

export type CsvTargetField =
  | 'name'
  | 'sku'
  | 'category'
  | 'description'
  | 'purchase_price'
  | 'selling_price'
  | 'discount_price'
  | 'available_stock'
  | 'min_stock'
  | 'barcode'
  | 'tags'
  | 'ignore';

const HEADER_ALIASES: Record<Exclude<CsvTargetField, 'ignore'>, string[]> = {
  name: ['name', 'product name', 'title', 'item', 'item name', 'পণ্যের নাম', 'নাম'],
  sku: ['sku', 'product sku', 'code', 'item code', 'এসকেইউ'],
  category: ['category', 'cat', 'type', 'collection', 'ক্যাটাগরি'],
  description: ['description', 'desc', 'details', 'বিবরণ'],
  purchase_price: ['purchase price', 'cost', 'cost price', 'buy price', 'buying price', 'ক্রয়মূল্য'],
  selling_price: ['selling price', 'price', 'sale price', 'mrp', 'retail price', 'বিক্রয়মূল্য', 'দাম'],
  discount_price: ['discount price', 'offer price', 'promo price', 'ছাড়ের দাম'],
  available_stock: ['stock', 'available stock', 'qty', 'quantity', 'inventory', 'স্টক', 'পরিমাণ'],
  min_stock: ['min stock', 'minimum stock', 'reorder level', 'alert stock'],
  barcode: ['barcode', 'ean', 'upc', 'gtin', 'bar code', 'বারকোড'],
  tags: ['tags', 'keywords', 'labels'],
};

export function autoMapCsvHeaders(headers: string[]): Record<string, CsvTargetField> {
  const mapping: Record<string, CsvTargetField> = {};
  const used = new Set<CsvTargetField>();

  for (const header of headers) {
    const normalized = header.trim().toLowerCase().replace(/[_-]+/g, ' ');
    let matched: CsvTargetField = 'ignore';

    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<[Exclude<CsvTargetField, 'ignore'>, string[]]>) {
      if (used.has(field)) continue;
      if (aliases.some((alias) => normalized === alias || normalized.includes(alias))) {
        matched = field;
        used.add(field);
        break;
      }
    }
    mapping[header] = matched;
  }

  return mapping;
}

export interface CsvValidatedProduct {
  rowIndex: number;
  name: string;
  sku: string;
  category: string;
  description: string;
  purchase_price: number;
  selling_price: number;
  discount_price: number | null;
  available_stock: number;
  min_stock: number;
  barcode: string;
  tags: string;
  status: 'valid' | 'duplicate' | 'error';
  issues: string[];
}

export function validateCsvRows(
  rows: Record<string, string>[],
  mapping: Record<string, CsvTargetField>,
  existingSkus: Set<string>,
  existingBarcodes: Set<string>
): CsvValidatedProduct[] {
  const reverseMap: Partial<Record<CsvTargetField, string>> = {};
  for (const [header, field] of Object.entries(mapping)) {
    if (field !== 'ignore' && !reverseMap[field]) {
      reverseMap[field] = header;
    }
  }

  const seenSkus = new Set<string>();
  const seenBarcodes = new Set<string>();

  return rows.map((row, idx) => {
    const getVal = (field: Exclude<CsvTargetField, 'ignore'>): string => {
      const col = reverseMap[field];
      return col && row[col] !== undefined ? String(row[col]).trim() : '';
    };

    const name = getVal('name');
    const sku = getVal('sku');
    const barcode = getVal('barcode'); // Preserves leading zeros!
    const category = getVal('category') || 'Fashion Accessories';
    const description = getVal('description');
    const purchaseRaw = getVal('purchase_price');
    const sellingRaw = getVal('selling_price');
    const discountRaw = getVal('discount_price');
    const stockRaw = getVal('available_stock');
    const minStockRaw = getVal('min_stock');
    const tags = getVal('tags');

    const purchase_price = purchaseRaw ? Number(purchaseRaw.replace(/[^0-9.-]/g, '')) : 0;
    const selling_price = sellingRaw ? Number(sellingRaw.replace(/[^0-9.-]/g, '')) : 0;
    const discount_price = discountRaw ? Number(discountRaw.replace(/[^0-9.-]/g, '')) : null;
    const available_stock = stockRaw ? Math.max(0, Math.floor(Number(stockRaw.replace(/[^0-9.-]/g, '')))) : 0;
    const min_stock = minStockRaw ? Math.max(0, Math.floor(Number(minStockRaw.replace(/[^0-9.-]/g, '')))) : 5;

    const issues: string[] = [];
    let isDuplicate = false;

    if (!name) issues.push('Missing product name');
    if (!sku) issues.push('Missing SKU');
    if (!Number.isFinite(selling_price) || selling_price <= 0) issues.push('Invalid or zero selling price');
    if (!Number.isFinite(purchase_price) || purchase_price < 0) issues.push('Invalid purchase price');
    if (discount_price !== null && (!Number.isFinite(discount_price) || discount_price < 0)) {
      issues.push('Invalid discount price');
    }

    if (sku) {
      const normSku = sku.toLowerCase();
      if (existingSkus.has(normSku) || seenSkus.has(normSku)) {
        isDuplicate = true;
        issues.push(`Duplicate SKU: ${sku}`);
      }
      seenSkus.add(normSku);
    }

    if (barcode) {
      if (existingBarcodes.has(barcode) || seenBarcodes.has(barcode)) {
        isDuplicate = true;
        issues.push(`Duplicate barcode: ${barcode}`);
      }
      seenBarcodes.add(barcode);
    }

    const hasError = issues.some((msg) => !msg.startsWith('Duplicate'));

    return {
      rowIndex: idx + 1,
      name,
      sku,
      category,
      description,
      purchase_price: Number.isFinite(purchase_price) ? roundMoney(purchase_price) : 0,
      selling_price: Number.isFinite(selling_price) ? roundMoney(selling_price) : 0,
      discount_price: discount_price !== null && Number.isFinite(discount_price) ? roundMoney(discount_price) : null,
      available_stock: Number.isFinite(available_stock) ? available_stock : 0,
      min_stock: Number.isFinite(min_stock) ? min_stock : 5,
      barcode,
      tags,
      status: hasError ? 'error' : isDuplicate ? 'duplicate' : 'valid',
      issues,
    };
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateInvestmentOwnershipBps,
  validateManualOwnershipBps,
  calculateProfitDistribution,
  calculateOrderTotals,
  calculateFinancialSummary,
  autoMapCsvHeaders,
  validateCsvRows,
} from './erpMath';

test('Initial ownership with zero shareholders gives Main Admin 100.00% (10000 bps)', () => {
  const res = calculateInvestmentOwnershipBps(0, []);
  assert.equal(res.length, 1);
  assert.equal(res[0].ownershipBps, 10000);
  assert.equal(res[0].ownershipPercent, 100);
});

test('Investment-based ownership calculates exact percentages totaling 100.00%', () => {
  const res = calculateInvestmentOwnershipBps(60000, [
    { id: 1, name: 'Shareholder A', equityCapital: 25000 },
    { id: 2, name: 'Shareholder B', equityCapital: 15000 },
  ]);
  assert.equal(res[0].ownershipPercent, 60);
  assert.equal(res[1].ownershipPercent, 25);
  assert.equal(res[2].ownershipPercent, 15);
  const sumBps = res.reduce((s, r) => s + r.ownershipBps, 0);
  assert.equal(sumBps, 10000);
});

test('Largest-remainder allocation handles uneven splits cleanly without losing 0.01%', () => {
  const res = calculateInvestmentOwnershipBps(10000, [
    { id: 1, name: 'A', equityCapital: 10000 },
    { id: 2, name: 'B', equityCapital: 10000 },
  ]);
  const sumBps = res.reduce((s, r) => s + r.ownershipBps, 0);
  assert.equal(sumBps, 10000);
});

test('Manual ownership validation enforces exact 100.00% total', () => {
  assert.equal(
    validateManualOwnershipBps([
      { id: null, ownershipBps: 6000 },
      { id: 1, ownershipBps: 4000 },
    ]).valid,
    true
  );
  assert.equal(
    validateManualOwnershipBps([
      { id: null, ownershipBps: 6000 },
      { id: 1, ownershipBps: 3500 },
    ]).valid,
    false
  );
});

test('Profit distribution allocates exact amounts matching distributable profit', () => {
  const dist = calculateProfitDistribution(50000, [
    { shareholderId: null, recipientName: 'Main Admin', ownershipBps: 6000 },
    { shareholderId: 1, recipientName: 'Shareholder A', ownershipBps: 2500 },
    { shareholderId: 2, recipientName: 'Shareholder B', ownershipBps: 1500 },
  ]);
  assert.equal(dist[0].allocatedAmount, 30000);
  assert.equal(dist[1].allocatedAmount, 12500);
  assert.equal(dist[2].allocatedAmount, 7500);
});

test('Order totals handle discounts, delivery charges, partial payments, and due amount', () => {
  const order = calculateOrderTotals(
    [
      { quantity: 2, unitPrice: 1200 },
      { quantity: 1, unitPrice: 600 },
    ],
    200,
    80,
    1500
  );
  assert.equal(order.subtotal, 3000);
  assert.equal(order.grandTotal, 2880);
  assert.equal(order.amountPaid, 1500);
  assert.equal(order.dueAmount, 1380);
  assert.equal(order.paymentStatus, 'partial');
});

test('Financial summary separates business equity from sales revenue and computes net profit accurately', () => {
  const summary = calculateFinancialSummary({
    openingBalance: 10000,
    orderRevenue: 50000,
    otherIncome: 2000,
    actualCashFromOrders: 40000,
    preorderAdvancesReceived: 5000,
    actualExpenses: 12000,
    cogs: 20000,
    outstandingReceivables: 10000,
    totalBusinessEquity: 100000,
    capitalWithdrawals: 0,
  });
  assert.equal(summary.totalRevenue, 52000);
  assert.equal(summary.actualMoneyReceived, 47000);
  assert.equal(summary.grossProfit, 32000);
  assert.equal(summary.netProfit, 20000);
  assert.equal(summary.availableBalance, 45000); // 10000 + 47000 - 12000
  assert.equal(summary.totalBusinessEquity, 100000);
});

test('CSV mapper preserves leading zeros in barcodes and detects duplicates', () => {
  const mapping = autoMapCsvHeaders(['Product Name', 'SKU', 'Selling Price', 'Barcode', 'Stock']);
  assert.equal(mapping['Product Name'], 'name');
  assert.equal(mapping['Barcode'], 'barcode');

  const validated = validateCsvRows(
    [
      { 'Product Name': 'Noir Sunglasses', SKU: 'XC-001', 'Selling Price': '1450', Barcode: '0089123456789', Stock: '12' },
      { 'Product Name': 'Velvet Bandana', SKU: 'XC-001', 'Selling Price': '450', Barcode: '0089123456790', Stock: '25' },
    ],
    mapping,
    new Set(['existing-1']),
    new Set(['999999'])
  );

  assert.equal(validated[0].status, 'valid');
  assert.equal(validated[0].barcode, '0089123456789'); // leading zeros intact
  assert.equal(validated[1].status, 'duplicate');
});

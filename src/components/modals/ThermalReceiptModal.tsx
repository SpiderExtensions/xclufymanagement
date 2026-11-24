import React, { useState } from 'react';
import { Printer, FileDown, Copy } from 'lucide-react';
import type { BusinessSettings, Order } from '../../shared/types';
import { formatBDT } from '../../shared/erpMath';
import { BarcodeSvg, Modal } from '../ui/Primitives';

export const ThermalReceiptModal: React.FC<{
  open: boolean;
  onClose: () => void;
  order: Order | null;
  settings: BusinessSettings | null;
}> = ({ open, onClose, order, settings }) => {
  const [copyLabel, setCopyLabel] = useState<'MERCHANT COPY' | 'CUSTOMER COPY'>('CUSTOMER COPY');

  if (!order) return null;

  const businessName = settings?.business_name || 'XCLUFY';
  const address = settings?.address || 'Dhaka, Bangladesh';
  const phone = settings?.phone || '';
  const footer =
    settings?.receipt_footer || 'Thank you for shopping with XCLUFY. Keep shopping. Stay aesthetic.';

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadHtmlReceipt = () => {
    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt-${order.order_number}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  body { font-family: 'Courier New', monospace; width: 72mm; margin: 0 auto; padding: 4mm 2mm; color: #000; background: #fff; font-size: 11px; line-height: 1.35; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .line { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { text-align: left; padding: 2px 0; vertical-align: top; }
  .right { text-align: right; }
</style>
</head>
<body>
  <div class="center">
    <div class="bold" style="font-size:16px;letter-spacing:2px;">${businessName}</div>
    <div>${settings?.receipt_header || 'Aesthetic Fashion Items & Accessories'}</div>
    <div>${address}${phone ? ` · ${phone}` : ''}</div>
    <div style="margin-top:4px;font-weight:bold;">${copyLabel}</div>
  </div>
  <div class="line"></div>
  <div class="row"><span>Order:</span><span class="bold">${order.order_number}</span></div>
  <div class="row"><span>Date:</span><span>${new Date(order.created_at).toLocaleString()}</span></div>
  <div class="row"><span>Customer:</span><span>${order.customer_name}</span></div>
  ${order.customer_phone ? `<div class="row"><span>Phone:</span><span>${order.customer_phone}</span></div>` : ''}
  <div class="line"></div>
  <table>
    <thead><tr><th>Item</th><th class="right">Qty</th><th class="right">Total</th></tr></thead>
    <tbody>
      ${(order.items || [])
        .map(
          (it) =>
            `<tr><td>${it.product_name}${it.variant_label ? `<br><small>${it.variant_label}</small>` : ''}<br><small>@ ${formatBDT(it.unit_price)}</small></td><td class="right">${it.quantity}</td><td class="right">${formatBDT(it.line_total)}</td></tr>`
        )
        .join('')}
    </tbody>
  </table>
  <div class="line"></div>
  <div class="row"><span>Subtotal</span><span>${formatBDT(order.subtotal)}</span></div>
  ${order.discount_amount > 0 ? `<div class="row"><span>Discount</span><span>-${formatBDT(order.discount_amount)}</span></div>` : ''}
  ${order.delivery_charge > 0 ? `<div class="row"><span>Delivery</span><span>${formatBDT(order.delivery_charge)}</span></div>` : ''}
  <div class="row bold" style="font-size:13px;margin-top:3px;"><span>Grand Total</span><span>${formatBDT(order.grand_total)}</span></div>
  <div class="row"><span>Paid (${order.payment_method})</span><span>${formatBDT(order.amount_paid)}</span></div>
  <div class="row bold"><span>Due Amount</span><span>${formatBDT(order.due_amount)}</span></div>
  <div class="line"></div>
  <div class="center" style="margin-top:6px;">
    <div>Thank you for shopping with XCLUFY.</div>
    <div class="bold">Keep shopping. Stay aesthetic.</div>
  </div>
</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `XCLUFY-Receipt-${order.order_number}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="80mm Thermal Receipt"
      subtitle={`Order ${order.order_number} · Print-optimized 72mm printable width on 80mm roll`}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 no-print">
          <div className="inline-flex rounded-lg border border-zinc-200 dark:border-white/10 p-1 bg-zinc-100 dark:bg-[#181818]">
            <button
              type="button"
              onClick={() => setCopyLabel('CUSTOMER COPY')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                copyLabel === 'CUSTOMER COPY'
                  ? 'bg-white dark:bg-white text-black shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              Customer Copy
            </button>
            <button
              type="button"
              onClick={() => setCopyLabel('MERCHANT COPY')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                copyLabel === 'MERCHANT COPY'
                  ? 'bg-white dark:bg-white text-black shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              Merchant Copy
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadHtmlReceipt}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-white/15 px-3 py-2 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-white/10"
            >
              <FileDown className="h-3.5 w-3.5" />
              Save Receipt
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-[#080808] hover:opacity-90"
            >
              <Printer className="h-3.5 w-3.5" />
              Print 80mm / PDF
            </button>
          </div>
        </div>

        {/* 80mm Thermal Monochrome Preview */}
        <div className="flex justify-center bg-zinc-100 dark:bg-black/60 p-4 rounded-xl border border-zinc-200 dark:border-white/10">
          <div className="thermal-receipt-print-root w-[76mm] bg-white text-black p-4 font-mono text-[11px] leading-snug shadow-md">
            <div className="text-center space-y-0.5">
              <div className="text-base font-bold tracking-[0.2em]">{businessName}</div>
              <div className="text-[10px]">{settings?.receipt_header || 'Aesthetic Fashion Items & Accessories'}</div>
              <div className="text-[10px]">
                {address}
                {phone ? ` · ${phone}` : ''}
              </div>
              <div className="pt-1 text-[10px] font-bold tracking-wider">{copyLabel}</div>
            </div>

            <div className="my-2 border-t border-dashed border-black" />

            <div className="space-y-0.5 text-[10.5px]">
              <div className="flex justify-between">
                <span>Order ID</span>
                <span className="font-bold">{order.order_number}</span>
              </div>
              <div className="flex justify-between">
                <span>Date</span>
                <span>{new Date(order.created_at).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Customer</span>
                <span>{order.customer_name}</span>
              </div>
              {order.customer_phone && (
                <div className="flex justify-between">
                  <span>Phone</span>
                  <span>{order.customer_phone}</span>
                </div>
              )}
            </div>

            <div className="my-2 border-t border-dashed border-black" />

            <table className="w-full text-left text-[10.5px]">
              <thead>
                <tr className="border-b border-black">
                  <th className="py-1 font-bold">Item</th>
                  <th className="py-1 text-right font-bold">Qty</th>
                  <th className="py-1 text-right font-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                {(order.items || []).map((item, idx) => (
                  <tr key={idx} className="border-b border-dotted border-zinc-300">
                    <td className="py-1 pr-2">
                      <div className="font-semibold">{item.product_name}</div>
                      {item.variant_label && <div className="text-[9.5px]">{item.variant_label}</div>}
                      <div className="text-[9.5px]">@ {formatBDT(item.unit_price)}</div>
                    </td>
                    <td className="py-1 text-right align-top tabular-nums">{item.quantity}</td>
                    <td className="py-1 text-right align-top tabular-nums">{formatBDT(item.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="my-2 border-t border-dashed border-black" />

            <div className="space-y-0.5 text-[11px] tabular-nums">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatBDT(order.subtotal)}</span>
              </div>
              {order.discount_amount > 0 && (
                <div className="flex justify-between">
                  <span>Discount</span>
                  <span>-{formatBDT(order.discount_amount)}</span>
                </div>
              )}
              {order.delivery_charge > 0 && (
                <div className="flex justify-between">
                  <span>Delivery Charge</span>
                  <span>{formatBDT(order.delivery_charge)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs font-bold pt-1 border-t border-black">
                <span>GRAND TOTAL</span>
                <span>{formatBDT(order.grand_total)}</span>
              </div>
              <div className="flex justify-between">
                <span>Paid ({order.payment_method})</span>
                <span>{formatBDT(order.amount_paid)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Due Amount</span>
                <span>{formatBDT(order.due_amount)}</span>
              </div>
            </div>

            <div className="my-2 border-t border-dashed border-black" />

            <div className="flex justify-center py-1">
              <BarcodeSvg value={order.order_number} height={28} width={1.1} lineColor="#000000" />
            </div>

            <div className="mt-1 text-center text-[10px] space-y-0.5">
              <div>Thank you for shopping with XCLUFY.</div>
              <div className="font-bold">Keep shopping. Stay aesthetic.</div>
              {footer && !footer.includes('Thank you for shopping') && <div>{footer}</div>}
            </div>
          </div>
        </div>

        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 no-print">
          <Copy className="h-3.5 w-3.5 shrink-0" />
          Uses native browser print / Save as PDF formatted for 80mm thermal paper (72mm printable area). Direct silent printing requires an OS-configured default thermal printer or local print bridge.
        </p>
      </div>
    </Modal>
  );
};

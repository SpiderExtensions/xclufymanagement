import React, { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Download, WifiOff, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidth?: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, maxWidth = 'max-w-xl', children }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={`relative z-10 w-full ${maxWidth} max-h-[90vh] flex flex-col rounded-xl border border-zinc-200 dark:border-white/12 bg-white dark:bg-[#121212] text-zinc-900 dark:text-white shadow-2xl overflow-hidden`}
          >
            <div className="flex items-start justify-between gap-4 border-b border-zinc-200 dark:border-white/10 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
                {subtitle && <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={`Close ${title}`}
                className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export const PageHeader: React.FC<{
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}> = ({ title, subtitle, actions }) => (
  <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white text-balance">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2.5 shrink-0">{actions}</div>}
  </div>
);

export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50/50 dark:bg-[#101010] px-6 py-14 text-center">
    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#171717] text-zinc-500 dark:text-zinc-300">
      {icon}
    </div>
    <h3 className="text-base font-medium text-zinc-900 dark:text-white">{title}</h3>
    <p className="mt-1.5 max-w-md text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export const SkeletonRows: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div className="space-y-3" aria-busy="true" aria-label="Loading content">
    {Array.from({ length: rows }).map((_, i) => (
      <div
        key={i}
        className="h-12 w-full animate-pulse rounded-lg border border-zinc-200 dark:border-white/5 bg-zinc-100 dark:bg-[#151515]"
      />
    ))}
  </div>
);

export const AnimatedNumber: React.FC<{
  value: number;
  formatter?: (val: number) => string;
  className?: string;
}> = ({ value, formatter = (v) => v.toLocaleString(), className = '' }) => {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const start = prevRef.current;
    const diff = value - start;
    if (diff === 0) return;

    const prefersReduced =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setDisplay(value);
      prevRef.current = value;
      return;
    }

    const duration = 350;
    const startTime = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + diff * eased);
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
        prevRef.current = value;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className={`tabular-nums ${className}`}>{formatter(display)}</span>;
};

export const Avatar: React.FC<{
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}> = ({ src, name, size = 'md' }) => {
  const [failed, setFailed] = useState(false);
  const dims =
    size === 'sm'
      ? 'h-8 w-8 text-xs'
      : size === 'lg'
        ? 'h-14 w-14 text-base'
        : size === 'xl'
          ? 'h-20 w-20 text-xl'
          : 'h-10 w-10 text-sm';

  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${dims} shrink-0 rounded-full object-cover border border-zinc-200 dark:border-white/15 bg-zinc-900`}
      />
    );
  }

  return (
    <div
      aria-label={name}
      className={`${dims} shrink-0 flex items-center justify-center rounded-full border border-zinc-300 dark:border-white/15 bg-zinc-100 dark:bg-[#1E1E1E] font-medium text-zinc-800 dark:text-zinc-200`}
    >
      {initials || 'X'}
    </div>
  );
};

export const BarcodeSvg: React.FC<{
  value: string;
  height?: number;
  width?: number;
  className?: string;
  lineColor?: string;
}> = ({ value, height = 38, width = 1.4, className = '', lineColor = '#000000' }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    try {
      JsBarcode(svgRef.current, value, {
        format: 'CODE128',
        lineColor,
        background: 'transparent',
        width,
        height,
        displayValue: true,
        fontSize: 11,
        margin: 2,
      });
    } catch {
      // Fallback safely if invalid barcode character
    }
  }, [value, height, width, lineColor]);

  if (!value) return null;
  return <svg ref={svgRef} className={className} />;
};

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 dark:border-white/15 bg-zinc-900 dark:bg-white px-3 py-1.5 text-xs font-medium text-white dark:text-[#080808] hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
      >
        <Download className="h-3.5 w-3.5" />
        {!compact && <span>Install App</span>}
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="h-3.5 w-3.5" />
          {!compact && <span>Install App</span>}
        </button>

        <Modal open={showIOSGuide} onClose={() => setShowIOSGuide(false)} title="Install XCLUFY on iOS">
          <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
            <p>Install XCLUFY onto your iPhone or iPad home screen for quick standalone access:</p>
            <ol className="list-decimal pl-5 space-y-2">
              <li>Tap the <strong>Share</strong> icon in Safari&apos;s bottom or top toolbar.</li>
              <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
              <li>Tap <strong>Add</strong> in the top-right corner.</li>
            </ol>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-lg bg-zinc-900 dark:bg-white py-2.5 text-sm font-medium text-white dark:text-[#080808]"
              >
                Got it
              </button>
            </div>
          </div>
        </Modal>
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-950 px-3.5 py-2 text-xs font-medium text-amber-200 shadow-lg no-print">
      <WifiOff className="h-3.5 w-3.5" />
      <span>Offline Mode — Cached shell active</span>
    </div>
  );
};

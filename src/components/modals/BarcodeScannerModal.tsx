import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/library';
import { Camera, Keyboard, ScanLine, AlertCircle } from 'lucide-react';
import { Modal } from '../ui/Primitives';

export const BarcodeScannerModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}> = ({ open, onClose, onDetected }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!open) {
      readerRef.current?.reset();
      readerRef.current = null;
      setScanning(false);
      return;
    }

    let cancelled = false;
    setCameraError('');
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    async function startCamera() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setCameraError('Camera API unavailable in this browser context. Use a USB/Bluetooth scanner or manual barcode entry below.');
          return;
        }
        setScanning(true);
        const devices = await reader.listVideoInputDevices();
        // Prefer rear camera on mobile
        const backCamera =
          devices.find((d) => /back|rear|environment/i.test(d.label)) || devices[devices.length - 1];
        const deviceId = backCamera?.deviceId ?? null;

        if (!videoRef.current || cancelled) return;
        await reader.decodeFromVideoDevice(deviceId, videoRef.current, (result) => {
          if (result && !cancelled) {
            const text = result.getText().trim();
            if (text) {
              onDetected(text);
              onClose();
            }
          }
        });
      } catch (err: unknown) {
        if (!cancelled) {
          setScanning(false);
          setCameraError(
            (err as Error).message || 'Could not access rear camera. Grant camera permission or enter code manually.'
          );
        }
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      reader.reset();
    };
  }, [open, onClose, onDetected]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = manualCode.trim();
    if (!trimmed) return;
    onDetected(trimmed);
    setManualCode('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Scan Product Barcode"
      subtitle="Supports EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, ITF, and QR via camera or hardware scanner"
    >
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-xl border border-zinc-200 dark:border-white/10 bg-black aspect-video flex items-center justify-center">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          {scanning && !cameraError && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="h-36 w-64 rounded-lg border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] flex items-center justify-center">
                <ScanLine className="h-6 w-6 text-white animate-pulse" />
              </div>
              <span className="mt-3 text-xs font-medium text-white bg-black/70 px-3 py-1 rounded-md">
                Align barcode inside frame
              </span>
            </div>
          )}
          {cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-[#101010] text-zinc-300">
              <Camera className="h-8 w-8 mb-2 text-zinc-400" />
              <p className="text-xs max-w-sm flex items-start gap-2 text-amber-300">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{cameraError}</span>
              </p>
            </div>
          )}
        </div>

        <form onSubmit={handleManualSubmit} className="space-y-2">
          <label htmlFor="manual-barcode-input" className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
            USB / Bluetooth Scanner or Manual Barcode / SKU Entry
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Keyboard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input
                id="manual-barcode-input"
                type="text"
                autoFocus
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Scan or type barcode / SKU and press Enter..."
                className="w-full rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#171717] pl-9 pr-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-white/40"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-[#080808] hover:opacity-90"
            >
              Lookup
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

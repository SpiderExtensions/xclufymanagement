import React, { useEffect, useRef, useState } from 'react';
import { Camera, Upload, ZoomIn, ZoomOut, Check, Trash2 } from 'lucide-react';
import { Modal } from '../ui/Primitives';

export const ImageCropperModal: React.FC<{
  open: boolean;
  onClose: () => void;
  currentImage?: string | null;
  onSave: (dataUrl: string | null) => void;
  title?: string;
}> = ({ open, onClose, currentImage, onSave, title = 'Update Profile Picture' }) => {
  const [sourceUrl, setSourceUrl] = useState<string | null>(currentImage || null);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setSourceUrl(currentImage || null);
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
    setCameraError('');
  }, [currentImage, open]);

  useEffect(() => {
    if (!open) {
      stopCamera();
    }
  }, [open]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (!sourceUrl || !canvasRef.current) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      drawCanvas();
    };
    img.src = sourceUrl;
  }, [sourceUrl]);

  useEffect(() => {
    drawCanvas();
  }, [zoom, offsetX, offsetY]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 256;
    canvas.width = size;
    canvas.height = size;
    ctx.fillStyle = '#101010';
    ctx.fillRect(0, 0, size, size);

    const baseScale = Math.max(size / img.width, size / img.height);
    const scale = baseScale * zoom;
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const dx = (size - drawW) / 2 + offsetX;
    const dy = (size - drawH) / 2 + offsetY;
    ctx.drawImage(img, dx, dy, drawW, drawH);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        stopCamera();
        setSourceUrl(reader.result);
        setZoom(1);
        setOffsetX(0);
        setOffsetY(0);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleStartCamera = async () => {
    setCameraError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera capture is not supported in this browser.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 60);
    } catch (err: unknown) {
      setCameraError((err as Error).message || 'Camera permission denied.');
    }
  };

  const handleCapture = () => {
    if (!videoRef.current) return;
    const tmp = document.createElement('canvas');
    tmp.width = videoRef.current.videoWidth || 480;
    tmp.height = videoRef.current.videoHeight || 480;
    const ctx = tmp.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, tmp.width, tmp.height);
    setSourceUrl(tmp.toDataURL('image/jpeg', 0.9));
    stopCamera();
  };

  const handleSave = () => {
    if (!sourceUrl) {
      onSave(null);
      onClose();
      return;
    }
    drawCanvas();
    const dataUrl = canvasRef.current?.toDataURL('image/webp', 0.88) || sourceUrl;
    onSave(dataUrl);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={title} subtitle="Upload or capture a photo, crop, and preview before saving">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 dark:border-white/15 px-3.5 py-2 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-white/10">
            <Upload className="h-3.5 w-3.5" />
            <span>Upload Image</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFileChange} />
          </label>
          <button
            type="button"
            onClick={() => void handleStartCamera()}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 dark:border-white/15 px-3.5 py-2 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-white/10"
          >
            <Camera className="h-3.5 w-3.5" />
            <span>Use Camera</span>
          </button>
          {sourceUrl && (
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setSourceUrl(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Remove</span>
            </button>
          )}
        </div>

        {cameraError && <p className="text-xs text-red-400">{cameraError}</p>}

        {cameraActive ? (
          <div className="space-y-3">
            <video ref={videoRef} className="w-full max-h-64 rounded-xl bg-black object-cover" muted playsInline />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCapture}
                className="flex-1 rounded-lg bg-white py-2 text-xs font-semibold text-[#080808]"
              >
                Capture Photo
              </button>
              <button
                type="button"
                onClick={stopCamera}
                className="rounded-lg border border-white/15 px-4 py-2 text-xs font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="relative h-56 w-56 overflow-hidden rounded-full border-2 border-zinc-300 dark:border-white/20 bg-[#101010] flex items-center justify-center">
              {sourceUrl ? (
                <canvas ref={canvasRef} className="h-full w-full" />
              ) : (
                <span className="text-xs text-zinc-500">No image selected</span>
              )}
            </div>

            {sourceUrl && (
              <div className="w-full space-y-2.5">
                <div className="flex items-center gap-3 text-xs">
                  <ZoomOut className="h-3.5 w-3.5 text-zinc-400" />
                  <input
                    type="range"
                    aria-label="Zoom"
                    min={1}
                    max={2.5}
                    step={0.05}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="flex-1 accent-white"
                  />
                  <ZoomIn className="h-3.5 w-3.5 text-zinc-400" />
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <label className="space-y-1">
                    <span className="text-zinc-400">Horizontal Position</span>
                    <input
                      type="range"
                      min={-80}
                      max={80}
                      value={offsetX}
                      onChange={(e) => setOffsetX(Number(e.target.value))}
                      className="w-full accent-white"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-zinc-400">Vertical Position</span>
                    <input
                      type="range"
                      min={-80}
                      max={80}
                      value={offsetY}
                      onChange={(e) => setOffsetY(Number(e.target.value))}
                      className="w-full accent-white"
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-zinc-200 dark:border-white/10 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 dark:border-white/15 px-4 py-2 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-white px-4 py-2 text-sm font-semibold text-white dark:text-[#080808]"
          >
            <Check className="h-4 w-4" />
            Save Picture
          </button>
        </div>
      </div>
    </Modal>
  );
};

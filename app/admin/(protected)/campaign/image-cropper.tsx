"use client";

import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

export function ImageCropper({
  file,
  aspect,
  label,
  onConfirm,
  onCancel,
}: {
  file: File;
  aspect: number;
  label: string;
  onConfirm: (crop: { x: number; y: number; width: number; height: number }) => void;
  onCancel: () => void;
}) {
  const [imageUrl] = useState(() => URL.createObjectURL(file));
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => setCroppedAreaPixels(pixels), []);

  return (
    <div className="cropper-scrim">
      <div className="cropper-modal">
        <p className="eyebrow">{label}</p>
        <div className="cropper-stage">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <label className="cropper-zoom">
          <span>Zoom</span>
          <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
        </label>
        <p className="cropper-hint">Drag to reposition, use the slider to zoom. This crop is applied entirely on your device before anything uploads.</p>
        <div className="cropper-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="admin-primary"
            disabled={!croppedAreaPixels}
            onClick={() => {
              if (croppedAreaPixels) onConfirm(croppedAreaPixels);
              URL.revokeObjectURL(imageUrl);
            }}
          >
            Use this crop
          </button>
        </div>
      </div>
    </div>
  );
}

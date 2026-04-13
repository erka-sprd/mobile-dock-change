import React, { useEffect, useRef } from "react";

const SETTINGS = {
  quantStep: 1,
  stitchDensity: 0,
  stitchLength: 20,
  stitchVisibility: 280,
  edgeCleanliness: 0,
  edgeShadow: 40,
  embossStrength: 500,
  embossThickness: 5,
  shineAmount: 0,
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function pseudoNoise(x: number, y: number) {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (v - Math.floor(v)) * 2 - 1;
}

function quantizeImageData(imageData: ImageData, step: number): ImageData {
  const copy = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  const data = copy.data;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 16) { data[i + 3] = 0; continue; }
    data[i]     = clamp(Math.round(data[i]     / step) * step, 0, 255);
    data[i + 1] = clamp(Math.round(data[i + 1] / step) * step, 0, 255);
    data[i + 2] = clamp(Math.round(data[i + 2] / step) * step, 0, 255);
    data[i + 3] = alpha > 200 ? 255 : alpha;
  }
  return copy;
}

function applyEdgeShadow(ctx: CanvasRenderingContext2D, imageData: ImageData, width: number, height: number, strength: number) {
  const src = imageData.data;
  ctx.fillStyle = `rgba(0,0,0,${strength / 100})`;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (src[(y * width + x) * 4 + 3] < 20) continue;
      let n = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (ox === 0 && oy === 0) continue;
        if (src[((y + oy) * width + (x + ox)) * 4 + 3] < 20) n++;
      }
      if (n > 0) ctx.fillRect(x + 1, y + 1, 1, 1);
    }
  }
}

function applyDenseStitches(
  ctx: CanvasRenderingContext2D,
  src: Uint8ClampedArray,
  width: number, height: number,
  angleDeg: number, spacing: number, length: number
) {
  const angle = angleDeg * Math.PI / 180;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const nx = -dy, ny = dx;
  const diag = Math.ceil(Math.sqrt(width * width + height * height));
  const passes = Math.ceil(diag / spacing);
  const visibility = SETTINGS.stitchVisibility / 100;
  const cleanliness = SETTINGS.edgeCleanliness / 100;
  ctx.lineCap = "round";

  const alphaAt = (x: number, y: number) => {
    const sx = Math.round(x), sy = Math.round(y);
    if (sx < 0 || sy < 0 || sx >= width || sy >= height) return 0;
    return src[(sy * width + sx) * 4 + 3];
  };

  const edgeFactor = (sx: number, sy: number) => {
    let count = 0, total = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      total++;
      const x = sx + ox, y = sy + oy;
      if (x >= 0 && y >= 0 && x < width && y < height && src[(y * width + x) * 4 + 3] > 20) count++;
    }
    return count / total;
  };

  for (let p = -passes; p <= passes; p++) {
    const offset = p * spacing;
    const cx = width / 2 + nx * offset;
    const cy = height / 2 + ny * offset;

    for (let t = -diag; t <= diag; t += Math.max(2, Math.floor(length * 0.72))) {
      const x = cx + dx * t, y = cy + dy * t;
      const sx = Math.round(x), sy = Math.round(y);
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;

      const idx = (sy * width + sx) * 4;
      if (src[idx + 3] < 20) continue;

      const r = src[idx], g = src[idx + 1], b = src[idx + 2];
      const ef = edgeFactor(sx, sy);
      let localLen = length;
      let aMain = 0.96 * visibility, aShadow = 0.42 * visibility, aSpec = 0.30 * visibility;

      if (ef < 0.8) {
        const threshold = 0.35 + cleanliness * 0.25;
        const k = Math.max(0, (ef - threshold) / Math.max(0.12, 0.8 - threshold));
        localLen = length * (0.35 + 0.65 * k);
        aMain *= (0.25 + 0.75 * k);
        aShadow *= (0.25 + 0.75 * k);
        aSpec *= (0.2 + 0.8 * k);
        if (pseudoNoise(sx * 0.13, sy * 0.17) > k) continue;
      }

      const wobble = pseudoNoise(sx * 0.19, sy * 0.23) * 0.9;
      const half = localLen / 2;
      let x1 = x - dx * half + nx * wobble, y1 = y - dy * half + ny * wobble;
      let x2 = x + dx * half + nx * wobble, y2 = y + dy * half + ny * wobble;

      for (let i = 0; i < 3; i++) {
        if (alphaAt(x1, y1) < 20 || alphaAt(x2, y2) < 20) {
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          x1 = (x1 + mx) / 2; y1 = (y1 + my) / 2;
          x2 = (x2 + mx) / 2; y2 = (y2 + my) / 2;
        } else break;
      }

      ctx.strokeStyle = `rgba(${clamp(r-24,0,255)},${clamp(g-24,0,255)},${clamp(b-24,0,255)},${aShadow})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x1+0.45, y1+0.45); ctx.lineTo(x2+0.45, y2+0.45); ctx.stroke();

      ctx.strokeStyle = `rgba(${clamp(r+14,0,255)},${clamp(g+14,0,255)},${clamp(b+14,0,255)},${aMain})`;
      ctx.lineWidth = 1.45;
      ctx.beginPath(); ctx.moveTo(x1-0.2, y1-0.2); ctx.lineTo(x2-0.2, y2-0.2); ctx.stroke();

      ctx.strokeStyle = `rgba(${clamp(r+42,0,255)},${clamp(g+42,0,255)},${clamp(b+42,0,255)},${aSpec})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(x1-0.8*ny, y1+0.8*nx); ctx.lineTo(x2-0.8*ny, y2+0.8*nx); ctx.stroke();
    }
  }
}

function applySpecularThreadHighlights(ctx: CanvasRenderingContext2D, src: Uint8ClampedArray, width: number, height: number) {
  const alpha = SETTINGS.shineAmount / 100;
  const threshold = 0.82 - Math.min(0.25, SETTINGS.shineAmount / 100);
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (src[(y * width + x) * 4 + 3] < 20) continue;
      if (pseudoNoise(x * 0.12, y * 0.18) > threshold) ctx.fillRect(x, y, 1, 1);
    }
  }
}

function applyRaisedEmboss(ctx: CanvasRenderingContext2D, imageData: ImageData, width: number, height: number) {
  const src = imageData.data;
  const emboss = ctx.createImageData(width, height);
  const out = emboss.data;
  const { embossStrength: strength, embossThickness: thickness } = SETTINGS;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      if (src[idx + 3] < 20) continue;
      const light = (
        (src[((y-1)*width+(x-1))*4+3] > 20 ? 255 : 0) +
        src[((y-1)*width+x)*4+3] +
        src[(y*width+(x-1))*4+3]
      ) / 3;
      const dark = (
        (src[((y+1)*width+(x+1))*4+3] > 20 ? 255 : 0) +
        src[((y+1)*width+x)*4+3] +
        src[(y*width+(x+1))*4+3]
      ) / 3;
      const relief = (light - dark) / 255;
      const n = pseudoNoise(x * 0.41, y * 0.37) * (0.25 + thickness * 0.075);
      const highlight = Math.max(0, relief + n);
      const shadow = Math.max(0, -relief + n * 0.6);

      if (shadow > 0.02) {
        out[idx] = 0; out[idx+1] = 0; out[idx+2] = 0;
        out[idx+3] = Math.round(shadow * (strength * 0.83));
      } else {
        out[idx] = 255; out[idx+1] = 255; out[idx+2] = 255;
        out[idx+3] = Math.round(highlight * strength);
      }
    }
  }

  const embossCanvas = document.createElement("canvas");
  embossCanvas.width = width; embossCanvas.height = height;
  embossCanvas.getContext("2d")!.putImageData(emboss, 0, 0);

  ctx.save();
  for (let i = 0; i < thickness; i++) {
    ctx.globalCompositeOperation = i % 2 === 0 ? "soft-light" : "overlay";
    ctx.globalAlpha = Math.max(0.22, 1 - i * 0.12);
    ctx.drawImage(embossCanvas, 0, 0);
  }
  ctx.restore();
}

export function renderEmbroidery(imageData: ImageData, width: number, height: number): HTMLCanvasElement {
  const renderCanvas = document.createElement("canvas");
  renderCanvas.width = width; renderCanvas.height = height;
  const rctx = renderCanvas.getContext("2d", { willReadFrequently: true })!;

  const baseCanvas = document.createElement("canvas");
  baseCanvas.width = width; baseCanvas.height = height;
  baseCanvas.getContext("2d", { willReadFrequently: true })!.putImageData(imageData, 0, 0);

  const src = imageData.data;
  rctx.clearRect(0, 0, width, height);
  rctx.drawImage(baseCanvas, 0, 0);

  applyEdgeShadow(rctx, imageData, width, height, SETTINGS.edgeShadow);

  const density = SETTINGS.stitchDensity;
  const baseSpacing = Math.max(1, 8 - density);
  const length = SETTINGS.stitchLength;

  applyDenseStitches(rctx, src, width, height, -28, baseSpacing, length);
  applyDenseStitches(rctx, src, width, height,  24, Math.max(1, baseSpacing - 1), Math.max(4, length - 3));
  applyDenseStitches(rctx, src, width, height, -12, Math.max(1, baseSpacing - 2), Math.max(3, length - 6));
  applyDenseStitches(rctx, src, width, height,   8, Math.max(1, baseSpacing - 1), Math.max(3, length - 7));

  applySpecularThreadHighlights(rctx, src, width, height);
  applyRaisedEmboss(rctx, imageData, width, height);

  return renderCanvas;
}

interface Props {
  src: string;
  maxSize?: number;
  style?: React.CSSProperties;
  className?: string;
  onRendered?: (dataUrl: string) => void;
}

export default function EmbroideryPreview({ src, maxSize = 500, style, className, onRendered }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!src) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.clearRect(0, 0, w, h);

      const offscreen = document.createElement("canvas");
      offscreen.width = w; offscreen.height = h;
      const octx = offscreen.getContext("2d", { willReadFrequently: true })!;
      octx.drawImage(img, 0, 0, w, h);

      const base = octx.getImageData(0, 0, w, h);
      const quantized = quantizeImageData(base, SETTINGS.quantStep);
      octx.putImageData(quantized, 0, 0);

      const result = renderEmbroidery(quantized, w, h);
      ctx.drawImage(result, 0, 0);
      onRendered?.(canvas.toDataURL("image/png"));
    };
    img.src = src;
  }, [src, maxSize]);

  return <canvas ref={canvasRef} style={style} className={className} />;
}

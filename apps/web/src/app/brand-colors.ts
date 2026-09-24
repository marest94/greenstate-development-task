import type { CSSProperties } from 'react';
const fallback = '#173d32';
function luminance(hex: string) {
  const channels = [1, 3, 5].map(offset => { const value = parseInt(hex.slice(offset, offset + 2), 16) / 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; });
  return channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722;
}
function contrast(a: string, b: string) { const x = luminance(a); const y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
export function brandColors(value: string | null): CSSProperties {
  const brand = value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  return { '--tenant-color': brand,
    '--tenant-on-color': contrast(brand, '#ffffff') >= 4.5 ? '#ffffff' : '#000000',
    '--tenant-text-color': contrast(brand, '#f5f4ee') >= 4.5 ? brand : fallback,
    '--tenant-wordmark-color': contrast(brand, '#f5f4ee') >= 3 ? brand : fallback,
  } as CSSProperties;
}

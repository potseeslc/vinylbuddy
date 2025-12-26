// Color utility functions for extracting colors from images
export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

export function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

export function getBrightness(r, g, b) {
  return (r * 299 + g * 587 + b * 114) / 1000;
}

export function adjustBrightness(hex, amount) {
  let rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  rgb.r = Math.min(255, Math.max(0, rgb.r + amount));
  rgb.g = Math.min(255, Math.max(0, rgb.g + amount));
  rgb.b = Math.min(255, Math.max(0, rgb.b + amount));
  
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

// Simple color extraction - returns a set of colors based on the album art URL
// This creates a deterministic color palette based on the image URL
export function extractColorsFromImage(imageUrl) {
  // If no image URL, return default colors
  if (!imageUrl) {
    return Promise.resolve({
      dominant: '#1a1a2e',
      vibrant: '#16213e',
      muted: '#0f3460',
      darkVibrant: '#0d0d1a',
      lightVibrant: '#f8f9fa'
    });
  }

  // Create a simple hash from the URL
  let hash = 0;
  for (let i = 0; i < imageUrl.length; i++) {
    const char = imageUrl.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Ensure positive hash
  hash = Math.abs(hash);
  
  // Generate 5 different colors based on the hash
  const colors = [];
  for (let i = 0; i < 5; i++) {
    // Use different parts of the hash for variety
    const segment = (hash >> (i * 4)) & 0xFFFF;
    
    // Generate HSL values
    const hue = (segment * 137.508) % 360; // Golden angle approximation for good distribution
    const sat = 70 + (segment % 30); // Saturation between 70-100
    const light = 30 + (segment % 40); // Lightness between 30-70
    
    colors.push(hslToHex(hue, sat, light));
  }
  
  return Promise.resolve({
    dominant: colors[0],
    vibrant: colors[1],
    muted: colors[2],
    darkVibrant: colors[3],
    lightVibrant: colors[4]
  });
}

// Helper function to convert HSL to Hex
function hslToHex(h, s, l) {
  h /= 360;
  s /= 100;
  l /= 100;
  
  let r, g, b;
  
  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  
  const toHex = x => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

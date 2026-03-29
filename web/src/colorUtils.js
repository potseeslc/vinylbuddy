export function rgbToHex(r, g, b) {
  return `#${[r, g, b]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

export function getBrightness(r, g, b) {
  return (r * 299 + g * 587 + b * 114) / 1000;
}

export function adjustBrightness(hex, amount) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  return rgbToHex(rgb.r + amount, rgb.g + amount, rgb.b + amount);
}

function hashFallbackPalette(imageUrl) {
  let hash = 0;
  for (let i = 0; i < imageUrl.length; i += 1) {
    hash = ((hash << 5) - hash) + imageUrl.charCodeAt(i);
    hash |= 0;
  }

  hash = Math.abs(hash);
  const colors = [];
  for (let i = 0; i < 5; i += 1) {
    const segment = (hash >> (i * 4)) & 0xffff;
    const hue = (segment * 137.508) % 360;
    const saturation = 68 + (segment % 22);
    const lightness = 28 + (segment % 34);
    colors.push(hslToHex(hue, saturation, lightness));
  }

  return {
    dominant: colors[0],
    vibrant: colors[1],
    muted: colors[2],
    darkVibrant: colors[3],
    lightVibrant: colors[4],
  };
}

function hslToHex(h, s, l) {
  h /= 360;
  s /= 100;
  l /= 100;

  let r;
  let g;
  let b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return rgbToHex(r * 255, g * 255, b * 255);
}

function averageBucket(bucket) {
  if (!bucket.length) {
    return null;
  }

  const totals = bucket.reduce(
    (accumulator, color) => ({
      r: accumulator.r + color.r,
      g: accumulator.g + color.g,
      b: accumulator.b + color.b,
    }),
    { r: 0, g: 0, b: 0 },
  );

  return rgbToHex(
    totals.r / bucket.length,
    totals.g / bucket.length,
    totals.b / bucket.length,
  );
}

async function sampleImageColors(imageUrl) {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";

  const imageLoaded = new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
  });

  image.src = imageUrl;
  await imageLoaded;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Canvas context unavailable");
  }

  const targetWidth = 48;
  const aspectRatio = image.height / image.width || 1;
  canvas.width = targetWidth;
  canvas.height = Math.max(1, Math.round(targetWidth * aspectRatio));
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const all = [];
  const dark = [];
  const light = [];
  const vivid = [];
  const muted = [];

  for (let i = 0; i < data.length; i += 16) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 180) continue;

    const brightness = getBrightness(r, g, b);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    const color = { r, g, b, brightness, saturation };

    all.push(color);
    if (brightness < 95) dark.push(color);
    if (brightness > 170) light.push(color);
    if (saturation > 0.42) vivid.push(color);
    if (saturation <= 0.42) muted.push(color);
  }

  return {
    dominant: averageBucket(all),
    vibrant: averageBucket(vivid) || averageBucket(all),
    muted: averageBucket(muted) || averageBucket(all),
    darkVibrant: averageBucket(dark) || averageBucket(vivid) || averageBucket(all),
    lightVibrant: averageBucket(light) || averageBucket(vivid) || averageBucket(all),
  };
}

export async function extractColorsFromImage(imageUrl) {
  if (!imageUrl) {
    return hashFallbackPalette("vinylbuddy-default");
  }

  try {
    return await sampleImageColors(imageUrl);
  } catch (error) {
    return hashFallbackPalette(imageUrl);
  }
}

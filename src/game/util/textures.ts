/**
 * Procedural texture synthesis. Every image in the game is generated in-browser at
 * load time — the project ships no third-party textures or photographs.
 */
import {
  ADDRESS_CLAMP_TO_EDGE,
  ADDRESS_REPEAT,
  FILTER_LINEAR,
  FILTER_LINEAR_MIPMAP_LINEAR,
  PIXELFORMAT_RGBA8,
  PIXELFORMAT_SRGBA8,
  Texture,
  type GraphicsDevice,
} from 'playcanvas';
import { WORLD } from '../config';
import { clamp, lerp, smoothstep } from './math';
import { createNoise2D } from './noise';

type Canvas2D = HTMLCanvasElement;

function makeCanvas(width: number, height: number): Canvas2D {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context2d(canvas: Canvas2D): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable — texture synthesis cannot run.');
  return ctx;
}

export interface TextureOptions {
  srgb?: boolean;
  repeat?: boolean;
  anisotropy?: number;
  mipmaps?: boolean;
  name?: string;
}

export function createTexture(device: GraphicsDevice, source: Canvas2D, options: TextureOptions = {}): Texture {
  const { srgb = true, repeat = false, anisotropy = 4, mipmaps = true, name } = options;
  const texture = new Texture(device, {
    name: name ?? 'procedural-texture',
    width: source.width,
    height: source.height,
    format: srgb ? PIXELFORMAT_SRGBA8 : PIXELFORMAT_RGBA8,
    mipmaps,
    minFilter: mipmaps ? FILTER_LINEAR_MIPMAP_LINEAR : FILTER_LINEAR,
    magFilter: FILTER_LINEAR,
    addressU: repeat ? ADDRESS_REPEAT : ADDRESS_CLAMP_TO_EDGE,
    addressV: repeat ? ADDRESS_REPEAT : ADDRESS_CLAMP_TO_EDGE,
    anisotropy,
  });
  texture.setSource(source);
  texture.upload();
  return texture;
}

/** Tileable value noise — seams do not appear when a texture repeats. */
function tileNoise(x: number, y: number, period: number, seed: number): number {
  const hash = (ix: number, iy: number): number => {
    const h = Math.sin((((ix % period) + period) % period) * 127.1 + (((iy % period) + period) % period) * 311.7 + seed) * 43758.5453;
    return h - Math.floor(h);
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = x - xi;
  const ty = y - yi;
  const u = tx * tx * (3 - 2 * tx);
  const v = ty * ty * (3 - 2 * ty);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

function fbmTile(x: number, y: number, period: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += tileNoise(x * freq, y * freq, period * freq, seed + o * 17) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/* -------------------------------------------------------------------------- */
/* Sky                                                                        */
/* -------------------------------------------------------------------------- */

export interface SkyResult {
  canvas: Canvas2D;
  sunDirection: [number, number, number];
}

/** Golden-hour sky in equirectangular projection, with drifting cloud bands. */
export function generateSkyTexture(): SkyResult {
  const width = 1024;
  const height = 512;
  const canvas = makeCanvas(width, height);
  const ctx = context2d(canvas);
  const image = ctx.createImageData(width, height);
  const data = image.data;
  const noise = createNoise2D(3311);

  const azimuth = WORLD.sunAzimuth;
  const elevation = WORLD.sunElevation;
  const sun: [number, number, number] = [
    Math.cos(elevation) * Math.sin(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.cos(azimuth),
  ];

  const zenith = [0.055, 0.12, 0.18];
  const upper = [0.16, 0.29, 0.36];
  const mid = [0.48, 0.6, 0.62];
  const horizonWarm = [0.94, 0.7, 0.49];
  const horizonCool = [0.52, 0.66, 0.66];
  const ground = [0.12, 0.14, 0.13];

  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    const lat = (0.5 - v) * Math.PI;
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1);
      const lon = (u - 0.5) * Math.PI * 2;
      const dx = cosLat * Math.sin(lon);
      const dy = sinLat;
      const dz = cosLat * Math.cos(lon);

      let r: number;
      let g: number;
      let b: number;
      if (dy >= 0) {
        const t = clamp(dy, 0, 1);
        // Three-stop vertical gradient.
        if (t < 0.35) {
          const k = smoothstep(0, 0.35, t);
          r = lerp(horizonWarm[0], mid[0], k);
          g = lerp(horizonWarm[1], mid[1], k);
          b = lerp(horizonWarm[2], mid[2], k);
        } else if (t < 0.72) {
          const k = smoothstep(0.35, 0.72, t);
          r = lerp(mid[0], upper[0], k);
          g = lerp(mid[1], upper[1], k);
          b = lerp(mid[2], upper[2], k);
        } else {
          const k = smoothstep(0.72, 1, t);
          r = lerp(upper[0], zenith[0], k);
          g = lerp(upper[1], zenith[1], k);
          b = lerp(upper[2], zenith[2], k);
        }

        // Cool band just above the horizon, plus azimuthal warm/cool variation.
        const horizonBand = 1 - smoothstep(0.0, 0.13, t);
        const azimuthal = 0.5 + 0.5 * Math.cos(lon - azimuth);
        r = lerp(r, lerp(horizonCool[0], horizonWarm[0], azimuthal), horizonBand * 0.55);
        g = lerp(g, lerp(horizonCool[1], horizonWarm[1], azimuthal), horizonBand * 0.5);
        b = lerp(b, lerp(horizonCool[2], horizonWarm[2], azimuthal), horizonBand * 0.45);

        // Sun glow (two lobes: broad atmospheric scatter + tight disc halo).
        const sunDot = clamp(dx * sun[0] + dy * sun[1] + dz * sun[2], -1, 1);
        const broad = Math.pow(clamp(sunDot, 0, 1), 6) * 0.55;
        const tight = Math.pow(clamp(sunDot, 0, 1), 260) * 1.7 + Math.pow(clamp(sunDot, 0, 1), 900) * 1.2;
        r += broad * 0.5 + tight * 1.0;
        g += broad * 0.32 + tight * 0.82;
        b += broad * 0.16 + tight * 0.56;

        // Cloud deck: projected onto a plane so bands compress toward the horizon.
        const cloudU = u * 7.5;
        const cloudV = (1 - t) * 3.4;
        const warpX = noise.fbm(u * 4 + 11, v * 3 - 4, 3) * 0.55;
        const warpY = noise.fbm(u * 3 - 7, v * 4 + 9, 3) * 0.35;
        const cloudNoise = noise.fbm(cloudU + warpX, cloudV + warpY, 5);
        let density = smoothstep(0.04, 0.42, cloudNoise) * (1 - smoothstep(0.18, 0.62, t)) * 0.95;
        density *= smoothstep(0.02, 0.1, t);
        const sunWarmth = Math.pow(clamp(sunDot, 0, 1), 3);
        const lit = clamp(density, 0, 0.92);
        const cloudColor = [
          lerp(0.55, 1.0, sunWarmth),
          lerp(0.58, 0.84, sunWarmth),
          lerp(0.63, 0.72, sunWarmth),
        ];
        r = lerp(r, cloudColor[0], lit);
        g = lerp(g, cloudColor[1], lit);
        b = lerp(b, cloudColor[2], lit);

        // Faint high-atmosphere veil — original-world flavour, not Earth's aurora.
        const veil = Math.exp(-Math.pow((t - 0.82) / 0.1, 2)) * (0.35 + 0.65 * Math.pow(Math.cos(lon * 2 + 1.7), 2));
        r += veil * 0.02;
        g += veil * 0.07;
        b += veil * 0.075;
      } else {
        // Below the horizon: dim ground haze; terrain covers most of this.
        const depth = clamp(-dy, 0, 1);
        const k = smoothstep(0, 0.35, depth);
        r = lerp(horizonCool[0] * 0.62, ground[0], k);
        g = lerp(horizonCool[1] * 0.62, ground[1], k);
        b = lerp(horizonCool[2] * 0.62, ground[2], k);
      }

      const i = (y * width + x) * 4;
      data[i] = clamp(r, 0, 1) * 255;
      data[i + 1] = clamp(g, 0, 1) * 255;
      data[i + 2] = clamp(b, 0, 1) * 255;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  // Upscale for a smoother skybox gradient while keeping generation cost low.
  const finalCanvas = makeCanvas(2048, 1024);
  const finalCtx = context2d(finalCanvas);
  finalCtx.imageSmoothingEnabled = true;
  finalCtx.imageSmoothingQuality = 'high';
  finalCtx.drawImage(canvas, 0, 0, finalCanvas.width, finalCanvas.height);

  // A believable sun disc with bloom-like falloff, placed by the same direction used for lighting.
  const sunU = 0.5 + azimuth / (Math.PI * 2);
  const sunV = 0.5 - elevation / Math.PI;
  const cx = sunU * finalCanvas.width;
  const cy = sunV * finalCanvas.height;
  const gradient = finalCtx.createRadialGradient(cx, cy, 0, cx, cy, 74);
  gradient.addColorStop(0, 'rgba(255, 251, 236, 1)');
  gradient.addColorStop(0.12, 'rgba(255, 246, 222, 0.95)');
  gradient.addColorStop(0.3, 'rgba(255, 224, 178, 0.42)');
  gradient.addColorStop(0.65, 'rgba(255, 200, 150, 0.12)');
  gradient.addColorStop(1, 'rgba(255, 190, 140, 0)');
  finalCtx.globalCompositeOperation = 'screen';
  finalCtx.fillStyle = gradient;
  finalCtx.beginPath();
  finalCtx.arc(cx, cy, 74, 0, Math.PI * 2);
  finalCtx.fill();
  finalCtx.globalCompositeOperation = 'source-over';

  return { canvas: finalCanvas, sunDirection: sun };
}

/* -------------------------------------------------------------------------- */
/* Surface detail                                                             */
/* -------------------------------------------------------------------------- */

export type DetailKind = 'grass' | 'rock' | 'sand' | 'stone';

/** Near-white, tileable detail maps multiplied by vertex colour on the terrain and props. */
export function generateDetailTexture(kind: DetailKind, size = 512): Canvas2D {
  const canvas = makeCanvas(size, size);
  const ctx = context2d(canvas);
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const seed = kind === 'grass' ? 12 : kind === 'rock' ? 33 : kind === 'sand' ? 48 : 71;
  const period = 8;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * period;
      const v = (y / size) * period;
      const coarse = fbmTile(u, v, period, seed, 4);
      const fine = fbmTile(u * 4, v * 4, period * 4, seed + 5, 3);
      let value: number;
      let tintR = 1;
      let tintG = 1;
      let tintB = 1;

      if (kind === 'grass') {
        value = 0.74 + coarse * 0.3 + (fine - 0.5) * 0.2;
        // Sparse dark tufts and pale dry blades.
        const blade = fbmTile(u * 9, v * 3, period * 9, seed + 21, 2);
        value -= smoothstep(0.62, 0.8, blade) * 0.22;
        tintR = 0.94;
        tintG = 1;
        tintB = 0.9;
      } else if (kind === 'rock' || kind === 'stone') {
        const strata = Math.sin(v * Math.PI * 3 + coarse * 5) * 0.5 + 0.5;
        value = 0.62 + coarse * 0.24 + strata * 0.16 + (fine - 0.5) * 0.12;
        const crack = 1 - smoothstep(0.02, 0.08, Math.abs(coarse - 0.5));
        value -= crack * 0.18;
        tintR = 1;
        tintG = 0.98;
        tintB = 0.94;
      } else {
        const grain = fbmTile(u * 12, v * 12, period * 12, seed + 9, 3);
        value = 0.82 + (grain - 0.5) * 0.16 + (coarse - 0.5) * 0.1;
        tintR = 1;
        tintG = 0.97;
        tintB = 0.9;
      }

      const i = (y * size + x) * 4;
      data[i] = clamp(value * tintR, 0, 1) * 255;
      data[i + 1] = clamp(value * tintG, 0, 1) * 255;
      data[i + 2] = clamp(value * tintB, 0, 1) * 255;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Tileable water normal map from crossing sine ripples. */
export function generateWaterNormalMap(size = 512): Canvas2D {
  const canvas = makeCanvas(size, size);
  const ctx = context2d(canvas);
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const tau = Math.PI * 2;
  const height = (u: number, v: number): number =>
    Math.sin(u * tau * 3 + Math.sin(v * tau * 2) * 0.9) * 0.5 +
    Math.sin(v * tau * 5 - Math.cos(u * tau * 3) * 1.1) * 0.3 +
    Math.sin((u + v) * tau * 8) * 0.12;
  const step = 1 / size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const hL = height((u - step + 1) % 1, v);
      const hR = height((u + step) % 1, v);
      const hD = height(u, (v - step + 1) % 1);
      const hU = height(u, (v + step) % 1);
      const nx = (hL - hR) * 1.6;
      const ny = (hD - hU) * 1.6;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Soft radial sprite used for floating motes and water sparkle. */
export function generateGlowSprite(size = 128, color: [number, number, number] = [1, 0.93, 0.8]): Canvas2D {
  const canvas = makeCanvas(size, size);
  const ctx = context2d(canvas);
  const c = size / 2;
  const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
  const [r, g, b] = color.map((v) => Math.round(v * 255));
  gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
  gradient.addColorStop(0.25, `rgba(${r}, ${g}, ${b}, 0.55)`);
  gradient.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, 0.12)`);
  gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

/** Vertical light shaft used for the Echo Gate beam and skyline god rays. */
export function generateBeamTexture(width = 128, height = 512): Canvas2D {
  const canvas = makeCanvas(width, height);
  const ctx = context2d(canvas);
  const gradient = ctx.createLinearGradient(0, height, 0, 0);
  gradient.addColorStop(0, 'rgba(121, 240, 207, 0.55)');
  gradient.addColorStop(0.35, 'rgba(121, 240, 207, 0.22)');
  gradient.addColorStop(0.75, 'rgba(121, 240, 207, 0.06)');
  gradient.addColorStop(1, 'rgba(121, 240, 207, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  const sideFade = ctx.createLinearGradient(0, 0, width, 0);
  sideFade.addColorStop(0, 'rgba(0,0,0,0)');
  sideFade.addColorStop(0.5, 'rgba(0,0,0,1)');
  sideFade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = sideFade;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

/** Small dust sprite for the ambient mote field. */
export function generateMoteSprite(): Canvas2D {
  return generateGlowSprite(64, [0.85, 1, 0.94]);
}

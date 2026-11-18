// Procedural canvas textures: every surface in Marisol Bay is painted at runtime,
// so the game ships no image assets and makes no network request.
import * as THREE from 'three';
import { makeRng, pickRandom } from './utils.js';

function canvasTexture(width, height, painter) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  painter(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const FACADE_PALETTES = [
  ['#e8dcc8', '#d8c9ae', '#c9b797'],
  ['#f2e6d0', '#e6d5b8', '#d9c39a'],
  ['#dfe6ea', '#c9d4da', '#b3c2c9'],
  ['#e9c9a8', '#ddb28a', '#cfa06f'],
  ['#f5d9c4', '#eec6a6', '#e2b28a'],
  ['#cfd8c9', '#b9c6b1', '#a3b49a'],
];

export function makeBuildingTexture(seed) {
  const rng = makeRng(seed);
  const palette = pickRandom(rng, FACADE_PALETTES);
  const base = palette[0];
  const trim = palette[1];
  const cols = 4 + Math.floor(rng() * 4);
  const rows = 5 + Math.floor(rng() * 6);
  const litRatio = 0.25 + rng() * 0.4;
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    // Subtle vertical grime variation.
    for (let x = 0; x < w; x += 4) {
      ctx.fillStyle = `rgba(0,0,0,${rng() * 0.05})`;
      ctx.fillRect(x, 0, 4, h);
    }
    const marginX = 14;
    const marginY = 12;
    const cellW = (w - marginX * 2) / cols;
    const cellH = (h - marginY * 2) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = marginX + c * cellW + cellW * 0.18;
        const y = marginY + r * cellH + cellH * 0.2;
        const ww = cellW * 0.64;
        const hh = cellH * 0.6;
        const lit = rng() < litRatio;
        ctx.fillStyle = trim;
        ctx.fillRect(x - 2, y - 2, ww + 4, hh + 4);
        ctx.fillStyle = lit ? '#ffe9a8' : (rng() < 0.5 ? '#2e3d4a' : '#3d5266');
        ctx.fillRect(x, y, ww, hh);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(x, y, ww, hh * 0.25);
      }
    }
    // Roof parapet line.
    ctx.fillStyle = trim;
    ctx.fillRect(0, 0, w, 8);
  });
}

export function makeGlassTowerTexture(seed) {
  const rng = makeRng(seed);
  return canvasTexture(256, 256, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#7fb2d9');
    gradient.addColorStop(0.5, '#5d94c4');
    gradient.addColorStop(1, '#3d6f9e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    const cols = 8;
    const rows = 12;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const shade = 0.85 + rng() * 0.3;
        ctx.fillStyle = `rgba(${Math.floor(120 * shade)},${Math.floor(170 * shade)},${Math.floor(215 * shade)},0.85)`;
        ctx.fillRect(c * (w / cols) + 2, r * (h / rows) + 2, w / cols - 4, h / rows - 4);
        if (rng() < 0.2) {
          ctx.fillStyle = 'rgba(255,240,190,0.9)';
          ctx.fillRect(c * (w / cols) + 2, r * (h / rows) + 2, w / cols - 4, h / rows - 4);
        }
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(0, 0, w, 6);
  });
}

export function makeRoadTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#33373c';
    ctx.fillRect(0, 0, w, h);
    // Asphalt speckle.
    const rng = makeRng(99);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(255,255,255,${rng() * 0.08})`;
      ctx.fillRect(rng() * w, rng() * h, 2, 2);
      ctx.fillStyle = `rgba(0,0,0,${rng() * 0.15})`;
      ctx.fillRect(rng() * w, rng() * h, 3, 2);
    }
    // Centre double yellow line (vertical) and edge lines.
    ctx.fillStyle = '#d9a521';
    ctx.fillRect(w / 2 - 5, 0, 3, h);
    ctx.fillRect(w / 2 + 2, 0, 3, h);
    ctx.fillStyle = '#c8cdd2';
    ctx.fillRect(6, 0, 3, h);
    ctx.fillRect(w - 9, 0, 3, h);
    // Lane dashes.
    ctx.fillStyle = '#e8ecf0';
    for (let y = 0; y < h; y += 64) ctx.fillRect(w / 4 - 2, y + 8, 4, 32);
    for (let y = 0; y < h; y += 64) ctx.fillRect((3 * w) / 4 - 2, y + 8, 4, 32);
  });
}

export function makeSidewalkTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#b7ada0';
    ctx.fillRect(0, 0, w, h);
    const rng = makeRng(7);
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = `rgba(0,0,0,${rng() * 0.08})`;
      ctx.fillRect(rng() * w, rng() * h, 2, 2);
    }
    ctx.strokeStyle = 'rgba(80,70,60,0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
  });
}

export function makeSandTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#e6d3a3';
    ctx.fillRect(0, 0, w, h);
    const rng = makeRng(21);
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = rng() < 0.5 ? `rgba(255,255,255,${rng() * 0.25})` : `rgba(150,120,70,${rng() * 0.2})`;
      ctx.fillRect(rng() * w, rng() * h, 2, 2);
    }
  });
}

export function makeGrassTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#5d8a3c';
    ctx.fillRect(0, 0, w, h);
    const rng = makeRng(33);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = rng() < 0.5 ? `rgba(255,255,200,${rng() * 0.12})` : `rgba(20,60,20,${rng() * 0.25})`;
      ctx.fillRect(rng() * w, rng() * h, 2, 3);
    }
  });
}

export function makePalmFrondTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    // Nine filled leaf blades radiating from the crown, seen from above.
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(angle);
      const gradient = ctx.createLinearGradient(0, 0, 58, 0);
      gradient.addColorStop(0, '#4f9440');
      gradient.addColorStop(1, '#2f6b22');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.quadraticCurveTo(30, -11, 58, -2);
      ctx.quadraticCurveTo(30, 6, 0, 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,220,0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(2, 0);
      ctx.lineTo(54, -1);
      ctx.stroke();
      ctx.restore();
    }
    // Coconut cluster at the crown.
    ctx.fillStyle = '#6b4a2a';
    ctx.beginPath();
    ctx.arc(w / 2 - 5, h / 2 + 4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(w / 2 + 5, h / 2 + 4, 5, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function makeSignTexture(lines, background, foreground, accent) {
  return canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = accent || foreground;
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = foreground;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (lines.length === 1) {
      ctx.font = '900 62px "Arial Narrow", Arial, sans-serif';
      ctx.fillText(lines[0], w / 2, h / 2 + 2);
    } else {
      ctx.font = '900 52px "Arial Narrow", Arial, sans-serif';
      ctx.fillText(lines[0], w / 2, h / 2 - 26);
      ctx.font = '700 30px "Arial Narrow", Arial, sans-serif';
      ctx.fillText(lines[1], w / 2, h / 2 + 30);
    }
  });
}

export function makeBillboardTexture(lines, background, foreground) {
  return canvasTexture(512, 256, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, background);
    gradient.addColorStop(1, '#1a2a3a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = foreground;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 64px "Arial Narrow", Arial, sans-serif';
    ctx.fillText(lines[0], w / 2, h / 2 - 34);
    ctx.font = '700 36px "Arial Narrow", Arial, sans-serif';
    ctx.fillText(lines[1], w / 2, h / 2 + 34);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, w - 16, h - 16);
  });
}

export function makeSoftCircleTexture(inner, outer) {
  return canvasTexture(64, 64, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    gradient.addColorStop(0, inner);
    gradient.addColorStop(1, outer);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
}

export function makeCloudTexture() {
  return canvasTexture(256, 128, (ctx) => {
    ctx.clearRect(0, 0, 256, 128);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    const blobs = [[70, 80, 34], [120, 62, 44], [175, 78, 36], [105, 88, 40], [150, 92, 32]];
    for (const [x, y, r] of blobs) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

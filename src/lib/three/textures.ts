import * as THREE from 'three';

// --- Noise utilities ---
function noise2D(x: number, y: number, seed: number): number {
	const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 43.123) * 43758.5453;
	return n - Math.floor(n);
}

function smoothNoise(x: number, y: number, seed: number): number {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const fx = x - ix;
	const fy = y - iy;

	const a = noise2D(ix, iy, seed);
	const b = noise2D(ix + 1, iy, seed);
	const c = noise2D(ix, iy + 1, seed);
	const d = noise2D(ix + 1, iy + 1, seed);

	const u = fx * fx * (3 - 2 * fx);
	const v = fy * fy * (3 - 2 * fy);

	return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function fractalNoise(x: number, y: number, seed: number, octaves: number): number {
	let value = 0;
	let amplitude = 1;
	let frequency = 1;
	let maxValue = 0;
	for (let i = 0; i < octaves; i++) {
		value += smoothNoise(x * frequency, y * frequency, seed + i) * amplitude;
		maxValue += amplitude;
		amplitude *= 0.5;
		frequency *= 2;
	}
	return value / maxValue;
}

// Distance from a point to an ellipse centered at (cx, cy)
function ellipseDist(x: number, y: number, cx: number, cy: number, rx: number, ry: number): number {
	const dx = (x - cx) / rx;
	const dy = (y - cy) / ry;
	return Math.sqrt(dx * dx + dy * dy);
}

const TEX_W = 1024;
const TEX_H = 512;

type PlanetTextureType =
	| 'mercury' | 'venus' | 'earth' | 'mars'
	| 'jupiter' | 'saturn' | 'uranus' | 'neptune'
	| 'saturnRing' | 'uranusRing' | 'sun' | 'earthClouds' | 'earthBump' | 'moon';

export function createPlanetTexture(type: PlanetTextureType): THREE.CanvasTexture {
	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d')!;
	const width = TEX_W;
	const height = TEX_H;
	canvas.width = width;
	canvas.height = height;

	const imageData = ctx.createImageData(width, height);
	const data = imageData.data;

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const u = x / width;
			const v = y / height;
			const idx = (y * width + x) * 4;
			const lat = Math.abs(v - 0.5) * 2; // 0 at equator, 1 at poles

			let r = 0, g = 0, b = 0;

			switch (type) {
				case 'mercury': {
					const n = fractalNoise(u * 40, v * 40, 1, 6);
					const n2 = fractalNoise(u * 100, v * 100, 2, 4);
					const n3 = fractalNoise(u * 200, v * 200, 3, 3);
					// Cratered surface
					const c = 100 + n * 70 + n2 * 30 + n3 * 15;
					r = c * 0.85;
					g = c * 0.80;
					b = c * 0.70;
					// Darker craters
					if (n3 < 0.3) {
						const dark = (0.3 - n3) * 2;
						r *= 1 - dark * 0.3;
						g *= 1 - dark * 0.3;
						b *= 1 - dark * 0.3;
					}
					break;
				}
				case 'venus': {
					// Thick yellowish cloud bands with swirls
					const band = Math.sin(v * Math.PI * 8 + fractalNoise(u * 6, v * 4, 3, 3) * 3) * 0.5 + 0.5;
					const n = fractalNoise(u * 12, v * 20, 4, 5);
					const swirl = fractalNoise(u * 30, v * 8, 5, 3);
					const c = 170 + band * 40 + n * 30 + swirl * 20;
					r = Math.min(255, c + 20);
					g = c * 0.82;
					b = c * 0.45;
					break;
				}
				case 'earth': {
					// Continents using layered noise
					const n = fractalNoise(u * 18, v * 18, 5, 6);
					const n2 = fractalNoise(u * 40, v * 40, 6, 4);
					const continent = n * 0.7 + n2 * 0.3;

					if (lat > 0.82) {
						// Polar ice caps
						const iceVar = fractalNoise(u * 30, v * 30, 7, 3);
						r = 230 + iceVar * 25;
						g = 235 + iceVar * 20;
						b = 245 + iceVar * 10;
					} else if (continent > 0.52) {
						const elev = (continent - 0.52) * 2.5;
						if (elev > 0.35) {
							// Mountains - brown/gray
							r = 90 + elev * 50 + n2 * 20;
							g = 70 + elev * 35;
							b = 40 + elev * 20;
						} else if (elev > 0.15) {
							// Lowlands - green
							r = 40 + elev * 50 + n2 * 15;
							g = 90 + elev * 70;
							b = 25 + elev * 20;
						} else {
							// Coastlines / beaches
							r = 180 + elev * 40;
							g = 160 + elev * 30;
							b = 100 + elev * 20;
						}
					} else {
						// Oceans - depth gradient
						const depth = (0.52 - continent) * 2;
						r = 5 + depth * 15;
						g = 30 + depth * 50;
						b = 70 + depth * 90;
					}
					break;
				}
				case 'earthClouds': {
					// Transparent cloud layer
					const n = fractalNoise(u * 20, v * 20, 8, 5);
					const n2 = fractalNoise(u * 50, v * 50, 9, 3);
					const cloud = n * 0.6 + n2 * 0.4;
					const alpha = cloud > 0.55 ? Math.min(255, (cloud - 0.55) * 600) : 0;
					// Wispy clouds near poles
					const polar = lat > 0.7 ? (lat - 0.7) * 3 : 0;
					const polarAlpha = Math.min(255, polar * 200 + (cloud > 0.5 ? (cloud - 0.5) * 300 : 0));
					const finalAlpha = Math.max(alpha, polarAlpha);
					r = 255; g = 255; b = 255;
					data[idx + 3] = Math.min(255, finalAlpha);
					break;
				}
				case 'earthBump': {
					// Bump map for Earth (height map for normal-like effect)
					const n = fractalNoise(u * 18, v * 18, 5, 5);
					const continent = n;
					if (continent > 0.52) {
						const elev = (continent - 0.52) * 2.5;
						const c = 128 + elev * 100;
						r = c; g = c; b = c;
					} else {
						r = 80; g = 80; b = 80;
					}
					data[idx + 3] = 255;
					break;
				}
				case 'mars': {
					// Detailed surface with craters, canyons, dust
					const n = fractalNoise(u * 25, v * 25, 10, 6);
					const n2 = fractalNoise(u * 60, v * 60, 11, 4);
					const n3 = fractalNoise(u * 150, v * 150, 12, 3);

					if (lat > 0.90) {
						// Polar caps
						r = 235; g = 240; b = 245;
					} else {
						// Dusty red surface with darker regions
						const c = 130 + n * 60 + n2 * 25 + n3 * 10;
						r = Math.min(255, c + 20);
						g = c * 0.42;
						b = c * 0.20;
						// Dark basaltic regions
						if (n < 0.35) {
							const dark = (0.35 - n) * 2;
							r *= 1 - dark * 0.4;
							g *= 1 - dark * 0.4;
							b *= 1 - dark * 0.3;
						}
					}
					break;
				}
				case 'jupiter': {
					// Complex banded atmosphere with turbulence
					const bandFreq = 14;
					const band = Math.sin(v * Math.PI * bandFreq) * 0.5 + 0.5;
					const bandSharp = Math.pow(band, 0.5);

					// Turbulent flow along bands
					const flow = fractalNoise(u * 8 + band * 4, v * bandFreq * 0.5, 10, 5);
					const turbulence = fractalNoise(u * 30 + flow * 5, v * 40, 11, 4);
					const detail = fractalNoise(u * 80, v * 80, 12, 3);

					// Zone colors: cream, brown, orange bands
					const c = 150 + bandSharp * 70 + turbulence * 25 + detail * 10;
					r = Math.min(255, c * 0.95);
					g = Math.min(255, c * 0.78);
					b = Math.min(255, c * 0.50);

					// Dark belts
					if (band < 0.35) {
						r *= 0.75; g *= 0.70; b *= 0.60;
					}

					// Great Red Spot - oval storm in southern hemisphere
					const grsX = 0.75, grsY = 0.65, grsRX = 0.06, grsRY = 0.04;
					const grsDist = ellipseDist(u, v, grsX, grsY, grsRX, grsRY);
					if (grsDist < 1.0) {
						const grsIntensity = 1.0 - grsDist;
						const grsSwirl = fractalNoise(u * 60, v * 60, 13, 3);
						r = r * (1 - grsIntensity * 0.7) + (180 + grsSwirl * 40) * grsIntensity * 0.7;
						g = g * (1 - grsIntensity * 0.7) + (60 + grsSwirl * 30) * grsIntensity * 0.7;
						b = b * (1 - grsIntensity * 0.7) + (30 + grsSwirl * 20) * grsIntensity * 0.7;
					}
					break;
				}
				case 'saturn': {
					// Subtle smooth bands
					const band = Math.sin(v * Math.PI * 10) * 0.5 + 0.5;
					const n = fractalNoise(u * 12, v * 20, 14, 4);
					const detail = fractalNoise(u * 40, v * 40, 15, 3);
					const c = 175 + band * 45 + n * 18 + detail * 8;
					r = Math.min(255, c * 0.96);
					g = Math.min(255, c * 0.86);
					b = Math.min(255, c * 0.60);
					break;
				}
				case 'uranus': {
					// Very smooth pale cyan with faint bands
					const band = Math.sin(v * Math.PI * 5) * 0.2 + 0.8;
					const n = fractalNoise(u * 6, v * 10, 16, 3);
					const c = 130 + band * 30 + n * 10;
					r = c * 0.55;
					g = c * 0.82;
					b = c * 0.92;
					break;
				}
				case 'neptune': {
					// Deep blue with storm features
					const band = Math.sin(v * Math.PI * 6) * 0.25 + 0.75;
					const n = fractalNoise(u * 12, v * 18, 17, 5);
					const storm = fractalNoise(u * 25, v * 25, 18, 3);
					const c = 55 + band * 45 + n * 18;
					r = c * 0.28;
					g = c * 0.48;
					b = Math.min(255, c * 0.95 + storm * 25);

					// Great Dark Spot
					const gdsX = 0.35, gdsY = 0.55, gdsRX = 0.05, gdsRY = 0.035;
					const gdsDist = ellipseDist(u, v, gdsX, gdsY, gdsRX, gdsRY);
					if (gdsDist < 1.0) {
						const gdsIntensity = 1.0 - gdsDist;
						r *= 1 - gdsIntensity * 0.5;
						g *= 1 - gdsIntensity * 0.5;
						b = b * (1 - gdsIntensity * 0.3) + 30 * gdsIntensity;
					}
					break;
				}
				case 'saturnRing': {
					// Multiple ring divisions with realistic gaps
					const ringPos = u;
					const n = fractalNoise(ringPos * 120, 0, 20, 5);
					const n2 = fractalNoise(ringPos * 300, 0, 21, 3);
					const fine = fractalNoise(ringPos * 600, 0, 22, 2);

					// Ring density profile (Cassini division + Encke gap)
					let density = 1.0;
					// Cassini Division (at ~63% of ring radius)
					if (ringPos > 0.58 && ringPos < 0.63) density *= 0.15;
					// Encke Gap (at ~83%)
					if (ringPos > 0.81 && ringPos < 0.83) density *= 0.2;
					// Faint inner edge
					if (ringPos < 0.08) density *= ringPos * 12;
					// Faint outer edge
					if (ringPos > 0.95) density *= (1 - ringPos) * 20;

					const c = (130 + n * 50 + n2 * 25 + fine * 10) * density;
					r = Math.min(255, c * 0.96);
					g = Math.min(255, c * 0.86);
					b = Math.min(255, c * 0.66);
					data[idx + 3] = Math.min(255, density * 255);
					break;
				}
				case 'uranusRing': {
					// Faint narrow rings
					const ringPos = u;
					let density = 0;
					// Narrow rings at specific positions
					if (Math.abs(ringPos - 0.3) < 0.02) density = 0.5;
					if (Math.abs(ringPos - 0.45) < 0.015) density = 0.4;
					if (Math.abs(ringPos - 0.6) < 0.01) density = 0.3;
					if (Math.abs(ringPos - 0.75) < 0.01) density = 0.25;
					const c = 100 * density;
					r = c * 0.6; g = c * 0.8; b = c * 0.9;
					data[idx + 3] = Math.min(255, density * 255);
					break;
				}
				case 'moon': {
					// Lunar surface with maria and craters
					const n = fractalNoise(u * 35, v * 35, 30, 6);
					const n2 = fractalNoise(u * 90, v * 90, 31, 4);
					const n3 = fractalNoise(u * 200, v * 200, 32, 3);

					// Maria (dark seas)
					const maria = fractalNoise(u * 8, v * 8, 33, 3);
					const isMaria = maria > 0.6 && maria < 0.75;

					const c = 110 + n * 50 + n2 * 20 + n3 * 8;
					if (isMaria) {
						r = c * 0.55; g = c * 0.55; b = c * 0.60;
					} else {
						r = c * 0.82; g = c * 0.80; b = c * 0.75;
					}
					break;
				}
				case 'sun': {
					// Granulated sun surface with brighter spots
					const n = fractalNoise(u * 40, v * 40, 20, 6);
					const n2 = fractalNoise(u * 100, v * 100, 21, 4);
					const granule = fractalNoise(u * 200, v * 200, 22, 3);
					const bright = fractalNoise(u * 15, v * 15, 23, 3);

					const c = 220 + n * 35 + n2 * 15 + granule * 8;
					r = 255;
					g = Math.min(255, 200 + c * 0.15 + bright * 30);
					b = Math.min(255, 80 + granule * 40 + bright * 20);
					break;
				}
			}

			data[idx] = Math.min(255, r);
			data[idx + 1] = Math.min(255, g);
			data[idx + 2] = Math.min(255, b);
			if (data[idx + 3] === 0) {
				data[idx + 3] = 255;
			}
		}
	}

	ctx.putImageData(imageData, 0, 0);
	const texture = new THREE.CanvasTexture(canvas);
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.ClampToEdgeWrapping;
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.needsUpdate = true;
	return texture;
}

// Create a glowing sun texture with corona effect
export function createSunGlowTexture(): THREE.CanvasTexture {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 512;
	const ctx = canvas.getContext('2d')!;

	const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
	gradient.addColorStop(0, 'rgba(255, 220, 100, 0.9)');
	gradient.addColorStop(0.15, 'rgba(255, 180, 60, 0.5)');
	gradient.addColorStop(0.35, 'rgba(255, 120, 40, 0.2)');
	gradient.addColorStop(0.7, 'rgba(255, 80, 20, 0.05)');
	gradient.addColorStop(1, 'rgba(255, 60, 10, 0)');

	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, 512, 512);

	const texture = new THREE.CanvasTexture(canvas);
	texture.needsUpdate = true;
	return texture;
}

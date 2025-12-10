import type { OrbitalElements } from '$lib/types';

const DEG_TO_RAD = Math.PI / 180;
const AU_TO_SCENE = 50; // 1 AU = 50 scene units for display

// Solve Kepler's equation: M = E - e*sin(E) using Newton-Raphson
// Enhanced for near-parabolic orbits (e close to 1)
export function solveKepler(M: number, e: number, tol = 1e-8, maxIter = 50): number {
	// Normalize M to [-PI, PI] for better convergence
	let Mn = M % (2 * Math.PI);
	if (Mn > Math.PI) Mn -= 2 * Math.PI;
	if (Mn < -Math.PI) Mn += 2 * Math.PI;

	// For near-parabolic orbits, use a better initial guess
	let E: number;
	if (e > 0.8) {
		// Parabolic approximation: E ≈ M + e*sin(M) for small M
		// For large M near parabolic, use M + e as starting point
		E = Mn + e * Math.sin(Mn);
		// Refine initial guess for very high eccentricity
		if (e > 0.95) {
			E = Mn + e * Math.sin(Mn) + 0.5 * e * e * Math.sin(2 * Mn);
		}
	} else {
		E = Mn;
	}

	for (let i = 0; i < maxIter; i++) {
		const sinE = Math.sin(E);
		const cosE = Math.cos(E);
		const f = E - e * sinE - Mn;
		const fp = 1 - e * cosE;
		const dE = f / fp;
		E -= dE;
		if (Math.abs(dE) < tol) break;
		// Safety: if E diverges, clamp it
		if (Math.abs(E) > 4 * Math.PI) {
			E = Math.sign(E) * 4 * Math.PI;
			break;
		}
	}
	return E;
}

// Convert orbital elements to 3D position at a given time
// Returns position in AU in the ecliptic coordinate frame
export function orbitalPosition(orbit: OrbitalElements, jd: number): [number, number, number] {
	const a = orbit.a;
	const e = orbit.e;
	const i = orbit.i * DEG_TO_RAD;
	const w = orbit.w * DEG_TO_RAD;
	const omega = orbit.omega * DEG_TO_RAD;

	// Mean motion (radians per day)
	const n = Math.sqrt(0.0002959122082855911 / (a * a * a));

	// Time since epoch
	const dt = jd - orbit.epoch;

	// Mean anomaly at time jd
	const M = (orbit.ma * DEG_TO_RAD + n * dt) % (2 * Math.PI);

	// Solve Kepler's equation for eccentric anomaly
	const E = solveKepler(M, e);

	// True anomaly
	const cosE = Math.cos(E);
	const sinE = Math.sin(E);
	const trueAnomaly = Math.atan2(
		Math.sqrt(1 - e * e) * sinE,
		cosE - e
	);

	// Heliocentric distance (AU)
	const r = a * (1 - e * cosE);

	// Clamp distance for near-parabolic orbits to prevent extreme jumps
	const rClamped = Math.min(r, a * (1 + e) * 2);

	// Position in orbital plane
	const xp = rClamped * Math.cos(trueAnomaly);
	const yp = rClamped * Math.sin(trueAnomaly);

	// Rotate by argument of perihelion
	const xw = xp * Math.cos(w) - yp * Math.sin(w);
	const yw = xp * Math.sin(w) + yp * Math.cos(w);

	// Rotate by inclination and longitude of ascending node
	const cosO = Math.cos(omega);
	const sinO = Math.sin(omega);
	const cosI = Math.cos(i);
	const sinI = Math.sin(i);

	const x = (cosO * xw - sinO * yw * cosI) * AU_TO_SCENE;
	const y = (sinO * xw + cosO * yw * cosI) * AU_TO_SCENE;
	const z = (yw * sinI) * AU_TO_SCENE;

	// Note: in the ecliptic frame, z is out of the ecliptic plane
	// For Three.js, we map: x->x, z->y (up), y->z
	return [x, z, y];
}

// Generate orbit path points for visualization
export function orbitPath(orbit: OrbitalElements, segments = 256): Float32Array {
	const a = orbit.a;
	const e = orbit.e;
	const i = orbit.i * DEG_TO_RAD;
	const w = orbit.w * DEG_TO_RAD;
	const omega = orbit.omega * DEG_TO_RAD;

	const cosO = Math.cos(omega);
	const sinO = Math.sin(omega);
	const cosI = Math.cos(i);
	const sinI = Math.sin(i);
	const cosW = Math.cos(w);
	const sinW = Math.sin(w);

	const points = new Float32Array((segments + 1) * 3);

	for (let s = 0; s <= segments; s++) {
		const trueAnomaly = (s / segments) * 2 * Math.PI;
		const r = a * (1 - e * e) / (1 + e * Math.cos(trueAnomaly));

		const xp = r * Math.cos(trueAnomaly);
		const yp = r * Math.sin(trueAnomaly);

		const xw = xp * cosW - yp * sinW;
		const yw = xp * sinW + yp * cosW;

		const x = (cosO * xw - sinO * yw * cosI) * AU_TO_SCENE;
		const y = (sinO * xw + cosO * yw * cosI) * AU_TO_SCENE;
		const z = (yw * sinI) * AU_TO_SCENE;

		points[s * 3] = x;
		points[s * 3 + 1] = z;
		points[s * 3 + 2] = y;
	}

	return points;
}

// Current Julian Date
export function currentJD(): number {
	return Date.now() / 86400000 + 2440587.5;
}

// Convert Julian Date to JavaScript Date
export function jdToDate(jd: number): Date {
	return new Date((jd - 2440587.5) * 86400000);
}

// Convert JavaScript Date to Julian Date
export function dateToJD(date: Date): number {
	return date.getTime() / 86400000 + 2440587.5;
}

import type { OrbitalElements } from '$lib/types';

const DEG_TO_RAD = Math.PI / 180;
const AU_TO_SCENE = 50; // 1 AU = 50 scene units for display

// Solve Kepler's equation: M = E - e*sin(E) using Newton-Raphson
export function solveKepler(M: number, e: number, tol = 1e-8, maxIter = 30): number {
	let E = M;
	for (let i = 0; i < maxIter; i++) {
		const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
		E -= dE;
		if (Math.abs(dE) < tol) break;
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

	// Position in orbital plane
	const xp = r * Math.cos(trueAnomaly);
	const yp = r * Math.sin(trueAnomaly);

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

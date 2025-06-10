export interface OrbitalElements {
	a: number; // semi-major axis (AU)
	e: number; // eccentricity
	i: number; // inclination (degrees)
	w: number; // argument of perihelion (degrees)
	omega: number; // longitude of ascending node (degrees)
	ma: number; // mean anomaly (degrees) at epoch
	epoch: number; // epoch (Julian Date)
	tp?: number; // time of perihelion passage (Julian Date)
	q?: number; // perihelion distance (AU)
	q_au?: [number, number]; // [perihelion, aphelion] in AU
	period?: number; // orbital period (years)
}

export interface SmallBody {
	id: string;
	spkid: string;
	des: string; // designation
	name: string;
	pdes: string; // primary designation
	kind: 'comet' | 'asteroid' | 'dormant';
	orbit: OrbitalElements;
	diameter?: number; // km
	h?: number; // absolute magnitude
	albedo?: number;
	phys?: Record<string, string | number>;
}

export interface CloseApproach {
	des: string;
	date: string; // ISO date string
	dist: number; // nominal approach distance (AU)
	dist_min: number; // minimum possible distance (AU)
	dist_max: number; // maximum possible distance (AU)
	v_rel: number; // relative velocity (km/s)
	v_inf: number; // infinite velocity (km/s)
	t_sigma_f: string; // time uncertainty
	body: string; // approaching body
}

export interface PlanetData {
	name: string;
	radius: number; // display radius (scene units)
	realRadius: number; // actual radius (km)
	semiMajorAxis: number; // display distance (scene units)
	realSemiMajorAxis: number; // actual distance (AU)
	eccentricity: number;
	inclination: number; // degrees
	longitudeAscendingNode: number; // degrees
	argumentPerihelion: number; // degrees
	meanAnomalyAtEpoch: number; // degrees
	epoch: number; // Julian Date
	orbitalPeriod: number; // days
	color: number;
	texture?: string;
	rings?: { inner: number; outer: number; color: number };
	rotationSpeed?: number; // radians per frame at 1x speed
	hasAtmosphere?: boolean;
	atmosphereColor?: number;
}

export interface SceneObject {
	id: string;
	name: string;
	type: 'sun' | 'planet' | 'comet' | 'asteroid' | 'orbit';
	mesh: unknown;
	position?: { x: number; y: number; z: number };
}

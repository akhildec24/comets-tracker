import type { SmallBody, CloseApproach, OrbitalElements, TrajectoryPoint } from '$lib/types';

const PROXY_URL = '/api/nasa';

function buildProxyUrl(target: 'sbdb' | 'cad' | 'horizons', params: URLSearchParams): string {
	return `${PROXY_URL}?target=${target}&q=${encodeURIComponent(params.toString())}`;
}

// --- Cache layer ---
const CACHE_PREFIX = 'neo_cache_';
// Cache TTLs in milliseconds
const CACHE_TTL_BODIES = 24 * 60 * 60 * 1000;   // 24 hours for orbital data
const CACHE_TTL_CAD = 6 * 60 * 60 * 1000;         // 6 hours for close approaches
const CACHE_TTL_LOOKUP = 7 * 24 * 60 * 60 * 1000; // 7 days for individual lookups

interface CacheEntry<T> {
	data: T;
	timestamp: number;
}

function getCached<T>(key: string): T | null {
	try {
		const raw = localStorage.getItem(CACHE_PREFIX + key);
		if (!raw) return null;
		const entry: CacheEntry<T> = JSON.parse(raw);
		return entry.data;
	} catch {
		return null;
	}
}

function setCached<T>(key: string, data: T): void {
	try {
		const entry: CacheEntry<T> = { data, timestamp: Date.now() };
		localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
	} catch {
		// localStorage might be full, silently ignore
	}
}

function getCacheAge(key: string): number {
	try {
		const raw = localStorage.getItem(CACHE_PREFIX + key);
		if (!raw) return Infinity;
		const entry: CacheEntry<unknown> = JSON.parse(raw);
		return Date.now() - entry.timestamp;
	} catch {
		return Infinity;
	}
}

export function isCacheStale(key: string, ttl: number): boolean {
	return getCacheAge(key) > ttl;
}

// SBDB Lookup API response types
interface SBDBElement {
	name: string;
	value: string;
	units: string | null;
	label: string;
	title: string;
	sigma: string | null;
}

interface SBDBLookupResponse {
	signature: { version: string; source: string };
	object: {
		des: string;
		spkid: string;
		kind: string; // "an" = asteroid numbered, "cn" = comet numbered, "au"/"cu" = unnumbered
		fullname: string;
		shortname?: string;
		prefix?: string | null;
		orbit_class?: { code: string; name: string };
	};
	orbit: {
		elements: SBDBElement[];
		epoch: string;
		equinox: string;
	};
	phys_par?: SBDBElement[];
}

interface CADResponse {
	fields: string[];
	data: (string | number)[][];
	count: number;
}

function parseNum(v: string | number | undefined | null): number | undefined {
	if (v === undefined || v === null || v === '' || v === 'null') return undefined;
	const n = Number(v);
	return isNaN(n) ? undefined : n;
}

// Extract an element value from the SBDB lookup response's orbit.elements array
function getElement(elements: SBDBElement[], name: string): number | undefined {
	const el = elements.find(e => e.name === name);
	if (!el) return undefined;
	return parseNum(el.value);
}

// Parse the SBDB lookup response into a SmallBody
function parseSBDBLookup(json: SBDBLookupResponse): SmallBody | null {
	if (!json.object || !json.orbit?.elements) return null;

	const obj = json.object;
	const elements = json.orbit.elements;

	const kindRaw = obj.kind || 'an';
	const kind: SmallBody['kind'] = kindRaw.startsWith('c') ? 'comet' : kindRaw.startsWith('d') ? 'dormant' : 'asteroid';

	// Extract name from fullname (e.g. "99942 Apophis (2004 MN4)" -> "Apophis")
	const fullName = obj.fullname || '';
	const shortName = obj.shortname || '';
	let name = shortName;
	if (!name || name === obj.des) {
		// Try to extract from fullname: remove designation prefix and parenthetical
		const match = fullName.match(/^\S+\s+(.+?)(?:\s*\(.+\))?$/);
		name = match ? match[1] : fullName;
	}

	const a = getElement(elements, 'a') || 0;
	const q = getElement(elements, 'q');
	const ad = getElement(elements, 'ad');
	const per = getElement(elements, 'per'); // period in days

	const orbit: OrbitalElements = {
		a,
		e: getElement(elements, 'e') || 0,
		i: getElement(elements, 'i') || 0,
		w: getElement(elements, 'w') || 0,
		omega: getElement(elements, 'om') || 0,
		ma: getElement(elements, 'ma') || 0,
		epoch: parseNum(json.orbit.epoch) || 0,
		tp: getElement(elements, 'tp'),
		q,
		q_au: q && ad ? [q, ad] : [q || 0, ad || 0],
		period: per ? per / 365.25 : undefined, // convert days to years
	};

	// Try to get physical parameters
	let diameter: number | undefined;
	let h: number | undefined;
	let albedo: number | undefined;
	if (json.phys_par) {
		diameter = getElement(json.phys_par, 'diameter');
		h = getElement(json.phys_par, 'H');
		albedo = getElement(json.phys_par, 'albedo');
	}

	return {
		id: obj.spkid,
		spkid: obj.spkid,
		des: obj.des,
		name,
		pdes: obj.des,
		kind,
		orbit,
		diameter,
		h,
		albedo,
	};
}

// Lookup a single small body by designation using the SBDB Lookup API
export async function lookupBody(designation: string, forceRefresh = false): Promise<SmallBody | null> {
	const cacheKey = `body_${designation}`;

	if (!forceRefresh) {
		const cached = getCached<SmallBody>(cacheKey);
		if (cached) return cached;
	}

	const params = new URLSearchParams({
		sstr: designation,
	});

	try {
		const res = await fetch(buildProxyUrl('sbdb', params));
		if (!res.ok) return null;
		const json: SBDBLookupResponse = await res.json();
		const body = parseSBDBLookup(json);
		if (body) setCached(cacheKey, body);
		return body;
	} catch {
		return null;
	}
}

// Batch-lookup multiple designations (with concurrency limit)
// Returns cached bodies immediately, then fetches stale ones in background
export async function lookupNotableBodies(designations: string[], forceRefresh = false): Promise<SmallBody[]> {
	const results: SmallBody[] = [];
	const stale: string[] = [];

	// First pass: collect from cache
	for (const des of designations) {
		if (!forceRefresh) {
			const cached = getCached<SmallBody>(`body_${des}`);
			if (cached && !isCacheStale(`body_${des}`, CACHE_TTL_LOOKUP)) {
				results.push(cached);
				continue;
			}
			if (cached) {
				// Have cached data but it's stale - use it but mark for refresh
				results.push(cached);
			}
		}
		stale.push(des);
	}

	// Fetch stale/missing entries
	if (stale.length > 0) {
		const batchSize = 5;
		for (let i = 0; i < stale.length; i += batchSize) {
			const batch = stale.slice(i, i + batchSize);
			const bodies = await Promise.all(
				batch.map(des => lookupBody(des, true).catch(() => null))
			);
			for (let j = 0; j < bodies.length; j++) {
				const body = bodies[j];
				if (body) {
					// Replace stale entry if present, or add new
					const idx = results.findIndex(b => b.des === batch[j]);
					if (idx >= 0) results[idx] = body;
					else results.push(body);
				}
			}
		}
	}

	return results;
}

// Query close approaches using the CAD API
export async function queryCloseApproaches(
	dateMin?: string,
	dateMax?: string,
	distMax?: number,
	limit = 50,
	forceRefresh = false
): Promise<CloseApproach[]> {
	const cacheKey = `cad_${dateMin || 'auto'}_${dateMax || 'auto'}_${distMax || 0.2}_${limit}`;

	if (!forceRefresh) {
		const cached = getCached<CloseApproach[]>(cacheKey);
		if (cached && !isCacheStale(cacheKey, CACHE_TTL_CAD)) return cached;
	}

	const params: Record<string, string> = {
		'date-min': dateMin || new Date().toISOString().slice(0, 10),
		'date-max': dateMax || new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
		'dist-max': distMax ? String(distMax) : '0.2',
		'sort': 'date',
		'limit': String(limit)
	};

	const res = await fetch(buildProxyUrl('cad', new URLSearchParams(params)));
	if (!res.ok) throw new Error(`CAD API failed: ${res.status}`);
	const json: CADResponse = await res.json();

	if (!json.data) return [];

	const fieldMap: Record<string, number> = {};
	json.fields.forEach((f, i) => { fieldMap[f] = i; });

	const result = json.data.map(row => {
		const g = (key: string): string | number | undefined => {
			const idx = fieldMap[key];
			if (idx === undefined) return undefined;
			return row[idx] ?? undefined;
		};

		return {
			des: String(g('des') || ''),
			date: String(g('cd') || ''),
			dist: parseNum(g('dist')) || 0,
			dist_min: parseNum(g('dist_min')) || 0,
			dist_max: parseNum(g('dist_max')) || 0,
			v_rel: parseNum(g('v_rel')) || 0,
			v_inf: parseNum(g('v_inf')) || 0,
			t_sigma_f: String(g('t_sigma_f') || ''),
			body: String(g('body') || 'Earth')
		};
	});

	setCached(cacheKey, result);
	return result;
}

export async function getHorizonsEphemeris(
	spkid: string,
	startDate: string,
	endDate: string,
	step: string = '1d'
): Promise<{ jd: number; x: number; y: number; z: number }[]> {
	const params = new URLSearchParams({
		'format': 'json',
		'COMMAND': `'DES=${spkid};'`,
		'CENTER': '500@0',
		'VECTOR_TABLE': "'6,7'",
		'START_TIME': startDate,
		'STOP_TIME': endDate,
		'STEP_SIZE': step,
		'OBJ_DATA': 'NO',
		'MAKE_EPHEMERIS': 'YES',
		'EPHEMERIS_TYPE': 'VECTOR'
	});

	try {
		const res = await fetch(buildProxyUrl('horizons', params));
		if (!res.ok) return [];
		const json = await res.json();
		const result: { jd: number; x: number; y: number; z: number }[] = [];
		if (json.result) {
			const lines = String(json.result).split('\n');
			let inData = false;
			for (const line of lines) {
				if (line.includes('$$SOE')) { inData = true; continue; }
				if (line.includes('$$EOE')) break;
				if (inData && line.trim()) {
					const parts = line.trim().split(/\s+/);
					if (parts.length >= 6) {
						const jd = parseFloat(parts[0]);
						const x = parseFloat(parts[2]);
						const y = parseFloat(parts[3]);
						const z = parseFloat(parts[4]);
						if (!isNaN(jd) && !isNaN(x)) {
							result.push({ jd, x, y, z });
						}
					}
				}
			}
		}
		return result;
	} catch {
		return [];
	}
}

// Fetch spacecraft trajectory from JPL Horizons using NAIF ID
// Returns positions in AU (heliocentric ecliptic) converted to scene units
const AU_TO_SCENE = 50;

export async function getSpacecraftTrajectory(
	naifId: number,
	startDate: string,
	endDate: string,
	step: string = '30d',
	forceRefresh = false
): Promise<TrajectoryPoint[]> {
	const cacheKey = `spacecraft_${naifId}`;

	if (!forceRefresh) {
		const cached = getCached<TrajectoryPoint[]>(cacheKey);
		if (cached && !isCacheStale(cacheKey, CACHE_TTL_LOOKUP)) return cached;
	}

	const params = new URLSearchParams({
		'format': 'json',
		'COMMAND': `'DES=${naifId};'`,
		'CENTER': '500@0',
		'VECTOR_TABLE': "'6,7'",
		'START_TIME': startDate,
		'STOP_TIME': endDate,
		'STEP_SIZE': step,
		'OBJ_DATA': 'NO',
		'MAKE_EPHEMERIS': 'YES',
		'EPHEMERIS_TYPE': 'VECTOR'
	});

	try {
		const res = await fetch(buildProxyUrl('horizons', params));
		if (!res.ok) return [];
		const json = await res.json();
		const result: TrajectoryPoint[] = [];
		if (json.result) {
			const lines = String(json.result).split('\n');
			let inData = false;
			for (const line of lines) {
				if (line.includes('$$SOE')) { inData = true; continue; }
				if (line.includes('$$EOE')) break;
				if (inData && line.trim()) {
					const parts = line.trim().split(/\s+/);
					if (parts.length >= 6) {
						const jd = parseFloat(parts[0]);
						const x = parseFloat(parts[2]);
						const y = parseFloat(parts[3]);
						const z = parseFloat(parts[4]);
						if (!isNaN(jd) && !isNaN(x)) {
							// Horizons returns AU in ecliptic frame: x, y, z
							// Map to scene units and Three.js coordinate system (x->x, z->y up, y->z)
							result.push({
								jd,
								x: x * AU_TO_SCENE,
								y: z * AU_TO_SCENE,
								z: y * AU_TO_SCENE,
							});
						}
					}
				}
			}
		}
		if (result.length > 0) setCached(cacheKey, result);
		return result;
	} catch {
		return [];
	}
}

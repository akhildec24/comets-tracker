import type { RequestHandler } from './$types';

const SBDB_LOOKUP_URL = 'https://ssd-api.jpl.nasa.gov/sbdb.api';
const CAD_URL = 'https://ssd-api.jpl.nasa.gov/cad.api';
const HORIZONS_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const ISS_URL = 'https://api.wheretheiss.at/v1/satellites/25544';

export const GET: RequestHandler = async ({ url }) => {
	const target = url.searchParams.get('target');
	const query = url.searchParams.get('q');

	if (!target) {
		return new Response(JSON.stringify({ error: 'Missing target parameter' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// ISS endpoint doesn't need a query param
	if (target === 'iss') {
		try {
			const res = await fetch(ISS_URL);
			const data = await res.text();
			return new Response(data, {
				status: res.status,
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
					'Cache-Control': 'public, max-age=3'
				}
			});
		} catch (err) {
			return new Response(JSON.stringify({ error: 'ISS proxy fetch failed', detail: String(err) }), {
				status: 502,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}

	if (!query) {
		return new Response(JSON.stringify({ error: 'Missing q parameter' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Validate query to prevent injection of extra params
	const sanitizedQuery = query.replace(/[&?]/g, '');

	let fetchUrl: string;
	if (target === 'sbdb') {
		fetchUrl = `${SBDB_LOOKUP_URL}?${sanitizedQuery}`;
	} else if (target === 'cad') {
		fetchUrl = `${CAD_URL}?${sanitizedQuery}`;
	} else if (target === 'horizons') {
		fetchUrl = `${HORIZONS_URL}?${sanitizedQuery}`;
	} else {
		return new Response(JSON.stringify({ error: 'Invalid target' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const res = await fetch(fetchUrl);
		const data = await res.text();

		return new Response(data, {
			status: res.status,
			headers: {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*',
				'Cache-Control': 'public, max-age=3600'
			}
		});
	} catch (err) {
		return new Response(JSON.stringify({ error: 'Proxy fetch failed', detail: String(err) }), {
			status: 502,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};

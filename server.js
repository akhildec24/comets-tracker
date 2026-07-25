import http from 'http';
import { readFile } from 'fs/promises';
import { join, extname, normalize } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const BUILD_DIR = join(__dirname, 'build');
const DB_PATH = join(__dirname, 'notable-bodies.db');
const PORT = process.env.PORT || 3057;

// Load SQLite database (built locally via build-db.js)
let db = null;
try {
	db = new Database(DB_PATH, { readonly: true });
	console.log(`Loaded database: ${DB_PATH} (${db.prepare('SELECT COUNT(*) as c FROM bodies').get().c} bodies)`);
} catch (err) {
	console.warn(`Database not found at ${DB_PATH} — /api/bodies will return empty`);
}

function handleBodiesEndpoint(req, res) {
	if (!db) {
		res.writeHead(503, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Database not available' }));
		return;
	}

	const urlObj = new URL(req.url, `http://localhost:${PORT}`);
	const des = urlObj.searchParams.get('des');

	if (des) {
		// Single body lookup
		const row = db.prepare('SELECT * FROM bodies WHERE des = ?').get(des);
		if (!row) {
			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Not found' }));
			return;
		}
		res.writeHead(200, {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, max-age=86400',
		});
		res.end(JSON.stringify(rowToBody(row)));
	} else {
		// Return all bodies
		const rows = db.prepare('SELECT * FROM bodies').all();
		const bodies = rows.map(rowToBody);
		res.writeHead(200, {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, max-age=3600',
		});
		res.end(JSON.stringify(bodies));
	}
}

function rowToBody(row) {
	return {
		id: row.spkid,
		spkid: row.spkid,
		des: row.des,
		name: row.name,
		pdes: row.pdes,
		kind: row.kind,
		orbit: {
			a: row.a,
			e: row.e,
			i: row.i,
			w: row.w,
			omega: row.omega,
			ma: row.ma,
			epoch: row.epoch,
			tp: row.tp,
			q: row.q,
			q_au: [row.q_au_peri, row.q_au_aph],
			period: row.period,
		},
		diameter: row.diameter,
		h: row.h,
		albedo: row.albedo,
	};
}

const SBDB_LOOKUP_URL = 'https://ssd-api.jpl.nasa.gov/sbdb.api';
const CAD_URL = 'https://ssd-api.jpl.nasa.gov/cad.api';
const HORIZONS_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const ISS_URL = 'https://api.wheretheiss.at/v1/satellites/25544';

async function handleNasaProxy(req, res) {
	const urlObj = new URL(req.url, `http://localhost:${PORT}`);
	const target = urlObj.searchParams.get('target');
	const query = urlObj.searchParams.get('q');

	if (!target) {
		res.writeHead(400, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Missing target parameter' }));
		return;
	}

	if (target === 'iss') {
		try {
			const r = await fetch(ISS_URL);
			const data = await r.text();
			res.writeHead(r.status, {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*',
				'Cache-Control': 'public, max-age=3',
			});
			res.end(data);
		} catch (err) {
			res.writeHead(502, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'ISS proxy fetch failed', detail: String(err) }));
		}
		return;
	}

	if (!query) {
		res.writeHead(400, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Missing q parameter' }));
		return;
	}

	const sanitizedQuery = query.replace(/[&?]/g, '');

	let fetchUrl;
	if (target === 'sbdb') {
		fetchUrl = `${SBDB_LOOKUP_URL}?${sanitizedQuery}`;
	} else if (target === 'cad') {
		fetchUrl = `${CAD_URL}?${sanitizedQuery}`;
	} else if (target === 'horizons') {
		fetchUrl = `${HORIZONS_URL}?${sanitizedQuery}`;
	} else {
		res.writeHead(400, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Invalid target' }));
		return;
	}

	try {
		const r = await fetch(fetchUrl);
		const data = await r.text();
		res.writeHead(r.status, {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': 'public, max-age=3600',
		});
		res.end(data);
	} catch (err) {
		res.writeHead(502, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Proxy fetch failed', detail: String(err) }));
	}
}

const MIME_TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'application/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.otf': 'font/otf',
	'.wasm': 'application/wasm',
	'.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
	try {
		// Handle /api/bodies endpoint (SQLite-backed, instant)
		if (req.url?.startsWith('/api/bodies')) {
			return handleBodiesEndpoint(req, res);
		}

		// Handle /api/nasa proxy endpoint
		if (req.url?.startsWith('/api/nasa')) {
			return handleNasaProxy(req, res);
		}

		let urlPath = decodeURIComponent(req.url?.split('?')[0] || '/');
		let filePath = normalize(join(BUILD_DIR, urlPath));

		// Prevent path traversal
		if (!filePath.startsWith(BUILD_DIR)) {
			res.writeHead(403);
			res.end('Forbidden');
			return;
		}

		// Serve index.html for non-file routes (SPA fallback)
		if (!extname(filePath)) {
			filePath = join(BUILD_DIR, 'index.html');
		}

		const data = await readFile(filePath);
		const ext = extname(filePath).toLowerCase();
		const mime = MIME_TYPES[ext] || 'application/octet-stream';

		res.writeHead(200, {
			'Content-Type': mime,
			'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
		});
		res.end(data);
	} catch (err) {
		// Fallback to index.html for any 404 (SPA routing)
		try {
			const fallback = await readFile(join(BUILD_DIR, 'index.html'));
			res.writeHead(200, {
				'Content-Type': 'text/html; charset=utf-8',
				'Cache-Control': 'no-cache',
			});
			res.end(fallback);
		} catch {
			res.writeHead(404);
			res.end('Not Found');
		}
	}
});

server.listen(PORT, () => {
	console.log(`NEO Tracker running on port ${PORT}`);
});

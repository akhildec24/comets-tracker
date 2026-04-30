<script lang="ts">
	import { onMount } from 'svelte';

	let mounted = $state(false);
	onMount(() => { mounted = true; });
</script>

<svelte:head>
	<title>About — NEO Tracker</title>
	<meta name="description" content="About NEO Tracker — a 3D solar system visualization tool powered by NASA JPL data." />
</svelte:head>

<svelte:window style:overflow={mounted ? 'auto' : 'hidden'} />

<div class="about-page">
	<div class="about-container">
		<a href="/" class="back-link">← BACK TO EXPLORER</a>

		<header class="about-header">
			<div class="logo-row">
				<span class="logo-icon">◉</span>
				<span class="logo-text">NEO TRACKER</span>
			</div>
			<p class="tagline">Solar System Visualization & Near-Earth Object Explorer</p>
		</header>

		<section class="about-section">
			<h2>OVERVIEW</h2>
			<p>
				NEO Tracker is an interactive 3D solar system explorer that visualizes planets, comets,
				asteroids, and spacecraft in real-time using live orbital mechanics. It pulls data
				directly from NASA JPL's Small Body Database and Close Approach Data API, letting you
				track, search, and analyze near-Earth objects from your browser.
			</p>
		</section>

		<section class="about-section">
			<h2>OBJECTIVES</h2>
			<div class="objectives-grid">
				<div class="objective-card">
					<span class="obj-icon">🪐</span>
					<h3>3D Solar System</h3>
					<p>Real-time 3D rendering of all 8 planets, the Sun, Earth's Moon, and Jupiter's Galilean moons with accurate axial tilts and orbital periods.</p>
				</div>
				<div class="objective-card">
					<span class="obj-icon">☄️</span>
					<h3>Comet & Asteroid Tracking</h3>
					<p>Track near-Earth objects by designation. View their orbital paths, perihelion dates, and physical properties from NASA JPL SBDB.</p>
				</div>
				<div class="objective-card">
					<span class="obj-icon">📊</span>
					<h3>Close Approach Alerts</h3>
					<p>Monitor upcoming close approaches with distance, velocity, and time data from NASA's CAD API. Urgent approaches are highlighted.</p>
				</div>
				<div class="objective-card">
					<span class="obj-icon">🔍</span>
					<h3>Search & Discover</h3>
					<p>Search any small body by designation (e.g. "1P/Halley", "99942 Apophis"). Objects are fetched live and added to the 3D scene.</p>
				</div>
				<div class="objective-card">
					<span class="obj-icon">⏱️</span>
					<h3>Time Machine</h3>
					<p>Scrub through time with adjustable speed (0.1x to 365x). Jump to any date with the date picker. Watch orbits evolve over centuries.</p>
				</div>
				<div class="objective-card">
					<span class="obj-icon">🛰️</span>
					<h3>Space Mission Visualization</h3>
					<p>View trajectories of interstellar missions like Voyager 1 & 2, Pioneer 10 & 11, and New Horizons as they journey beyond the solar system.</p>
				</div>
				<div class="objective-card">
					<span class="obj-icon">⭐</span>
					<h3>Bookmark & Compare</h3>
					<p>Star favorite objects for quick access. Compare two objects side-by-side with orbital element differences. Export data as CSV or JSON.</p>
				</div>
				<div class="objective-card">
					<span class="obj-icon">🌌</span>
					<h3>Astronomical Visuals</h3>
					<p>Constellation lines, meteor shower radiants, asteroid belt, Kuiper belt, comet tails with ion and dust components, and a Milky Way star field.</p>
				</div>
				<div class="objective-card">
					<span class="obj-icon">⚡</span>
					<h3>Performance & Accessibility</h3>
					<p>Level-of-detail rendering for planets, keyboard shortcuts, mobile responsive layout, and bloom post-processing for a polished experience.</p>
				</div>
			</div>
		</section>

		<section class="about-section">
			<h2>DATA SOURCES</h2>
			<ul class="data-list">
				<li><strong>NASA JPL SBDB</strong> — Small Body Database for orbital elements and physical properties</li>
				<li><strong>NASA JPL CAD API</strong> — Close Approach Data for upcoming flybys</li>
				<li><strong>NASA JPL Horizons</strong> — Ephemeris data for spacecraft trajectories</li>
			</ul>
		</section>

		<section class="about-section">
			<h2>TECHNOLOGY</h2>
			<div class="tech-tags">
				<span class="tech-tag">Svelte 5</span>
				<span class="tech-tag">Three.js</span>
				<span class="tech-tag">TypeScript</span>
				<span class="tech-tag">Vite</span>
				<span class="tech-tag">WebGL</span>
				<span class="tech-tag">GLSL Shaders</span>
			</div>
		</section>

		<section class="about-section">
			<h2>KEYBOARD SHORTCUTS</h2>
			<div class="shortcuts-grid">
				<div class="shortcut-row"><kbd>SPACE</kbd><span>Play / pause time</span></div>
				<div class="shortcut-row"><kbd>1-6</kbd><span>Set time speed</span></div>
				<div class="shortcut-row"><kbd>R</kbd><span>Reset camera view</span></div>
				<div class="shortcut-row"><kbd>C</kbd><span>Toggle comparison mode</span></div>
				<div class="shortcut-row"><kbd>ESC</kbd><span>Close panel / settings</span></div>
			</div>
		</section>

		<footer class="about-footer">
			<a href="https://github.com/akhildec24/comets-tracker" target="_blank" rel="noopener noreferrer" class="footer-link">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: -2px; margin-right: 6px;">
					<path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.9 1.2 1.9 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.6.2 2.8.1 3.2.7.8 1.3 1.9 1.3 3.1 0 4.6-2.8 5.7-5.5 6 .5.4.9 1.1.9 2.3v3.3c0 .3.1.7.8.6A12 12 0 0 0 12 .3"/>
				</svg>
				github.com/akhildec24/comets-tracker
			</a>
			<p class="footer-note">Built with real NASA data · Open source · MIT License</p>
		</footer>
	</div>
</div>

<style>
	.about-page {
		width: 100%;
		min-height: 100vh;
		background: #000005;
		color: #c0d0e0;
		overflow-y: auto;
		padding: 40px 16px 60px;
	}

	.about-container {
		max-width: 900px;
		margin: 0 auto;
	}

	.back-link {
		display: inline-block;
		font-family: 'JetBrains Mono', monospace;
		font-size: 11px;
		color: #00aadd;
		text-decoration: none;
		letter-spacing: 1px;
		margin-bottom: 32px;
		transition: color 0.2s;
	}

	.back-link:hover {
		color: #00ccff;
	}

	.about-header {
		text-align: center;
		margin-bottom: 48px;
	}

	.logo-row {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		margin-bottom: 8px;
	}

	.logo-icon {
		font-size: 28px;
		color: #ffaa44;
		text-shadow: 0 0 12px rgba(255, 170, 68, 0.4);
	}

	.logo-text {
		font-family: 'Orbitron', sans-serif;
		font-size: 28px;
		font-weight: 900;
		letter-spacing: 4px;
		color: #00ccff;
		text-shadow: 0 0 12px rgba(0, 200, 255, 0.3);
	}

	.tagline {
		font-size: 12px;
		color: #6080a0;
		letter-spacing: 2px;
	}

	.about-section {
		margin-bottom: 40px;
	}

	.about-section h2 {
		font-family: 'Orbitron', sans-serif;
		font-size: 14px;
		font-weight: 700;
		letter-spacing: 3px;
		color: #00aadd;
		margin-bottom: 16px;
		padding-bottom: 8px;
		border-bottom: 1px solid rgba(0, 100, 150, 0.2);
	}

	.about-section p {
		font-size: 13px;
		line-height: 1.7;
		color: #90a8c0;
	}

	.objectives-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 16px;
	}

	.objective-card {
		background: rgba(5, 12, 25, 0.6);
		border: 1px solid rgba(0, 100, 150, 0.2);
		border-radius: 6px;
		padding: 20px;
		transition: border-color 0.2s;
	}

	.objective-card:hover {
		border-color: rgba(0, 150, 200, 0.4);
	}

	.obj-icon {
		font-size: 24px;
		display: block;
		margin-bottom: 10px;
	}

	.objective-card h3 {
		font-family: 'Orbitron', sans-serif;
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 1px;
		color: #c0e0ff;
		margin-bottom: 8px;
	}

	.objective-card p {
		font-size: 11px;
		line-height: 1.6;
		color: #7090b0;
	}

	.data-list {
		list-style: none;
		padding: 0;
	}

	.data-list li {
		font-size: 12px;
		color: #90a8c0;
		padding: 6px 0;
		border-bottom: 1px solid rgba(60, 80, 120, 0.15);
	}

	.data-list li:last-child {
		border-bottom: none;
	}

	.data-list strong {
		color: #00ccff;
		font-family: 'Orbitron', sans-serif;
		font-size: 11px;
		letter-spacing: 1px;
		margin-right: 8px;
	}

	.tech-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.tech-tag {
		font-family: 'JetBrains Mono', monospace;
		font-size: 11px;
		color: #00aadd;
		background: rgba(0, 100, 150, 0.15);
		border: 1px solid rgba(0, 150, 200, 0.25);
		padding: 4px 12px;
		border-radius: 12px;
		letter-spacing: 1px;
	}

	.shortcuts-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 8px;
	}

	.shortcut-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 0;
	}

	.shortcut-row kbd {
		font-family: 'JetBrains Mono', monospace;
		font-size: 10px;
		font-weight: 700;
		color: #00ccff;
		background: rgba(0, 100, 150, 0.2);
		border: 1px solid rgba(0, 150, 200, 0.3);
		padding: 3px 8px;
		border-radius: 4px;
		min-width: 50px;
		text-align: center;
	}

	.shortcut-row span {
		font-size: 11px;
		color: #8090b0;
	}

	.about-footer {
		text-align: center;
		margin-top: 48px;
		padding-top: 24px;
		border-top: 1px solid rgba(60, 80, 120, 0.2);
	}

	.footer-link {
		font-family: 'JetBrains Mono', monospace;
		font-size: 12px;
		color: #00aadd;
		text-decoration: none;
		transition: color 0.2s;
	}

	.footer-link:hover {
		color: #00ccff;
	}

	.footer-note {
		font-size: 10px;
		color: #4a6080;
		margin-top: 8px;
		letter-spacing: 1px;
	}

	@media (max-width: 600px) {
		.logo-text {
			font-size: 22px;
		}
		.objectives-grid {
			grid-template-columns: 1fr;
		}
	}
</style>

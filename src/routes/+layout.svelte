<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>NEO Tracker — 3D Solar System Explorer</title>
	<meta name="description" content="Interactive 3D solar system explorer with real-time orbital mechanics. Track comets, asteroids, and near-Earth objects using live NASA JPL data." />
	<link rel="canonical" href="https://neo-tracker.app/" />
	<script type="application/ld+json">
	{
		"@context": "https://schema.org",
		"@type": "WebApplication",
		"name": "NEO Tracker",
		"description": "Interactive 3D solar system explorer with real-time orbital mechanics powered by NASA JPL data.",
		"applicationCategory": "ScienceApplication",
		"operatingSystem": "Web",
		"offers": {
			"@type": "Offer",
			"price": "0",
			"priceCurrency": "USD"
		},
		"keywords": "solar system, NASA, JPL, comets, asteroids, NEO, orbital mechanics, astronomy, 3D visualization"
	}
	</script>
</svelte:head>

{@render children()}

<style>
	:global(*) {
		margin: 0;
		padding: 0;
		box-sizing: border-box;
	}

	:global(html, body) {
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: #000005;
		font-family: 'JetBrains Mono', 'Courier New', monospace;
		color: #c0d0e0;
	}

	:global(::-webkit-scrollbar) {
		width: 6px;
		height: 6px;
	}

	:global(::-webkit-scrollbar-track) {
		background: rgba(10, 20, 40, 0.5);
	}

	:global(::-webkit-scrollbar-thumb) {
		background: rgba(0, 150, 200, 0.4);
		border-radius: 3px;
	}

	:global(::-webkit-scrollbar-thumb:hover) {
		background: rgba(0, 150, 200, 0.7);
	}
</style>

<script lang="ts">
	import { onMount } from 'svelte';
	import { SolarSystemScene } from '$lib/three/scene';
	import { lookupNotableBodies, queryCloseApproaches, lookupBody } from '$lib/api/nasa';
	import { NOTABLE_OBJECTS, PLANETS, INTERSTELLAR_MISSIONS } from '$lib/solarSystem';
	import { currentJD, jdToDate } from '$lib/orbital';
	import type { SmallBody, CloseApproach, Spacecraft } from '$lib/types';
	import InfoPanel from '$lib/components/InfoPanel.svelte';
	import TimelineControl from '$lib/components/TimelineControl.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import CloseApproachList from '$lib/components/CloseApproachList.svelte';
	import ObjectList from '$lib/components/ObjectList.svelte';

	let sceneInstance: SolarSystemScene | null = null;
	let container: HTMLDivElement;

	let trackedBodies: SmallBody[] = $state([]);
	let approaches: CloseApproach[] = $state([]);
	let selected: { type: string; id: string; name: string } | null = $state(null);
	let selectedBody: SmallBody | null = $state(null);
	let jd = $state(currentJD());
	let paused = $state(false);
	let speed = $state(1);
	let searchLoading = $state(false);
	let approachesLoading = $state(false);
	let bodiesLoading = $state(false);
	let sidebarTab: 'planets' | 'objects' | 'approaches' | 'missions' = $state('objects');
	let showHelp = $state(true);
	let errorMessage = $state('');
	let cacheStatus = $state('');
	let refreshTimer: ReturnType<typeof setInterval> | null = null;
	let isolated = $state(false);
	let cameraFollowing = $state(false);
	let showComets = $state(true);
	let showAsteroids = $state(true);
	let showDormant = $state(true);
	let showLabels = $state(true);
	let showTrails = $state(false);
	let logScale = $state(false);
	let showSpacecraft = $state(false);
	let spacecraftLoaded = $state(false);
	let settingsOpen = $state(false);

	const cometCount = $derived(trackedBodies.filter(b => b.kind === 'comet').length);
	const asteroidCount = $derived(trackedBodies.filter(b => b.kind === 'asteroid').length);
	const dormantCount = $derived(trackedBodies.filter(b => b.kind === 'dormant').length);

	const findBody = (id: string): SmallBody | null => {
		return trackedBodies.find(b => b.id === id || b.des === id || b.name === id) || null;
	};

	const handleSelect = (data: { type: string; id: string; name: string } | null) => {
		selected = data;
		if (data) {
			selectedBody = findBody(data.id);
			if (!selectedBody && (data.type === 'comet' || data.type === 'asteroid' || data.type === 'dormant')) {
				lookupBody(data.name || data.id).then(body => {
					if (body) selectedBody = body;
				});
			}
		} else {
			selectedBody = null;
		}
	};

	const handlePlanetSelect = (name: string) => {
		const id = name === 'Sun' ? 'sun' : name;
		selected = { type: name === 'Sun' ? 'sun' : 'planet', id, name };
		selectedBody = null;
		sceneInstance?.focusOn(id);
		cameraFollowing = true;
	};

	const handleSpacecraftSelect = (sc: Spacecraft) => {
		selected = { type: 'spacecraft', id: sc.id, name: sc.name };
		selectedBody = null;
		sceneInstance?.focusOn(sc.id);
		cameraFollowing = true;
	};

	const handleFocus = (id: string) => {
		sceneInstance?.focusOn(id);
		cameraFollowing = true;
	};

	const handleIsolate = (enabled: boolean) => {
		isolated = enabled;
		sceneInstance?.setIsolatedView(enabled, selected?.id);
	};

	const resetView = () => {
		sceneInstance?.clearFollow();
		sceneInstance?.setIsolatedView(false);
		isolated = false;
		cameraFollowing = false;
	};

	const handleTimeChange = (newJD: number) => {
		jd = newJD;
		sceneInstance?.setTime(newJD);
	};

	const handlePauseToggle = () => {
		paused = !paused;
		sceneInstance?.setPaused(paused);
	};

	const handleSpeedChange = (s: number) => {
		speed = s;
		sceneInstance?.setTimeSpeed(s);
	};

	const handleSearch = async (query: string) => {
		searchLoading = true;
		errorMessage = '';
		try {
			const body = await lookupBody(query);
			if (body) {
				sceneInstance?.addSmallBody(body);
				if (!trackedBodies.find(b => b.id === body.id)) {
					trackedBodies = [...trackedBodies, body];
				}
				selected = { type: body.kind, id: body.id, name: body.name || body.des };
				selectedBody = body;
				sceneInstance?.focusOn(body.id);
				showHelp = false;
			} else {
				errorMessage = `No object found for "${query}"`;
			}
		} catch {
			errorMessage = `Error searching for "${query}"`;
		}
		searchLoading = false;
	};

	const handleApproachSelect = async (des: string) => {
		searchLoading = true;
		errorMessage = '';
		try {
			const body = await lookupBody(des);
			if (body) {
				sceneInstance?.addSmallBody(body);
				if (!trackedBodies.find(b => b.id === body.id)) {
					trackedBodies = [...trackedBodies, body];
				}
				selected = { type: body.kind, id: body.id, name: body.name || body.des };
				selectedBody = body;
				sceneInstance?.focusOn(body.id);
				sidebarTab = 'objects';
				showHelp = false;
			}
		} catch {
			errorMessage = `Error loading ${des}`;
		}
		searchLoading = false;
	};

	const handleObjectSelect = (id: string) => {
		const body = findBody(id);
		if (body) {
			selected = { type: body.kind, id: body.id, name: body.name || body.des };
			selectedBody = body;
			sceneInstance?.focusOn(id);
		}
	};

	const handleObjectRemove = (id: string) => {
		sceneInstance?.removeSmallBody(id);
		trackedBodies = trackedBodies.filter(b => b.id !== id);
		if (selected?.id === id) {
			selected = null;
			selectedBody = null;
		}
	};

	const loadNotableObjects = async (forceRefresh = false) => {
		if (!forceRefresh && trackedBodies.length > 0) return;
		bodiesLoading = true;
		errorMessage = '';
		cacheStatus = 'Loading from cache...';
		try {
			const designations = NOTABLE_OBJECTS.map(o => o.des);
			const bodies = await lookupNotableBodies(designations, forceRefresh);
			for (const body of bodies) {
				sceneInstance?.addSmallBody(body);
				if (!trackedBodies.find(b => b.id === body.id)) {
					trackedBodies = [...trackedBodies, body];
				}
			}
			showHelp = false;
			if (bodies.length === 0) {
				errorMessage = 'No objects loaded. Check your network connection.';
				cacheStatus = '';
			} else {
				cacheStatus = `Loaded ${bodies.length} objects`;
			}
		} catch {
			errorMessage = 'Failed to load from NASA SBDB API. Check your connection.';
			cacheStatus = '';
		}
		bodiesLoading = false;
	};

	const refreshData = async () => {
		cacheStatus = 'Refreshing from NASA...';
		try {
			if (trackedBodies.length > 0) {
				const designations = NOTABLE_OBJECTS.map(o => o.des);
				const bodies = await lookupNotableBodies(designations, true);
				for (const body of bodies) {
					sceneInstance?.updateSmallBody(body);
					const idx = trackedBodies.findIndex(b => b.id === body.id);
					if (idx >= 0) {
						trackedBodies[idx] = body;
						trackedBodies = [...trackedBodies];
					}
				}
			}
			approaches = await queryCloseApproaches(undefined, undefined, 0.2, 50, true);
			cacheStatus = `Updated ${new Date().toLocaleTimeString()}`;
		} catch {
			cacheStatus = 'Refresh failed';
		}
		setTimeout(() => { cacheStatus = ''; }, 3000);
	};

	const loadCloseApproaches = async () => {
		approachesLoading = true;
		try {
			approaches = await queryCloseApproaches(undefined, undefined, 0.2, 50);
		} catch {
			approaches = [];
		}
		approachesLoading = false;
	};

	onMount(() => {
		sceneInstance = new SolarSystemScene(container);
		sceneInstance.onSelect = handleSelect;
		sceneInstance.onTimeUpdate = (newJD: number) => { jd = newJD; };

		// Close settings dropdown on outside click
		const handleClickOutside = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (!target.closest('.gear-menu')) {
				settingsOpen = false;
			}
		};
		window.addEventListener('click', handleClickOutside);

		// Auto-load from cache on startup
		loadNotableObjects();
		loadCloseApproaches();

		// Periodic refresh every 10 minutes
		refreshTimer = setInterval(() => refreshData(), 10 * 60 * 1000);

		return () => {
			window.removeEventListener('click', handleClickOutside);
			if (refreshTimer) clearInterval(refreshTimer);
			sceneInstance?.dispose();
		};
	});

	// Sync filter toggles with 3D scene visibility
	$effect(() => {
		sceneInstance?.setSmallBodyVisibility('comet', showComets);
	});
	$effect(() => {
		sceneInstance?.setSmallBodyVisibility('asteroid', showAsteroids);
	});
	$effect(() => {
		sceneInstance?.setSmallBodyVisibility('dormant', showDormant);
	});
	$effect(() => {
		sceneInstance?.setLabelsVisible(showLabels);
	});
	$effect(() => {
		sceneInstance?.setTrailsVisible(showTrails);
	});
	$effect(() => {
		sceneInstance?.setLogScale(logScale);
	});
	$effect(() => {
		sceneInstance?.setSpacecraftVisible(showSpacecraft);
	});

	const loadSpacecraft = async () => {
		if (spacecraftLoaded) return;
		spacecraftLoaded = true;
		for (const sc of INTERSTELLAR_MISSIONS) {
			sceneInstance?.addSpacecraft(sc);
		}
	};
</script>

<div class="app">
	<div class="canvas-container" bind:this={container}></div>

	<div class="top-bar">
		<div class="logo">
			<span class="logo-icon">◉</span>
			<span class="logo-text">NEO TRACKER</span>
			<span class="logo-sub">SOLAR SYSTEM VISUALIZATION</span>
		</div>
		<div class="search-area">
			<SearchBar onSearch={handleSearch} loading={searchLoading} />
			{#if errorMessage}
				<div class="error-msg">{errorMessage}</div>
			{/if}
		</div>
		<div class="status-area">
			<div class="status-item">
				<span class="status-label">JD</span>
				<span class="status-value">{jd.toFixed(2)}</span>
			</div>
			<div class="status-item">
				<span class="status-label">DATE</span>
				<span class="status-value">{jdToDate(jd).toISOString().slice(0, 10)}</span>
			</div>
			<div class="status-item">
				<span class="status-label">TRACKED</span>
				<span class="status-value">{trackedBodies.length}</span>
			</div>
			<div class="gear-menu">
				<button
					class="gear-btn"
					class:active={settingsOpen}
					onclick={() => (settingsOpen = !settingsOpen)}
					title="Display settings"
				>
					<span class="gear-icon">⚙</span>
				</button>
				{#if settingsOpen}
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
					<div class="gear-dropdown" onclick={(e) => e.stopPropagation()}>
						<div class="dropdown-section">DISPLAY</div>
						<label class="dropdown-item" title="Show/hide name labels for all objects">
							<span class="dropdown-label">LABELS</span>
							<input type="checkbox" bind:checked={showLabels} />
							<span class="switch-slider"></span>
						</label>
						<label class="dropdown-item" title="Show/hide orbit trails behind moving objects">
							<span class="dropdown-label">TRAILS</span>
							<input type="checkbox" bind:checked={showTrails} />
							<span class="switch-slider"></span>
						</label>
						<label class="dropdown-item" title="Log-scale distances: spreads out inner planets for visibility">
							<span class="dropdown-label">SCALE</span>
							<input type="checkbox" bind:checked={logScale} />
							<span class="switch-slider"></span>
						</label>
						<label class="dropdown-item" title="Load and show interstellar space missions (Voyager, Pioneer, New Horizons)">
							<span class="dropdown-label">MISSIONS</span>
							<input
								type="checkbox"
								bind:checked={showSpacecraft}
								onchange={() => { if (showSpacecraft) loadSpacecraft(); }}
							/>
							<span class="switch-slider"></span>
						</label>
						<div class="dropdown-divider"></div>
						<div class="dropdown-section">OBJECTS</div>
						<label class="dropdown-item" title="Show/hide tracked comets">
							<span class="dropdown-label">☄ COMETS ({cometCount})</span>
							<input type="checkbox" bind:checked={showComets} />
							<span class="switch-slider"></span>
						</label>
						<label class="dropdown-item" title="Show/hide tracked asteroids">
							<span class="dropdown-label">● ASTEROIDS ({asteroidCount})</span>
							<input type="checkbox" bind:checked={showAsteroids} />
							<span class="switch-slider"></span>
						</label>
						{#if dormantCount > 0}
							<label class="dropdown-item" title="Show/hide dormant comets">
								<span class="dropdown-label">○ DORMANT ({dormantCount})</span>
								<input type="checkbox" bind:checked={showDormant} />
								<span class="switch-slider"></span>
							</label>
						{/if}
					</div>
				{/if}
			</div>
			<button class="refresh-btn" onclick={() => refreshData()} title="Refresh from NASA">
				↻
			</button>
			{#if cacheStatus}
				<span class="cache-status">{cacheStatus}</span>
			{/if}
		</div>
	</div>

	<div class="left-sidebar">
		<div class="sidebar-tabs">
			<button
				class="tab-btn"
				class:active={sidebarTab === 'planets'}
				onclick={() => (sidebarTab = 'planets')}
			>
				PLANETS
			</button>
			<button
				class="tab-btn"
				class:active={sidebarTab === 'objects'}
				onclick={() => (sidebarTab = 'objects')}
			>
				OBJECTS
			</button>
			<button
				class="tab-btn"
				class:active={sidebarTab === 'approaches'}
				onclick={() => (sidebarTab = 'approaches')}
			>
				APPROACHES
			</button>
			<button
				class="tab-btn"
				class:active={sidebarTab === 'missions'}
				onclick={() => (sidebarTab = 'missions')}
			>
				MISSIONS
			</button>
		</div>

		<div class="sidebar-content">
			{#if sidebarTab === 'planets'}
				<div class="planet-list">
					<button class="planet-item" onclick={() => handlePlanetSelect('Sun')}>
						<span class="planet-dot" style="background: #fff5dd;"></span>
						<span class="planet-name">Sun</span>
					</button>
					{#each PLANETS as planet}
						<button class="planet-item" onclick={() => handlePlanetSelect(planet.name)}>
							<span class="planet-dot" style="background: #{planet.color.toString(16).padStart(6, '0')};"></span>
							<span class="planet-name">{planet.name}</span>
						</button>
					{/each}
				</div>
			{:else if sidebarTab === 'objects'}
				<ObjectList
					bodies={trackedBodies}
					onSelect={handleObjectSelect}
					onRemove={handleObjectRemove}
					bind:showComets
					bind:showAsteroids
					bind:showDormant
				/>
				<div class="sidebar-actions">
					<button class="action-btn" onclick={() => loadNotableObjects()} disabled={bodiesLoading}>
						{#if bodiesLoading}
							LOADING...
						{:else}
							⊕ LOAD NOTABLE OBJECTS
						{/if}
					</button>
				</div>
			{:else if sidebarTab === 'missions'}
				<div class="planet-list">
					{#if !spacecraftLoaded}
						<div class="sidebar-actions" style="padding: 12px;">
							<button class="action-btn" onclick={loadSpacecraft}>
								⊕ LOAD SPACE MISSIONS
							</button>
						</div>
					{:else}
						{#each INTERSTELLAR_MISSIONS as sc}
							<button class="planet-item" onclick={() => handleSpacecraftSelect(sc)}>
								<span class="planet-dot" style="background: #{sc.color.toString(16).padStart(6, '0')};"></span>
								<span class="planet-name">{sc.name}</span>
								{#if sc.status === 'silent'}
									<span style="color: #888; font-size: 9px;">SILENT</span>
								{/if}
							</button>
						{/each}
						<div style="padding: 10px; font-size: 10px; color: #667; line-height: 1.5;">
							Trajectory data from NASA JPL Horizons. Positions update with the timeline.
						</div>
					{/if}
				</div>
			{:else}
				<CloseApproachList
					approaches={approaches}
					loading={approachesLoading}
					onSelect={handleApproachSelect}
				/>
				<div class="sidebar-actions">
					<button class="action-btn" onclick={loadCloseApproaches} disabled={approachesLoading}>
						{#if approachesLoading}
							LOADING...
						{:else}
							↻ REFRESH APPROACHES
						{/if}
					</button>
				</div>
			{/if}
		</div>
	</div>

	<InfoPanel
		{selected}
		bodyData={selectedBody}
		{isolated}
		onClose={() => { selected = null; selectedBody = null; if (isolated) { isolated = false; sceneInstance?.setIsolatedView(false); } cameraFollowing = false; }}
		onFocus={handleFocus}
		onIsolate={handleIsolate}
	/>

	{#if cameraFollowing && !selected}
		<button class="reset-view-btn" onclick={resetView} title="Exit follow mode and reset view">
			⟲ RESET VIEW
		</button>
	{/if}

	{#if showHelp}
		<div class="help-overlay">
			<div class="help-card">
				<div class="help-title">SOLAR SYSTEM EXPLORER</div>
				<div class="help-subtitle">Real-time 3D visualization powered by NASA JPL data</div>
				<div class="help-instructions">
					<div class="help-row"><span class="help-key">DRAG</span> Rotate camera</div>
					<div class="help-row"><span class="help-key">SCROLL</span> Zoom in/out</div>
					<div class="help-row"><span class="help-key">RIGHT-DRAG</span> Pan camera</div>
					<div class="help-row"><span class="help-key">CLICK</span> Select object</div>
					<div class="help-row"><span class="help-key">SEARCH</span> Track by designation</div>
				</div>
				<div class="help-actions">
					<button class="help-btn primary" onclick={() => loadNotableObjects()} disabled={bodiesLoading}>
						{#if bodiesLoading}LOADING...{:else}⊕ LOAD NOTABLE OBJECTS{/if}
					</button>
					<button class="help-btn" onclick={() => (showHelp = false)}>
						EXPLORE FREELY
					</button>
				</div>
				<div class="help-data">
					Data: NASA JPL SBDB · CAD API · Horizons
				</div>
			</div>
		</div>
	{/if}

	<TimelineControl
		{jd}
		{paused}
		{speed}
		bodies={trackedBodies}
		onTimeChange={handleTimeChange}
		onPauseToggle={handlePauseToggle}
		onSpeedChange={handleSpeedChange}
	/>
</div>

<style>
	.app {
		position: relative;
		width: 100vw;
		height: 100vh;
		overflow: hidden;
	}

	.canvas-container {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
	}

	.top-bar {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 16px;
		background: linear-gradient(to bottom, rgba(5, 12, 25, 0.95), rgba(5, 12, 25, 0.6));
		border-bottom: 1px solid rgba(0, 150, 200, 0.2);
		z-index: 60;
		gap: 16px;
	}

	.logo {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}

	.logo-icon {
		font-size: 20px;
		color: #00ccff;
		text-shadow: 0 0 10px rgba(0, 200, 255, 0.5);
	}

	.logo-text {
		font-family: 'Orbitron', sans-serif;
		font-size: 16px;
		font-weight: 900;
		letter-spacing: 3px;
		color: #e0f0ff;
		text-shadow: 0 0 8px rgba(0, 200, 255, 0.3);
	}

	.logo-sub {
		font-size: 8px;
		color: #4a6080;
		letter-spacing: 2px;
		margin-left: 4px;
	}

	.search-area {
		flex: 1;
		max-width: 500px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.error-msg {
		font-size: 10px;
		color: #ff6666;
		padding: 2px 8px;
	}

	.status-area {
		display: flex;
		gap: 16px;
		flex-shrink: 0;
		align-items: center;
	}

	.refresh-btn {
		background: rgba(0, 150, 200, 0.2);
		border: 1px solid rgba(0, 150, 200, 0.4);
		color: #00ccff;
		font-size: 13px;
		width: 32px;
		height: 32px;
		border-radius: 4px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
	}

	.refresh-btn:hover {
		background: rgba(0, 150, 200, 0.4);
		border-color: #00ccff;
	}

	/* Gear menu */
	.gear-menu {
		position: relative;
	}

	.gear-btn {
		background: rgba(10, 20, 40, 0.6);
		border: 1px solid rgba(60, 80, 120, 0.3);
		color: #6080a0;
		font-size: 18px;
		width: 32px;
		height: 32px;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.gear-btn:hover {
		border-color: rgba(0, 150, 200, 0.4);
		color: #80a0c0;
	}

	.gear-btn.active {
		background: rgba(0, 150, 200, 0.2);
		border-color: rgba(0, 150, 200, 0.4);
		color: #00ccff;
	}

	.gear-btn.active .gear-icon {
		display: inline-block;
		transform: rotate(60deg);
	}

	.gear-dropdown {
		position: absolute;
		top: 38px;
		right: 0;
		background: rgba(8, 14, 28, 0.95);
		border: 1px solid rgba(60, 80, 120, 0.4);
		border-radius: 6px;
		padding: 6px;
		min-width: 180px;
		z-index: 1000;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(10px);
	}

	.dropdown-section {
		font-family: 'Orbitron', sans-serif;
		font-size: 8px;
		font-weight: 700;
		letter-spacing: 1.5px;
		color: #4a6080;
		padding: 6px 10px 2px;
	}

	.dropdown-divider {
		height: 1px;
		background: rgba(60, 80, 120, 0.25);
		margin: 4px 6px;
	}

	.dropdown-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 10px;
		cursor: pointer;
		border-radius: 4px;
		transition: background 0.15s;
	}

	.dropdown-item:hover {
		background: rgba(0, 100, 150, 0.15);
	}

	.dropdown-label {
		font-family: 'Orbitron', sans-serif;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 1px;
		color: #80a0c0;
	}

	.dropdown-item input[type="checkbox"] {
		opacity: 0;
		width: 0;
		height: 0;
		position: absolute;
	}

	.switch-slider {
		width: 32px;
		height: 16px;
		border-radius: 8px;
		background: rgba(40, 50, 70, 0.8);
		border: 1px solid rgba(60, 80, 120, 0.3);
		position: relative;
		transition: all 0.2s;
		flex-shrink: 0;
	}

	.switch-slider::after {
		content: '';
		position: absolute;
		top: 1px;
		left: 1px;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #506070;
		transition: all 0.2s;
	}

	.dropdown-item input:checked ~ .switch-slider {
		background: rgba(0, 150, 200, 0.3);
		border-color: rgba(0, 150, 200, 0.5);
	}

	.dropdown-item input:checked ~ .switch-slider::after {
		left: 17px;
		background: #00ccff;
		box-shadow: 0 0 6px rgba(0, 200, 255, 0.5);
	}

	.cache-status {
		font-family: 'JetBrains Mono', monospace;
		font-size: 10px;
		color: #4a8090;
		white-space: nowrap;
	}

	.status-item {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 1px;
	}

	.status-label {
		font-size: 8px;
		color: #4a6080;
		letter-spacing: 1px;
	}

	.status-value {
		font-family: 'Orbitron', sans-serif;
		font-size: 12px;
		font-weight: 700;
		color: #00ccff;
		font-variant-numeric: tabular-nums;
		min-width: 90px;
		text-align: right;
	}

	.left-sidebar {
		position: absolute;
		top: 52px;
		left: 16px;
		width: 280px;
		max-height: calc(100vh - 140px);
		background: rgba(5, 12, 25, 0.92);
		border: 1px solid rgba(0, 150, 200, 0.25);
		border-radius: 4px;
		backdrop-filter: blur(10px);
		z-index: 55;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		box-shadow: 0 0 20px rgba(0, 100, 150, 0.1);
	}

	.sidebar-tabs {
		display: flex;
		border-bottom: 1px solid rgba(0, 100, 150, 0.2);
	}

	.tab-btn {
		flex: 1;
		padding: 8px;
		background: none;
		border: none;
		color: #6080a0;
		font-family: 'Orbitron', sans-serif;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 1.5px;
		cursor: pointer;
		transition: all 0.2s;
		border-bottom: 2px solid transparent;
	}

	.tab-btn:hover {
		color: #80a0c0;
	}

	.tab-btn.active {
		color: #00ccff;
		border-bottom-color: #00ccff;
		background: rgba(0, 50, 80, 0.2);
	}

	.sidebar-content {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.planet-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px;
	}

	.planet-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		background: none;
		border: none;
		color: #a0c0e0;
		font-family: 'JetBrains Mono', monospace;
		font-size: 12px;
		cursor: pointer;
		border-radius: 4px;
		text-align: left;
		transition: all 0.15s;
	}

	.planet-item:hover {
		background: rgba(0, 80, 120, 0.3);
		color: #00ccff;
	}

	.planet-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
		box-shadow: 0 0 6px currentColor;
	}

	.sidebar-actions {
		padding: 8px 12px;
		border-top: 1px solid rgba(0, 100, 150, 0.2);
	}

	.action-btn {
		width: 100%;
		padding: 8px;
		background: rgba(0, 100, 150, 0.15);
		border: 1px solid rgba(0, 150, 200, 0.3);
		color: #00aadd;
		font-family: 'Orbitron', sans-serif;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 1px;
		border-radius: 3px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.action-btn:hover:not(:disabled) {
		background: rgba(0, 150, 200, 0.25);
		border-color: rgba(0, 200, 255, 0.5);
		box-shadow: 0 0 8px rgba(0, 150, 200, 0.2);
	}

	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.reset-view-btn {
		position: absolute;
		top: 60px;
		right: 16px;
		background: rgba(0, 100, 150, 0.3);
		border: 1px solid rgba(0, 150, 200, 0.5);
		color: #00ccff;
		font-family: 'Orbitron', sans-serif;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 1px;
		padding: 8px 14px;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s;
		z-index: 100;
		backdrop-filter: blur(8px);
	}

	.reset-view-btn:hover {
		background: rgba(0, 150, 200, 0.4);
		border-color: #00ccff;
		box-shadow: 0 0 12px rgba(0, 200, 255, 0.3);
	}

	.help-overlay {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 200;
	}

	.help-card {
		background: rgba(5, 12, 25, 0.95);
		border: 1px solid rgba(0, 150, 200, 0.3);
		border-radius: 8px;
		padding: 32px 40px;
		text-align: center;
		box-shadow: 0 0 40px rgba(0, 100, 150, 0.2);
		max-width: 480px;
	}

	.help-title {
		font-family: 'Orbitron', sans-serif;
		font-size: 24px;
		font-weight: 900;
		letter-spacing: 4px;
		color: #00ccff;
		text-shadow: 0 0 15px rgba(0, 200, 255, 0.4);
		margin-bottom: 4px;
	}

	.help-subtitle {
		font-size: 11px;
		color: #6080a0;
		margin-bottom: 24px;
		letter-spacing: 1px;
	}

	.help-instructions {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 24px;
		text-align: left;
		padding: 0 20px;
	}

	.help-row {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 12px;
		color: #a0c0e0;
	}

	.help-key {
		font-family: 'Orbitron', sans-serif;
		font-size: 9px;
		font-weight: 700;
		color: #00ccff;
		background: rgba(0, 50, 80, 0.4);
		border: 1px solid rgba(0, 150, 200, 0.3);
		padding: 3px 8px;
		border-radius: 3px;
		min-width: 80px;
		text-align: center;
	}

	.help-actions {
		display: flex;
		gap: 12px;
		justify-content: center;
		margin-bottom: 16px;
	}

	.help-btn {
		padding: 10px 20px;
		background: rgba(10, 20, 40, 0.6);
		border: 1px solid rgba(60, 80, 120, 0.4);
		color: #80a0c0;
		font-family: 'Orbitron', sans-serif;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 1px;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.help-btn:hover:not(:disabled) {
		border-color: rgba(0, 200, 255, 0.5);
		color: #00ccff;
	}

	.help-btn.primary {
		background: rgba(0, 100, 150, 0.3);
		border-color: rgba(0, 200, 255, 0.4);
		color: #00ccff;
	}

	.help-btn.primary:hover:not(:disabled) {
		background: rgba(0, 150, 200, 0.4);
		box-shadow: 0 0 15px rgba(0, 150, 200, 0.3);
	}

	.help-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.help-data {
		font-size: 9px;
		color: #3a5070;
		letter-spacing: 1px;
	}
</style>

<script lang="ts">
	import type { SmallBody } from '$lib/types';
	import { jdToDate, orbitalPosition } from '$lib/orbital';
	import { currentJD } from '$lib/orbital';

	interface SelectedInfo {
		type: string;
		id: string;
		name: string;
	}

	let {
		selected,
		bodyData,
		isolated,
		onClose,
		onFocus,
		onIsolate
	}: {
		selected: SelectedInfo | null;
		bodyData: SmallBody | null;
		isolated: boolean;
		onClose: () => void;
		onFocus: (id: string) => void;
		onIsolate: (enabled: boolean) => void;
	} = $props();

	const kindLabel = (kind: string) => {
		switch (kind) {
			case 'comet': return 'COMET';
			case 'asteroid': return 'ASTEROID';
			case 'dormant': return 'DORMANT COMET';
			case 'planet': return 'PLANET';
			case 'sun': return 'STAR';
			case 'spacecraft': return 'SPACECRAFT';
			default: return kind.toUpperCase();
		}
	};

	const kindColor = (kind: string) => {
		switch (kind) {
			case 'comet': return '#00ffff';
			case 'asteroid': return '#ff8844';
			case 'dormant': return '#aa88ff';
			case 'planet': return '#88ccff';
			case 'sun': return '#fff5dd';
			case 'spacecraft': return '#44ff88';
			default: return '#c0d0e0';
		}
	};

	const formatDate = (jd: number) => {
		if (!jd) return '—';
		return jdToDate(jd).toISOString().slice(0, 10);
	};

	// Compute distance from Earth in AU
	const distanceFromEarth = $derived.by(() => {
		if (!bodyData) return null;
		const jd = currentJD();
		const earthPos = orbitalPosition({ a: 1.0, e: 0.0167, i: 0, w: 114.208, omega: -11.260, ma: 358.617, epoch: 2451545.0 }, jd);
		const bodyPos = orbitalPosition({
			a: bodyData.orbit.a,
			e: bodyData.orbit.e,
			i: bodyData.orbit.i,
			w: bodyData.orbit.w,
			omega: bodyData.orbit.omega,
			ma: bodyData.orbit.ma,
			epoch: bodyData.orbit.epoch,
		}, jd);
		const dx = earthPos[0] - bodyPos[0];
		const dy = earthPos[1] - bodyPos[1];
		const dz = earthPos[2] - bodyPos[2];
		// Convert scene units back to AU (50 scene units = 1 AU)
		return Math.sqrt(dx * dx + dy * dy + dz * dz) / 50;
	});

	// Days since/before perihelion
	const perihelionInfo = $derived.by(() => {
		if (!bodyData?.orbit?.tp) return null;
		const jd = currentJD();
		const diff = bodyData.orbit.tp - jd;
		return {
			date: formatDate(bodyData.orbit.tp),
			days: Math.round(Math.abs(diff)),
			past: diff < 0,
		};
	});
</script>

{#if selected}
	<div class="info-panel">
		<div class="panel-header">
			<div class="header-left">
				<span class="type-badge" style="color: {kindColor(selected.type)}; border-color: {kindColor(selected.type)}">
					{kindLabel(selected.type)}
				</span>
				<span class="object-name">{selected.name}</span>
			</div>
			<button class="close-btn" onclick={onClose} title="Close info panel">✕</button>
		</div>

		{#if selected.type === 'spacecraft'}
			<div class="panel-body">
				<div class="data-section">
					<div class="section-title">MISSION</div>
					<div class="data-row">
						<span class="label">Name</span>
						<span class="value">{selected.name}</span>
					</div>
					<div class="data-row">
						<span class="label">Type</span>
						<span class="value">Interstellar Probe</span>
					</div>
				</div>
				<div class="data-section">
					<div class="section-title">TRAJECTORY</div>
					<div class="data-row">
						<span class="label">Data Source</span>
						<span class="value">NASA JPL Horizons</span>
					</div>
					<div class="data-row">
						<span class="label">Status</span>
						<span class="value" style="color: #44ff88">Active Mission</span>
					</div>
				</div>
				<div class="data-section">
					<div class="section-title">CONTROLS</div>
					<div class="data-row" style="flex-direction: column; gap: 6px;">
						<button class="focus-btn" onclick={() => onFocus(selected.id)} title="Move camera to this object">FOCUS CAMERA</button>
						<button class="isolate-btn" class:active={isolated} onclick={() => onIsolate(!isolated)} title="Hide everything except this object">
							{isolated ? 'ISOLATED VIEW' : 'ISOLATE VIEW'}
						</button>
					</div>
				</div>
			</div>
		{:else if bodyData}
			<div class="panel-body">
				<div class="data-section">
					<div class="section-title">DESIGNATION</div>
					<div class="data-row">
						<span class="label">Primary Des</span>
						<span class="value">{bodyData.pdes || bodyData.des}</span>
					</div>
					<div class="data-row">
						<span class="label">SPK-ID</span>
						<span class="value">{bodyData.spkid}</span>
					</div>
					{#if bodyData.diameter}
						<div class="data-row">
							<span class="label">Diameter</span>
							<span class="value">{bodyData.diameter.toFixed(2)} km</span>
						</div>
					{/if}
					{#if bodyData.h !== undefined}
						<div class="data-row">
							<span class="label">Abs. Mag (H)</span>
							<span class="value">{bodyData.h}</span>
						</div>
					{/if}
					{#if bodyData.albedo}
						<div class="data-row">
							<span class="label">Albedo</span>
							<span class="value">{bodyData.albedo.toFixed(3)}</span>
						</div>
					{/if}
				</div>

				<div class="data-section">
					<div class="section-title">ORBITAL ELEMENTS</div>
					<div class="data-row">
						<span class="label">Semi-Major Axis</span>
						<span class="value">{bodyData.orbit.a.toFixed(4)} AU</span>
					</div>
					<div class="data-row">
						<span class="label">Eccentricity</span>
						<span class="value">{bodyData.orbit.e.toFixed(4)}</span>
					</div>
					<div class="data-row">
						<span class="label">Inclination</span>
						<span class="value">{bodyData.orbit.i.toFixed(3)}°</span>
					</div>
					<div class="data-row">
						<span class="label">Arg. Perihelion</span>
						<span class="value">{bodyData.orbit.w.toFixed(3)}°</span>
					</div>
					<div class="data-row">
						<span class="label">Long. Asc. Node</span>
						<span class="value">{bodyData.orbit.omega.toFixed(3)}°</span>
					</div>
					<div class="data-row">
						<span class="label">Mean Anomaly</span>
						<span class="value">{bodyData.orbit.ma.toFixed(3)}°</span>
					</div>
					<div class="data-row">
						<span class="label">Epoch</span>
						<span class="value">{formatDate(bodyData.orbit.epoch)}</span>
					</div>
					{#if bodyData.orbit.q !== undefined}
						<div class="data-row">
							<span class="label">Perihelion (q)</span>
							<span class="value">{bodyData.orbit.q.toFixed(4)} AU</span>
						</div>
					{/if}
					{#if bodyData.orbit.q_au}
						<div class="data-row">
							<span class="label">q — Q</span>
							<span class="value">{bodyData.orbit.q_au[0].toFixed(2)} — {bodyData.orbit.q_au[1].toFixed(2)} AU</span>
						</div>
					{/if}
					{#if bodyData.orbit.period}
						<div class="data-row">
							<span class="label">Orbital Period</span>
							<span class="value">{bodyData.orbit.period.toFixed(2)} yr</span>
						</div>
					{/if}
				</div>

			{#if distanceFromEarth !== null}
				<div class="data-section">
					<div class="section-title">CURRENT POSITION</div>
					<div class="data-row">
						<span class="label">Distance from Earth</span>
						<span class="value">{distanceFromEarth.toFixed(3)} AU</span>
					</div>
					<div class="data-row">
						<span class="label">Distance (km)</span>
						<span class="value">{(distanceFromEarth * 149597870.7).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} km</span>
					</div>
				</div>
			{/if}

			{#if perihelionInfo}
				<div class="data-section">
					<div class="section-title">PERIHELION</div>
					<div class="data-row">
						<span class="label">Perihelion Date</span>
						<span class="value">{perihelionInfo.date}</span>
					</div>
					<div class="data-row">
						<span class="label">Status</span>
						<span class="value">{perihelionInfo.past ? `${perihelionInfo.days} days ago` : `in ${perihelionInfo.days} days`}</span>
					</div>
				</div>
			{/if}

				<button class="focus-btn" onclick={() => onFocus(selected.id)} title="Move camera to this object">
					⊙ FOCUS CAMERA
				</button>
				<button class="isolate-btn" class:active={isolated} onclick={() => onIsolate(!isolated)} title="Hide everything except this object">
					{isolated ? '◉ ISOLATED VIEW' : '○ ISOLATE VIEW'}
				</button>
			</div>
		{:else if selected.type === 'planet' || selected.type === 'sun'}
			<div class="panel-body">
				<div class="data-section">
					<div class="section-title">{selected.type === 'sun' ? 'CENTRAL STAR' : 'PLANETARY BODY'}</div>
					<p class="placeholder">Click to focus camera on {selected.name}.</p>
				</div>
				<button class="focus-btn" onclick={() => onFocus(selected.id)} title="Move camera to this object">
					⊙ FOCUS CAMERA
				</button>
				<button class="isolate-btn" class:active={isolated} onclick={() => onIsolate(!isolated)} title="Hide everything except this object">
					{isolated ? '◉ ISOLATED VIEW' : '○ ISOLATE VIEW'}
				</button>
			</div>
		{:else}
			<div class="panel-body">
				<div class="data-section">
					<p class="placeholder">Loading orbital data...</p>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.info-panel {
		position: absolute;
		top: 60px;
		right: 16px;
		width: 340px;
		max-height: calc(100vh - 140px);
		background: rgba(5, 12, 25, 0.92);
		border: 1px solid rgba(0, 150, 200, 0.3);
		border-radius: 4px;
		backdrop-filter: blur(10px);
		overflow-y: auto;
		z-index: 100;
		box-shadow: 0 0 20px rgba(0, 100, 150, 0.15);
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 14px;
		border-bottom: 1px solid rgba(0, 150, 200, 0.2);
		background: rgba(0, 20, 40, 0.6);
	}

	.header-left {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.type-badge {
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 1.5px;
		padding: 2px 6px;
		border: 1px solid;
		border-radius: 2px;
		width: fit-content;
	}

	.object-name {
		font-family: 'Orbitron', sans-serif;
		font-size: 16px;
		font-weight: 700;
		color: #e0f0ff;
	}

	.close-btn {
		background: none;
		border: 1px solid rgba(100, 150, 200, 0.3);
		color: #80a0c0;
		width: 24px;
		height: 24px;
		border-radius: 3px;
		cursor: pointer;
		font-size: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
	}

	.close-btn:hover {
		border-color: rgba(255, 100, 100, 0.6);
		color: #ff6666;
	}

	.panel-body {
		padding: 12px 14px;
	}

	.data-section {
		margin-bottom: 16px;
	}

	.section-title {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 2px;
		color: #00aadd;
		margin-bottom: 8px;
		padding-bottom: 4px;
		border-bottom: 1px solid rgba(0, 100, 150, 0.2);
	}

	.data-row {
		display: flex;
		justify-content: space-between;
		padding: 3px 0;
		font-size: 11px;
	}

	.label {
		color: #6080a0;
	}

	.value {
		color: #c0e0ff;
		font-weight: 500;
		text-align: right;
	}

	.placeholder {
		color: #6080a0;
		font-size: 11px;
		font-style: italic;
	}

	.focus-btn {
		width: 100%;
		padding: 8px;
		background: rgba(0, 100, 150, 0.2);
		border: 1px solid rgba(0, 150, 200, 0.4);
		color: #00ccff;
		font-family: 'JetBrains Mono', monospace;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 1px;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.focus-btn:hover {
		background: rgba(0, 150, 200, 0.3);
		border-color: rgba(0, 200, 255, 0.6);
		box-shadow: 0 0 10px rgba(0, 150, 200, 0.3);
	}

	.isolate-btn {
		width: 100%;
		padding: 8px;
		margin-top: 6px;
		background: rgba(80, 40, 0, 0.15);
		border: 1px solid rgba(150, 100, 50, 0.3);
		color: #c0a070;
		font-family: 'JetBrains Mono', monospace;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 1px;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.isolate-btn:hover {
		background: rgba(150, 100, 50, 0.2);
		border-color: rgba(200, 150, 80, 0.5);
	}

	.isolate-btn.active {
		background: rgba(150, 80, 20, 0.25);
		border-color: rgba(255, 170, 60, 0.5);
		color: #ffaa44;
		box-shadow: 0 0 8px rgba(200, 120, 40, 0.2);
	}
</style>

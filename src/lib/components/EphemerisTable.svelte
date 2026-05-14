<script lang="ts">
	import type { SmallBody } from '$lib/types';
	import { orbitalPosition, jdToDate } from '$lib/orbital';

	let {
		body,
		currentJd
	}: {
		body: SmallBody;
		currentJd: number;
	} = $props();

	const STEP_DAYS = 10;
	const NUM_ROWS = 20;

	// Throttle: only recalculate when JD changes by more than 1 day
	let lastCalcJd = 0;
	let cachedRows: { date: string; x: string; y: string; z: string; dist: string; vel: string }[] = [];

	const rows = $derived.by(() => {
		// Trigger reactivity on currentJd but only recalc if significant change
		const _ = currentJd;
		if (Math.abs(currentJd - lastCalcJd) < 1 && cachedRows.length > 0) {
			return cachedRows;
		}
		lastCalcJd = currentJd;
		const result: { date: string; x: string; y: string; z: string; dist: string; vel: string }[] = [];
		const startJd = currentJd;
		for (let i = 0; i < NUM_ROWS; i++) {
			const jd = startJd + i * STEP_DAYS;
			const [x, y, z] = orbitalPosition(body.orbit, jd);
			const dist = Math.sqrt(x * x + y * y + z * z);
			const [x2, y2, z2] = orbitalPosition(body.orbit, jd + 1);
			const vel = Math.sqrt((x2 - x) ** 2 + (y2 - y) ** 2 + (z2 - z) ** 2) * 86400;
			result.push({
				date: jdToDate(jd).toISOString().slice(0, 10),
				x: x.toFixed(3),
				y: y.toFixed(3),
				z: z.toFixed(3),
				dist: dist.toFixed(3),
				vel: vel.toFixed(1),
			});
		}
		cachedRows = result;
		return result;
	});
</script>

<div class="ephemeris-table">
	<div class="eph-header">
		<span class="eph-title">EPHEMERIS</span>
		<span class="eph-sub">{STEP_DAYS}-day intervals · {NUM_ROWS} rows</span>
	</div>
	<div class="eph-scroll">
		<table>
			<thead>
				<tr>
					<th>DATE</th>
					<th>X (AU)</th>
					<th>Y (AU)</th>
					<th>Z (AU)</th>
					<th>r (AU)</th>
					<th>v (km/s)</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as row}
					<tr>
						<td>{row.date}</td>
						<td>{row.x}</td>
						<td>{row.y}</td>
						<td>{row.z}</td>
						<td>{row.dist}</td>
						<td>{row.vel}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	.ephemeris-table {
		margin-top: 12px;
	}

	.eph-header {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin-bottom: 6px;
	}

	.eph-title {
		font-family: 'Orbitron', sans-serif;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 2px;
		color: #00aadd;
	}

	.eph-sub {
		font-size: 8px;
		color: #4a6080;
		letter-spacing: 1px;
	}

	.eph-scroll {
		max-height: 200px;
		overflow-y: auto;
		border: 1px solid rgba(0, 100, 150, 0.2);
		border-radius: 4px;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-family: 'JetBrains Mono', monospace;
		font-size: 9px;
	}

	thead {
		position: sticky;
		top: 0;
		background: rgba(5, 12, 25, 0.95);
	}

	th {
		padding: 4px 6px;
		text-align: right;
		color: #6080a0;
		font-weight: 500;
		letter-spacing: 1px;
		border-bottom: 1px solid rgba(0, 100, 150, 0.2);
	}

	th:first-child {
		text-align: left;
	}

	td {
		padding: 3px 6px;
		text-align: right;
		color: #90b0d0;
		border-bottom: 1px solid rgba(60, 80, 120, 0.1);
	}

	td:first-child {
		text-align: left;
		color: #c0d0e0;
	}

	tbody tr:hover {
		background: rgba(0, 100, 150, 0.1);
	}
</style>

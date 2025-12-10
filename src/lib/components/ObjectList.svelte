<script lang="ts">
	import type { SmallBody } from '$lib/types';

	let {
		bodies,
		onSelect,
		onRemove,
		showComets = $bindable(true),
		showAsteroids = $bindable(true),
		showDormant = $bindable(true)
	}: {
		bodies: SmallBody[];
		onSelect: (id: string) => void;
		onRemove: (id: string) => void;
		showComets: boolean;
		showAsteroids: boolean;
		showDormant: boolean;
	} = $props();

	let searchQuery = $state('');

	const kindIcon = (kind: string) => {
		switch (kind) {
			case 'comet': return '\u2604';
			case 'asteroid': return '\u25CF';
			case 'dormant': return '\u25CB';
			default: return '\u25CF';
		}
	};

	const kindColor = (kind: string) => {
		switch (kind) {
			case 'comet': return '#00ffff';
			case 'asteroid': return '#ff8844';
			case 'dormant': return '#aa88ff';
			default: return '#c0d0e0';
		}
	};

	const filteredBodies = $derived.by(() => {
		return bodies.filter(b => {
			if (b.kind === 'comet' && !showComets) return false;
			if (b.kind === 'asteroid' && !showAsteroids) return false;
			if (b.kind === 'dormant' && !showDormant) return false;
			if (searchQuery) {
				const q = searchQuery.toLowerCase();
				return (b.name || '').toLowerCase().includes(q) || b.des.toLowerCase().includes(q);
			}
			return true;
		});
	});

	const cometCount = $derived(bodies.filter(b => b.kind === 'comet').length);
	const asteroidCount = $derived(bodies.filter(b => b.kind === 'asteroid').length);
	const dormantCount = $derived(bodies.filter(b => b.kind === 'dormant').length);
</script>

<div class="object-list">
	<div class="list-header">
		<span class="header-title">TRACKED OBJECTS</span>
		<span class="count-badge">{filteredBodies.length}/{bodies.length}</span>
	</div>

	<div class="filter-bar">
		<button
			class="filter-btn"
			class:active={showComets}
			onclick={() => { showComets = !showComets; }}
		>
			<span class="filter-icon" style="color: {showComets ? '#00ffff' : '#4a6080'}">{kindIcon('comet')}</span>
			<span class="filter-label" class:dimmed={!showComets}>Comets ({cometCount})</span>
		</button>
		<button
			class="filter-btn"
			class:active={showAsteroids}
			onclick={() => { showAsteroids = !showAsteroids; }}
		>
			<span class="filter-icon" style="color: {showAsteroids ? '#ff8844' : '#4a6080'}">{kindIcon('asteroid')}</span>
			<span class="filter-label" class:dimmed={!showAsteroids}>Asteroids ({asteroidCount})</span>
		</button>
		{#if dormantCount > 0}
			<button
				class="filter-btn"
				class:active={showDormant}
				onclick={() => { showDormant = !showDormant; }}
			>
				<span class="filter-icon" style="color: {showDormant ? '#aa88ff' : '#4a6080'}">{kindIcon('dormant')}</span>
				<span class="filter-label" class:dimmed={!showDormant}>Dormant ({dormantCount})</span>
			</button>
		{/if}
	</div>

	<div class="search-filter">
		<input type="text" placeholder="Filter objects..." bind:value={searchQuery} />
	</div>

	{#if filteredBodies.length === 0}
		<div class="empty">{bodies.length === 0 ? 'No objects tracked. Use search or load notable objects.' : 'No objects match filters.'}</div>
	{/if}

	<div class="list-body">
		{#each filteredBodies as body (body.id)}
			<div class="object-item">
				<button class="item-info" onclick={() => onSelect(body.id)}>
					<span class="kind-icon" style="color: {kindColor(body.kind)}">
						{kindIcon(body.kind)}
					</span>
					<div class="item-details">
						<div class="item-name">{body.name || body.des}</div>
						<div class="item-des">{body.des}</div>
					</div>
				</button>
				<button class="remove-btn" onclick={() => onRemove(body.id)} title="Remove from tracking">
					{'\u2715'}
				</button>
			</div>
		{/each}
	</div>
</div>

<style>
	.object-list {
		display: flex;
		flex-direction: column;
	}

	.list-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		border-bottom: 1px solid rgba(0, 100, 150, 0.2);
		background: rgba(0, 15, 30, 0.6);
	}

	.header-title {
		font-family: 'Orbitron', sans-serif;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 2px;
		color: #00aadd;
	}

	.count-badge {
		font-size: 10px;
		color: #00ccff;
		background: rgba(0, 100, 150, 0.2);
		padding: 1px 6px;
		border-radius: 8px;
		border: 1px solid rgba(0, 150, 200, 0.3);
	}

	.filter-bar {
		display: flex;
		gap: 4px;
		padding: 6px 8px;
		border-bottom: 1px solid rgba(0, 100, 150, 0.15);
		flex-wrap: wrap;
	}

	.filter-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		background: rgba(10, 20, 40, 0.6);
		border: 1px solid rgba(60, 80, 120, 0.3);
		font-family: 'JetBrains Mono', monospace;
		font-size: 9px;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.2s;
		white-space: nowrap;
	}

	.filter-btn.active {
		background: rgba(0, 100, 150, 0.2);
		border-color: rgba(0, 150, 200, 0.4);
	}

	.filter-btn:not(.active) {
		opacity: 0.5;
	}

	.filter-btn:hover {
		border-color: rgba(0, 150, 200, 0.4);
	}

	.filter-icon {
		font-size: 12px;
	}

	.filter-label {
		color: #c0e0ff;
	}

	.filter-label.dimmed {
		color: #4a6080;
		text-decoration: line-through;
	}

	.search-filter {
		padding: 6px 8px;
		border-bottom: 1px solid rgba(0, 100, 150, 0.15);
	}

	.search-filter input {
		width: 100%;
		padding: 4px 8px;
		background: rgba(10, 20, 40, 0.6);
		border: 1px solid rgba(60, 80, 120, 0.3);
		color: #c0e0ff;
		font-family: 'JetBrains Mono', monospace;
		font-size: 10px;
		border-radius: 4px;
		outline: none;
	}

	.search-filter input::placeholder {
		color: #4a6080;
	}

	.search-filter input:focus {
		border-color: rgba(0, 150, 200, 0.5);
	}

	.empty {
		padding: 16px 12px;
		font-size: 11px;
		color: #4a6080;
		text-align: center;
		font-style: italic;
	}

	.list-body {
		max-height: 240px;
		overflow-y: auto;
	}

	.object-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 4px 0 0;
		border-bottom: 1px solid rgba(20, 40, 70, 0.4);
		transition: background 0.15s;
	}

	.object-item:hover {
		background: rgba(0, 50, 80, 0.3);
	}

	.item-info {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: none;
		border: none;
		cursor: pointer;
		flex: 1;
		text-align: left;
	}

	.kind-icon {
		font-size: 14px;
	}

	.item-details {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.item-name {
		font-size: 12px;
		color: #c0e0ff;
		font-weight: 500;
	}

	.item-des {
		font-size: 10px;
		color: #6080a0;
	}

	.remove-btn {
		background: none;
		border: 1px solid rgba(60, 80, 120, 0.3);
		color: #6080a0;
		width: 20px;
		height: 20px;
		border-radius: 4px;
		cursor: pointer;
		font-size: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
	}

	.remove-btn:hover {
		border-color: rgba(255, 100, 100, 0.5);
		color: #ff6666;
	}
</style>

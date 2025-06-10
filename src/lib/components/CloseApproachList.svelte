<script lang="ts">
	import type { CloseApproach } from '$lib/types';

	let {
		approaches,
		loading,
		onSelect
	}: {
		approaches: CloseApproach[];
		loading: boolean;
		onSelect: (des: string) => void;
	} = $props();

	const formatDate = (date: string) => {
		return date.slice(0, 10);
	};

	const distColor = (dist: number) => {
		if (dist < 0.01) return '#ff4444';
		if (dist < 0.05) return '#ff8844';
		if (dist < 0.1) return '#ffcc44';
		return '#44cc88';
	};
</script>

<div class="approach-list">
	<div class="list-header">
		<span class="header-title">CLOSE APPROACHES</span>
		{#if loading}
			<div class="mini-spinner"></div>
		{/if}
	</div>

	{#if approaches.length === 0 && !loading}
		<div class="empty">No close approach data loaded.</div>
	{:else if loading && approaches.length === 0}
		<div class="empty">Fetching from NASA CAD API...</div>
	{/if}

	<div class="list-body">
		{#each approaches as ca}
			<button class="approach-item" onclick={() => onSelect(ca.des)}>
				<div class="item-left">
					<div class="item-des">{ca.des}</div>
					<div class="item-date">{formatDate(ca.date)}</div>
				</div>
				<div class="item-right">
					<div class="item-dist" style="color: {distColor(ca.dist)}">
						{ca.dist.toFixed(4)} AU
					</div>
					<div class="item-vel">{ca.v_rel.toFixed(1)} km/s</div>
				</div>
			</button>
		{/each}
	</div>
</div>

<style>
	.approach-list {
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

	.mini-spinner {
		width: 12px;
		height: 12px;
		border: 2px solid rgba(0, 150, 200, 0.2);
		border-top-color: #00ccff;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.empty {
		padding: 16px 12px;
		font-size: 11px;
		color: #4a6080;
		text-align: center;
		font-style: italic;
	}

	.list-body {
		max-height: 280px;
		overflow-y: auto;
	}

	.approach-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 12px;
		background: none;
		border: none;
		border-bottom: 1px solid rgba(20, 40, 70, 0.4);
		cursor: pointer;
		transition: background 0.15s;
		width: 100%;
		text-align: left;
	}

	.approach-item:hover {
		background: rgba(0, 50, 80, 0.3);
	}

	.item-left {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.item-des {
		font-size: 12px;
		color: #c0e0ff;
		font-weight: 500;
	}

	.item-date {
		font-size: 10px;
		color: #6080a0;
	}

	.item-right {
		display: flex;
		flex-direction: column;
		gap: 2px;
		align-items: flex-end;
	}

	.item-dist {
		font-size: 12px;
		font-weight: 700;
		font-family: 'Orbitron', sans-serif;
	}

	.item-vel {
		font-size: 10px;
		color: #6080a0;
	}
</style>

<script lang="ts">
	import type { SmallBody } from '$lib/types';

	let {
		bodies,
		onSelect,
		onRemove
	}: {
		bodies: SmallBody[];
		onSelect: (id: string) => void;
		onRemove: (id: string) => void;
	} = $props();

	const kindIcon = (kind: string) => {
		switch (kind) {
			case 'comet': return '☄';
			case 'asteroid': return '●';
			case 'dormant': return '○';
			default: return '●';
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
</script>

<div class="object-list">
	<div class="list-header">
		<span class="header-title">TRACKED OBJECTS</span>
		<span class="count-badge">{bodies.length}</span>
	</div>

	{#if bodies.length === 0}
		<div class="empty">No objects tracked. Use search or load notable objects.</div>
	{/if}

	<div class="list-body">
		{#each bodies as body (body.id)}
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
					✕
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
		border-radius: 3px;
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

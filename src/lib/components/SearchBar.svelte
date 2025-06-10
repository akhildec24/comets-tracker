<script lang="ts">
	let {
		onSearch,
		loading = false
	}: {
		onSearch: (query: string) => void;
		loading: boolean;
	} = $props();

	let query = $state('');
	let focused = $state(false);

	const handleSubmit = (e: Event) => {
		e.preventDefault();
		if (query.trim()) {
			onSearch(query.trim());
		}
	};
</script>

<div class="search-container" class:focused>
	<form onsubmit={handleSubmit}>
		<div class="search-icon">⌕</div>
		<input
			type="text"
			bind:value={query}
			placeholder="Search by designation (e.g. 1P, 99942, C/2023 A3)..."
			aria-label="Search small body by designation"
		/>
		{#if loading}
			<div class="spinner"></div>
		{/if}
		<button type="submit" disabled={!query.trim() || loading}>TRACK</button>
	</form>
</div>

<style>
	.search-container {
		width: 100%;
	}

	.search-container form {
		display: flex;
		align-items: center;
		gap: 6px;
		background: rgba(5, 15, 30, 0.9);
		border: 1px solid rgba(0, 100, 150, 0.3);
		border-radius: 4px;
		padding: 4px 8px;
		transition: all 0.2s;
	}

	.search-container.focused form {
		border-color: rgba(0, 200, 255, 0.5);
		box-shadow: 0 0 12px rgba(0, 150, 200, 0.2);
	}

	.search-icon {
		color: #00aadd;
		font-size: 16px;
	}

	input {
		flex: 1;
		background: none;
		border: none;
		color: #c0e0ff;
		font-family: 'JetBrains Mono', monospace;
		font-size: 12px;
		outline: none;
		padding: 6px 4px;
	}

	input::placeholder {
		color: #3a5070;
	}

	.spinner {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(0, 150, 200, 0.2);
		border-top-color: #00ccff;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	button[type="submit"] {
		padding: 6px 12px;
		background: rgba(0, 100, 150, 0.3);
		border: 1px solid rgba(0, 150, 200, 0.4);
		color: #00ccff;
		font-family: 'Orbitron', sans-serif;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 1px;
		border-radius: 3px;
		cursor: pointer;
		transition: all 0.2s;
	}

	button[type="submit"]:hover:not(:disabled) {
		background: rgba(0, 150, 200, 0.4);
		box-shadow: 0 0 8px rgba(0, 150, 200, 0.3);
	}

	button[type="submit"]:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>

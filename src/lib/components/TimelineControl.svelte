<script lang="ts">
	import { jdToDate, dateToJD, currentJD } from '$lib/orbital';
	import type { SmallBody } from '$lib/types';

	let {
		jd = currentJD(),
		paused = false,
		speed = 1,
		bodies = [],
		onTimeChange,
		onPauseToggle,
		onSpeedChange
	}: {
		jd: number;
		paused: boolean;
		speed: number;
		bodies?: SmallBody[];
		onTimeChange: (jd: number) => void;
		onPauseToggle: () => void;
		onSpeedChange: (speed: number) => void;
	} = $props();

	const speeds = [0.1, 1, 10, 50, 100, 365];
	const speedLabels = ['0.1x', '1x', '10x', '50x', '100x', '1yr/s'];

	let sliderValue = $state(0);

	$effect(() => {
		sliderValue = jd;
	});

	const minJD = dateToJD(new Date('2000-01-01'));
	const maxJD = dateToJD(new Date('2050-01-01'));

	const handleSlider = (e: Event) => {
		const target = e.target as HTMLInputElement;
		onTimeChange(parseFloat(target.value));
	};

	const formatDate = (j: number) => {
		return jdToDate(j).toISOString().slice(0, 10);
	};

	const resetToNow = () => {
		onTimeChange(currentJD());
	};

	const jumpForward = (days: number) => {
		onTimeChange(jd + days);
	};

	const jumpToNextPerihelion = () => {
		let nextJD = Infinity;
		for (const body of bodies) {
			if (body.orbit.tp && body.orbit.tp > jd && body.orbit.tp < nextJD) {
				nextJD = body.orbit.tp;
			}
		}
		if (nextJD !== Infinity) {
			onTimeChange(nextJD);
		}
	};
</script>

<div class="timeline-container">
	<div class="timeline-bar">
		<button class="play-btn" onclick={onPauseToggle}>
			{#if paused}
				{'\u25B6'}
			{:else}
				{'\u23F8'}
			{/if}
		</button>

		<div class="slider-section">
			<div class="date-display">{formatDate(jd)}</div>
			<input
				type="range"
				class="time-slider"
				min={minJD}
				max={maxJD}
				step="0.25"
				value={sliderValue}
				oninput={handleSlider}
			/>
			<div class="date-range">
				<span>2000</span>
				<span>2025</span>
				<span>2050</span>
			</div>
		</div>

		<div class="preset-section">
			<div class="preset-label">JUMP</div>
			<div class="preset-buttons">
				<button class="preset-btn" onclick={() => jumpForward(7)}>1W</button>
				<button class="preset-btn" onclick={() => jumpForward(30)}>1M</button>
				<button class="preset-btn" onclick={() => jumpForward(365)}>1Y</button>
				<button class="preset-btn" onclick={jumpToNextPerihelion} title="Jump to next perihelion of tracked comets">PERI</button>
			</div>
		</div>

		<div class="speed-section">
			<div class="speed-label">SPEED</div>
			<div class="speed-buttons">
				{#each speeds as sp, i}
					<button
						class="speed-btn"
						class:active={speed === sp}
						onclick={() => onSpeedChange(sp)}
					>
						{speedLabels[i]}
					</button>
				{/each}
			</div>
		</div>

		<button class="reset-btn" onclick={resetToNow}>
			NOW
		</button>
	</div>
</div>

<style>
	.timeline-container {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		background: linear-gradient(to top, rgba(5, 12, 25, 0.95), rgba(5, 12, 25, 0.7));
		border-top: 1px solid rgba(0, 150, 200, 0.2);
		padding: 10px 16px;
		z-index: 50;
	}

	.timeline-bar {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.play-btn {
		width: 32px;
		height: 32px;
		background: rgba(0, 100, 150, 0.3);
		border: 1px solid rgba(0, 150, 200, 0.4);
		color: #00ccff;
		border-radius: 4px;
		cursor: pointer;
		font-size: 13px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
		flex-shrink: 0;
	}

	.play-btn:hover {
		background: rgba(0, 150, 200, 0.4);
		box-shadow: 0 0 10px rgba(0, 150, 200, 0.3);
	}

	.slider-section {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.date-display {
		font-family: 'Orbitron', sans-serif;
		font-size: 12px;
		font-weight: 700;
		color: #00ccff;
		text-align: center;
		letter-spacing: 2px;
		text-shadow: 0 0 8px rgba(0, 200, 255, 0.3);
	}

	.time-slider {
		width: 100%;
		height: 4px;
		-webkit-appearance: none;
		appearance: none;
		background: linear-gradient(to right, rgba(0, 100, 150, 0.3), rgba(0, 200, 255, 0.3));
		border-radius: 2px;
		outline: none;
		cursor: pointer;
	}

	.time-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 14px;
		height: 14px;
		background: #00ccff;
		border-radius: 50%;
		cursor: pointer;
		box-shadow: 0 0 8px rgba(0, 200, 255, 0.6);
	}

	.time-slider::-moz-range-thumb {
		width: 14px;
		height: 14px;
		background: #00ccff;
		border-radius: 50%;
		cursor: pointer;
		border: none;
		box-shadow: 0 0 8px rgba(0, 200, 255, 0.6);
	}

	.date-range {
		display: flex;
		justify-content: space-between;
		font-size: 8px;
		color: #4a6080;
	}

	.speed-section {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex-shrink: 0;
	}

	.preset-section {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex-shrink: 0;
	}

	.preset-label {
		font-size: 8px;
		color: #4a6080;
		letter-spacing: 1px;
		text-align: center;
	}

	.preset-buttons {
		display: flex;
		gap: 2px;
	}

	.preset-btn {
		padding: 6px 8px;
		background: rgba(10, 20, 40, 0.6);
		border: 1px solid rgba(60, 80, 120, 0.3);
		color: #6080a0;
		font-family: 'Orbitron', sans-serif;
		font-size: 9px;
		font-weight: 700;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.preset-btn:hover {
		border-color: rgba(0, 150, 200, 0.4);
		color: #00ccff;
		background: rgba(0, 100, 150, 0.2);
	}

	.speed-label {
		font-size: 8px;
		color: #4a6080;
		letter-spacing: 1px;
		text-align: center;
	}

	.speed-buttons {
		display: flex;
		gap: 2px;
	}

	.speed-btn {
		padding: 6px 8px;
		background: rgba(10, 20, 40, 0.6);
		border: 1px solid rgba(60, 80, 120, 0.3);
		color: #6080a0;
		font-family: 'JetBrains Mono', monospace;
		font-size: 10px;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.speed-btn:hover {
		border-color: rgba(0, 150, 200, 0.4);
		color: #80a0c0;
	}

	.speed-btn.active {
		background: rgba(0, 150, 200, 0.2);
		border-color: rgba(0, 200, 255, 0.5);
		color: #00ccff;
	}

	.reset-btn {
		padding: 6px 12px;
		height: 32px;
		background: rgba(0, 100, 150, 0.2);
		border: 1px solid rgba(0, 150, 200, 0.3);
		color: #00aadd;
		font-family: 'Orbitron', sans-serif;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 1px;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.2s;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.reset-btn:hover {
		background: rgba(0, 150, 200, 0.3);
		box-shadow: 0 0 10px rgba(0, 150, 200, 0.2);
	}
</style>

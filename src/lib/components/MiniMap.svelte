<script lang="ts">
	import { onMount } from 'svelte';

	interface MiniMapItem {
		x: number;
		z: number;
		name: string;
		type: string;
		color: string;
	}

	interface CameraState {
		px: number; py: number; pz: number;
		tx: number; ty: number; tz: number;
	}

	let {
		getData,
		selectedId = null,
		getCameraState = null
	}: {
		getData: () => MiniMapItem[];
		selectedId?: string | null;
		getCameraState?: (() => CameraState | null) | null;
	} = $props();

	let canvas: HTMLCanvasElement;
	let rafId = 0;

	const SIZE = 160;
	const MAX_RANGE = 300; // scene units visible in mini-map

	onMount(() => {
		const ctx = canvas.getContext('2d')!;
		const render = () => {
			ctx.clearRect(0, 0, SIZE, SIZE);

			// Background
			ctx.fillStyle = 'rgba(5, 12, 25, 0.85)';
			ctx.fillRect(0, 0, SIZE, SIZE);

			// Grid circles
			ctx.strokeStyle = 'rgba(0, 100, 150, 0.15)';
			ctx.lineWidth = 1;
			for (let r = 1; r <= 3; r++) {
				ctx.beginPath();
				ctx.arc(SIZE / 2, SIZE / 2, (r / 3) * (SIZE / 2 - 4), 0, Math.PI * 2);
				ctx.stroke();
			}

			// Cross hairs
			ctx.strokeStyle = 'rgba(0, 100, 150, 0.1)';
			ctx.beginPath();
			ctx.moveTo(SIZE / 2, 0);
			ctx.lineTo(SIZE / 2, SIZE);
			ctx.moveTo(0, SIZE / 2);
			ctx.lineTo(SIZE, SIZE / 2);
			ctx.stroke();

			const items = getData();
			const scale = (SIZE / 2 - 6) / MAX_RANGE;

			for (const item of items) {
				const px = SIZE / 2 + item.x * scale;
				const py = SIZE / 2 + item.z * scale;

				if (px < 2 || px > SIZE - 2 || py < 2 || py > SIZE - 2) continue;

				const isSelected = item.name === selectedId;
				const isSun = item.type === 'sun';

				if (isSun) {
					// Sun glow
					const grad = ctx.createRadialGradient(px, py, 0, px, py, 8);
					grad.addColorStop(0, 'rgba(255, 200, 80, 0.8)');
					grad.addColorStop(1, 'rgba(255, 200, 80, 0)');
					ctx.fillStyle = grad;
					ctx.fillRect(px - 8, py - 8, 16, 16);
					ctx.fillStyle = '#ffdd66';
					ctx.beginPath();
					ctx.arc(px, py, 3, 0, Math.PI * 2);
					ctx.fill();
				} else {
					ctx.fillStyle = item.color;
					ctx.beginPath();
					ctx.arc(px, py, isSelected ? 3 : 2, 0, Math.PI * 2);
					ctx.fill();

					if (isSelected) {
						ctx.strokeStyle = '#fff';
						ctx.lineWidth = 1;
						ctx.beginPath();
						ctx.arc(px, py, 5, 0, Math.PI * 2);
						ctx.stroke();
					}
				}
			}

			// Draw camera position and look direction
			const cam = getCameraState?.();
			if (cam) {
				const camPx = SIZE / 2 + cam.px * scale;
				const camPy = SIZE / 2 + cam.pz * scale;
				const targetPx = SIZE / 2 + cam.tx * scale;
				const targetPy = SIZE / 2 + cam.tz * scale;

				const camInRange = camPx >= 0 && camPx <= SIZE && camPy >= 0 && camPy <= SIZE;
				const targetInRange = targetPx >= 0 && targetPx <= SIZE && targetPy >= 0 && targetPy <= SIZE;

				if (camInRange || targetInRange) {
					if (camInRange && targetInRange) {
						ctx.strokeStyle = 'rgba(0, 255, 100, 0.5)';
						ctx.lineWidth = 1;
						ctx.setLineDash([3, 2]);
						ctx.beginPath();
						ctx.moveTo(camPx, camPy);
						ctx.lineTo(targetPx, targetPy);
						ctx.stroke();
						ctx.setLineDash([]);
					}

					if (camInRange) {
						const dx = targetPx - camPx;
						const dy = targetPy - camPy;
						const angle = Math.atan2(dy, dx);

						ctx.save();
						ctx.translate(camPx, camPy);
						ctx.rotate(angle);
						ctx.fillStyle = '#00ff66';
						ctx.beginPath();
						ctx.moveTo(5, 0);
						ctx.lineTo(-3, -3);
						ctx.lineTo(-3, 3);
						ctx.closePath();
						ctx.fill();
						ctx.restore();
					}

					if (targetInRange && (Math.abs(targetPx - camPx) > 3 || Math.abs(targetPy - camPy) > 3)) {
						ctx.strokeStyle = 'rgba(0, 255, 100, 0.6)';
						ctx.lineWidth = 1;
						ctx.beginPath();
						ctx.moveTo(targetPx - 4, targetPy);
						ctx.lineTo(targetPx + 4, targetPy);
						ctx.moveTo(targetPx, targetPy - 4);
						ctx.lineTo(targetPx, targetPy + 4);
						ctx.stroke();
					}
				}
			}

			// Border
			ctx.strokeStyle = 'rgba(0, 150, 200, 0.3)';
			ctx.lineWidth = 1;
			ctx.strokeRect(0.5, 0.5, SIZE - 1, SIZE - 1);

			rafId = requestAnimationFrame(render);
		};
		render();

		return () => cancelAnimationFrame(rafId);
	});
</script>

<canvas bind:this={canvas} width={SIZE} height={SIZE} class="minimap-canvas" title="Top-down view — green triangle shows camera, crosshair shows look target"></canvas>

<style>
	.minimap-canvas {
		display: block;
		border-radius: 4px;
		cursor: default;
	}
</style>

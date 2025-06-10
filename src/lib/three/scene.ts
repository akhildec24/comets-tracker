import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { PlanetData, SmallBody } from '$lib/types';
import { PLANETS, SUN_DATA, MOON_DATA } from '$lib/solarSystem';
import { orbitalPosition, orbitPath, currentJD, dateToJD } from '$lib/orbital';
import { createPlanetTexture, createSunGlowTexture } from './textures';

interface TrackedBody {
	body: SmallBody;
	mesh: THREE.Mesh;
	orbitLine: THREE.Line;
	label: string;
	tail: THREE.Points | null;
}

export class SolarSystemScene {
	private renderer: THREE.WebGLRenderer;
	private scene: THREE.Scene;
	private camera: THREE.PerspectiveCamera;
	private controls: OrbitControls;
	private container: HTMLElement;

	private planetMeshes: Map<string, THREE.Mesh> = new Map();
	private planetOrbits: Map<string, THREE.Line> = new Map();
	private sun: THREE.Mesh;
	private sunGlow: THREE.Mesh;
	private starField: THREE.Points;
	private moon: THREE.Mesh | null = null;
	private asteroidBelt: THREE.Points | null = null;
	private atmospheres: Map<string, THREE.Mesh> = new Map();
	private earthClouds: THREE.Mesh | null = null;
	private composer: EffectComposer | null = null;
	private bloomPass: UnrealBloomPass | null = null;

	private trackedBodies: Map<string, TrackedBody> = new Map();
	private raycaster = new THREE.Raycaster();
	private mouse = new THREE.Vector2();
	private clickTargets: THREE.Object3D[] = [];

	private animationId = 0;
	private currentJD = currentJD();
	private timeSpeed = 1; // days per second
	private paused = false;
	private followTarget: string | null = null;
	private followOffset: THREE.Vector3 = new THREE.Vector3();
	private isolated: boolean = false;
	private isolatedId: string | null = null;

	public onSelect: (data: { type: string; id: string; name: string } | null) => void = () => {};
	public onTimeUpdate: (jd: number) => void = () => {};

	private labels: Map<string, HTMLDivElement> = new Map();
	private labelContainer: HTMLDivElement;

	constructor(container: HTMLElement) {
		this.container = container;

		// Renderer
		this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
		this.renderer.setSize(container.clientWidth, container.clientHeight);
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		// Tone mapping is handled by OutputPass in the post-processing pipeline
		this.renderer.toneMapping = THREE.NoToneMapping;
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		container.appendChild(this.renderer.domElement);

		// Scene
		this.scene = new THREE.Scene();
		this.scene.background = new THREE.Color(0x000005);

		// Camera
		this.camera = new THREE.PerspectiveCamera(
			60,
			container.clientWidth / container.clientHeight,
			0.1,
			5000
		);
		this.camera.position.set(0, 200, 400);

		// Controls
		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.05;
		this.controls.minDistance = 10;
		this.controls.maxDistance = 3000;
		this.controls.addEventListener('start', () => {
			this.followTarget = null;
		});

		// Label container (HTML overlay for labels)
		this.labelContainer = document.createElement('div');
		this.labelContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;';
		container.appendChild(this.labelContainer);

		// Lighting
		const ambient = new THREE.AmbientLight(0x223344, 0.15);
		this.scene.add(ambient);

		const sunLight = new THREE.PointLight(0xfff5e0, 3, 8000, 0.3);
		sunLight.position.set(0, 0, 0);
		this.scene.add(sunLight);

		// Subtle hemisphere light for ambient sky/ground variation
		const hemiLight = new THREE.HemisphereLight(0x224466, 0x000000, 0.15);
		this.scene.add(hemiLight);

		// Sun
		this.sun = this.createSun();
		this.scene.add(this.sun);

		// Sun glow
		this.sunGlow = this.createSunGlow();
		this.scene.add(this.sunGlow);

		// Star field
		this.starField = this.createStarField();
		this.scene.add(this.starField);

		// Planets
		for (const planet of PLANETS) {
			this.createPlanet(planet);
		}

		// Earth's Moon
		this.createMoon();

		// Asteroid belt
		this.createAsteroidBelt();

		// Post-processing: bloom for glow effects
		this.composer = new EffectComposer(this.renderer);
		const renderPass = new RenderPass(this.scene, this.camera);
		this.composer.addPass(renderPass);

		this.bloomPass = new UnrealBloomPass(
			new THREE.Vector2(container.clientWidth, container.clientHeight),
			0.6,  // strength - subtle glow
			0.3,  // radius
			0.85  // threshold - only very bright objects (sun) bloom
		);
		this.composer.addPass(this.bloomPass);

		// OutputPass handles tone mapping + color space conversion for the composer pipeline
		this.composer.addPass(new OutputPass());

		// Event listeners
		window.addEventListener('resize', this.onResize);
		this.renderer.domElement.addEventListener('click', this.onClick);
		this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);

		this.animate();
	}

	private createSun(): THREE.Mesh {
		const geo = new THREE.SphereGeometry(SUN_DATA.radius, 128, 64);
		const sunTexture = createPlanetTexture('sun');
		const mat = new THREE.MeshBasicMaterial({
			map: sunTexture,
			color: 0xffffff,
		});
		const mesh = new THREE.Mesh(geo, mat);
		mesh.userData = { type: 'sun', id: 'sun', name: 'Sun' };
		this.clickTargets.push(mesh);
		return mesh;
	}

	private createSunGlow(): THREE.Mesh {
		const geo = new THREE.SphereGeometry(SUN_DATA.radius * 3, 64, 64);
		const glowTexture = createSunGlowTexture();
		const mat = new THREE.MeshBasicMaterial({
			map: glowTexture,
			color: 0xff8833,
			transparent: true,
			opacity: 0.6,
			side: THREE.BackSide,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
		});
		return new THREE.Mesh(geo, mat);
	}

	private createStarField(): THREE.Points {
		const count = 12000;
		const milkyWayCount = 4000;
		const total = count + milkyWayCount;
		const positions = new Float32Array(total * 3);
		const colors = new Float32Array(total * 3);
		const sizes = new Float32Array(total);

		// Regular stars (uniform distribution)
		for (let i = 0; i < count; i++) {
			const r = 2000 + Math.random() * 2000;
			const theta = Math.random() * Math.PI * 2;
			const phi = Math.acos(2 * Math.random() - 1);

			positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
			positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
			positions[i * 3 + 2] = r * Math.cos(phi);

			const brightness = 0.3 + Math.random() * 0.4;
			const tint = Math.random();
			if (tint < 0.7) {
				colors[i * 3] = brightness;
				colors[i * 3 + 1] = brightness;
				colors[i * 3 + 2] = brightness;
			} else if (tint < 0.85) {
				colors[i * 3] = brightness;
				colors[i * 3 + 1] = brightness * 0.9;
				colors[i * 3 + 2] = brightness * 0.6;
			} else {
				colors[i * 3] = brightness * 0.6;
				colors[i * 3 + 1] = brightness * 0.8;
				colors[i * 3 + 2] = brightness;
			}
			sizes[i] = Math.random() < 0.1 ? 2.5 : 1.0 + Math.random() * 0.5;
		}

		// Milky Way band (concentrated along a tilted plane)
		const galacticTilt = 0.6;
		for (let i = count; i < total; i++) {
			const r = 2500 + Math.random() * 1500;
			const theta = Math.random() * Math.PI * 2;
			const bandWidth = (Math.random() - 0.5) * 0.3;

			let x = r * Math.cos(theta);
			let y = r * bandWidth;
			let z = r * Math.sin(theta);

			const cosT = Math.cos(galacticTilt);
			const sinT = Math.sin(galacticTilt);
			const rx = x * cosT - y * sinT;
			const ry = x * sinT + y * cosT;

			positions[i * 3] = rx;
			positions[i * 3 + 1] = ry;
			positions[i * 3 + 2] = z;

			const brightness = 0.15 + Math.random() * 0.25;
			const dust = Math.random();
			if (dust < 0.5) {
				colors[i * 3] = brightness;
				colors[i * 3 + 1] = brightness * 0.85;
				colors[i * 3 + 2] = brightness * 0.6;
			} else {
				colors[i * 3] = brightness * 0.7;
				colors[i * 3 + 1] = brightness * 0.8;
				colors[i * 3 + 2] = brightness;
			}
			sizes[i] = 0.5 + Math.random() * 0.8;
		}

		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

		const mat = new THREE.PointsMaterial({
			size: 1.5,
			vertexColors: true,
			transparent: true,
			opacity: 0.9,
			sizeAttenuation: false,
		});

		return new THREE.Points(geo, mat);
	}

	private createPlanet(planet: PlanetData) {
		const texType = planet.name.toLowerCase() as 'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';
		const texture = createPlanetTexture(texType);

		const geo = new THREE.SphereGeometry(planet.radius, 128, 64);
		const mat = new THREE.MeshStandardMaterial({
			map: texture,
			roughness: planet.name === 'Earth' ? 0.6 : 0.85,
			metalness: 0.0,
			emissive: planet.color,
			emissiveIntensity: 0.03,
		});

		// Earth gets specular ocean reflections
		if (planet.name === 'Earth') {
			mat.roughnessMap = createPlanetTexture('earthBump');
			mat.roughness = 0.4;
			mat.metalness = 0.1;
		}

		const mesh = new THREE.Mesh(geo, mat);
		mesh.userData = { type: 'planet', id: planet.name, name: planet.name };

		// Axial tilt (approximate real values)
		const tilts: Record<string, number> = {
			Mercury: 0.03, Venus: 177.4, Earth: 23.4, Mars: 25.2,
			Jupiter: 3.1, Saturn: 26.7, Uranus: 97.8, Neptune: 28.3
		};
		const tilt = (tilts[planet.name] || 0) * Math.PI / 180;
		mesh.rotation.z = tilt;

		this.clickTargets.push(mesh);
		this.scene.add(mesh);
		this.planetMeshes.set(planet.name, mesh);

		// Earth cloud layer (separate rotating sphere)
		if (planet.name === 'Earth') {
			const cloudTex = createPlanetTexture('earthClouds');
			const cloudGeo = new THREE.SphereGeometry(planet.radius * 1.02, 64, 32);
			const cloudMat = new THREE.MeshStandardMaterial({
				map: cloudTex,
				transparent: true,
				opacity: 0.8,
				roughness: 1.0,
				metalness: 0.0,
				depthWrite: false,
			});
			this.earthClouds = new THREE.Mesh(cloudGeo, cloudMat);
			this.earthClouds.rotation.z = tilt;
			mesh.add(this.earthClouds);
		}

		// Saturn's rings (high detail)
		if (planet.rings) {
			const ringGeo = new THREE.RingGeometry(planet.rings.inner, planet.rings.outer, 256, 16);
			const ringTexture = createPlanetTexture('saturnRing');

			// Adjust UVs so texture maps radially
			const pos = ringGeo.attributes.position;
			const uv = ringGeo.attributes.uv;
			const v3 = new THREE.Vector3();
			for (let i = 0; i < pos.count; i++) {
				v3.fromBufferAttribute(pos, i);
				const radius = v3.length();
				const t = (radius - planet.rings.inner) / (planet.rings.outer - planet.rings.inner);
				uv.setXY(i, t, 0.5);
			}

			const ringMat = new THREE.MeshBasicMaterial({
				map: ringTexture,
				color: planet.rings.color,
				side: THREE.DoubleSide,
				transparent: true,
				opacity: 0.9,
			});
			const rings = new THREE.Mesh(ringGeo, ringMat);
			rings.rotation.x = Math.PI / 2;
			mesh.add(rings);
		}

		// Uranus rings (faint, narrow)
		if (planet.name === 'Uranus') {
			const ringGeo = new THREE.RingGeometry(planet.radius * 1.4, planet.radius * 2.0, 128, 8);
			const ringTexture = createPlanetTexture('uranusRing');
			const pos = ringGeo.attributes.position;
			const uv = ringGeo.attributes.uv;
			const v3 = new THREE.Vector3();
			for (let i = 0; i < pos.count; i++) {
				v3.fromBufferAttribute(pos, i);
				const radius = v3.length();
				const t = (radius - planet.radius * 1.4) / (planet.radius * 0.6);
				uv.setXY(i, t, 0.5);
			}
			const ringMat = new THREE.MeshBasicMaterial({
				map: ringTexture,
				side: THREE.DoubleSide,
				transparent: true,
				opacity: 0.5,
			});
			const rings = new THREE.Mesh(ringGeo, ringMat);
			rings.rotation.x = Math.PI / 2;
			mesh.add(rings);
		}

		// Orbit line
		const orbit = this.createPlanetOrbit(planet);
		this.scene.add(orbit);
		this.planetOrbits.set(planet.name, orbit);

		// Atmosphere glow (fresnel shader for smooth rim light)
		if (planet.hasAtmosphere && planet.atmosphereColor !== undefined) {
			const atmGeo = new THREE.SphereGeometry(planet.radius * 1.12, 64, 64);
			const atmMat = new THREE.ShaderMaterial({
				uniforms: {
					glowColor: { value: new THREE.Color(planet.atmosphereColor) },
					intensity: { value: 0.6 },
				},
				vertexShader: `
					varying vec3 vNormal;
					varying vec3 vViewDir;
					void main() {
						vNormal = normalize(normalMatrix * normal);
						vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
						vViewDir = normalize(-mvPos.xyz);
						gl_Position = projectionMatrix * mvPos;
					}
				`,
				fragmentShader: `
					uniform vec3 glowColor;
					uniform float intensity;
					varying vec3 vNormal;
					varying vec3 vViewDir;
					void main() {
						float fresnel = pow(1.0 - dot(vNormal, vViewDir), 2.5);
						gl_FragColor = vec4(glowColor, fresnel * intensity);
					}
				`,
				transparent: true,
				blending: THREE.AdditiveBlending,
				side: THREE.BackSide,
				depthWrite: false,
			});
			const atmMesh = new THREE.Mesh(atmGeo, atmMat);
			mesh.add(atmMesh);
			this.atmospheres.set(planet.name, atmMesh);
		}

		// Label
		this.createLabel(planet.name, planet.name, '#88ccff');
	}

	private createMoon() {
		const geo = new THREE.SphereGeometry(MOON_DATA.radius, 64, 32);
		const moonTexture = createPlanetTexture('moon');
		const mat = new THREE.MeshStandardMaterial({
			map: moonTexture,
			roughness: 0.95,
			metalness: 0.0,
		});
		const mesh = new THREE.Mesh(geo, mat);
		mesh.userData = { type: 'moon', id: 'moon', name: 'Moon' };
		this.clickTargets.push(mesh);
		this.scene.add(mesh);
		this.moon = mesh;
		this.createLabel('moon', 'Moon', '#aaaaaa');
	}

	private createAsteroidBelt() {
		const count = 3000;
		const positions = new Float32Array(count * 3);
		const colors = new Float32Array(count * 3);
		const sizes = new Float32Array(count);

		const innerRadius = 2.2 * 50; // ~Mars + gap
		const outerRadius = 3.2 * 50; // ~before Jupiter

		for (let i = 0; i < count; i++) {
			const r = innerRadius + Math.random() * (outerRadius - innerRadius);
			const theta = Math.random() * Math.PI * 2;
			const incl = (Math.random() - 0.5) * 0.15;

			positions[i * 3] = r * Math.cos(theta);
			positions[i * 3 + 1] = r * Math.sin(incl);
			positions[i * 3 + 2] = r * Math.sin(theta);

			const brightness = 0.3 + Math.random() * 0.4;
			colors[i * 3] = brightness * 0.8;
			colors[i * 3 + 1] = brightness * 0.7;
			colors[i * 3 + 2] = brightness * 0.5;
			sizes[i] = 0.5 + Math.random() * 1.5;
		}

		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

		const mat = new THREE.PointsMaterial({
			size: 0.8,
			vertexColors: true,
			transparent: true,
			opacity: 0.6,
			sizeAttenuation: true,
		});

		this.asteroidBelt = new THREE.Points(geo, mat);
		this.scene.add(this.asteroidBelt);
	}

	private createPlanetOrbit(planet: PlanetData): THREE.Line {
		const segments = 256;
		const points: THREE.Vector3[] = [];
		const a = planet.semiMajorAxis;
		const e = planet.eccentricity;
		const inc = planet.inclination * Math.PI / 180;
		const w = planet.argumentPerihelion * Math.PI / 180;
		const omega = planet.longitudeAscendingNode * Math.PI / 180;

		const cosO = Math.cos(omega);
		const sinO = Math.sin(omega);
		const cosI = Math.cos(inc);
		const sinI = Math.sin(inc);
		const cosW = Math.cos(w);
		const sinW = Math.sin(w);

		for (let s = 0; s <= segments; s++) {
			const ta = (s / segments) * 2 * Math.PI;
			const r = a * (1 - e * e) / (1 + e * Math.cos(ta));
			const xp = r * Math.cos(ta);
			const yp = r * Math.sin(ta);
			const xw = xp * cosW - yp * sinW;
			const yw = xp * sinW + yp * cosW;
			const x = cosO * xw - sinO * yw * cosI;
			const y = sinO * xw + cosO * yw * cosI;
			const z = yw * sinI;
			points.push(new THREE.Vector3(x, z, y));
		}

		const geo = new THREE.BufferGeometry().setFromPoints(points);
		const mat = new THREE.LineBasicMaterial({
			color: 0x3a5a8a,
			transparent: true,
			opacity: 0.35,
		});
		const line = new THREE.Line(geo, mat);
		line.renderOrder = -1;
		return line;
	}

	private createLabel(id: string, text: string, color: string) {
		const div = document.createElement('div');
		div.textContent = text;
		div.style.cssText = `
			position: absolute;
			color: ${color};
			font-family: 'Courier New', monospace;
			font-size: 11px;
			pointer-events: none;
			text-shadow: 0 0 4px rgba(0,0,0,0.8);
			transform: translate(-50%, -50%);
			white-space: nowrap;
			opacity: 0.8;
		`;
		this.labelContainer.appendChild(div);
		this.labels.set(id, div);
	}

	private updateLabels() {
		const update = (id: string, pos: THREE.Vector3) => {
			const label = this.labels.get(id);
			if (!label) return;
			const screenPos = pos.clone().project(this.camera);
			if (screenPos.z > 1 || screenPos.z < -1) {
				label.style.display = 'none';
				return;
			}
			const x = (screenPos.x * 0.5 + 0.5) * this.container.clientWidth;
			const y = (-screenPos.y * 0.5 + 0.5) * this.container.clientHeight;
			label.style.display = 'block';
			label.style.left = `${x}px`;
			label.style.top = `${y - 15}px`;
		};

		update('Sun', this.sun.position);
		for (const [name, mesh] of this.planetMeshes) {
			update(name, mesh.position);
		}
		if (this.moon) {
			update('moon', this.moon.position);
		}
		for (const [id, tracked] of this.trackedBodies) {
			update(id, tracked.mesh.position);
		}
	}

	public addSmallBody(body: SmallBody) {
		if (this.trackedBodies.has(body.id)) return;

		const isComet = body.kind === 'comet';
		const size = isComet ? 0.4 : 0.3;
		const color = isComet ? 0x00ffff : 0xff8844;

		// Body mesh
		const geo = new THREE.SphereGeometry(size, 16, 16);
		const mat = new THREE.MeshPhongMaterial({
			color,
			emissive: color,
			emissiveIntensity: 0.5,
		});
		const mesh = new THREE.Mesh(geo, mat);
		mesh.userData = { type: body.kind, id: body.id, name: body.name || body.des };
		this.clickTargets.push(mesh);
		this.scene.add(mesh);

		// Orbit line
		const orbitPoints = orbitPath(body.orbit, 256);
		const orbitGeo = new THREE.BufferGeometry();
		orbitGeo.setAttribute('position', new THREE.BufferAttribute(orbitPoints, 3));
		const orbitMat = new THREE.LineBasicMaterial({
			color,
			transparent: true,
			opacity: 0.5,
		});
		const orbitLine = new THREE.Line(orbitGeo, orbitMat);
		this.scene.add(orbitLine);

		// Comet tail (particle-based, oriented away from sun in updatePositions)
		let tail: THREE.Points | null = null;
		if (isComet) {
			const tailParticleCount = 200;
			const tailPositions = new Float32Array(tailParticleCount * 3);
			const tailColors = new Float32Array(tailParticleCount * 3);
			const tailSizes = new Float32Array(tailParticleCount);

			for (let i = 0; i < tailParticleCount; i++) {
				const t = i / tailParticleCount;
				const spread = 0.5 + t * 2.5;
				tailPositions[i * 3] = (Math.random() - 0.5) * spread;
				tailPositions[i * 3 + 1] = (Math.random() - 0.5) * spread;
				tailPositions[i * 3 + 2] = t * 20; // tail extends along +Z, will be oriented away from sun

				const fade = 1 - t;
				tailColors[i * 3] = 0.4 * fade + 0.1;
				tailColors[i * 3 + 1] = 0.7 * fade + 0.1;
				tailColors[i * 3 + 2] = 1.0 * fade + 0.1;
				tailSizes[i] = (1 - t) * 2 + 0.3;
			}

			const tailGeo = new THREE.BufferGeometry();
			tailGeo.setAttribute('position', new THREE.BufferAttribute(tailPositions, 3));
			tailGeo.setAttribute('color', new THREE.BufferAttribute(tailColors, 3));

			const tailMat = new THREE.PointsMaterial({
				size: 1.5,
				vertexColors: true,
				transparent: true,
				opacity: 0.6,
				blending: THREE.AdditiveBlending,
				depthWrite: false,
				sizeAttenuation: true,
			});
			tail = new THREE.Points(tailGeo, tailMat);
			this.scene.add(tail);
		}

		this.createLabel(body.id, body.name || body.des, isComet ? '#00ffff' : '#ff8844');

		this.trackedBodies.set(body.id, { body, mesh, orbitLine, label: body.name || body.des, tail });
	}

	public removeSmallBody(id: string) {
		const tracked = this.trackedBodies.get(id);
		if (!tracked) return;
		this.scene.remove(tracked.mesh);
		this.scene.remove(tracked.orbitLine);
		if (tracked.tail) {
			this.scene.remove(tracked.tail);
		}
		const label = this.labels.get(id);
		if (label) {
			label.remove();
			this.labels.delete(id);
		}
		this.trackedBodies.delete(id);
		this.clickTargets = this.clickTargets.filter(t => t !== tracked.mesh);
	}

	public updateSmallBody(body: SmallBody) {
		const tracked = this.trackedBodies.get(body.id);
		if (!tracked) return;
		tracked.body = body;
		// Regenerate orbit line with updated elements
		this.scene.remove(tracked.orbitLine);
		const orbitPoints = orbitPath(body.orbit, 256);
		const orbitGeo = new THREE.BufferGeometry();
		orbitGeo.setAttribute('position', new THREE.BufferAttribute(orbitPoints, 3));
		const isComet = body.kind === 'comet';
		const orbitMat = new THREE.LineBasicMaterial({
			color: isComet ? 0x00ffff : 0xff8844,
			transparent: true,
			opacity: 0.5,
		});
		const orbitLine = new THREE.Line(orbitGeo, orbitMat);
		this.scene.add(orbitLine);
		tracked.orbitLine = orbitLine;
	}

	public clearSmallBodies() {
		for (const id of Array.from(this.trackedBodies.keys())) {
			this.removeSmallBody(id);
		}
	}

	public focusOn(id: string) {
		let target: THREE.Object3D | null = null;
		if (id === 'sun') {
			target = this.sun;
		} else if (this.planetMeshes.has(id)) {
			target = this.planetMeshes.get(id)!;
		} else if (this.trackedBodies.has(id)) {
			target = this.trackedBodies.get(id)!.mesh;
		}
		if (!target) return;

		const pos = target.position.clone();
		const distance = id === 'sun' ? 50 : 30;
		this.controls.target.copy(pos);

		// Move camera to a nice viewing angle
		const offset = new THREE.Vector3(distance, distance * 0.5, distance);
		this.camera.position.copy(pos).add(offset);

		// Enable follow mode
		this.followTarget = id;
		this.followOffset.copy(offset);

		// Update isolation target if isolation is active
		if (this.isolated) {
			this.isolatedId = id;
			this.applyIsolation();
		}
	}

	public clearFollow() {
		this.followTarget = null;
	}

	public setIsolatedView(enabled: boolean) {
		this.isolated = enabled;
		if (!enabled) {
			this.isolatedId = null;
		}
		this.applyIsolation();
	}

	private applyIsolation() {
		if (!this.isolated || !this.isolatedId) {
			// Show everything
			this.starField.visible = true;
			this.sunGlow.visible = true;
			if (this.asteroidBelt) this.asteroidBelt.visible = true;
			for (const [name, mesh] of this.planetMeshes) {
				mesh.visible = true;
				const orbit = this.planetOrbits.get(name);
				if (orbit) orbit.visible = true;
			}
			for (const [, tracked] of this.trackedBodies) {
				tracked.mesh.visible = true;
				tracked.orbitLine.visible = true;
				if (tracked.tail) tracked.tail.visible = true;
			}
			if (this.moon) this.moon.visible = true;
			return;
		}

		// Isolated mode: hide everything, then show only the focused object + nearby small bodies
		this.starField.visible = false;
		this.sunGlow.visible = false;
		if (this.asteroidBelt) this.asteroidBelt.visible = false;

		// Get focused object position
		let focusPos: THREE.Vector3 | null = null;
		if (this.isolatedId === 'sun') {
			focusPos = this.sun.position;
		} else if (this.planetMeshes.has(this.isolatedId)) {
			focusPos = this.planetMeshes.get(this.isolatedId)!.position;
		} else if (this.trackedBodies.has(this.isolatedId)) {
			focusPos = this.trackedBodies.get(this.isolatedId)!.mesh.position;
		}

		// Hide all planets except the focused one
		for (const [name, mesh] of this.planetMeshes) {
			const isFocused = name === this.isolatedId;
			mesh.visible = isFocused;
			const orbit = this.planetOrbits.get(name);
			if (orbit) orbit.visible = isFocused;
		}

		// Show sun only if focused on sun or if focus is inner planet
		if (this.isolatedId === 'sun') {
			this.sun.visible = true;
			this.sunGlow.visible = true;
		} else {
			this.sun.visible = false;
		}

		// Moon: show only if focusing on Earth or Moon
		if (this.moon) {
			this.moon.visible = this.isolatedId === 'Earth' || this.isolatedId === 'moon';
		}

		// Small bodies: show only those within proximity of the focused object
		const proximityThreshold = 100; // scene units (~2 AU)
		for (const [, tracked] of this.trackedBodies) {
			if (!focusPos) {
				tracked.mesh.visible = false;
				tracked.orbitLine.visible = false;
				if (tracked.tail) tracked.tail.visible = false;
				continue;
			}
			const dist = tracked.mesh.position.distanceTo(focusPos);
			const isNear = dist <= proximityThreshold;
			const isFocused = tracked.body.id === this.isolatedId;
			tracked.mesh.visible = isNear || isFocused;
			tracked.orbitLine.visible = isNear || isFocused;
			if (tracked.tail) tracked.tail.visible = isNear || isFocused;
		}
	}

	public setTimeSpeed(speed: number) {
		this.timeSpeed = speed;
	}

	public setPaused(paused: boolean) {
		this.paused = paused;
	}

	public setTime(jd: number) {
		this.currentJD = jd;
	}

	public getTime(): number {
		return this.currentJD;
	}

	private updatePositions() {
		// Update planets
		for (const planet of PLANETS) {
			const mesh = this.planetMeshes.get(planet.name);
			if (!mesh) continue;

			const a = planet.semiMajorAxis;
			const e = planet.eccentricity;
			const inc = planet.inclination * Math.PI / 180;
			const w = planet.argumentPerihelion * Math.PI / 180;
			const omega = planet.longitudeAscendingNode * Math.PI / 180;

			const n = 2 * Math.PI / planet.orbitalPeriod; // radians per day
			const dt = this.currentJD - planet.epoch;
			const M = (planet.meanAnomalyAtEpoch * Math.PI / 180 + n * dt) % (2 * Math.PI);

			// Solve Kepler
			let E = M;
			for (let i = 0; i < 20; i++) {
				const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
				E -= dE;
				if (Math.abs(dE) < 1e-8) break;
			}

			const cosE = Math.cos(E);
			const sinE = Math.sin(E);
			const ta = Math.atan2(Math.sqrt(1 - e * e) * sinE, cosE - e);
			const r = a * (1 - e * cosE);

			const xp = r * Math.cos(ta);
			const yp = r * Math.sin(ta);
			const xw = xp * Math.cos(w) - yp * Math.sin(w);
			const yw = xp * Math.sin(w) + yp * Math.cos(w);

			const cosO = Math.cos(omega);
			const sinO = Math.sin(omega);
			const cosI = Math.cos(inc);
			const sinI = Math.sin(inc);

			mesh.position.set(
				cosO * xw - sinO * yw * cosI,
				yw * sinI,
				sinO * xw + cosO * yw * cosI
			);

			// Rotate planet at its individual speed
			mesh.rotation.y += planet.rotationSpeed ?? 0.005;
		}

		// Update Moon position (orbits Earth)
		if (this.moon) {
			const earthMesh = this.planetMeshes.get('Earth');
			if (earthMesh) {
				const a = MOON_DATA.semiMajorAxis;
				const e = MOON_DATA.eccentricity;
				const n = 2 * Math.PI / MOON_DATA.orbitalPeriod;
				const dt = this.currentJD - MOON_DATA.epoch;
				const M = (MOON_DATA.meanAnomalyAtEpoch * Math.PI / 180 + n * dt) % (2 * Math.PI);

				let E = M;
				for (let i = 0; i < 15; i++) {
					const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
					E -= dE;
					if (Math.abs(dE) < 1e-8) break;
				}

				const ta = Math.atan2(Math.sqrt(1 - e * e) * Math.sin(E), Math.cos(E) - e);
				const r = a * (1 - e * Math.cos(E));
				const incRad = MOON_DATA.inclination * Math.PI / 180;

				const mx = r * Math.cos(ta);
				const my = r * Math.sin(ta);

				this.moon.position.set(
					earthMesh.position.x + mx,
					earthMesh.position.y + my * Math.sin(incRad),
					earthMesh.position.z + my * Math.cos(incRad)
				);
				this.moon.rotation.y += 0.003;
			}
		}

		// Slowly rotate asteroid belt
		if (this.asteroidBelt) {
			this.asteroidBelt.rotation.y += 0.0003;
		}

		// Update small bodies
		for (const [, tracked] of this.trackedBodies) {
			const [x, y, z] = orbitalPosition(tracked.body.orbit, this.currentJD);
			tracked.mesh.position.set(x, y, z);

			// Orient comet tail away from sun
			if (tracked.body.kind === 'comet' && tracked.tail) {
				tracked.mesh.lookAt(0, 0, 0);
				tracked.mesh.rotateX(Math.PI);
				// Position tail at comet and orient it away from sun
				const dir = tracked.mesh.position.clone().normalize();
				tracked.tail.position.copy(tracked.mesh.position);
				tracked.tail.lookAt(tracked.mesh.position.clone().add(dir));
			}
		}

		// Rotate sun
		this.sun.rotation.y += 0.0008;

		// Pulse sun glow
		const t = performance.now() * 0.001;
		this.sunGlow.scale.setScalar(1 + Math.sin(t * 0.5) * 0.03);

		// Camera follow: keep camera at fixed offset from followed object
		if (this.followTarget) {
			let targetPos: THREE.Vector3 | null = null;
			if (this.followTarget === 'sun') {
				targetPos = this.sun.position;
			} else if (this.planetMeshes.has(this.followTarget)) {
				targetPos = this.planetMeshes.get(this.followTarget)!.position;
			} else if (this.trackedBodies.has(this.followTarget)) {
				targetPos = this.trackedBodies.get(this.followTarget)!.mesh.position;
			}
			if (targetPos) {
				this.controls.target.copy(targetPos);
				this.camera.position.copy(targetPos).add(this.followOffset);
			}
		}

		// Re-apply isolation filtering (proximity may change as objects orbit)
		if (this.isolated) {
			this.applyIsolation();
		}
	}

	private clock = new THREE.Clock();
	private lastTimeUpdate = 0;

	private animate = () => {
		this.animationId = requestAnimationFrame(this.animate);

		const delta = this.clock.getDelta();

		if (!this.paused) {
			this.currentJD += this.timeSpeed * delta;
			const now = performance.now();
			if (now - this.lastTimeUpdate > 250) {
				this.onTimeUpdate(this.currentJD);
				this.lastTimeUpdate = now;
			}
		}

		this.updatePositions();
		this.updateLabels();
		this.controls.update();

		// Sun glow pulsing
		const t = performance.now() * 0.001;
		if (this.sunGlow) {
			const pulse = 1 + Math.sin(t * 0.5) * 0.04;
			this.sunGlow.scale.setScalar(pulse);
			(this.sunGlow.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(t * 0.8) * 0.1;
		}

		// Earth clouds rotate independently
		if (this.earthClouds) {
			this.earthClouds.rotation.y += 0.015;
		}

		// Render with bloom post-processing
		if (this.composer) {
			this.composer.render();
		} else {
			this.renderer.render(this.scene, this.camera);
		}
	};

	private onResize = () => {
		const w = this.container.clientWidth;
		const h = this.container.clientHeight;
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(w, h);
		if (this.composer) {
			this.composer.setSize(w, h);
		}
	};

	private onPointerMove = (event: PointerEvent) => {
		const rect = this.renderer.domElement.getBoundingClientRect();
		this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
	};

	private onClick = (event: MouseEvent) => {
		const rect = this.renderer.domElement.getBoundingClientRect();
		this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

		this.raycaster.setFromCamera(this.mouse, this.camera);
		const intersects = this.raycaster.intersectObjects(this.clickTargets, true);

		if (intersects.length > 0) {
			// Traverse up to find the object with userData (parent planet mesh)
			let obj: THREE.Object3D | null = intersects[0].object;
			while (obj && (!obj.userData?.type || !obj.userData?.id)) {
				obj = obj.parent;
			}
			if (obj?.userData?.type) {
				const data = obj.userData;
				this.onSelect({ type: data.type, id: data.id, name: data.name });
			} else {
				this.onSelect(null);
			}
		} else {
			this.onSelect(null);
		}
	};

	public dispose() {
		cancelAnimationFrame(this.animationId);
		window.removeEventListener('resize', this.onResize);
		this.renderer.domElement.removeEventListener('click', this.onClick);
		this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
		this.composer?.dispose();
		this.renderer.dispose();
		this.container.removeChild(this.renderer.domElement);
		if (this.labelContainer.parentNode) {
			this.container.removeChild(this.labelContainer);
		}
	}
}

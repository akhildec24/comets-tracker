import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { PlanetData, SmallBody, Spacecraft, TrajectoryPoint } from '$lib/types';
import { PLANETS, SUN_DATA, MOON_DATA, INTERSTELLAR_MISSIONS } from '$lib/solarSystem';
import { orbitalPosition, orbitPath, currentJD, dateToJD } from '$lib/orbital';
import { createPlanetTexture, createSunGlowTexture } from './textures';
import { getSpacecraftTrajectory } from '$lib/api/nasa';

interface TrackedBody {
	body: SmallBody;
	mesh: THREE.Mesh;
	orbitLine: THREE.Line;
	label: string;
	tail: THREE.Points | null;
	dustTail: THREE.Points | null;
	velocityArrow: THREE.ArrowHelper | null;
}

interface GalileanMoon {
	mesh: THREE.Mesh;
	orbitRadius: number;
	period: number; // days
	phase: number; // initial angle
	color: number;
}

interface TrackedSpacecraft {
	spacecraft: Spacecraft;
	mesh: THREE.Mesh;
	trajectoryLine: THREE.Line;
	trajectory: TrajectoryPoint[];
	loaded: boolean;
}

export class SolarSystemScene {
	private renderer: THREE.WebGLRenderer;
	private scene: THREE.Scene;
	private camera: THREE.PerspectiveCamera;
	private controls: OrbitControls;
	private container: HTMLElement;

	private planetMeshes: Map<string, THREE.Object3D> = new Map();
	private planetOrbits: Map<string, THREE.Line> = new Map();
	private sun: THREE.Mesh;
	private sunGlow: THREE.Mesh;
	private starField: THREE.Points;
	private constellationLines: THREE.LineSegments;
	private meteorRadiants: THREE.Points | null = null;
	private moon: THREE.Mesh | null = null;
	private asteroidBelt: THREE.Points | null = null;
	private kuiperBelt: THREE.Points | null = null;
	private atmospheres: Map<string, THREE.Mesh> = new Map();
	private earthClouds: THREE.Mesh | null = null;
	private galileanMoons: GalileanMoon[] = [];
	private spacecraft: Map<string, TrackedSpacecraft> = new Map();
	private spacecraftVisible = true;
	private hiddenOrbits: Set<string> = new Set();
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
	private cameraTween: { from: THREE.Vector3; to: THREE.Vector3; targetFrom: THREE.Vector3; targetTo: THREE.Vector3; start: number; duration: number } | null = null;

	public onSelect: (data: { type: string; id: string; name: string } | null) => void = () => {};
	public onTimeUpdate: (jd: number) => void = () => {};

	private labels: Map<string, HTMLDivElement> = new Map();
	private labelContainer: HTMLDivElement;
	private labelsVisible = true;
	private trails: Map<string, THREE.Line> = new Map();
	private trailPositions: Map<string, THREE.Vector3[]> = new Map();
	private trailsVisible = false;
	private readonly TRAIL_MAX_POINTS = 100;
	private logScale = false;

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
			this.cameraTween = null;
		});

		// Label container (HTML overlay for labels)
		this.labelContainer = document.createElement('div');
		this.labelContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;';
		container.appendChild(this.labelContainer);

		// Lighting
		const ambient = new THREE.AmbientLight(0x223344, 0.15);
		this.scene.add(ambient);

		const sunLight = new THREE.PointLight(0xfff8f0, 3, 8000, 0.3);
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

		// Constellation lines
		this.constellationLines = this.createConstellations();
		this.scene.add(this.constellationLines);

		// Meteor shower radiants
		this.meteorRadiants = this.createMeteorRadiants();
		this.scene.add(this.meteorRadiants);

		// Planets
		for (const planet of PLANETS) {
			this.createPlanet(planet);
		}

		// Earth's Moon
		this.createMoon();

		// Jupiter's Galilean moons
		this.createGalileanMoons();

		// Asteroid belt
		this.createAsteroidBelt();

		// Kuiper belt
		this.createKuiperBelt();

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
			color: 0xffdd88,
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

	private createConstellations(): THREE.LineSegments {
		const R = 3000; // distance for constellation stars
		type StarDef = [number, number]; // [ra degrees, dec degrees]
		type Constellation = { name: string; lines: StarDef[][] };

		const constellations: Constellation[] = [
			// Ursa Major (Big Dipper)
			{ name: 'Ursa Major', lines: [
				[[165.9, 61.8], [173.5, 56.4]], [[173.5, 56.4], [179.8, 53.5]],
				[[179.8, 53.5], [185.5, 57.2]], [[185.5, 57.2], [193.5, 55.0]],
				[[193.5, 55.0], [201.3, 43.7]], [[201.3, 43.7], [179.8, 53.5]],
			]},
			// Orion
			{ name: 'Orion', lines: [
				[[78.6, -8.2], [88.8, 7.4]], [[88.8, 7.4], [95.2, -1.2]],
				[[95.2, -1.2], [84.1, -1.9]], [[84.1, -1.9], [78.6, -8.2]],
				[[88.8, 7.4], [81.3, 6.0]], [[95.2, -1.2], [98.0, -9.7]],
				[[84.1, -1.9], [86.9, -9.7]],
			]},
			// Cassiopeia
			{ name: 'Cassiopeia', lines: [
				[[2.3, 59.1], [10.1, 56.5]], [[10.1, 56.5], [13.7, 60.2]],
				[[13.7, 60.2], [23.5, 57.5]], [[23.5, 57.5], [32.9, 61.1]],
			]},
			// Cygnus (Northern Cross)
			{ name: 'Cygnus', lines: [
				[[310.4, 45.3], [305.6, 40.3]], [[305.6, 40.3], [299.1, 38.5]],
				[[299.1, 38.5], [292.3, 36.8]], [[305.6, 40.3], [312.5, 37.1]],
				[[305.6, 40.3], [309.1, 42.7]],
			]},
			// Leo
			{ name: 'Leo', lines: [
				[[146.5, 21.5], [137.0, 25.1]], [[137.0, 25.1], [130.5, 20.5]],
				[[130.5, 20.5], [126.2, 23.4]], [[126.2, 23.4], [131.1, 15.4]],
				[[131.1, 15.4], [146.5, 21.5]],
			]},
			// Scorpius
			{ name: 'Scorpius', lines: [
				[[240.1, -26.1], [241.4, -19.8]], [[241.4, -19.8], [245.3, -22.6]],
				[[245.3, -22.6], [251.0, -29.3]], [[251.0, -29.3], [258.7, -37.1]],
				[[258.7, -37.1], [263.0, -42.4]], [[263.0, -42.4], [269.3, -42.9]],
			]},
		];

		const positions: number[] = [];

		for (const con of constellations) {
			for (const [a, b] of con.lines) {
				const posA = this.celestialToCartesian(a[0], a[1], R);
				const posB = this.celestialToCartesian(b[0], b[1], R);
				positions.push(posA.x, posA.y, posA.z, posB.x, posB.y, posB.z);
			}
		}

		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

		const mat = new THREE.LineBasicMaterial({
			color: 0x2a4a6a,
			transparent: true,
			opacity: 0.35,
		});

		return new THREE.LineSegments(geo, mat);
	}

	private celestialToCartesian(raDeg: number, decDeg: number, r: number): THREE.Vector3 {
		const ra = raDeg * Math.PI / 180;
		const dec = decDeg * Math.PI / 180;
		return new THREE.Vector3(
			r * Math.cos(dec) * Math.cos(ra),
			r * Math.sin(dec),
			r * Math.cos(dec) * Math.sin(ra)
		);
	}

	private createMeteorRadiants(): THREE.Points {
		const R = 2800;
		// Major meteor shower radiants: [ra, dec, color]
		const showers: [number, number, number][] = [
			[210, 49, 0xff4444],   // Perseids (Aug)
			[95, 15, 0xff8844],    // Geminids (Dec)
			[76, 32, 0xffcc44],    // Quadrantids (Jan)
			[158, -22, 0x44ff88],  // Eta Aquariids (May)
			[52, 22, 0x4488ff],    // Lyrids (Apr)
			[238, -50, 0xff44ff],  // Orionids (Oct)
			[259, 54, 0x44ffff],   // Ursids (Dec)
			[32, -15, 0xffaa44],   // Leonids (Nov)
			[271, 33, 0x88ff44],   // Draconids (Oct)
			[113, 45, 0xff6688],   // Lyrids alternate
		];

		const positions = new Float32Array(showers.length * 3);
		const colors = new Float32Array(showers.length * 3);
		const sizes = new Float32Array(showers.length);

		for (let i = 0; i < showers.length; i++) {
			const [ra, dec, color] = showers[i];
			const pos = this.celestialToCartesian(ra, dec, R);
			positions[i * 3] = pos.x;
			positions[i * 3 + 1] = pos.y;
			positions[i * 3 + 2] = pos.z;

			const c = new THREE.Color(color);
			colors[i * 3] = c.r;
			colors[i * 3 + 1] = c.g;
			colors[i * 3 + 2] = c.b;
			sizes[i] = 8;
		}

		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
		geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

		const mat = new THREE.ShaderMaterial({
			uniforms: {
				uPixelRatio: { value: this.renderer.getPixelRatio() },
			},
			vertexShader: `
				attribute float aSize;
				attribute vec3 color;
				varying vec3 vColor;
				uniform float uPixelRatio;
				void main() {
					vColor = color;
					vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
					gl_PointSize = aSize * uPixelRatio * (300.0 / max(-mvPos.z, 1.0));
					gl_Position = projectionMatrix * mvPos;
				}
			`,
			fragmentShader: `
				varying vec3 vColor;
				void main() {
					vec2 uv = gl_PointCoord - vec2(0.5);
					float dist = length(uv);
					if (dist > 0.5) discard;
					float alpha = smoothstep(0.5, 0.0, dist);
					float ring = smoothstep(0.35, 0.3, dist) - smoothstep(0.3, 0.25, dist);
					gl_FragColor = vec4(vColor * (alpha + ring * 0.5), alpha * 0.6);
				}
			`,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
		});

		return new THREE.Points(geo, mat);
	}

	private createPlanet(planet: PlanetData) {
		const texType = planet.name.toLowerCase() as 'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';
		const texture = createPlanetTexture(texType);

		const geo = new THREE.SphereGeometry(planet.radius, 128, 64);
		const geoLow = new THREE.SphereGeometry(planet.radius, 32, 16);
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

		const meshLow = new THREE.Mesh(geoLow, mat);

		const lod = new THREE.LOD();
		lod.addLevel(mesh, 0);
		lod.addLevel(meshLow, 200);
		lod.userData = { type: 'planet', id: planet.name, name: planet.name };

		// Axial tilt (approximate real values)
		const tilts: Record<string, number> = {
			Mercury: 0.03, Venus: 177.4, Earth: 23.4, Mars: 25.2,
			Jupiter: 3.1, Saturn: 26.7, Uranus: 97.8, Neptune: 28.3
		};
		const tilt = (tilts[planet.name] || 0) * Math.PI / 180;
		lod.rotation.z = tilt;

		this.clickTargets.push(mesh);
		this.scene.add(lod);
		this.planetMeshes.set(planet.name, lod);

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
			const ringGeo = new THREE.RingGeometry(planet.radius * 1.5, planet.radius * 1.8, 128, 8);
			const ringTexture = createPlanetTexture('uranusRing');
			const pos = ringGeo.attributes.position;
			const uv = ringGeo.attributes.uv;
			const v3 = new THREE.Vector3();
			for (let i = 0; i < pos.count; i++) {
				v3.fromBufferAttribute(pos, i);
				const radius = v3.length();
				const t = (radius - planet.radius * 1.5) / (planet.radius * 0.3);
				uv.setXY(i, t, 0.5);
			}
			const ringMat = new THREE.MeshBasicMaterial({
				map: ringTexture,
				side: THREE.DoubleSide,
				transparent: true,
				opacity: 0.35,
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

	private createGalileanMoons() {
		// Jupiter radius is 4.0 scene units; moons orbit at 6-14 units from Jupiter
		const moonData = [
			{ name: 'Io', radius: 0.25, orbitRadius: 6.0, period: 1.769, color: 0xffe066, phase: 0 },
			{ name: 'Europa', radius: 0.22, orbitRadius: 8.0, period: 3.551, color: 0xd4c5a0, phase: 1.2 },
			{ name: 'Ganymede', radius: 0.35, orbitRadius: 10.5, period: 7.155, color: 0x9a8b7a, phase: 2.5 },
			{ name: 'Callisto', radius: 0.32, orbitRadius: 13.5, period: 16.689, color: 0x6b6258, phase: 4.0 },
		];

		for (const data of moonData) {
			const geo = new THREE.SphereGeometry(data.radius, 32, 16);
			const mat = new THREE.MeshStandardMaterial({
				color: data.color,
				roughness: 0.8,
				metalness: 0.0,
				emissive: data.color,
				emissiveIntensity: 0.1,
			});
			const mesh = new THREE.Mesh(geo, mat);
			mesh.userData = { type: 'galilean', id: data.name, name: data.name };
			this.scene.add(mesh);

			// Orbit line around Jupiter (will be positioned relative to Jupiter each frame)
			const orbitGeo = new THREE.BufferGeometry();
			const segments = 64;
			const orbitPoints = new Float32Array((segments + 1) * 3);
			for (let s = 0; s <= segments; s++) {
				const angle = (s / segments) * 2 * Math.PI;
				orbitPoints[s * 3] = Math.cos(angle) * data.orbitRadius;
				orbitPoints[s * 3 + 1] = 0;
				orbitPoints[s * 3 + 2] = Math.sin(angle) * data.orbitRadius;
			}
			orbitGeo.setAttribute('position', new THREE.BufferAttribute(orbitPoints, 3));
			const orbitMat = new THREE.LineBasicMaterial({
				color: data.color,
				transparent: true,
				opacity: 0.2,
			});
			const orbitLine = new THREE.Line(orbitGeo, orbitMat);
			orbitLine.userData = { galileanOrbit: true, parent: 'Jupiter' };
			this.scene.add(orbitLine);

			this.galileanMoons.push({
				mesh,
				orbitRadius: data.orbitRadius,
				period: data.period,
				phase: data.phase,
				color: data.color,
			});

			this.createLabel(`galilean-${data.name}`, data.name, '#' + data.color.toString(16).padStart(6, '0'));
		}
	}

	public async addSpacecraft(sc: Spacecraft) {
		if (this.spacecraft.has(sc.id)) return;

		// Create a small diamond-shaped marker for the spacecraft
		const geo = new THREE.OctahedronGeometry(0.6, 0);
		const mat = new THREE.MeshStandardMaterial({
			color: sc.color,
			emissive: sc.color,
			emissiveIntensity: 0.8,
			metalness: 0.3,
			roughness: 0.4,
		});
		const mesh = new THREE.Mesh(geo, mat);
		mesh.userData = { type: 'spacecraft', id: sc.id, name: sc.name };
		this.clickTargets.push(mesh);
		this.scene.add(mesh);

		// Create a placeholder trajectory line (will be filled when data loads)
		const trajGeo = new THREE.BufferGeometry();
		const placeholderPos = new Float32Array(2 * 3);
		trajGeo.setAttribute('position', new THREE.BufferAttribute(placeholderPos, 3));
		const trajMat = new THREE.LineBasicMaterial({
			color: sc.color,
			transparent: true,
			opacity: 0.4,
		});
		const trajectoryLine = new THREE.Line(trajGeo, trajMat);
		this.scene.add(trajectoryLine);

		this.createLabel(sc.id, sc.name, '#' + sc.color.toString(16).padStart(6, '0'));

		const entry: TrackedSpacecraft = {
			spacecraft: sc,
			mesh,
			trajectoryLine,
			trajectory: [],
			loaded: false,
		};
		this.spacecraft.set(sc.id, entry);

		// Fetch trajectory data from Horizons in background
		const startDate = sc.launchDate;
		const endDate = '2050-01-01';
		const trajectory = await getSpacecraftTrajectory(sc.naifId, startDate, endDate, '30d');

		if (trajectory.length > 0) {
			entry.trajectory = trajectory;
			entry.loaded = true;

			// Update trajectory line geometry
			const positions = new Float32Array(trajectory.length * 3);
			for (let i = 0; i < trajectory.length; i++) {
				positions[i * 3] = trajectory[i].x;
				positions[i * 3 + 1] = trajectory[i].y;
				positions[i * 3 + 2] = trajectory[i].z;
			}
			const newGeo = new THREE.BufferGeometry();
			newGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
			trajectoryLine.geometry.dispose();
			trajectoryLine.geometry = newGeo;
		}

		if (!this.spacecraftVisible) {
			mesh.visible = false;
			trajectoryLine.visible = false;
		}
	}

	public removeSpacecraft(id: string) {
		const entry = this.spacecraft.get(id);
		if (!entry) return;
		this.scene.remove(entry.mesh);
		this.scene.remove(entry.trajectoryLine);
		const label = this.labels.get(id);
		if (label) {
			label.remove();
			this.labels.delete(id);
		}
		this.spacecraft.delete(id);
		this.clickTargets = this.clickTargets.filter(t => t !== entry.mesh);
	}

	public setSpacecraftVisible(visible: boolean) {
		this.spacecraftVisible = visible;
		for (const entry of this.spacecraft.values()) {
			entry.mesh.visible = visible;
			entry.trajectoryLine.visible = visible;
		}
	}

	private createAsteroidBelt() {
		const count = 4000;
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

			// Rocky colors: grey-brown with variation
			const brightness = 0.25 + Math.random() * 0.45;
			const tint = Math.random();
			colors[i * 3] = brightness * (0.7 + tint * 0.2);
			colors[i * 3 + 1] = brightness * (0.6 + tint * 0.15);
			colors[i * 3 + 2] = brightness * (0.45 + tint * 0.1);
			sizes[i] = 0.8 + Math.random() * 2.5;
		}

		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
		geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

		const mat = new THREE.ShaderMaterial({
			uniforms: {
				uPixelRatio: { value: this.renderer.getPixelRatio() },
			},
			vertexShader: `
				attribute float aSize;
				attribute vec3 color;
				varying vec3 vColor;
				uniform float uPixelRatio;
				void main() {
					vColor = color;
					vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
					gl_PointSize = aSize * uPixelRatio * (300.0 / max(-mvPos.z, 1.0));
					gl_Position = projectionMatrix * mvPos;
				}
			`,
			fragmentShader: `
				varying vec3 vColor;
				void main() {
					vec2 uv = gl_PointCoord - vec2(0.5);
					float dist = length(uv);
					if (dist > 0.5) discard;
					// Soft circular edge
					float alpha = smoothstep(0.5, 0.35, dist);
					// Subtle irregular shading
					float shade = 1.0 - dist * 0.6;
					gl_FragColor = vec4(vColor * shade, alpha);
				}
			`,
			transparent: true,
			depthWrite: false,
			blending: THREE.NormalBlending,
		});

		this.asteroidBelt = new THREE.Points(geo, mat);
		this.scene.add(this.asteroidBelt);
	}

	private createKuiperBelt() {
		const count = 6000;
		const positions = new Float32Array(count * 3);
		const colors = new Float32Array(count * 3);
		const sizes = new Float32Array(count);

		const innerRadius = 30 * 50; // ~30 AU
		const outerRadius = 50 * 50; // ~50 AU

		for (let i = 0; i < count; i++) {
			const r = innerRadius + Math.random() * (outerRadius - innerRadius);
			const theta = Math.random() * Math.PI * 2;
			const incl = (Math.random() - 0.5) * 0.08;

			positions[i * 3] = r * Math.cos(theta);
			positions[i * 3 + 1] = r * Math.sin(incl);
			positions[i * 3 + 2] = r * Math.sin(theta);

			// Icy colors: blue-grey with variation
			const brightness = 0.15 + Math.random() * 0.35;
			const tint = Math.random();
			colors[i * 3] = brightness * (0.4 + tint * 0.15);
			colors[i * 3 + 1] = brightness * (0.5 + tint * 0.2);
			colors[i * 3 + 2] = brightness * (0.6 + tint * 0.25);
			sizes[i] = 0.5 + Math.random() * 1.5;
		}

		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
		geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

		const mat = new THREE.ShaderMaterial({
			uniforms: {
				uPixelRatio: { value: this.renderer.getPixelRatio() },
			},
			vertexShader: `
				attribute float aSize;
				attribute vec3 color;
				varying vec3 vColor;
				uniform float uPixelRatio;
				void main() {
					vColor = color;
					vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
					gl_PointSize = aSize * uPixelRatio * (300.0 / max(-mvPos.z, 1.0));
					gl_Position = projectionMatrix * mvPos;
				}
			`,
			fragmentShader: `
				varying vec3 vColor;
				void main() {
					vec2 uv = gl_PointCoord - vec2(0.5);
					float dist = length(uv);
					if (dist > 0.5) discard;
					float alpha = smoothstep(0.5, 0.35, dist);
					float shade = 1.0 - dist * 0.6;
					gl_FragColor = vec4(vColor * shade, alpha * 0.6);
				}
			`,
			transparent: true,
			depthWrite: false,
			blending: THREE.NormalBlending,
		});

		this.kuiperBelt = new THREE.Points(geo, mat);
		this.scene.add(this.kuiperBelt);
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
			let x = cosO * xw - sinO * yw * cosI;
			let y = sinO * xw + cosO * yw * cosI;
			let z = yw * sinI;
			if (this.logScale) {
				const dist = Math.sqrt(x * x + y * y + z * z);
				if (dist > 0) {
					const scale = this.scaleDistance(dist) / dist;
					x *= scale; y *= scale; z *= scale;
				}
			}
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
		const update = (id: string, pos: THREE.Vector3, visible: boolean = true) => {
			const label = this.labels.get(id);
			if (!label) return;
			if (!visible) {
				label.style.display = 'none';
				return;
			}
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
		for (const gm of this.galileanMoons) {
			update(`galilean-${gm.mesh.userData.name}`, gm.mesh.position, gm.mesh.visible);
		}
		for (const [id, tracked] of this.trackedBodies) {
			update(id, tracked.mesh.position);
		}
		for (const [id, entry] of this.spacecraft) {
			update(id, entry.mesh.position);
		}
	}

	public addSmallBody(body: SmallBody) {
		if (this.trackedBodies.has(body.id)) return;

		const isComet = body.kind === 'comet';
		// Size based on absolute magnitude if available (brighter = bigger)
		// Comets are tiny vs planets — keep well below Mercury (0.8 scene units)
		const baseSize = isComet ? 0.15 : 0.25;
		const hMag = body.h;
		let size = baseSize;
		if (hMag !== undefined) {
			// H=3 -> large comet, H=15 -> small. Range: 0.5x to 1.8x base
			size = baseSize * Math.max(0.5, Math.min(1.8, 1 + (12 - hMag) / 24));
		}
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

		// Comet tails: ion (blue, straight) + dust (white, curved/spread)
		let tail: THREE.Points | null = null;
		let dustTail: THREE.Points | null = null;
		if (isComet) {
			// Ion tail - blue, narrow, long
			const ionCount = 150;
			const ionPositions = new Float32Array(ionCount * 3);
			const ionColors = new Float32Array(ionCount * 3);
			for (let i = 0; i < ionCount; i++) {
				const t = i / ionCount;
				const spread = 0.1 + t * 0.3;
				ionPositions[i * 3] = (Math.random() - 0.5) * spread;
				ionPositions[i * 3 + 1] = (Math.random() - 0.5) * spread;
				ionPositions[i * 3 + 2] = t * 12; // long straight tail along +Z

				const fade = 1 - t;
				ionColors[i * 3] = 0.2 * fade;
				ionColors[i * 3 + 1] = 0.5 * fade;
				ionColors[i * 3 + 2] = 1.0 * fade;
			}
			const ionGeo = new THREE.BufferGeometry();
			ionGeo.setAttribute('position', new THREE.BufferAttribute(ionPositions, 3));
			ionGeo.setAttribute('color', new THREE.BufferAttribute(ionColors, 3));
			const ionMat = new THREE.PointsMaterial({
				size: 0.4,
				vertexColors: true,
				transparent: true,
				opacity: 0.7,
				blending: THREE.AdditiveBlending,
				depthWrite: false,
				sizeAttenuation: true,
			});
			tail = new THREE.Points(ionGeo, ionMat);
			this.scene.add(tail);

			// Dust tail - white/yellow, wider, shorter, more spread
			const dustCount = 120;
			const dustPositions = new Float32Array(dustCount * 3);
			const dustColors = new Float32Array(dustCount * 3);
			for (let i = 0; i < dustCount; i++) {
				const t = i / dustCount;
				const spread = 0.3 + t * 1.5;
				// Dust tail curves slightly (offset in X based on t)
				const curve = t * t * 1.5;
				dustPositions[i * 3] = (Math.random() - 0.5) * spread + curve;
				dustPositions[i * 3 + 1] = (Math.random() - 0.5) * spread;
				dustPositions[i * 3 + 2] = t * 8; // shorter than ion tail

				const fade = 1 - t;
				dustColors[i * 3] = 0.9 * fade;
				dustColors[i * 3 + 1] = 0.85 * fade;
				dustColors[i * 3 + 2] = 0.6 * fade;
			}
			const dustGeo = new THREE.BufferGeometry();
			dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
			dustGeo.setAttribute('color', new THREE.BufferAttribute(dustColors, 3));
			const dustMat = new THREE.PointsMaterial({
				size: 0.6,
				vertexColors: true,
				transparent: true,
				opacity: 0.5,
				blending: THREE.AdditiveBlending,
				depthWrite: false,
				sizeAttenuation: true,
			});
			dustTail = new THREE.Points(dustGeo, dustMat);
			this.scene.add(dustTail);
		}

		this.createLabel(body.id, body.name || body.des, isComet ? '#00ffff' : '#ff8844');

		// Velocity direction arrow for comets
		let velocityArrow: THREE.ArrowHelper | null = null;
		if (isComet) {
			velocityArrow = new THREE.ArrowHelper(
				new THREE.Vector3(0, 0, 1),
				mesh.position,
				3,
				0x00ffff,
				1,
				0.6
			);
			this.scene.add(velocityArrow);
		}

		this.trackedBodies.set(body.id, { body, mesh, orbitLine, label: body.name || body.des, tail, dustTail, velocityArrow });
	}

	public removeSmallBody(id: string) {
		const tracked = this.trackedBodies.get(id);
		if (!tracked) return;
		this.scene.remove(tracked.mesh);
		this.scene.remove(tracked.orbitLine);
		if (tracked.tail) {
			this.scene.remove(tracked.tail);
		}
		if (tracked.dustTail) {
			this.scene.remove(tracked.dustTail);
		}
		if (tracked.velocityArrow) {
			this.scene.remove(tracked.velocityArrow);
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

	public setSmallBodyVisibility(kind: string, visible: boolean) {
		for (const tracked of this.trackedBodies.values()) {
			if (tracked.body.kind === kind) {
				tracked.mesh.visible = visible;
				tracked.orbitLine.visible = visible && !this.hiddenOrbits.has(tracked.body.id);
				if (tracked.tail) tracked.tail.visible = visible;
				if (tracked.dustTail) tracked.dustTail.visible = visible;
				if (tracked.velocityArrow) tracked.velocityArrow.visible = visible;
			}
		}
	}

	public toggleOrbitVisibility(id: string): boolean {
		if (this.hiddenOrbits.has(id)) {
			this.hiddenOrbits.delete(id);
		} else {
			this.hiddenOrbits.add(id);
		}
		const visible = !this.hiddenOrbits.has(id);
		const tracked = this.trackedBodies.get(id);
		if (tracked) {
			tracked.orbitLine.visible = visible;
		}
		return visible;
	}

	public isOrbitVisible(id: string): boolean {
		return !this.hiddenOrbits.has(id);
	}

	public setLabelsVisible(visible: boolean) {
		this.labelsVisible = visible;
		this.labelContainer.style.display = visible ? 'block' : 'none';
	}

	public setTrailsVisible(visible: boolean) {
		this.trailsVisible = visible;
		if (!visible) {
			for (const trail of this.trails.values()) {
				trail.visible = false;
			}
			this.trailPositions.clear();
		} else {
			for (const trail of this.trails.values()) {
				trail.visible = true;
			}
		}
	}

	private scaleDistance(r: number): number {
		if (this.logScale) {
			// log scale: compresses outer planets, keeps inner planets visible
			// log(1 + r_au) * 50 / log(2) so Earth (1 AU) stays at 50 units
			return Math.log(1 + r) * 50 / Math.log(2);
		}
		return r;
	}

	public setLogScale(enabled: boolean) {
		this.logScale = enabled;
		// Regenerate planet orbit lines with new scale
		for (const [name, oldOrbit] of this.planetOrbits) {
			this.scene.remove(oldOrbit);
			const planet = PLANETS.find(p => p.name === name);
			if (planet) {
				const newOrbit = this.createPlanetOrbit(planet);
				this.scene.add(newOrbit);
				this.planetOrbits.set(name, newOrbit);
			}
		}
		// Regenerate small body orbit lines
		for (const [, tracked] of this.trackedBodies) {
			this.scene.remove(tracked.orbitLine);
			const orbitPoints = orbitPath(tracked.body.orbit, 256);
			if (this.logScale) {
				for (let i = 0; i < orbitPoints.length; i += 3) {
					const x = orbitPoints[i], y = orbitPoints[i + 1], z = orbitPoints[i + 2];
					const r = Math.sqrt(x * x + y * y + z * z);
					if (r > 0) {
						const scale = this.scaleDistance(r) / r;
						orbitPoints[i] = x * scale;
						orbitPoints[i + 1] = y * scale;
						orbitPoints[i + 2] = z * scale;
					}
				}
			}
			const orbitGeo = new THREE.BufferGeometry();
			orbitGeo.setAttribute('position', new THREE.BufferAttribute(orbitPoints, 3));
			const orbitMat = new THREE.LineBasicMaterial({
				color: tracked.body.kind === 'comet' ? 0x00ffff : 0xff8844,
				transparent: true,
				opacity: 0.5,
			});
			tracked.orbitLine = new THREE.Line(orbitGeo, orbitMat);
			this.scene.add(tracked.orbitLine);
		}
		// Clear trails since positions will jump
		this.trailPositions.clear();
	}

	public focusOn(id: string) {
		let target: THREE.Object3D | null = null;
		if (id === 'sun') {
			target = this.sun;
		} else if (this.planetMeshes.has(id)) {
			target = this.planetMeshes.get(id)!;
		} else if (this.trackedBodies.has(id)) {
			target = this.trackedBodies.get(id)!.mesh;
		} else if (this.spacecraft.has(id)) {
			target = this.spacecraft.get(id)!.mesh;
		}
		if (!target) return;

		const pos = target.position.clone();
		const distance = id === 'sun' ? 50 : 30;
		const offset = new THREE.Vector3(distance, distance * 0.5, distance);
		const targetCamPos = pos.clone().add(offset);

		// Start smooth camera tween
		this.cameraTween = {
			from: this.camera.position.clone(),
			to: targetCamPos,
			targetFrom: this.controls.target.clone(),
			targetTo: pos.clone(),
			start: performance.now(),
			duration: 1500, // 1.5 seconds
		};

		// Enable follow mode (will take over when tween completes)
		this.followTarget = id;
		this.followOffset.copy(offset);

		// Store as isolation target and re-apply if isolation is active
		this.isolatedId = id;
		if (this.isolated) {
			this.applyIsolation();
		}
	}

	private updateCameraTween(): boolean {
		if (!this.cameraTween) return false;

		const elapsed = performance.now() - this.cameraTween.start;
		const t = Math.min(elapsed / this.cameraTween.duration, 1);
		// EaseInOutCubic for smooth cinematic feel
		const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

		this.camera.position.lerpVectors(this.cameraTween.from, this.cameraTween.to, ease);
		this.controls.target.lerpVectors(this.cameraTween.targetFrom, this.cameraTween.targetTo, ease);

		if (t >= 1) {
			this.cameraTween = null;
		}
		return true;
	}

	public clearFollow() {
		this.followTarget = null;
	}

	public setIsolatedView(enabled: boolean, id?: string) {
		this.isolated = enabled;
		if (enabled && id) {
			this.isolatedId = id;
		} else if (!enabled) {
			this.isolatedId = null;
		}
		this.applyIsolation();
	}

	private applyIsolation() {
		if (!this.isolated || !this.isolatedId) {
			// Show everything
			this.starField.visible = true;
			this.constellationLines.visible = true;
			if (this.meteorRadiants) this.meteorRadiants.visible = true;
			this.sunGlow.visible = true;
			if (this.asteroidBelt) this.asteroidBelt.visible = true;
		if (this.kuiperBelt) this.kuiperBelt.visible = true;
			for (const [name, mesh] of this.planetMeshes) {
				mesh.visible = true;
				const orbit = this.planetOrbits.get(name);
				if (orbit) orbit.visible = true;
			}
			for (const [, tracked] of this.trackedBodies) {
				tracked.mesh.visible = true;
				tracked.orbitLine.visible = true;
				if (tracked.tail) tracked.tail.visible = true;
				if (tracked.velocityArrow) tracked.velocityArrow.visible = true;
			}
			if (this.moon) this.moon.visible = true;
			for (const entry of this.spacecraft.values()) {
				entry.mesh.visible = this.spacecraftVisible;
				entry.trajectoryLine.visible = this.spacecraftVisible;
			}
			return;
		}

		// Isolated mode: hide everything, then show only the focused object + nearby small bodies
		this.starField.visible = false;
		this.constellationLines.visible = false;
		if (this.meteorRadiants) this.meteorRadiants.visible = false;
		this.sunGlow.visible = false;
		if (this.asteroidBelt) this.asteroidBelt.visible = false;
		if (this.kuiperBelt) this.kuiperBelt.visible = false;

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

		// Galilean moons: show only if focusing on Jupiter
		const showGalilean = this.isolatedId === 'Jupiter';
		for (const gm of this.galileanMoons) {
			gm.mesh.visible = showGalilean;
		}
		for (const child of this.scene.children) {
			if (child.userData?.galileanOrbit) {
				child.visible = showGalilean;
			}
		}

		// Spacecraft: show only the focused one, or all if focusing on sun
		for (const [id, entry] of this.spacecraft) {
			const isFocused = id === this.isolatedId;
			const showWithSun = this.isolatedId === 'sun' && this.spacecraftVisible;
			entry.mesh.visible = isFocused || showWithSun;
			entry.trajectoryLine.visible = isFocused || showWithSun;
		}

		// Small bodies: show only those within proximity of the focused object
		const proximityThreshold = 100; // scene units (~2 AU)
		for (const [, tracked] of this.trackedBodies) {
			if (!focusPos) {
				tracked.mesh.visible = false;
				tracked.orbitLine.visible = false;
				if (tracked.tail) tracked.tail.visible = false;
				if (tracked.velocityArrow) tracked.velocityArrow.visible = false;
				continue;
			}
			const dist = tracked.mesh.position.distanceTo(focusPos);
			const isNear = dist <= proximityThreshold;
			const isFocused = tracked.body.id === this.isolatedId;
			tracked.mesh.visible = isNear || isFocused;
			tracked.orbitLine.visible = isNear || isFocused;
			if (tracked.tail) tracked.tail.visible = isNear || isFocused;
			if (tracked.velocityArrow) tracked.velocityArrow.visible = isNear || isFocused;
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

			const px = cosO * xw - sinO * yw * cosI;
			const py = yw * sinI;
			const pz = sinO * xw + cosO * yw * cosI;

			if (this.logScale) {
				const r = Math.sqrt(px * px + py * py + pz * pz);
				if (r > 0) {
					const scale = this.scaleDistance(r) / r;
					mesh.position.set(px * scale, py * scale, pz * scale);
				} else {
					mesh.position.set(px, py, pz);
				}
			} else {
				mesh.position.set(px, py, pz);
			}

			// Rotate planet at its individual speed (scaled by time speed and frame delta)
			mesh.rotation.y += (planet.rotationSpeed ?? 0.005) * this.timeSpeed * this.frameDelta * 60;
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
				this.moon.rotation.y += 0.003 * this.timeSpeed * this.frameDelta * 60;
			}
		}

		// Update Galilean moons (orbit Jupiter)
		const jupiter = this.planetMeshes.get('Jupiter');
		if (jupiter && this.galileanMoons.length > 0) {
			const dt = this.currentJD - 2451545.0; // days since J2000
			for (const gm of this.galileanMoons) {
				const angle = (2 * Math.PI * dt / gm.period) + gm.phase;
				const incRad = 0.5 * Math.PI / 180;
				const x = Math.cos(angle) * gm.orbitRadius;
				const z = Math.sin(angle) * gm.orbitRadius;
				gm.mesh.position.set(
					jupiter.position.x + x,
					jupiter.position.y + z * Math.sin(incRad),
					jupiter.position.z + z * Math.cos(incRad)
				);
				gm.mesh.rotation.y += 0.01 * this.timeSpeed * this.frameDelta * 60;
			}
			// Move orbit lines to follow Jupiter
			for (const child of this.scene.children) {
				if (child.userData?.galileanOrbit) {
					child.position.copy(jupiter.position);
				}
			}
		}

		// Slowly rotate asteroid belt
		if (this.asteroidBelt) {
			this.asteroidBelt.rotation.y += 0.0003;
		}
		// Slowly rotate Kuiper belt
		if (this.kuiperBelt) {
			this.kuiperBelt.rotation.y += 0.0001;
		}

		// Update small bodies
		for (const [, tracked] of this.trackedBodies) {
			const [x, y, z] = orbitalPosition(tracked.body.orbit, this.currentJD);

			if (this.logScale) {
				const r = Math.sqrt(x * x + y * y + z * z);
				if (r > 0) {
					const scale = this.scaleDistance(r) / r;
					tracked.mesh.position.set(x * scale, y * scale, z * scale);
				} else {
					tracked.mesh.position.set(x, y, z);
				}
			} else {
				tracked.mesh.position.set(x, y, z);
			}

			// Orient comet tails opposite to velocity (trailing behind motion), scale by distance
			if (tracked.body.kind === 'comet') {
				tracked.mesh.lookAt(0, 0, 0);
				tracked.mesh.rotateX(Math.PI);

				const distFromSun = tracked.mesh.position.length();
				const tailScale = Math.max(0.1, Math.min(1.0, 1.0 / (distFromSun / 50)));

				// Compute velocity direction
				const jdNext = this.currentJD + 0.5;
				const [nx, ny, nz] = orbitalPosition(tracked.body.orbit, jdNext);
				const vel = new THREE.Vector3(nx - x, ny - y, nz - z).normalize();

				// Tail points opposite to velocity (trailing behind the comet)
				const tailDir = vel.clone().negate();

				if (tracked.tail) {
					tracked.tail.position.copy(tracked.mesh.position);
					tracked.tail.lookAt(tracked.mesh.position.clone().add(tailDir));
					tracked.tail.scale.setScalar(tailScale);
					(tracked.tail.material as THREE.PointsMaterial).opacity = 0.7 * tailScale;
				}
				if (tracked.dustTail) {
					tracked.dustTail.position.copy(tracked.mesh.position);
					tracked.dustTail.lookAt(tracked.mesh.position.clone().add(tailDir));
					tracked.dustTail.scale.setScalar(tailScale);
					(tracked.dustTail.material as THREE.PointsMaterial).opacity = 0.5 * tailScale;
				}

				// Update velocity direction arrow
				if (tracked.velocityArrow) {
					tracked.velocityArrow.position.copy(tracked.mesh.position);
					tracked.velocityArrow.setDirection(vel);
					tracked.velocityArrow.setLength(2 + tailScale * 2, 0.8, 0.5);
					(tracked.velocityArrow.line as THREE.Line).visible = tailScale > 0.2;
					(tracked.velocityArrow.cone as THREE.Mesh).visible = tailScale > 0.2;
				}
			}
		}

		// Update trails
		if (this.trailsVisible) {
			const updateTrail = (id: string, pos: THREE.Vector3, color: number) => {
				let positions = this.trailPositions.get(id);
				if (!positions) {
					positions = [];
					this.trailPositions.set(id, positions);
				}
				// Add current position
				positions.push(pos.clone());
				if (positions.length > this.TRAIL_MAX_POINTS) {
					positions.shift();
				}
				// Update or create trail line
				let trail = this.trails.get(id);
				if (!trail) {
					const geo = new THREE.BufferGeometry();
					geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.TRAIL_MAX_POINTS * 3), 3));
					const mat = new THREE.LineBasicMaterial({
						color,
						transparent: true,
						opacity: 0.4,
					});
					trail = new THREE.Line(geo, mat);
					this.scene.add(trail);
					this.trails.set(id, trail);
				}
				const arr = trail.geometry.getAttribute('position').array as Float32Array;
				for (let i = 0; i < positions.length; i++) {
					arr[i * 3] = positions[i].x;
					arr[i * 3 + 1] = positions[i].y;
					arr[i * 3 + 2] = positions[i].z;
				}
				trail.geometry.setDrawRange(0, positions.length);
				trail.geometry.getAttribute('position').needsUpdate = true;
			};

			for (const [name, mesh] of this.planetMeshes) {
				updateTrail(name, mesh.position, 0x4488ff);
			}
			for (const [id, tracked] of this.trackedBodies) {
				const color = tracked.body.kind === 'comet' ? 0x00ffff : 0xff8844;
				updateTrail(id, tracked.mesh.position, color);
			}
		}

		// Update spacecraft positions by interpolating trajectory data
		for (const entry of this.spacecraft.values()) {
			if (!entry.loaded || entry.trajectory.length === 0) continue;
			const traj = entry.trajectory;

			// Find the two trajectory points that bracket the current JD
			if (this.currentJD <= traj[0].jd) {
				// Before launch — clamp to first point
				entry.mesh.position.set(traj[0].x, traj[0].y, traj[0].z);
			} else if (this.currentJD >= traj[traj.length - 1].jd) {
				// Beyond last data point — extrapolate linearly from last two points
				const last = traj[traj.length - 1];
				const prev = traj[traj.length - 2];
				const dt = last.jd - prev.jd;
				if (dt > 0) {
					const factor = (this.currentJD - last.jd) / dt;
					entry.mesh.position.set(
						last.x + (last.x - prev.x) * factor,
						last.y + (last.y - prev.y) * factor,
						last.z + (last.z - prev.z) * factor,
					);
				} else {
					entry.mesh.position.set(last.x, last.y, last.z);
				}
			} else {
				// Binary search for the bracketing points
				let lo = 0, hi = traj.length - 1;
				while (hi - lo > 1) {
					const mid = (lo + hi) >> 1;
					if (traj[mid].jd <= this.currentJD) lo = mid;
					else hi = mid;
				}
				const p0 = traj[lo], p1 = traj[hi];
				const t = (this.currentJD - p0.jd) / (p1.jd - p0.jd);
				entry.mesh.position.set(
					p0.x + (p1.x - p0.x) * t,
					p0.y + (p1.y - p0.y) * t,
					p0.z + (p1.z - p0.z) * t,
				);
			}

			// Apply log scale if enabled
			if (this.logScale) {
				const r = entry.mesh.position.length();
				if (r > 0) {
					const scale = this.scaleDistance(r) / r;
					entry.mesh.position.multiplyScalar(scale);
				}
			}

			// Rotate the diamond marker for visual interest
			entry.mesh.rotation.y += 0.02 * this.timeSpeed * this.frameDelta * 60;
			entry.mesh.rotation.x += 0.01 * this.timeSpeed * this.frameDelta * 60;
		}

		// Rotate sun
		this.sun.rotation.y += 0.0008 * this.timeSpeed * this.frameDelta * 60;

		// Pulse sun glow
		const t = performance.now() * 0.001;
		this.sunGlow.scale.setScalar(1 + Math.sin(t * 0.5) * 0.03);

		// Camera follow: keep camera at fixed offset from followed object
		// Skip if camera tween is active (it takes priority)
		if (this.followTarget && !this.cameraTween) {
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

		// Update camera tween (smooth cinematic transition)
		if (this.cameraTween) {
			// Update tween target to track moving planet
			let targetPos: THREE.Vector3 | null = null;
			if (this.followTarget === 'sun') {
				targetPos = this.sun.position;
			} else if (this.planetMeshes.has(this.followTarget ?? '')) {
				targetPos = this.planetMeshes.get(this.followTarget!)!.position;
			} else if (this.trackedBodies.has(this.followTarget ?? '')) {
				targetPos = this.trackedBodies.get(this.followTarget!)!.mesh.position;
			}
			if (targetPos) {
				this.cameraTween.targetTo.copy(targetPos);
				this.cameraTween.to.copy(targetPos).add(this.followOffset);
			}
			this.updateCameraTween();
		}

		// Re-apply isolation filtering (proximity may change as objects orbit)
		if (this.isolated) {
			this.applyIsolation();
		}
	}

	private clock = new THREE.Clock();
	private lastTimeUpdate = 0;
	private frameDelta = 0;

	private animate = () => {
		this.animationId = requestAnimationFrame(this.animate);

		const delta = this.clock.getDelta();
		this.frameDelta = delta;

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

		// Update LOD levels for planets
		for (const lod of this.planetMeshes.values()) {
			if (lod instanceof THREE.LOD) {
				lod.update(this.camera);
			}
		}

		// Sun glow pulsing
		const t = performance.now() * 0.001;
		if (this.sunGlow) {
			const pulse = 1 + Math.sin(t * 0.5) * 0.04;
			this.sunGlow.scale.setScalar(pulse);
			(this.sunGlow.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(t * 0.8) * 0.1;
		}

		// Earth clouds rotate independently
		if (this.earthClouds) {
			this.earthClouds.rotation.y += 0.015 * this.timeSpeed * this.frameDelta * 60;
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

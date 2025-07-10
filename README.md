# NEO Tracker — 3D Solar System Explorer

An interactive 3D solar system visualization powered by Three.js and real NASA JPL data. Explore planets, comets, asteroids, and near-Earth objects with accurate orbital mechanics in your browser.

## Features

- **Real-time 3D solar system** — All 8 planets, the Sun, Earth's Moon, and an asteroid belt rendered with WebGL
- **Live NASA data** — Search and track comets and asteroids using NASA JPL SBDB and CAD APIs
- **Accurate orbital mechanics** — Keplerian orbital elements with real-time position calculations
- **Procedural planet textures** — High-resolution (1024×512) textures generated with fractal noise: Jupiter's Great Red Spot, Earth's continents and clouds, Mars craters, Saturn's Cassini Division
- **Bloom post-processing** — UnrealBloomPass for realistic sun glow and atmospheric effects
- **Fresnel atmosphere shaders** — Smooth rim-light glow for Earth, Venus, and Neptune
- **Earth cloud layer** — Separate rotating transparent sphere with procedural cloud texture
- **Saturn & Uranus rings** — Multi-division ring systems with procedural textures
- **Particle comet tails** — Dynamic tails oriented away from the sun via solar wind simulation
- **Milky Way star field** — 12,000 stars with a concentrated galactic band
- **Camera follow mode** — Focus on any planet or tracked object; camera follows as it orbits
- **Isolate view** — Hide everything except the focused planet and nearby small bodies within 2 AU
- **Planet sidebar** — Click any planet to focus, with color-coded indicators
- **Timeline control** — Pause, scrub, and adjust time speed (days per second)
- **Close approach tracking** — View upcoming near-Earth approaches from NASA CAD API
- **SEO & social** — Open Graph tags, Twitter cards, structured data, custom favicon

## Tech Stack

- **SvelteKit** — Web framework and static site generation
- **Three.js** — 3D rendering, post-processing, and shader effects
- **TypeScript** — Type-safe development
- **Vite** — Build tooling and dev server
- **NASA JPL APIs** — SBDB (Small Body Database) and CAD (Close Approach Data)

## Getting Started

```sh
# install dependencies
npm install

# start dev server
npm run dev

# build for production
npm run build

# preview production build
npm run preview
```

## Project Structure

```
src/
├── lib/
│   ├── api/nasa.ts          # NASA JPL API integration
│   ├── components/           # UI components (InfoPanel, SearchBar, etc.)
│   ├── three/
│   │   ├── scene.ts          # Three.js scene, rendering, and interaction
│   │   └── textures.ts       # Procedural texture generation
│   ├── solarSystem.ts        # Planet data and orbital parameters
│   ├── orbital.ts            # Keplerian orbital mechanics
│   └── types.ts              # TypeScript definitions
├── routes/
│   ├── +page.svelte          # Main application page
│   └── api/nasa/+server.ts   # Server-side API proxy
└── app.html                  # HTML template with SEO meta tags
```

## Data Sources

- [NASA JPL Small Body Database (SBDB)](https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html)
- [NASA JPL Close Approach Data (CAD)](https://ssd.jpl.nasa.gov/tools/cad_query.html)

## License

MIT

# Stochastic Plotter

Desmos-style web notebook for stochastic processes, built with Next.js and Tailwind CSS.

## Features

- Reusable notebook cells for constants, scalar functions, built-in stochastic processes, and derived processes
- Interactive canvas path plot with pan, zoom, synchronized endpoint distribution panel, and legend hover highlighting
- Built-in process library including Brownian motion, Brownian bridge, geometric Brownian motion, Ornstein-Uhlenbeck, Poisson, and random walk
- Seeded sampling with common-randomness reuse for parameter changes
- Endpoint-law overlays for supported direct and composite processes
- Regression tests for endpoint densities, histogram math, evaluator behavior, and process samplers

## Development

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

## Validation

Run the local checks before pushing:

```bash
npm test
npm run lint
npm run build
```

## Project Structure

- `app/`: Next.js app entrypoints and global styles
- `components/`: sidebar, toolbar, and canvas plotting UI
- `lib/runtime/`: parser, evaluator, process samplers, endpoint-law math, and tests
- `lib/store/`: Zustand notebook state
- `lib/utils/`: plotting helpers and shared utilities

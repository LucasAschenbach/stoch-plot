# Desmos for Stochastic Processes

Interactive notebook for stochastic processes built with Next.js, shadcn/ui, and a lightweight stochastic runtime.

## Features

- Editable notebook cells for constants, scalar functions, built-in stochastic processes, and derived processes
- Itô-style SDE definitions with `X_0 = ...`, `dX_t = ...`, `integral(...)`, `qv(...)`, and monotone time changes
- Interactive path plot with pan, zoom, legend hover highlighting, and a toggleable endpoint histogram panel
- Seeded sampling with persistent notebook state
- Endpoint-law overlays for supported direct and composite processes
- Vitest coverage for evaluator, sampler, endpoint-law, and histogram behavior

## Development

Install dependencies with your preferred package manager, then run:

```bash
npm run dev
```

## Validation

```bash
npm run lint
npm run test
npm run build
```

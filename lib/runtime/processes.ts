import {
  linspace,
  logNormalPdf,
  meanByIndex,
  normalPdf,
  varianceByIndex,
} from "@/lib/runtime/math";
import {
  constantEndpointLaw,
  logNormalEndpointLaw,
  normalEndpointLaw,
  poissonEndpointLaw,
} from "@/lib/runtime/endpoint-laws";
import { getGaussianMatrix, getUniformMatrix } from "@/lib/runtime/rng";
import type {
  ProcessDefinition,
  ProcessSamplerContext,
  SampledProcess,
} from "@/lib/runtime/types";

function cumulative(matrix: number[][], transform: (value: number, dt: number) => number, dt: number) {
  return matrix.map((row) => {
    const path = [0];

    row.forEach((value) => {
      path.push((path.at(-1) ?? 0) + transform(value, dt));
    });

    return path;
  });
}

function withStatistics(
  processName: string,
  output: Omit<SampledProcess, "type" | "processName">,
  stats?: SampledProcess["stats"],
): Omit<SampledProcess, "type" | "processName"> {
  return {
    ...output,
    mean: output.mean.length ? output.mean : meanByIndex(output.paths),
    variance: output.variance.length ? output.variance : varianceByIndex(output.paths),
    endpoints:
      output.endpoints.length > 0
        ? output.endpoints
        : output.paths.map((path) => path.at(-1) ?? 0),
    stats,
    endpointLaw: output.endpointLaw,
    randomnessHandle: `${processName}:${output.randomnessHandle}`,
  };
}

function brownianStats(scale = 1) {
  return (_args: number[], times: number[]) => ({
    mean: () => times.map(() => 0),
    variance: () => times.map((time) => scale * scale * Math.max(0, time)),
    endpointExpectation: () => 0,
    endpointDensity: (y: number[], time: number) =>
      y.map((value) => normalPdf(value, 0, Math.sqrt(Math.max(time, 1e-9)) * scale)),
  });
}

function poissonIncrement(lambdaDt: number, uniform: number) {
  const threshold = Math.exp(-lambdaDt);
  let probability = threshold;
  let cumulativeProbability = probability;
  let k = 0;

  while (uniform > cumulativeProbability && k < 100) {
    k += 1;
    probability *= lambdaDt / k;
    cumulativeProbability += probability;
  }

  return k;
}

const definitions: ProcessDefinition[] = [
  {
    name: "Brownian",
    parameters: [],
    sample: (_args, context) => {
      const increments = getGaussianMatrix(
        context.rng,
        context.cellId,
        "brownian",
        context.sampleCount,
        Math.max(context.times.length - 1, 1),
      );
      const dt = (context.tMax - context.tMin) / Math.max(context.times.length - 1, 1);
      const paths = cumulative(increments, (value, localDt) => value * Math.sqrt(localDt), dt);

      return withStatistics(
        "Brownian",
        {
          times: context.times,
          paths,
          mean: [],
          variance: [],
          endpoints: [],
          endpointLaw: normalEndpointLaw(
            context.cellId,
            0,
            Math.max(context.tMax, 0),
            "Brownian endpoint",
          ),
          randomnessHandle: `seed:${context.rng.seed}`,
        },
        brownianStats()([], context.times),
      );
    },
    stats: brownianStats(),
  },
  {
    name: "BrownianBridge",
    parameters: ["T"],
    sample: (args, context) => {
      const targetT = args[0] ?? context.tMax;
      const increments = getGaussianMatrix(
        context.rng,
        context.cellId,
        "brownian-bridge",
        context.sampleCount,
        Math.max(context.times.length - 1, 1),
      );
      const dt = (context.tMax - context.tMin) / Math.max(context.times.length - 1, 1);
      const brownian = cumulative(increments, (value, localDt) => value * Math.sqrt(localDt), dt);
      const bridge = brownian.map((path) => {
        const finalValue = path.at(-1) ?? 0;
        return path.map((value, index) => {
          const time = context.times[index];
          return value - (time / Math.max(targetT, 1e-9)) * finalValue;
        });
      });
      const stats = {
        mean: () => context.times.map(() => 0),
        variance: () =>
          context.times.map((time) => {
            const clipped = Math.min(time, targetT);
            return (clipped * Math.max(targetT - clipped, 0)) / Math.max(targetT, 1e-9);
          }),
        endpointExpectation: () => 0,
      };

      return withStatistics(
        "BrownianBridge",
        {
          times: context.times,
          paths: bridge,
          mean: [],
          variance: [],
          endpoints: [],
          endpointLaw: constantEndpointLaw(0),
          randomnessHandle: `seed:${context.rng.seed}:T:${targetT}`,
        },
        stats,
      );
    },
  },
  {
    name: "GeometricBrownian",
    parameters: ["mu", "sigma", "x0"],
    sample: (args, context) => {
      const [mu = 0.15, sigma = 0.2, x0 = 1] = args;
      const increments = getGaussianMatrix(
        context.rng,
        context.cellId,
        "gbm",
        context.sampleCount,
        Math.max(context.times.length - 1, 1),
      );
      const dt = (context.tMax - context.tMin) / Math.max(context.times.length - 1, 1);
      const brownian = cumulative(increments, (value, localDt) => value * Math.sqrt(localDt), dt);
      const paths = brownian.map((path) =>
        path.map((w, index) => {
          const time = context.times[index];
          return x0 * Math.exp((mu - 0.5 * sigma * sigma) * time + sigma * w);
        }),
      );
      const stats = {
        mean: () => context.times.map((time) => x0 * Math.exp(mu * time)),
        variance: () =>
          context.times.map(
            (time) =>
              x0 *
              x0 *
              Math.exp(2 * mu * time) *
              (Math.exp(sigma * sigma * time) - 1),
          ),
        endpointExpectation: (time: number) => x0 * Math.exp(mu * time),
        endpointDensity: (y: number[], time: number) =>
          y.map((value) =>
            logNormalPdf(
              value,
              Math.log(Math.max(x0, 1e-9)) + (mu - 0.5 * sigma * sigma) * time,
              sigma * Math.sqrt(Math.max(time, 1e-9)),
            ),
          ),
      };

      return withStatistics(
        "GeometricBrownian",
        {
          times: context.times,
          paths,
          mean: [],
          variance: [],
          endpoints: [],
          endpointLaw: logNormalEndpointLaw(
            context.cellId,
            Math.log(Math.max(x0, 1e-9)) +
              (mu - 0.5 * sigma * sigma) * context.tMax,
            sigma * Math.sqrt(Math.max(context.tMax, 1e-9)),
            "Geometric Brownian endpoint",
          ),
          randomnessHandle: `seed:${context.rng.seed}:mu:${mu}:sigma:${sigma}:x0:${x0}`,
        },
        stats,
      );
    },
  },
  {
    name: "OrnsteinUhlenbeck",
    parameters: ["theta", "mu", "sigma", "x0"],
    sample: (args, context) => {
      const [theta = 1.2, mu = 0, sigma = 0.35, x0 = 0] = args;
      const normals = getGaussianMatrix(
        context.rng,
        context.cellId,
        "ou",
        context.sampleCount,
        Math.max(context.times.length - 1, 1),
      );
      const dt = (context.tMax - context.tMin) / Math.max(context.times.length - 1, 1);
      const paths = normals.map((row) => {
        const path = [x0];

        row.forEach((noise) => {
          const previous = path.at(-1) ?? x0;
          if (theta <= 1e-9) {
            path.push(previous + sigma * Math.sqrt(dt) * noise);
            return;
          }

          const decay = Math.exp(-theta * dt);
          const std = sigma * Math.sqrt((1 - Math.exp(-2 * theta * dt)) / (2 * theta));
          path.push(mu + (previous - mu) * decay + std * noise);
        });

        return path;
      });
      const stats = {
        mean: () =>
          context.times.map((time) => mu + (x0 - mu) * Math.exp(-theta * time)),
        variance: () =>
          context.times.map((time) => {
            if (theta <= 1e-9) {
              return sigma * sigma * time;
            }
            return ((sigma * sigma) / (2 * theta)) * (1 - Math.exp(-2 * theta * time));
          }),
        endpointExpectation: (time: number) => mu + (x0 - mu) * Math.exp(-theta * time),
        endpointDensity: (y: number[], time: number) => {
          const meanValue = mu + (x0 - mu) * Math.exp(-theta * time);
          const varianceValue =
            theta <= 1e-9
              ? sigma * sigma * time
              : ((sigma * sigma) / (2 * theta)) * (1 - Math.exp(-2 * theta * time));
          return y.map((value) => normalPdf(value, meanValue, Math.sqrt(Math.max(varianceValue, 1e-9))));
        },
      };

      return withStatistics(
        "OrnsteinUhlenbeck",
        {
          times: context.times,
          paths,
          mean: [],
          variance: [],
          endpoints: [],
          endpointLaw: normalEndpointLaw(
            context.cellId,
            mu + (x0 - mu) * Math.exp(-theta * context.tMax),
            theta <= 1e-9
              ? sigma * sigma * context.tMax
              : ((sigma * sigma) / (2 * theta)) *
                  (1 - Math.exp(-2 * theta * context.tMax)),
            "OU endpoint",
          ),
          randomnessHandle: `seed:${context.rng.seed}:theta:${theta}:mu:${mu}:sigma:${sigma}:x0:${x0}`,
        },
        stats,
      );
    },
  },
  {
    name: "Poisson",
    parameters: ["lambda"],
    sample: (args, context) => {
      const [lambda = 1] = args;
      const uniforms = getUniformMatrix(
        context.rng,
        context.cellId,
        "poisson",
        context.sampleCount,
        Math.max(context.times.length - 1, 1),
      );
      const dt = (context.tMax - context.tMin) / Math.max(context.times.length - 1, 1);
      const paths = uniforms.map((row) => {
        const path = [0];
        row.forEach((uniform) => {
          const increment = poissonIncrement(Math.max(lambda * dt, 0), uniform);
          path.push((path.at(-1) ?? 0) + increment);
        });
        return path;
      });
      const stats = {
        mean: () => context.times.map((time) => lambda * time),
        variance: () => context.times.map((time) => lambda * time),
        endpointExpectation: (time: number) => lambda * time,
      };

      return withStatistics(
        "Poisson",
        {
          times: context.times,
          paths,
          mean: [],
          variance: [],
          endpoints: [],
          endpointLaw: poissonEndpointLaw(
            context.cellId,
            Math.max(lambda * context.tMax, 0),
            "Poisson endpoint",
          ),
          randomnessHandle: `seed:${context.rng.seed}:lambda:${lambda}`,
        },
        stats,
      );
    },
  },
  {
    name: "RandomWalk",
    parameters: ["stepScale", "dt"],
    sample: (args, context) => {
      const [stepScale = 1, customDt = 1] = args;
      const uniforms = getUniformMatrix(
        context.rng,
        context.cellId,
        "random-walk",
        context.sampleCount,
        Math.max(context.times.length - 1, 1),
      );
      const dt = customDt > 0 ? customDt : (context.tMax - context.tMin) / Math.max(context.times.length - 1, 1);
      const paths = uniforms.map((row) => {
        const path = [0];
        row.forEach((uniform) => {
          const sign = uniform >= 0.5 ? 1 : -1;
          path.push((path.at(-1) ?? 0) + sign * stepScale * Math.sqrt(dt));
        });
        return path;
      });
      const stats = {
        mean: () => context.times.map(() => 0),
        variance: () => context.times.map((time) => Math.max(time, 0) * stepScale * stepScale),
        endpointExpectation: () => 0,
      };

      return withStatistics(
        "RandomWalk",
        {
          times: context.times,
          paths,
          mean: [],
          variance: [],
          endpoints: [],
          randomnessHandle: `seed:${context.rng.seed}:stepScale:${stepScale}:dt:${dt}`,
        },
        stats,
      );
    },
  },
];

export const PROCESS_DEFINITIONS = new Map(definitions.map((definition) => [definition.name, definition]));

export function sampleBuiltinProcess(
  name: string,
  args: number[],
  context: ProcessSamplerContext,
) {
  const definition = PROCESS_DEFINITIONS.get(name);

  if (!definition) {
    throw new Error(`Unknown process constructor '${name}'.`);
  }

  const sampled = definition.sample(args, context);

  return {
    type: "process" as const,
    processName: name,
    ...sampled,
    stats: definition.stats ? definition.stats(args, context.times, context.tMax) : sampled.stats,
  };
}

export function defaultEndpointDensityRange(minValue: number, maxValue: number) {
  const padding = (maxValue - minValue) * 0.15 || 1;
  return linspace(minValue - padding, maxValue + padding, 120);
}

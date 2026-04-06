import {
  affineEndpointLaw,
  constantEndpointLaw,
  addEndpointLaws,
  monotoneTransformEndpointLaw,
  powerEndpointLaw,
  subtractEndpointLaws,
  transformEndpointLaw,
} from "@/lib/runtime/endpoint-laws";
import {
  BUILTIN_CONSTANTS,
  linspace,
  meanByIndex,
  SCALAR_FUNCTIONS,
  varianceByIndex,
} from "@/lib/runtime/math";
import { compileCells, inferExpressionType } from "@/lib/runtime/parser";
import { sampleBuiltinProcess, PROCESS_DEFINITIONS } from "@/lib/runtime/processes";
import type {
  CompiledCell,
  DifferentialValue,
  EvaluationRecord,
  ExpressionNode,
  GridConfig,
  MaterializeProcessContext,
  NotebookCell,
  NotebookEvaluation,
  ProcessInterpolation,
  ProcessModelValue,
  ProcessSamplerContext,
  RuntimeValue,
  RuntimeValueType,
  SampledProcess,
  ScalarFunctionValue,
  SymbolValue,
} from "@/lib/runtime/types";

type NumberValue = Extract<SymbolValue, { type: "number" }>;
type MaterializedExpression =
  | NumberValue
  | ScalarFunctionValue
  | {
      type: "process";
      value: SampledProcess;
    };

type MaterializationScope = {
  modelId: string;
  cache: Map<string, MaterializedExpression>;
  selfProcessName?: string;
  selfPathBySample?: number[][];
};

type PointEvaluationEnvironment = {
  sampleIndex: number;
  pointIndex: number;
  localNumbers?: Record<string, number>;
  selfProcessName?: string;
  selfValue?: number;
};

function applyBinary(operator: string, left: number, right: number) {
  switch (operator) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return Math.abs(right) <= 1e-12 ? 0 : left / right;
    case "^":
      return left ** right;
    default:
      throw new Error(`Unsupported operator '${operator}'.`);
  }
}

function zipPaths(
  left: number[] | number[][],
  right: number[] | number[][],
  operator: (a: number, b: number) => number,
) {
  if (Array.isArray(left[0]) || Array.isArray(right[0])) {
    const leftPaths = Array.isArray(left[0]) ? (left as number[][]) : [left as number[]];
    const rightPaths = Array.isArray(right[0]) ? (right as number[][]) : [right as number[]];
    const samples = Math.max(leftPaths.length, rightPaths.length);

    return Array.from({ length: samples }, (_, sampleIndex) => {
      const leftPath = leftPaths[sampleIndex % leftPaths.length];
      const rightPath = rightPaths[sampleIndex % rightPaths.length];
      return leftPath.map((value, index) => operator(value, rightPath[index] ?? 0));
    });
  }

  const leftValues = left as number[];
  const rightValues = right as number[];
  return leftValues.map((value, index) => operator(value, rightValues[index] ?? 0));
}

function liftScalarToPath(value: number, length: number) {
  return Array.from({ length }, () => value);
}

function processCacheKey(model: ProcessModelValue, context: MaterializeProcessContext) {
  return [
    model.modelId,
    context.sampleCount,
    context.tMin,
    context.tMax,
    context.times.length,
    context.rng.seed,
    context.rng.version,
  ].join(":");
}

function materializeProcess(
  model: ProcessModelValue,
  context: MaterializeProcessContext,
) {
  const cacheKey = processCacheKey(model, context);
  const cached = context.cache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const sampled = model.materialize(context);
  context.cache.set(cacheKey, sampled);
  return sampled;
}

function makeSampledProcess(
  processName: string,
  times: number[],
  paths: number[][],
  randomnessHandle: string,
  interpolation: ProcessInterpolation,
  stats?: SampledProcess["stats"],
  endpointLaw?: SampledProcess["endpointLaw"],
): SampledProcess {
  const increments = paths.map((path) =>
    path.slice(1).map((value, index) => value - (path[index] ?? 0)),
  );

  return {
    type: "process",
    processName,
    times,
    paths,
    increments,
    interpolation,
    mean: meanByIndex(paths),
    variance: varianceByIndex(paths),
    endpoints: paths.map((path) => path.at(-1) ?? 0),
    randomnessHandle,
    stats,
    endpointLaw,
  };
}

function constantProcess(times: number[], value: number, label: string): SampledProcess {
  const path = liftScalarToPath(value, times.length);
  return makeSampledProcess("Deterministic", times, [path], label, "linear", {
    mean: () => [...path],
    variance: () => times.map(() => 0),
    endpointExpectation: () => value,
  }, constantEndpointLaw(value));
}

function timeProcess(times: number[]): SampledProcess {
  return makeSampledProcess("Time", times, [[...times]], "time", "linear", {
    mean: () => [...times],
    variance: () => times.map(() => 0),
    endpointExpectation: (time) => time,
  });
}

function numberLaw(value: number) {
  return constantEndpointLaw(value);
}

function scalarBuiltinEndpointLaw(
  name: string,
  law: SampledProcess["endpointLaw"],
) {
  if (!law) {
    return undefined;
  }

  switch (name) {
    case "exp":
      return monotoneTransformEndpointLaw(
        law,
        Math.exp,
        Math.log,
        (value) => (value > 0 ? 1 / value : 0),
        { support: { min: 0 } },
      );
    case "log":
      if (law.support?.min !== undefined && law.support.min > 0) {
        return monotoneTransformEndpointLaw(
          law,
          Math.log,
          Math.exp,
          Math.exp,
          {
            support: {
              min: Math.log(law.support.min),
              max:
                law.support.max !== undefined ? Math.log(law.support.max) : undefined,
            },
          },
        );
      }
      return transformEndpointLaw(law, Math.log);
    case "sqrt":
      if (law.support?.min !== undefined && law.support.min >= 0) {
        return monotoneTransformEndpointLaw(
          law,
          Math.sqrt,
          (value) => value * value,
          (value) => 2 * Math.max(value, 0),
          { support: { min: 0 } },
        );
      }
      return transformEndpointLaw(law, Math.sqrt);
    case "abs":
      return transformEndpointLaw(law, Math.abs, {
        support: { min: 0 },
        densityAt: law.densityAt
          ? (value) => {
              if (value < 0) {
                return 0;
              }
              return law.densityAt(value) + law.densityAt(-value);
            }
          : undefined,
      });
    default:
      return transformEndpointLaw(law, (value) => SCALAR_FUNCTIONS[name](value));
  }
}

function binaryEndpointLaw(
  left: NumberValue | SampledProcess,
  right: NumberValue | SampledProcess,
  operator: string,
) {
  const leftLaw = left.type === "number" ? numberLaw(left.value) : left.endpointLaw;
  const rightLaw = right.type === "number" ? numberLaw(right.value) : right.endpointLaw;

  if (!leftLaw || !rightLaw) {
    return undefined;
  }

  switch (operator) {
    case "+":
      if (left.type === "number") {
        return affineEndpointLaw(rightLaw, 1, left.value);
      }
      if (right.type === "number") {
        return affineEndpointLaw(leftLaw, 1, right.value);
      }
      return addEndpointLaws(leftLaw, rightLaw);
    case "-":
      if (left.type === "number") {
        return affineEndpointLaw(rightLaw, -1, left.value);
      }
      if (right.type === "number") {
        return affineEndpointLaw(leftLaw, 1, -right.value);
      }
      return subtractEndpointLaws(leftLaw, rightLaw);
    case "*":
      if (left.type === "number") {
        return affineEndpointLaw(rightLaw, left.value, 0);
      }
      if (right.type === "number") {
        return affineEndpointLaw(leftLaw, right.value, 0);
      }
      return undefined;
    case "/":
      if (right.type === "number" && Math.abs(right.value) > 1e-12) {
        return affineEndpointLaw(leftLaw, 1 / right.value, 0);
      }
      return undefined;
    case "^":
      if (right.type === "number") {
        return powerEndpointLaw(leftLaw, right.value);
      }
      return undefined;
    default:
      return undefined;
  }
}

function createProcessModel(
  processName: string,
  modelId: string,
  interpolation: ProcessInterpolation,
  materializeFn: (context: MaterializeProcessContext) => SampledProcess,
): ProcessModelValue {
  return {
    type: "process",
    processName,
    modelId,
    interpolation,
    materialize: materializeFn,
  };
}

function buildTypeLookup(compiled: Map<string, CompiledCell>, orderedCellIds: string[]) {
  const types = new Map<string, RuntimeValueType>();

  orderedCellIds.forEach((cellId) => {
    const cell = compiled.get(cellId);

    if (!cell) {
      return;
    }

    switch (cell.assignment.type) {
      case "function":
        types.set(cell.name, "function");
        return;
      case "initialCondition":
        types.set(cell.name, "number");
        return;
      case "sde":
        types.set(cell.name, "process");
        return;
      default: {
        const expressionType = inferExpressionType(
          cell.assignment.expression,
          (identifier) => types.get(identifier),
        );
        types.set(cell.name, expressionType);
      }
    }
  });

  return types;
}

function evaluateScalarExpression(
  node: ExpressionNode,
  symbols: Record<string, SymbolValue>,
  types: Map<string, RuntimeValueType>,
  localNumbers: Record<string, number> = {},
): number {
  switch (node.type) {
    case "number":
      return node.value;
    case "time":
      if ("t" in localNumbers) {
        return localNumbers.t;
      }
      throw new Error("The time variable 't' requires a function or process context.");
    case "identifier":
      if (node.name in localNumbers) {
        return localNumbers[node.name];
      }
      if (node.name in BUILTIN_CONSTANTS) {
        return BUILTIN_CONSTANTS[node.name];
      }
      if (!(node.name in symbols)) {
        throw new Error(`Unknown symbol '${node.name}'.`);
      }
      if (symbols[node.name].type !== "number") {
        throw new Error(`'${node.name}' does not evaluate to a number here.`);
      }
      return symbols[node.name].value;
    case "differentialIdentifier":
      throw new Error("Differentials can only appear inside integral(...) or dX_t = ...");
    case "unary":
      return -evaluateScalarExpression(node.operand, symbols, types, localNumbers);
    case "binary":
      return applyBinary(
        node.operator,
        evaluateScalarExpression(node.left, symbols, types, localNumbers),
        evaluateScalarExpression(node.right, symbols, types, localNumbers),
      );
    case "timeChange":
      throw new Error("Time-changed processes are not numeric expressions.");
    case "call": {
      if (node.callee === "integral" || node.callee === "qv" || PROCESS_DEFINITIONS.has(node.callee)) {
        throw new Error(`'${node.callee}' evaluates to a process, not a number.`);
      }

      if (node.callee in SCALAR_FUNCTIONS) {
        const fn = SCALAR_FUNCTIONS[node.callee];
        return fn(...node.args.map((arg) => evaluateScalarExpression(arg, symbols, types, localNumbers)));
      }

      const callee = symbols[node.callee];
      if (!callee) {
        throw new Error(`Unknown function '${node.callee}'.`);
      }
      if (callee.type !== "function") {
        throw new Error(`'${node.callee}' is not callable.`);
      }
      if (node.args.length !== 1) {
        throw new Error("User-defined functions currently take exactly one argument.");
      }
      return callee.evaluate(
        evaluateScalarExpression(node.args[0], symbols, types, localNumbers),
      );
    }
  }
}

function currentValueForProcess(
  process: SampledProcess,
  sampleIndex: number,
  pointIndex: number,
) {
  const path = process.paths[sampleIndex % process.paths.length] ?? process.paths[0] ?? [];
  return path[pointIndex] ?? 0;
}

function materializeExpression(
  node: ExpressionNode,
  symbols: Record<string, SymbolValue>,
  types: Map<string, RuntimeValueType>,
  context: MaterializeProcessContext,
  scope: MaterializationScope,
  path = "root",
): MaterializedExpression {
  const cached = scope.cache.get(path);
  if (cached) {
    return cached;
  }

  const store = (value: MaterializedExpression) => {
    scope.cache.set(path, value);
    return value;
  };

  switch (node.type) {
    case "number":
      return store({ type: "number", value: node.value });
    case "time":
      return store({ type: "process", value: timeProcess(context.times) });
    case "identifier": {
      if (node.name in BUILTIN_CONSTANTS) {
        return store({ type: "number", value: BUILTIN_CONSTANTS[node.name] });
      }

      const symbol = symbols[node.name];

      if (!symbol) {
        throw new Error(`Unknown symbol '${node.name}'.`);
      }

      if (symbol.type === "process") {
        return store({ type: "process", value: materializeProcess(symbol, context) });
      }

      return store(symbol);
    }
    case "differentialIdentifier":
      throw new Error("Differentials can only be evaluated inside integral(...) or dX_t = ...");
    case "unary": {
      const operand = materializeExpression(
        node.operand,
        symbols,
        types,
        context,
        scope,
        `${path}/operand`,
      );

      if (operand.type === "number") {
        return store({ type: "number", value: -operand.value });
      }

      if (operand.type === "process") {
        return store({
          type: "process",
          value: makeSampledProcess(
            operand.value.processName,
            operand.value.times,
            operand.value.paths.map((candidatePath) =>
              candidatePath.map((value) => -value),
            ),
            `${operand.value.randomnessHandle}:neg`,
            operand.value.interpolation,
            operand.value.stats,
            operand.value.endpointLaw
              ? affineEndpointLaw(operand.value.endpointLaw, -1, 0)
              : undefined,
          ),
        });
      }

      throw new Error("Unary minus cannot be applied to functions.");
    }
    case "binary": {
      const left = materializeExpression(
        node.left,
        symbols,
        types,
        context,
        scope,
        `${path}/left`,
      );
      const right = materializeExpression(
        node.right,
        symbols,
        types,
        context,
        scope,
        `${path}/right`,
      );

      if (left.type === "function" || right.type === "function") {
        throw new Error("Binary operators only support numbers and processes.");
      }

      if (left.type === "number" && right.type === "number") {
        return store({
          type: "number",
          value: applyBinary(node.operator, left.value, right.value),
        });
      }

      const process = left.type === "process" ? left.value : right.value;
      const length = process.times.length;
      const leftPaths =
        left.type === "process" ? left.value.paths : [liftScalarToPath(left.value, length)];
      const rightPaths =
        right.type === "process" ? right.value.paths : [liftScalarToPath(right.value, length)];

      return store({
        type: "process",
        value: makeSampledProcess(
          "Derived",
          process.times,
          zipPaths(leftPaths, rightPaths, (a, b) => applyBinary(node.operator, a, b)) as number[][],
          `${left.type === "process" ? left.value.randomnessHandle : "scalar"}:${node.operator}:${
            right.type === "process" ? right.value.randomnessHandle : "scalar"
          }`,
          left.type === "process"
            ? left.value.interpolation
            : right.type === "process"
              ? right.value.interpolation
              : "linear",
          undefined,
          binaryEndpointLaw(
            left.type === "number" ? left : left.value,
            right.type === "number" ? right : right.value,
            node.operator,
          ),
        ),
      });
    }
    case "timeChange": {
      const source = materializeExpression(
        node.process,
        symbols,
        types,
        context,
        scope,
        `${path}/process`,
      );
      const clock = materializeExpression(
        node.clock,
        symbols,
        types,
        context,
        scope,
        `${path}/clock`,
      );

      if (source.type !== "process") {
        throw new Error("Time changes require a process on the left-hand side.");
      }

      if (clock.type === "function") {
        throw new Error("Time-change clocks cannot be functions.");
      }

      const clockProcess =
        clock.type === "process"
          ? clock.value
          : constantProcess(context.times, clock.value, `${path}:clock`);

      const interpolate = (pathValues: number[], timeValue: number) => {
        const sourceTimes = source.value.times;

        if (timeValue < sourceTimes[0] - 1e-12 || timeValue > sourceTimes.at(-1)! + 1e-12) {
          throw new Error("Time-change clock must stay within the source process horizon.");
        }

        if (timeValue <= sourceTimes[0]) {
          return pathValues[0] ?? 0;
        }

        for (let index = 0; index < sourceTimes.length - 1; index += 1) {
          const leftTime = sourceTimes[index];
          const rightTime = sourceTimes[index + 1];

          if (timeValue > rightTime + 1e-12) {
            continue;
          }

          if (source.value.interpolation === "step") {
            return pathValues[index] ?? 0;
          }

          const leftValue = pathValues[index] ?? 0;
          const rightValue = pathValues[index + 1] ?? leftValue;
          const weight = (timeValue - leftTime) / Math.max(rightTime - leftTime, 1e-12);
          return leftValue + (rightValue - leftValue) * weight;
        }

        return pathValues.at(-1) ?? 0;
      };

      const sampleCount = Math.max(source.value.paths.length, clockProcess.paths.length);
      const paths = Array.from({ length: sampleCount }, (_, sampleIndex) => {
        const sourcePath =
          source.value.paths[sampleIndex % source.value.paths.length] ?? source.value.paths[0];
        const clockPath =
          clockProcess.paths[sampleIndex % clockProcess.paths.length] ?? clockProcess.paths[0];

        let previousClock = -Infinity;
        return clockPath.map((clockValue) => {
          if (clockValue < -1e-12) {
            throw new Error("Time-change clock must stay nonnegative.");
          }
          if (clockValue + 1e-12 < previousClock) {
            throw new Error("Time-change clock must be nondecreasing.");
          }
          previousClock = clockValue;
          return interpolate(sourcePath, clockValue);
        });
      });

      return store({
        type: "process",
        value: makeSampledProcess(
          "TimeChanged",
          context.times,
          paths,
          `${source.value.randomnessHandle}:clock:${clockProcess.randomnessHandle}`,
          source.value.interpolation,
        ),
      });
    }
    case "call": {
      if (PROCESS_DEFINITIONS.has(node.callee)) {
        const args = node.args.map((argument) =>
          evaluateScalarExpression(argument, symbols, types, {}),
        );
        return store({
          type: "process",
          value: sampleBuiltinProcess(node.callee, args, {
            ...context,
            cellId: `${scope.modelId}:${path}:${node.callee}`,
          }),
        });
      }

      if (node.callee === "integral") {
        if (node.args.length !== 1) {
          throw new Error("integral(...) takes exactly one differential expression.");
        }

        return store({
          type: "process",
          value: materializeIntegralProcess(
            node.args[0],
            symbols,
            types,
            context,
            scope,
            `${path}/integral`,
          ),
        });
      }

      if (node.callee === "qv") {
        if (node.args.length < 1 || node.args.length > 2) {
          throw new Error("qv(...) takes one or two process arguments.");
        }

        const left = materializeExpression(
          node.args[0],
          symbols,
          types,
          context,
          scope,
          `${path}/qv-left`,
        );
        const right = materializeExpression(
          node.args[1] ?? node.args[0],
          symbols,
          types,
          context,
          scope,
          `${path}/qv-right`,
        );

        if (left.type !== "process" || right.type !== "process") {
          throw new Error("qv(...) arguments must be processes.");
        }

        const sampleCount = Math.max(left.value.paths.length, right.value.paths.length);
        const qvPaths = Array.from({ length: sampleCount }, (_, sampleIndex) => {
          const leftIncrements =
            left.value.increments[sampleIndex % left.value.increments.length] ??
            left.value.increments[0] ??
            [];
          const rightIncrements =
            right.value.increments[sampleIndex % right.value.increments.length] ??
            right.value.increments[0] ??
            [];
          const path = [0];

          leftIncrements.forEach((increment, index) => {
            path.push((path.at(-1) ?? 0) + increment * (rightIncrements[index] ?? 0));
          });

          return path;
        });

        return store({
          type: "process",
          value: makeSampledProcess(
            "QuadraticVariation",
            context.times,
            qvPaths,
            `${left.value.randomnessHandle}:qv:${right.value.randomnessHandle}`,
            "step",
          ),
        });
      }

      if (node.callee in SCALAR_FUNCTIONS) {
        const fn = SCALAR_FUNCTIONS[node.callee];
        const evaluatedArgs = node.args.map((argument, index) =>
          materializeExpression(
            argument,
            symbols,
            types,
            context,
            scope,
            `${path}/arg-${index}`,
          ),
        );

        if (evaluatedArgs.some((value) => value.type === "function")) {
          throw new Error("Scalar built-ins cannot accept functions.");
        }

        const processArgs = evaluatedArgs.filter(
          (value): value is Extract<MaterializedExpression, { type: "process" }> =>
            value.type === "process",
        );

        if (processArgs.length === 0) {
          return store({
            type: "number",
            value: fn(...evaluatedArgs.map((value) => (value as NumberValue).value)),
          });
        }

        const baseProcess = processArgs[0].value;

        return store({
          type: "process",
          value: makeSampledProcess(
            "Derived",
            baseProcess.times,
            baseProcess.paths.map((pathValues, sampleIndex) =>
              pathValues.map((_value, pointIndex) =>
                fn(
                  ...evaluatedArgs.map((value) => {
                    if (value.type === "number") {
                      return value.value;
                    }
                    return currentValueForProcess(value.value, sampleIndex, pointIndex);
                  }),
                ),
              ),
            ),
            `${baseProcess.randomnessHandle}:builtin:${node.callee}`,
            processArgs.some((value) => value.value.interpolation === "step") ? "step" : "linear",
            undefined,
            processArgs.length === 1
              ? scalarBuiltinEndpointLaw(node.callee, baseProcess.endpointLaw)
              : undefined,
          ),
        });
      }

      const callee = symbols[node.callee];
      if (!callee) {
        throw new Error(`Unknown function '${node.callee}'.`);
      }
      if (callee.type !== "function") {
        throw new Error(`'${node.callee}' is not callable.`);
      }
      if (node.args.length !== 1) {
        throw new Error("User-defined functions currently take exactly one argument.");
      }

      const argument = materializeExpression(
        node.args[0],
        symbols,
        types,
        context,
        scope,
        `${path}/arg-0`,
      );

      if (argument.type === "number") {
        return store({
          type: "number",
          value: callee.evaluate(argument.value),
        });
      }

      if (argument.type !== "process") {
        throw new Error("Functions cannot consume other functions.");
      }

      return store({
        type: "process",
        value: makeSampledProcess(
          "Derived",
          argument.value.times,
          argument.value.paths.map((candidatePath) =>
            candidatePath.map((value) => callee.evaluate(value)),
          ),
          `${argument.value.randomnessHandle}:fn:${node.callee}`,
          argument.value.interpolation,
          undefined,
          argument.value.endpointLaw
            ? transformEndpointLaw(argument.value.endpointLaw, (value) => callee.evaluate(value))
            : undefined,
        ),
      });
    }
  }
}

function evaluatePointwiseValue(
  node: ExpressionNode,
  symbols: Record<string, SymbolValue>,
  types: Map<string, RuntimeValueType>,
  context: MaterializeProcessContext,
  scope: MaterializationScope,
  env: PointEvaluationEnvironment,
  path: string,
): number {
  switch (node.type) {
    case "number":
      return node.value;
    case "time":
      return context.times[env.pointIndex] ?? 0;
    case "identifier": {
      if (env.localNumbers && node.name in env.localNumbers) {
        return env.localNumbers[node.name];
      }

      if (node.name in BUILTIN_CONSTANTS) {
        return BUILTIN_CONSTANTS[node.name];
      }

      if (env.selfProcessName === node.name && env.selfValue !== undefined) {
        return env.selfValue;
      }

      const symbol = symbols[node.name];
      if (!symbol) {
        throw new Error(`Unknown symbol '${node.name}'.`);
      }

      if (symbol.type === "number") {
        return symbol.value;
      }

      if (symbol.type === "process") {
        const sampled = materializeProcess(symbol, context);
        return currentValueForProcess(sampled, env.sampleIndex, env.pointIndex);
      }

      throw new Error(`'${node.name}' must be called as a function.`);
    }
    case "differentialIdentifier":
      throw new Error("Differentials cannot be used as pointwise values.");
    case "unary":
      return -evaluatePointwiseValue(
        node.operand,
        symbols,
        types,
        context,
        scope,
        env,
        `${path}/operand`,
      );
    case "binary":
      return applyBinary(
        node.operator,
        evaluatePointwiseValue(node.left, symbols, types, context, scope, env, `${path}/left`),
        evaluatePointwiseValue(node.right, symbols, types, context, scope, env, `${path}/right`),
      );
    case "timeChange":
    case "call": {
      if (
        node.type === "call" &&
        !(node.callee in SCALAR_FUNCTIONS) &&
        (PROCESS_DEFINITIONS.has(node.callee) || node.callee === "integral" || node.callee === "qv")
      ) {
        const materialized = materializeExpression(node, symbols, types, context, scope, path);
        if (materialized.type !== "process") {
          throw new Error("Expected a process-valued expression.");
        }
        return currentValueForProcess(materialized.value, env.sampleIndex, env.pointIndex);
      }

      if (node.type === "timeChange") {
        const materialized = materializeExpression(node, symbols, types, context, scope, path);
        if (materialized.type !== "process") {
          throw new Error("Expected a process-valued expression.");
        }
        return currentValueForProcess(materialized.value, env.sampleIndex, env.pointIndex);
      }

      const callNode = node as Extract<ExpressionNode, { type: "call" }>;
      if (callNode.callee in SCALAR_FUNCTIONS) {
        const fn = SCALAR_FUNCTIONS[callNode.callee];
        return fn(
          ...callNode.args.map((arg, index) =>
            evaluatePointwiseValue(
              arg,
              symbols,
              types,
              context,
              scope,
              env,
              `${path}/arg-${index}`,
            ),
          ),
        );
      }

      const callee = symbols[callNode.callee];
      if (!callee || callee.type !== "function") {
        throw new Error(`Unknown function '${callNode.callee}'.`);
      }

      if (callNode.args.length !== 1) {
        throw new Error("User-defined functions currently take exactly one argument.");
      }

      return callee.evaluate(
        evaluatePointwiseValue(
          callNode.args[0],
          symbols,
          types,
          context,
          scope,
          env,
          `${path}/arg-0`,
        ),
      );
    }
  }
}

function containsDifferential(node: ExpressionNode): boolean {
  switch (node.type) {
    case "differentialIdentifier":
      return true;
    case "binary":
      return containsDifferential(node.left) || containsDifferential(node.right);
    case "unary":
      return containsDifferential(node.operand);
    default:
      return false;
  }
}

function evaluateDifferentialIncrement(
  node: ExpressionNode,
  symbols: Record<string, SymbolValue>,
  types: Map<string, RuntimeValueType>,
  context: MaterializeProcessContext,
  scope: MaterializationScope,
  env: PointEvaluationEnvironment,
  path: string,
): number {
  switch (node.type) {
    case "differentialIdentifier":
      if (node.name === "dt") {
        const current = context.times[env.pointIndex] ?? 0;
        const next = context.times[env.pointIndex + 1] ?? current;
        return next - current;
      }

      if (scope.selfProcessName && node.name === `d${scope.selfProcessName}`) {
        throw new Error("The right-hand side of dX_t = ... cannot reference dX_t.");
      }

      const processName = node.name.slice(1);
      const symbol = symbols[processName];
      if (!symbol || symbol.type !== "process") {
        throw new Error(`Unknown differential '${node.name}'.`);
      }
      const sampled = materializeProcess(symbol, context);
      const increments =
        sampled.increments[env.sampleIndex % sampled.increments.length] ??
        sampled.increments[0] ??
        [];
      return increments[env.pointIndex] ?? 0;
    case "unary":
      return -evaluateDifferentialIncrement(
        node.operand,
        symbols,
        types,
        context,
        scope,
        env,
        `${path}/operand`,
      );
    case "binary": {
      const leftHasDiff = containsDifferential(node.left);
      const rightHasDiff = containsDifferential(node.right);

      switch (node.operator) {
        case "+":
          return (
            evaluateDifferentialIncrement(
              node.left,
              symbols,
              types,
              context,
              scope,
              env,
              `${path}/left`,
            ) +
            evaluateDifferentialIncrement(
              node.right,
              symbols,
              types,
              context,
              scope,
              env,
              `${path}/right`,
            )
          );
        case "-":
          return (
            evaluateDifferentialIncrement(
              node.left,
              symbols,
              types,
              context,
              scope,
              env,
              `${path}/left`,
            ) -
            evaluateDifferentialIncrement(
              node.right,
              symbols,
              types,
              context,
              scope,
              env,
              `${path}/right`,
            )
          );
        case "*":
          if (leftHasDiff && rightHasDiff) {
            throw new Error("Products of differentials are not supported. Use qv(...) instead.");
          }
          if (leftHasDiff) {
            return (
              evaluateDifferentialIncrement(
                node.left,
                symbols,
                types,
                context,
                scope,
                env,
                `${path}/left`,
              ) *
              evaluatePointwiseValue(
                node.right,
                symbols,
                types,
                context,
                scope,
                env,
                `${path}/right`,
              )
            );
          }
          if (rightHasDiff) {
            return (
              evaluatePointwiseValue(
                node.left,
                symbols,
                types,
                context,
                scope,
                env,
                `${path}/left`,
              ) *
              evaluateDifferentialIncrement(
                node.right,
                symbols,
                types,
                context,
                scope,
                env,
                `${path}/right`,
              )
            );
          }
          break;
        case "/":
          if (rightHasDiff) {
            throw new Error("Division by a differential is not supported.");
          }
          if (leftHasDiff) {
            const denominator = evaluatePointwiseValue(
              node.right,
              symbols,
              types,
              context,
              scope,
              env,
              `${path}/right`,
            );
            return (
              evaluateDifferentialIncrement(
                node.left,
                symbols,
                types,
                context,
                scope,
                env,
                `${path}/left`,
              ) / Math.max(Math.abs(denominator), 1e-12)
            );
          }
          break;
        case "^":
          if (leftHasDiff || rightHasDiff) {
            throw new Error("Differentials cannot be raised to a power.");
          }
          break;
      }

      throw new Error("Differential expressions must be linear combinations of dt and dX_t terms.");
    }
    default:
      throw new Error("Differential expressions must be linear combinations of dt and dX_t terms.");
  }
}

function differentialInterpolation(
  node: ExpressionNode,
  symbols: Record<string, SymbolValue>,
  context: MaterializeProcessContext,
): ProcessInterpolation {
  if (node.type === "differentialIdentifier" && node.name !== "dt") {
    const symbol = symbols[node.name.slice(1)];
    if (symbol?.type === "process") {
      return materializeProcess(symbol, context).interpolation;
    }
  }

  if (node.type === "binary") {
    const left = differentialInterpolation(node.left, symbols, context);
    const right = differentialInterpolation(node.right, symbols, context);
    return left === "step" || right === "step" ? "step" : "linear";
  }

  if (node.type === "unary") {
    return differentialInterpolation(node.operand, symbols, context);
  }

  return "linear";
}

function materializeIntegralProcess(
  differentialNode: ExpressionNode,
  symbols: Record<string, SymbolValue>,
  types: Map<string, RuntimeValueType>,
  context: MaterializeProcessContext,
  scope: MaterializationScope,
  path: string,
): SampledProcess {
  const sampleCount = context.sampleCount;
  const paths = Array.from({ length: sampleCount }, (_, sampleIndex) => {
    const currentPath = [0];

    for (let pointIndex = 0; pointIndex < context.times.length - 1; pointIndex += 1) {
      const increment = evaluateDifferentialIncrement(
        differentialNode,
        symbols,
        types,
        context,
        scope,
        {
          sampleIndex,
          pointIndex,
        },
        `${path}/step-${pointIndex}`,
      );
      currentPath.push((currentPath.at(-1) ?? 0) + increment);
    }

    return currentPath;
  });

  return makeSampledProcess(
    "Integral",
    context.times,
    paths,
    `${scope.modelId}:${path}`,
    differentialInterpolation(differentialNode, symbols, context),
  );
}

function createAstProcessModel(
  processName: string,
  expression: ExpressionNode,
  symbols: Record<string, SymbolValue>,
  types: Map<string, RuntimeValueType>,
  modelId: string,
): ProcessModelValue {
  return createProcessModel(processName, modelId, "linear", (context) => {
    const result = materializeExpression(
      expression,
      symbols,
      types,
      context,
      {
        modelId,
        cache: new Map(),
      },
      "root",
    );

    if (result.type === "process") {
      return {
        ...result.value,
        processName,
      };
    }

    if (result.type === "number") {
      return {
        ...constantProcess(context.times, result.value, `${modelId}:constant`),
        processName,
      };
    }

    throw new Error("Process expressions cannot evaluate to functions.");
  });
}

function createSdeProcessModel(
  cell: CompiledCell,
  symbols: Record<string, SymbolValue>,
  types: Map<string, RuntimeValueType>,
): ProcessModelValue {
  if (cell.assignment.type !== "sde") {
    throw new Error("Expected an SDE assignment.");
  }

  const { processName, initialConditionName, expression } = cell.assignment;

  return createProcessModel(processName, cell.id, "linear", (context) => {
    const initialValue = symbols[initialConditionName];
    if (!initialValue || initialValue.type !== "number") {
      throw new Error(`Missing numeric initial condition '${initialConditionName}'.`);
    }

    const interpolation = differentialInterpolation(expression, symbols, context);
    const paths = Array.from({ length: context.sampleCount }, (_, sampleIndex) => {
      const currentPath = [initialValue.value];

      for (let pointIndex = 0; pointIndex < context.times.length - 1; pointIndex += 1) {
        const currentValue = currentPath.at(-1) ?? initialValue.value;
        const increment = evaluateDifferentialIncrement(
          expression,
          symbols,
          types,
          context,
          {
            modelId: cell.id,
            cache: new Map(),
            selfProcessName: processName,
          },
          {
            sampleIndex,
            pointIndex,
            selfProcessName: processName,
            selfValue: currentValue,
          },
          `sde:${pointIndex}`,
        );
        currentPath.push(currentValue + increment);
      }

      return currentPath;
    });

    return makeSampledProcess(
      processName,
      context.times,
      paths,
      `${cell.id}:sde`,
      interpolation,
    );
  });
}

function materializeRuntimeValue(
  value: SymbolValue,
  context: MaterializeProcessContext,
): RuntimeValue {
  if (value.type === "process") {
    return materializeProcess(value, context);
  }

  if (value.type === "differential") {
    throw new Error("Differential expressions are not displayable notebook values.");
  }

  return value;
}

export function evaluateNotebook(
  cells: NotebookCell[],
  grid: GridConfig,
  rng: ProcessSamplerContext["rng"],
): NotebookEvaluation {
  const { compiled, diagnostics, orderedCellIds } = compileCells(cells);
  const symbolTable: Record<string, SymbolValue> = {};
  const records: Record<string, EvaluationRecord> = {};
  const times = linspace(grid.tMin, grid.tMax, grid.points);
  const types = buildTypeLookup(compiled, orderedCellIds);
  const processCache = new Map<string, SampledProcess>();

  const sampleCountForCell = (cellId: string) =>
    cells.find((candidate) => candidate.id === cellId)?.display.sampleCount ?? 24;

  orderedCellIds.forEach((cellId) => {
    const cell = compiled.get(cellId);

    if (!cell) {
      return;
    }

    if (diagnostics[cellId]?.length) {
      records[cellId] = {
        cellId,
        error: diagnostics[cellId]?.[0]?.message,
      };
      return;
    }

    try {
      let value: SymbolValue;

      switch (cell.assignment.type) {
        case "function": {
          const parameter = cell.assignment.parameter;
          const expression = cell.assignment.expression;

          value = {
            type: "function",
            parameter,
            evaluate: (input: number) =>
              evaluateScalarExpression(expression, symbolTable, types, {
                [parameter]: input,
              }),
          } satisfies ScalarFunctionValue;
          break;
        }
        case "initialCondition":
          value = {
            type: "number",
            value: evaluateScalarExpression(
              cell.assignment.expression,
              symbolTable,
              types,
            ),
          };
          break;
        case "sde":
          value = createSdeProcessModel(cell, symbolTable, types);
          break;
        case "assignment": {
          const expressionType = inferExpressionType(
            cell.assignment.expression,
            (identifier) => types.get(identifier),
          );

          if (expressionType === "number") {
            value = {
              type: "number",
              value: evaluateScalarExpression(
                cell.assignment.expression,
                symbolTable,
                types,
              ),
            };
          } else if (expressionType === "process") {
            value = createAstProcessModel(
              cell.name,
              cell.assignment.expression,
              symbolTable,
              types,
              cell.id,
            );
          } else if (expressionType === "differential") {
            value = {
              type: "differential",
              terms: [],
            } satisfies DifferentialValue;
          } else {
            throw new Error("Unexpected function-valued assignment.");
          }
          break;
        }
      }

      const runtimeValue =
        value.type === "differential"
          ? undefined
          : materializeRuntimeValue(value, {
              cellId: cell.id,
              sampleCount: sampleCountForCell(cell.id),
              times,
              tMin: grid.tMin,
              tMax: grid.tMax,
              rng,
              cache: processCache,
            });

      if (cell.kind === "constant" && runtimeValue?.type !== "number" && cell.assignment.type !== "function") {
        throw new Error("Constants must evaluate to numbers.");
      }

      if ((cell.kind === "process" || cell.kind === "derived" || cell.kind === "sde") && runtimeValue?.type !== "process") {
        throw new Error("Process cells must evaluate to stochastic processes.");
      }

      if (value.type === "differential") {
        throw new Error("Top-level differential expressions must be wrapped in integral(...) or dX_t = ...");
      }

      symbolTable[cell.name] = value;
      records[cellId] = {
        cellId,
        name: cell.name,
        compiled: cell,
        kind: cell.kind,
        value: runtimeValue,
      };
    } catch (error) {
      records[cellId] = {
        cellId,
        name: cell.name,
        compiled: cell,
        kind: cell.kind,
        error: (error as Error).message,
      };
    }
  });

  cells.forEach((cell) => {
    if (!records[cell.id] && diagnostics[cell.id]?.length) {
      records[cell.id] = {
        cellId: cell.id,
        error: diagnostics[cell.id]?.[0]?.message,
      };
    }
  });

  return {
    records,
    symbolTable,
    orderedCellIds,
  };
}

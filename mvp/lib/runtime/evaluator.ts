import {
  affineEndpointLaw,
  constantEndpointLaw,
  addEndpointLaws,
  powerEndpointLaw,
  subtractEndpointLaws,
  transformEndpointLaw,
} from "@/lib/runtime/endpoint-laws";
import {
  linspace,
  meanByIndex,
  SCALAR_FUNCTIONS,
  varianceByIndex,
} from "@/lib/runtime/math";
import { compileCells, inferExpressionType } from "@/lib/runtime/parser";
import { sampleBuiltinProcess, PROCESS_DEFINITIONS } from "@/lib/runtime/processes";
import type {
  CompiledCell,
  EvaluationRecord,
  ExpressionNode,
  GridConfig,
  NotebookCell,
  NotebookEvaluation,
  ProcessSamplerContext,
  RuntimeValue,
  RuntimeValueType,
  ScalarFunctionValue,
} from "@/lib/runtime/types";

type EvaluationContext = {
  times: number[];
  sampleCountForCell: (cellId: string) => number;
  grid: GridConfig;
  rng: ProcessSamplerContext["rng"];
  currentCellId: string;
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
      return right === 0 ? 0 : left / right;
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

function makeProcess(
  processName: string,
  times: number[],
  paths: number[][],
  randomnessHandle: string,
  stats?: RuntimeValue extends infer T
    ? T extends { type: "process"; stats?: infer S }
      ? S
      : never
    : never,
  endpointLaw?: RuntimeValue extends infer T
    ? T extends { type: "process"; endpointLaw?: infer L }
      ? L
      : never
    : never,
): RuntimeValue {
  return {
    type: "process",
    processName,
    times,
    paths,
    mean: meanByIndex(paths),
    variance: varianceByIndex(paths),
    endpoints: paths.map((path) => path.at(-1) ?? 0),
    randomnessHandle,
    stats,
    endpointLaw,
  };
}

function numberLaw(value: number) {
  return constantEndpointLaw(value);
}

function binaryEndpointLaw(
  left: RuntimeValue,
  right: RuntimeValue,
  operator: string,
) {
  const leftLaw =
    left.type === "number" ? numberLaw(left.value) : left.type === "process" ? left.endpointLaw : undefined;
  const rightLaw =
    right.type === "number" ? numberLaw(right.value) : right.type === "process" ? right.endpointLaw : undefined;

  if (!leftLaw || !rightLaw) {
    return undefined;
  }

  switch (operator) {
    case "+":
      return addEndpointLaws(leftLaw, rightLaw);
    case "-":
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

function evaluateExpression(
  node: ExpressionNode,
  symbols: Record<string, RuntimeValue>,
  context: EvaluationContext,
  localNumberBindings: Record<string, number> = {},
): RuntimeValue {
  switch (node.type) {
    case "number":
      return { type: "number", value: node.value };
    case "identifier":
      if (node.name in localNumberBindings) {
        return { type: "number", value: localNumberBindings[node.name] };
      }

      if (!(node.name in symbols)) {
        throw new Error(`Unknown symbol '${node.name}'.`);
      }

      return symbols[node.name];
    case "unary": {
      const operand = evaluateExpression(node.operand, symbols, context, localNumberBindings);

      if (operand.type === "number") {
        return { type: "number", value: -operand.value };
      }

      if (operand.type === "process") {
        return makeProcess(
          `${operand.processName}:negated`,
          operand.times,
          operand.paths.map((path) => path.map((value) => -value)),
          `${operand.randomnessHandle}:neg`,
          operand.stats,
          operand.endpointLaw ? transformEndpointLaw(operand.endpointLaw, (value) => -value) : undefined,
        );
      }

      throw new Error("Unary minus cannot be applied to functions.");
    }
    case "binary": {
      const left = evaluateExpression(node.left, symbols, context, localNumberBindings);
      const right = evaluateExpression(node.right, symbols, context, localNumberBindings);

      if (left.type === "number" && right.type === "number") {
        return {
          type: "number",
          value: applyBinary(node.operator, left.value, right.value),
        };
      }

      if (left.type === "process" || right.type === "process") {
        if (
          (left.type !== "number" && left.type !== "process") ||
          (right.type !== "number" && right.type !== "process")
        ) {
          throw new Error("Binary operators only support numbers and processes.");
        }

        const process = left.type === "process" ? left : (right as Extract<RuntimeValue, { type: "process" }>);
        const length = process.times.length;
        const leftPaths =
          left.type === "process" ? left.paths : [liftScalarToPath(left.value, length)];
        const rightPaths =
          right.type === "process" ? right.paths : [liftScalarToPath(right.value, length)];

        return makeProcess(
          "Derived",
          process.times,
          zipPaths(leftPaths, rightPaths, (a, b) => applyBinary(node.operator, a, b)) as number[][],
          `${left.type === "process" ? left.randomnessHandle : "scalar"}:${node.operator}:${
            right.type === "process" ? right.randomnessHandle : "scalar"
          }`,
          undefined,
          binaryEndpointLaw(left, right, node.operator),
        );
      }

      throw new Error("Invalid binary expression.");
    }
    case "call": {
      if (PROCESS_DEFINITIONS.has(node.callee)) {
        const args = node.args.map((argument) => {
          const value = evaluateExpression(argument, symbols, context, localNumberBindings);
          if (value.type !== "number") {
            throw new Error("Process constructor arguments must be numeric.");
          }
          return value.value;
        });

        return sampleBuiltinProcess(node.callee, args, {
          cellId: context.currentCellId,
          sampleCount: context.sampleCountForCell(context.currentCellId),
          times: context.times,
          tMin: context.grid.tMin,
          tMax: context.grid.tMax,
          rng: context.rng,
        });
      }

      if (node.callee in SCALAR_FUNCTIONS) {
        const fn = SCALAR_FUNCTIONS[node.callee];
        const evaluatedArgs = node.args.map((argument) =>
          evaluateExpression(argument, symbols, context, localNumberBindings),
        );

        if (evaluatedArgs.some((value) => value.type === "function")) {
          throw new Error("Scalar built-ins cannot accept functions.");
        }

        const processArgs = evaluatedArgs.filter(
          (value): value is Extract<RuntimeValue, { type: "process" }> => value.type === "process",
        );
        const processArg = processArgs[0];

        if (!processArg) {
          return {
            type: "number",
            value: fn(
              ...evaluatedArgs.map((value) => {
                if (value.type === "number") {
                  return value.value;
                }

                if (value.type === "process") {
                  return value.endpoints[0] ?? 0;
                }

                throw new Error("Scalar built-ins cannot accept functions.");
              }),
            ),
          };
        }

        return makeProcess(
          "Derived",
          processArg.times,
          processArg.paths.map((path, sampleIndex) =>
            path.map((_value, index) =>
              fn(
                ...evaluatedArgs.map((value) => {
                  if (value.type === "number") {
                    return value.value;
                  }

                  if (value.type !== "process") {
                    throw new Error("Scalar built-ins cannot accept functions.");
                  }

                  const candidatePath = value.paths[sampleIndex % value.paths.length];
                  return candidatePath[index] ?? 0;
                }),
              ),
            ),
          ),
          `${processArg.randomnessHandle}:builtin:${node.callee}`,
          undefined,
          processArgs.length === 1 && processArg.endpointLaw
            ? transformEndpointLaw(processArg.endpointLaw, (value) =>
                fn(
                  ...evaluatedArgs.map((argumentValue) =>
                    argumentValue.type === "number" ? argumentValue.value : value,
                  ),
                ),
              )
            : undefined,
        );
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

      const argument = evaluateExpression(node.args[0], symbols, context, localNumberBindings);

      if (argument.type === "number") {
        return {
          type: "number",
          value: callee.evaluate(argument.value),
        };
      }

      if (argument.type === "process") {
        return makeProcess(
          "Derived",
          argument.times,
          argument.paths.map((path) => path.map((value) => callee.evaluate(value))),
          `${argument.randomnessHandle}:fn:${node.callee}`,
          undefined,
          argument.endpointLaw
            ? transformEndpointLaw(argument.endpointLaw, (value) => callee.evaluate(value))
            : undefined,
        );
      }

      throw new Error("Functions cannot consume other functions.");
    }
  }
}

function buildTypeLookup(compiled: Map<string, CompiledCell>, orderedCellIds: string[]) {
  const types = new Map<string, RuntimeValueType>();

  orderedCellIds.forEach((cellId) => {
    const cell = compiled.get(cellId);

    if (!cell) {
      return;
    }

    if (cell.assignment.type === "function") {
      types.set(cell.name, "function");
      return;
    }

    const expressionType = inferExpressionType(
      cell.assignment.expression,
      (identifier) => types.get(identifier),
    );
    types.set(cell.name, expressionType);
  });

  return types;
}

export function evaluateNotebook(
  cells: NotebookCell[],
  grid: GridConfig,
  rng: ProcessSamplerContext["rng"],
): NotebookEvaluation {
  const { compiled, diagnostics, orderedCellIds } = compileCells(cells);
  const symbols: Record<string, RuntimeValue> = {};
  const records: Record<string, EvaluationRecord> = {};
  const times = linspace(grid.tMin, grid.tMax, grid.points);
  const types = buildTypeLookup(compiled, orderedCellIds);

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
      let value: RuntimeValue;
      if (cell.assignment.type === "function") {
        const parameter = cell.assignment.parameter;
        const expression = cell.assignment.expression;
        value = {
          type: "function",
          parameter,
          evaluate: (input: number) => {
            const output = evaluateExpression(
              expression,
              symbols,
              {
                times,
                sampleCountForCell,
                grid,
                rng,
                currentCellId: cell.id,
              },
              { [parameter]: input },
            );

            if (output.type !== "number") {
              throw new Error("Scalar functions must return numbers.");
            }

            return output.value;
          },
        } satisfies ScalarFunctionValue;
      } else {
        value = evaluateExpression(cell.assignment.expression, symbols, {
          times,
          sampleCountForCell,
          grid,
          rng,
          currentCellId: cell.id,
        });
      }

      const expressionType =
        cell.assignment.type === "function"
          ? "function"
          : inferExpressionType(cell.assignment.expression, (identifier) => types.get(identifier));

      if (cell.kind === "constant" && value.type !== "number") {
        throw new Error("Constants must evaluate to numbers.");
      }

      if ((cell.kind === "process" || cell.kind === "derived") && value.type !== "process") {
        throw new Error("Process cells must evaluate to stochastic processes.");
      }

      symbols[cell.name] = value;
      records[cellId] = {
        cellId,
        name: cell.name,
        compiled: cell,
        kind: cell.kind,
        value,
      };
      types.set(cell.name, expressionType);
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
    symbolTable: symbols,
    orderedCellIds,
  };
}

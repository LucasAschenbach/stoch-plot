import type {
  BinaryOperator,
  CompiledCell,
  CompiledCellKind,
  Diagnostic,
  DifferentialIdentifierName,
  ExpressionNode,
  NotebookCell,
  ParsedAssignment,
  RuntimeValueType,
} from "@/lib/runtime/types";
import { SCALAR_FUNCTIONS } from "@/lib/runtime/math";

const BUILTIN_PROCESS_NAMES = new Set([
  "Brownian",
  "BrownianBridge",
  "GeometricBrownian",
  "OrnsteinUhlenbeck",
  "Poisson",
  "RandomWalk",
]);

type Token =
  | { type: "number"; value: number }
  | { type: "identifier"; value: string }
  | {
      type: "operator";
      value: BinaryOperator | "=" | "," | "(" | ")" | "[" | "]";
    }
  | { type: "eof" };

type OperatorTokenValue = Extract<Token, { type: "operator" }>["value"];

const PRECEDENCE: Record<BinaryOperator, number> = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
  "^": 3,
};

function normalizeTimeChangeSugar(input: string) {
  return input.replace(
    /\b([A-Za-z][A-Za-z0-9]*)_\{([^{}]+)\}/g,
    (_match, baseName: string, clockSource: string) => `${baseName}_t[${clockSource}]`,
  );
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      const match = input.slice(index).match(/^\d+(\.\d+)?|\.\d+/);

      if (!match) {
        throw new Error("Malformed number literal");
      }

      tokens.push({ type: "number", value: Number(match[0]) });
      index += match[0].length;
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const match = input.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);

      if (!match) {
        throw new Error("Malformed identifier");
      }

      tokens.push({ type: "identifier", value: match[0] });
      index += match[0].length;
      continue;
    }

    if ("+-*/^=(),[]".includes(char)) {
      tokens.push({ type: "operator", value: char as OperatorTokenValue });
      index += 1;
      continue;
    }

    throw new Error(`Unexpected token '${char}'`);
  }

  tokens.push({ type: "eof" });
  return tokens;
}

function initialConditionProcessName(name: string) {
  const match = name.match(/^([A-Za-z][A-Za-z0-9]*)_0$/);
  return match ? `${match[1]}_t` : null;
}

function sdeProcessName(name: string) {
  const match = name.match(/^d([A-Za-z][A-Za-z0-9]*)_t$/);
  return match ? `${match[1]}_t` : null;
}

function differentialProcessName(name: DifferentialIdentifierName) {
  if (name === "dt") {
    return null;
  }

  return `${name.slice(1)}`;
}

class Parser {
  constructor(private readonly tokens: Token[], private index = 0) {}

  parseAssignment(): ParsedAssignment {
    const name = this.expectIdentifier();
    const maybeInitialCondition = initialConditionProcessName(name);
    const maybeSdeProcessName = sdeProcessName(name);

    if (this.matchOperator("(")) {
      const parameter = this.expectIdentifier();
      this.expectOperator(")");
      this.expectOperator("=");

      return {
        type: "function",
        name,
        parameter,
        expression: this.parseExpression(),
      };
    }

    this.expectOperator("=");

    if (maybeSdeProcessName) {
      return {
        type: "sde",
        name: maybeSdeProcessName,
        processName: maybeSdeProcessName,
        initialConditionName: maybeSdeProcessName.replace(/_t$/, "_0"),
        expression: this.parseExpression(),
      };
    }

    if (maybeInitialCondition) {
      return {
        type: "initialCondition",
        name,
        processName: maybeInitialCondition,
        expression: this.parseExpression(),
      };
    }

    return {
      type: "assignment",
      name,
      expression: this.parseExpression(),
    };
  }

  parseExpression(minPrecedence = 0): ExpressionNode {
    let left = this.parsePrefix();

    while (true) {
      if (this.matchOperator("[")) {
        const clock = this.parseExpression();
        this.expectOperator("]");
        left = {
          type: "timeChange",
          process: left,
          clock,
        };
        continue;
      }

      const operator = this.peekOperator();

      if (!operator || operator === "=" || operator === "," || operator === ")" || operator === "]") {
        break;
      }

      const precedence = PRECEDENCE[operator as BinaryOperator];

      if (precedence < minPrecedence) {
        break;
      }

      this.consume();
      const nextPrecedence = operator === "^" ? precedence : precedence + 1;
      const right = this.parseExpression(nextPrecedence);
      left = {
        type: "binary",
        operator: operator as BinaryOperator,
        left,
        right,
      };
    }

    return left;
  }

  private parsePrefix(): ExpressionNode {
    const token = this.peek();

    if (token.type === "operator" && token.value === "-") {
      this.consume();
      return {
        type: "unary",
        operator: "-",
        operand: this.parseExpression(4),
      };
    }

    if (token.type === "number") {
      this.consume();
      return { type: "number", value: token.value };
    }

    if (token.type === "identifier") {
      this.consume();

      if (token.value === "t") {
        return { type: "time" };
      }

      if (token.value === "dt" || /^d[A-Za-z][A-Za-z0-9]*_t$/.test(token.value)) {
        return {
          type: "differentialIdentifier",
          name: token.value as DifferentialIdentifierName,
        };
      }

      if (this.matchOperator("(")) {
        const args: ExpressionNode[] = [];

        if (!this.matchOperator(")")) {
          do {
            args.push(this.parseExpression());
          } while (this.matchOperator(","));

          this.expectOperator(")");
        }

        return {
          type: "call",
          callee: token.value,
          args,
        };
      }

      return { type: "identifier", name: token.value };
    }

    if (token.type === "operator" && token.value === "(") {
      this.consume();
      const expression = this.parseExpression();
      this.expectOperator(")");
      return expression;
    }

    throw new Error("Expected a number, identifier, or parenthesized expression");
  }

  private matchOperator(value: string) {
    const token = this.peek();

    if (token.type === "operator" && token.value === value) {
      this.consume();
      return true;
    }

    return false;
  }

  private expectOperator(value: string) {
    const token = this.peek();

    if (token.type !== "operator" || token.value !== value) {
      throw new Error(`Expected '${value}'`);
    }

    this.consume();
  }

  private expectIdentifier() {
    const token = this.peek();

    if (token.type !== "identifier") {
      throw new Error("Expected identifier");
    }

    this.consume();
    return token.value;
  }

  private peek() {
    return this.tokens[this.index];
  }

  private peekOperator() {
    const token = this.peek();
    return token.type === "operator" ? token.value : null;
  }

  private consume() {
    this.index += 1;
  }
}

function collectDependencies(
  node: ExpressionNode,
  parameterName?: string,
  localProcessName?: string,
  dependencies = new Set<string>(),
) {
  switch (node.type) {
    case "identifier":
      if (node.name !== parameterName && node.name !== localProcessName) {
        dependencies.add(node.name);
      }
      return dependencies;
    case "time":
      return dependencies;
    case "differentialIdentifier": {
      const dependency = differentialProcessName(node.name);
      if (dependency && dependency !== localProcessName) {
        dependencies.add(dependency);
      }
      return dependencies;
    }
    case "binary":
      collectDependencies(node.left, parameterName, localProcessName, dependencies);
      collectDependencies(node.right, parameterName, localProcessName, dependencies);
      return dependencies;
    case "unary":
      collectDependencies(node.operand, parameterName, localProcessName, dependencies);
      return dependencies;
    case "call":
      if (
        !(node.callee in SCALAR_FUNCTIONS) &&
        !BUILTIN_PROCESS_NAMES.has(node.callee) &&
        node.callee !== "integral" &&
        node.callee !== "qv"
      ) {
        dependencies.add(node.callee);
      }
      node.args.forEach((arg) =>
        collectDependencies(arg, parameterName, localProcessName, dependencies),
      );
      return dependencies;
    case "timeChange":
      collectDependencies(node.process, parameterName, localProcessName, dependencies);
      collectDependencies(node.clock, parameterName, localProcessName, dependencies);
      return dependencies;
    default:
      return dependencies;
  }
}

function classifyKind(assignment: ParsedAssignment): CompiledCellKind {
  if (assignment.type === "function") {
    return "function";
  }

  if (assignment.type === "sde") {
    return "sde";
  }

  if (assignment.type === "initialCondition") {
    return "constant";
  }

  if (assignment.name.endsWith("_t")) {
    if (assignment.expression.type === "call") {
      return BUILTIN_PROCESS_NAMES.has(assignment.expression.callee) ? "process" : "derived";
    }

    return "derived";
  }

  return "constant";
}

export function parseCellSource(source: string) {
  const trimmed = source.trim();

  if (!trimmed) {
    throw new Error("Cell is empty");
  }

  const normalized = normalizeTimeChangeSugar(trimmed);
  const parser = new Parser(tokenize(normalized));
  return parser.parseAssignment();
}

export function compileCells(cells: NotebookCell[]) {
  const diagnostics: Record<string, Diagnostic[]> = {};
  const compiled = new Map<string, CompiledCell>();
  const symbolOwners = new Map<string, string>();

  for (const cell of cells) {
    try {
      const assignment = parseCellSource(cell.source);
      const dependencies = Array.from(
        collectDependencies(
          assignment.expression,
          assignment.type === "function" ? assignment.parameter : undefined,
          assignment.type === "sde" ? assignment.processName : undefined,
        ),
      ).filter((dependency) => dependency !== assignment.name);

      if (assignment.type === "sde") {
        dependencies.push(assignment.initialConditionName);
      }

      const compiledCell: CompiledCell = {
        id: cell.id,
        source: cell.source,
        name: assignment.name,
        assignment,
        kind: classifyKind(assignment),
        dependencies: Array.from(new Set(dependencies)),
      };

      compiled.set(cell.id, compiledCell);

      const existingOwner = symbolOwners.get(assignment.name);
      if (existingOwner) {
        diagnostics[cell.id] = [
          { message: `Symbol '${assignment.name}' is already defined in another cell.` },
        ];
      } else {
        symbolOwners.set(assignment.name, cell.id);
      }
    } catch (error) {
      diagnostics[cell.id] = [{ message: (error as Error).message }];
    }
  }

  const dependencyOwners = new Map<string, string>();
  compiled.forEach((cell) => dependencyOwners.set(cell.name, cell.id));

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: string[] = [];

  const visit = (cellId: string, stack: string[] = []) => {
    if (visited.has(cellId) || diagnostics[cellId]?.length) {
      return;
    }

    if (visiting.has(cellId)) {
      diagnostics[cellId] = [{ message: `Dependency cycle detected: ${stack.join(" -> ")}` }];
      return;
    }

    visiting.add(cellId);
    const cell = compiled.get(cellId);

    if (!cell) {
      visiting.delete(cellId);
      return;
    }

    for (const dependency of cell.dependencies) {
      const ownerId = dependencyOwners.get(dependency);

      if (!ownerId) {
        diagnostics[cellId] = [{ message: `Unknown symbol '${dependency}'.` }];
        continue;
      }

      visit(ownerId, [...stack, cell.name]);
    }

    visiting.delete(cellId);
    visited.add(cellId);
    ordered.push(cellId);
  };

  cells.forEach((cell) => visit(cell.id));

  return {
    diagnostics,
    compiled,
    orderedCellIds: ordered,
  };
}

export function inferExpressionType(
  node: ExpressionNode,
  getType: (identifier: string) => RuntimeValueType | undefined,
  parameterName?: string,
): RuntimeValueType {
  switch (node.type) {
    case "number":
      return "number";
    case "identifier":
      if (node.name === parameterName) {
        return "number";
      }
      return getType(node.name) ?? "number";
    case "time":
      return parameterName === "t" ? "number" : "process";
    case "differentialIdentifier":
      return "differential";
    case "unary":
      return inferExpressionType(node.operand, getType, parameterName);
    case "binary": {
      const left = inferExpressionType(node.left, getType, parameterName);
      const right = inferExpressionType(node.right, getType, parameterName);

      if (left === "differential" || right === "differential") {
        return "differential";
      }

      return left === "process" || right === "process" ? "process" : "number";
    }
    case "call": {
      const calleeType = getType(node.callee);

      if (node.callee === "integral") {
        return "process";
      }

      if (node.callee === "qv") {
        return "process";
      }

      if (calleeType === "function") {
        const firstArgType = node.args[0]
          ? inferExpressionType(node.args[0], getType, parameterName)
          : "number";
        return firstArgType === "process" ? "process" : "number";
      }

      if (BUILTIN_PROCESS_NAMES.has(node.callee)) {
        return "process";
      }

      if (node.callee in SCALAR_FUNCTIONS) {
        const argTypes = node.args.map((arg) =>
          inferExpressionType(arg, getType, parameterName),
        );
        return argTypes.includes("process") ? "process" : "number";
      }

      return "number";
    }
    case "timeChange":
      return "process";
  }
}

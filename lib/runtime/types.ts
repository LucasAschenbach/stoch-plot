export type RuntimeValueType = "number" | "function" | "process";

export type BinaryOperator = "+" | "-" | "*" | "/" | "^";

export type UnaryOperator = "-";

export type ExpressionNode =
  | {
      type: "number";
      value: number;
    }
  | {
      type: "identifier";
      name: string;
    }
  | {
      type: "binary";
      operator: BinaryOperator;
      left: ExpressionNode;
      right: ExpressionNode;
    }
  | {
      type: "unary";
      operator: UnaryOperator;
      operand: ExpressionNode;
    }
  | {
      type: "call";
      callee: string;
      args: ExpressionNode[];
    };

export type ParsedAssignment =
  | {
      type: "assignment";
      name: string;
      expression: ExpressionNode;
    }
  | {
      type: "function";
      name: string;
      parameter: string;
      expression: ExpressionNode;
    };

export type SliderConfig = {
  enabled: boolean;
  min: number;
  max: number;
  step: number;
};

export type ColorMode =
  | "solid"
  | "viridis"
  | "plasma"
  | "inferno"
  | "magma"
  | "cividis"
  | "turbo";

export type CellDisplayOptions = {
  visible: boolean;
  showPaths: boolean;
  showMean: boolean;
  showVariance: boolean;
  sampleCount: number;
  color: string;
  colorMode: ColorMode;
};

export type NotebookCell = {
  id: string;
  source: string;
  display: CellDisplayOptions;
  slider: SliderConfig;
};

export type CompiledCellKind = "constant" | "function" | "process" | "derived";

export type CompiledCell = {
  id: string;
  source: string;
  name: string;
  assignment: ParsedAssignment;
  kind: CompiledCellKind;
  dependencies: string[];
};

export type Diagnostic = {
  message: string;
};

export type ScalarFunctionValue = {
  type: "function";
  parameter: string;
  evaluate: (input: number) => number;
};

export type ProcessDensity = {
  y: number[];
  density: number[];
};

export type EndpointLawVariable = {
  key: string;
  label: string;
  values: number[];
  weights: number[];
};

export type EndpointLawSupport = {
  min?: number;
  max?: number;
};

export type EndpointLaw = {
  variables: EndpointLawVariable[];
  support?: EndpointLawSupport;
  evaluate: (environment: Record<string, number>) => number;
  expectation: () => number;
  density: (yGrid: number[]) => number[];
};

export type ProcessStatsProvider = {
  mean?: (times: number[]) => number[];
  variance?: (times: number[]) => number[];
  endpointExpectation?: (time: number) => number;
  endpointDensity?: (y: number[], time: number) => number[];
};

export type SampledProcess = {
  type: "process";
  processName: string;
  times: number[];
  paths: number[][];
  mean: number[];
  variance: number[];
  endpoints: number[];
  randomnessHandle: string;
  stats?: ProcessStatsProvider;
  endpointLaw?: EndpointLaw;
};

export type RuntimeValue =
  | {
      type: "number";
      value: number;
    }
  | ScalarFunctionValue
  | SampledProcess;

export type ProcessSamplerContext = {
  cellId: string;
  sampleCount: number;
  times: number[];
  tMin: number;
  tMax: number;
  rng: RngContext;
};

export type ProcessDefinition = {
  name: string;
  parameters: string[];
  sample: (
    args: number[],
    context: ProcessSamplerContext,
  ) => Omit<SampledProcess, "type" | "processName">;
  stats?: (args: number[], times: number[], tMax: number) => ProcessStatsProvider;
};

export type EvaluationRecord = {
  cellId: string;
  name?: string;
  kind?: CompiledCellKind;
  compiled?: CompiledCell;
  value?: RuntimeValue;
  error?: string;
};

export type NotebookEvaluation = {
  records: Record<string, EvaluationRecord>;
  symbolTable: Record<string, RuntimeValue>;
  orderedCellIds: string[];
};

export type GridConfig = {
  tMin: number;
  tMax: number;
  points: number;
};

export type ToolbarState = GridConfig & {
  seed: number;
  distributionPanel: boolean;
};

export type Viewport = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};

export type PrimitiveNoise =
  | {
      kind: "gaussian";
      values: number[][];
    }
  | {
      kind: "uniform";
      values: number[][];
    };

export type RngContext = {
  seed: number;
  version: number;
  gaussianCache: Map<string, number[][]>;
  uniformCache: Map<string, number[][]>;
};

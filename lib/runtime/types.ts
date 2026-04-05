export type RuntimeValueType = "number" | "function" | "process" | "differential";

export type BinaryOperator = "+" | "-" | "*" | "/" | "^";

export type UnaryOperator = "-";

export type DifferentialIdentifierName = "dt" | `d${string}_t`;

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
      type: "time";
    }
  | {
      type: "differentialIdentifier";
      name: DifferentialIdentifierName;
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
    }
  | {
      type: "timeChange";
      process: ExpressionNode;
      clock: ExpressionNode;
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
    }
  | {
      type: "initialCondition";
      name: string;
      processName: string;
      expression: ExpressionNode;
    }
  | {
      type: "sde";
      name: string;
      processName: string;
      initialConditionName: string;
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

export type CompiledCellKind =
  | "constant"
  | "function"
  | "process"
  | "derived"
  | "sde";

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
  densityAt?: (value: number) => number;
  density: (yGrid: number[]) => number[];
};

export type ProcessStatsProvider = {
  mean?: (times: number[]) => number[];
  variance?: (times: number[]) => number[];
  endpointExpectation?: (time: number) => number;
  endpointDensity?: (y: number[], time: number) => number[];
};

export type ProcessInterpolation = "linear" | "step";

export type SampledProcess = {
  type: "process";
  processName: string;
  times: number[];
  paths: number[][];
  increments: number[][];
  interpolation: ProcessInterpolation;
  mean: number[];
  variance: number[];
  endpoints: number[];
  randomnessHandle: string;
  stats?: ProcessStatsProvider;
  endpointLaw?: EndpointLaw;
};

export type ProcessSamplerContext = {
  cellId: string;
  sampleCount: number;
  times: number[];
  tMin: number;
  tMax: number;
  rng: RngContext;
};

export type MaterializeProcessContext = ProcessSamplerContext & {
  cache: Map<string, SampledProcess>;
};

export type ProcessModelValue = {
  type: "process";
  processName: string;
  modelId: string;
  interpolation: ProcessInterpolation;
  materialize: (context: MaterializeProcessContext) => SampledProcess;
};

export type DifferentialTerm = {
  atom: "dt" | string;
  coefficient: SymbolValue;
};

export type DifferentialValue = {
  type: "differential";
  terms: DifferentialTerm[];
};

export type RuntimeValue =
  | {
      type: "number";
      value: number;
    }
  | ScalarFunctionValue
  | SampledProcess;

export type SymbolValue =
  | {
      type: "number";
      value: number;
    }
  | ScalarFunctionValue
  | ProcessModelValue
  | DifferentialValue;

export type ProcessDefinition = {
  name: string;
  parameters: string[];
  sample: (
    args: number[],
    context: ProcessSamplerContext,
  ) => Omit<
    SampledProcess,
    | "type"
    | "processName"
    | "increments"
    | "interpolation"
  > & {
    increments?: number[][];
    interpolation?: ProcessInterpolation;
  };
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
  symbolTable: Record<string, SymbolValue>;
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

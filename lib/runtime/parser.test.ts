import { describe, expect, it } from "vitest";

import { parseCellSource } from "@/lib/runtime/parser";

describe("parser stochastic calculus syntax", () => {
  it("parses initial conditions", () => {
    const parsed = parseCellSource("X_0 = 1");

    expect(parsed.type).toBe("initialCondition");
    if (parsed.type !== "initialCondition") {
      throw new Error("Expected initial condition.");
    }

    expect(parsed.name).toBe("X_0");
    expect(parsed.processName).toBe("X_t");
  });

  it("parses SDE assignments", () => {
    const parsed = parseCellSource("dX_t = mu * dt + sigma * dB_t");

    expect(parsed.type).toBe("sde");
    if (parsed.type !== "sde") {
      throw new Error("Expected SDE assignment.");
    }

    expect(parsed.name).toBe("X_t");
    expect(parsed.initialConditionName).toBe("X_0");
  });

  it("parses ASCII time changes", () => {
    const parsed = parseCellSource("Z_t = B_t[f(t)]");

    expect(parsed.type).toBe("assignment");
    if (parsed.type !== "assignment") {
      throw new Error("Expected assignment.");
    }

    expect(parsed.expression.type).toBe("timeChange");
  });

  it("parses brace time-change sugar", () => {
    const parsed = parseCellSource("Z_t = B_{f(t)}");

    expect(parsed.type).toBe("assignment");
    if (parsed.type !== "assignment") {
      throw new Error("Expected assignment.");
    }

    expect(parsed.expression.type).toBe("timeChange");
  });

  it("parses qv and integral calls", () => {
    const integral = parseCellSource("I_t = integral(X_t * dt)");
    const qv = parseCellSource("Q_t = qv(X_t, Y_t)");

    expect(integral.type).toBe("assignment");
    expect(qv.type).toBe("assignment");
    if (integral.type !== "assignment" || qv.type !== "assignment") {
      throw new Error("Expected assignments.");
    }

    expect(integral.expression.type).toBe("call");
    expect(qv.expression.type).toBe("call");
  });
});

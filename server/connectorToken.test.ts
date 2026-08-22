import { describe, it, expect } from "vitest";
import { ENV } from "./_core/env";

describe("CONNECTOR_SHARED_TOKEN configuration", () => {
  it("should have CONNECTOR_SHARED_TOKEN configured and non-empty", () => {
    expect(ENV.connectorSharedToken).toBeDefined();
    expect(typeof ENV.connectorSharedToken).toBe("string");
    expect(ENV.connectorSharedToken.trim().length).toBeGreaterThan(0);
  });

  it("should have a token with at least 20 characters for security", () => {
    expect(ENV.connectorSharedToken.length).toBeGreaterThanOrEqual(20);
  });
});

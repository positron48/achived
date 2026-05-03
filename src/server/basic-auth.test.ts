import { describe, expect, it } from "vitest";

import { isBasicAuthAuthorized } from "./basic-auth";

describe("isBasicAuthAuthorized", () => {
  it("accepts valid credentials", () => {
    const header = `Basic ${Buffer.from("user:pass").toString("base64")}`;
    expect(isBasicAuthAuthorized(header, "user", "pass")).toBe(true);
  });

  it("rejects invalid credentials", () => {
    const header = `Basic ${Buffer.from("user:wrong").toString("base64")}`;
    expect(isBasicAuthAuthorized(header, "user", "pass")).toBe(false);
  });

  it("rejects malformed header", () => {
    expect(isBasicAuthAuthorized("Bearer token", "user", "pass")).toBe(false);
  });
});

import { expect, it } from "vitest";
import { authErrorKey, validate } from "./validate";

const ok = { name: "Dana", email: "dana@example.co.il", password: "12345678" };

it("accepts valid input", () => {
  expect(validate(ok, "signUp")).toEqual({});
  expect(validate({ ...ok, email: "  dana@example.com " }, "signIn")).toEqual({});
});

it("rejects bad emails", () => {
  for (const email of ["", "dana", "dana@", "@x.com", "dana@x", "da na@x.com"]) {
    expect(validate({ ...ok, email }, "signIn").email).toBe("auth.error.email");
  }
});

it("requires 8+ character passwords", () => {
  expect(validate({ ...ok, password: "1234567" }, "signIn").password).toBe("auth.error.password");
});

it("requires a name only on sign-up", () => {
  expect(validate({ ...ok, name: " " }, "signUp").name).toBe("auth.error.name");
  expect(validate({ ...ok, name: "" }, "signIn")).toEqual({});
});

it("maps better-auth error codes to string keys", () => {
  expect(authErrorKey("INVALID_EMAIL_OR_PASSWORD")).toBe("auth.error.invalid");
  expect(authErrorKey("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL")).toBe("auth.error.exists");
  expect(authErrorKey(undefined)).toBe("auth.error.generic");
});

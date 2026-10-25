import { describe, expect, it } from "vitest";
import { Linter } from "eslint";
import path from "node:path";
import architecture from "../eslint.architecture.mjs";
describe("production import boundaries", () => {
 const linter = new Linter();
 function errors(code: string, filename: string) {
  return linter.verify(code, [{ files: ["**/*.ts"], languageOptions: { ecmaVersion: "latest", sourceType: "module" }, plugins: { architecture }, rules: { "architecture/boundaries": "error" } }], { filename: path.resolve(filename) });
 }
 it("blocks inward dependency violations including relative and dynamic imports", () => {
  expect(errors('import x from "@/infrastructure/auth/auth-store";', "src/application/fake.ts")).toHaveLength(1);
  expect(errors('import("../infrastructure/auth/auth-store");', "src/domain/fake.ts")).toHaveLength(1);
  expect(errors('import x from "next/server";', "src/domain/fake.ts")).toHaveLength(1);
  expect(errors('"use client"; import x from "@/infrastructure/fhir/core/fhir.client";', "src/app/fake.ts")).toHaveLength(1);
 });
 it("allows composition, domain-facing contracts, server actions and test fixtures", () => {
  expect(errors('import x from "@/domain/patient/patient";', "src/application/fake.ts")).toEqual([]);
  expect(errors('import x from "@/infrastructure/fhir/create-clinical-dependencies";', "src/app/fake.ts")).toEqual([]);
  expect(errors('"use client"; import x from "./actions";', "src/app/fake.ts")).toEqual([]);
  expect(errors('import x from "@/infrastructure/auth/auth-store";', "src/application/fake.test.ts")).toEqual([]);
 });
});

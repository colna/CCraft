import { describe, expect, it } from "vitest";
import {
  buildPillars,
  interactivePanels,
  productShowcase,
  studioPrinciples
} from "./site";

describe("homepage content", () => {
  it("keeps the product showcase complete and uniquely named", () => {
    expect(productShowcase).toHaveLength(4);
    expect(new Set(productShowcase.map((product) => product.title)).size).toBe(
      productShowcase.length
    );
    expect(productShowcase.every((product) => product.description.length > 24)).toBe(true);
  });

  it("covers the core company build areas", () => {
    expect(buildPillars.map((pillar) => pillar.title)).toEqual([
      "Intelligent Apps",
      "Creative Tools",
      "Social Experiences"
    ]);
    expect(buildPillars.every((pillar) => pillar.titleZh.length > 2)).toBe(true);
  });

  it("has enough principles and interface panels for the landing page rhythm", () => {
    expect(studioPrinciples).toHaveLength(3);
    expect(interactivePanels.length).toBeGreaterThanOrEqual(4);
  });
});

import { describe, expect, it } from "vitest";

import { renderableImageSrc } from "./image-src";

describe("renderableImageSrc", () => {
  it("passes through https URLs on the Open Food Facts image host", () => {
    const url =
      "https://images.openfoodfacts.org/images/products/729/000/006/6318/front_he.jpg";
    expect(renderableImageSrc(url)).toBe(url);
  });

  it("returns null for null (products without an image)", () => {
    expect(renderableImageSrc(null)).toBeNull();
  });

  it.each([
    ["a foreign host", "https://evil.example/tracker.png"],
    [
      "a lookalike subdomain",
      "https://images.openfoodfacts.org.evil.example/x.png",
    ],
    ["plain http on the right host", "http://images.openfoodfacts.org/x.jpg"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a data: URL", "data:image/svg+xml,<svg/>"],
    ["a relative path", "/images/x.jpg"],
    ["a non-URL string", "not a url"],
    ["an empty string", ""],
  ])("returns null for %s", (_label, url) => {
    expect(renderableImageSrc(url)).toBeNull();
  });
});

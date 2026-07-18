import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const sourceUrl = new URL("./App.tsx", import.meta.url);
const stylesUrl = new URL("./styles.css", import.meta.url);
const htmlUrl = new URL("../../index.html", import.meta.url);

describe("LessonProof design guard", () => {
  it("keeps production styling flat and self-contained", async () => {
    const styles = await readFile(stylesUrl, "utf8");
    const html = await readFile(htmlUrl, "utf8");

    expect(styles).not.toMatch(/(?:linear|radial|conic)-gradient\s*\(/i);
    expect(styles).not.toMatch(/\bbox-shadow\s*:/i);
    expect(html).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/i);
  });

  it("keeps interface copy specific and free of emoji icons", async () => {
    const source = await readFile(sourceUrl, "utf8");
    const vagueWords = [
      "unlock",
      "empower",
      "seamless",
      "leverage",
      "streamline",
      "robust",
      "cutting-edge",
      "elevate",
      "harness",
      "delve",
    ];

    for (const word of vagueWords) {
      expect(source).not.toMatch(new RegExp(`\\b${word}\\b`, "i"));
    }
    expect(source).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

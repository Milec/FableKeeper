import { describe, expect, it } from "vitest";
import { extractWikiLinks, renderWikiLinks } from "./wikilinks";

describe("extractWikiLinks", () => {
  it("extracts a simple link", () => {
    const links = extractWikiLinks("The city of [[Absalom]] is vast.");
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ target: "Absalom", slug: "absalom" });
  });

  it("extracts an aliased link", () => {
    const links = extractWikiLinks("Ruled by [[Queen Domina|the Queen]].");
    expect(links[0]).toMatchObject({
      target: "Queen Domina",
      slug: "queen-domina",
      alias: "the Queen",
    });
  });

  it("de-duplicates by slug", () => {
    const links = extractWikiLinks("[[Absalom]] and [[absalom]] and [[Absalom|home]]");
    expect(links).toHaveLength(1);
  });

  it("ignores empty and malformed links", () => {
    expect(extractWikiLinks("[[]] [[   ]] [not a link]")).toHaveLength(0);
  });

  it("handles multiple links across lines", () => {
    const links = extractWikiLinks("[[Taldor]]\nborders [[Andoran]] and [[Qadira]].");
    expect(links.map((l) => l.slug)).toEqual(["taldor", "andoran", "qadira"]);
  });
});

describe("renderWikiLinks", () => {
  const resolve = (slug: string) =>
    slug === "absalom" ? "/campaigns/1/worlds/1/entries/absalom" : null;

  it("rewrites resolved links to markdown", () => {
    const out = renderWikiLinks("Visit [[Absalom]] today.", resolve);
    expect(out).toBe("Visit [Absalom](/campaigns/1/worlds/1/entries/absalom) today.");
  });

  it("uses the alias as the label", () => {
    const out = renderWikiLinks("Visit [[Absalom|the city]].", resolve);
    expect(out).toBe("Visit [the city](/campaigns/1/worlds/1/entries/absalom).");
  });

  it("marks unresolved links as missing", () => {
    const out = renderWikiLinks("Go to [[Nowhere]].", resolve);
    expect(out).toContain('"missing:nowhere"');
  });

  it("leaves text without links untouched", () => {
    expect(renderWikiLinks("Plain text.", resolve)).toBe("Plain text.");
  });
});

// The town a Driver's base is in — the Base column of /admin/drivers' "To be approved" table (S80).
//
// ⚑ WHY IT EXISTS. The row printed the label's first comma-separated part, and the live fleet's Monaco
// Driver read "Pl. du Casino · 40 km" — a street where the column names a zone.
import { describe, expect, it } from "vitest";
import { baseTownOf } from "@/lib/format";

describe("baseTownOf", () => {
  it("a town on its own is the town", () => {
    expect(baseTownOf("Antibes")).toBe("Antibes");
    expect(baseTownOf("Saint-Laurent-du-Var")).toBe("Saint-Laurent-du-Var");
  });

  it("⚑ a street with a postcode names the town, not the street — the live Monaco base", () => {
    expect(baseTownOf("Pl. du Casino, 98000 Monaco")).toBe("Monaco");
    expect(baseTownOf("1055 Chemin De Rabiac-Estagnol, 06600 Antibes, France")).toBe("Antibes");
  });

  it("a trailing country is dropped — but Monaco is a town as well as a country", () => {
    expect(baseTownOf("Cannes, France")).toBe("Cannes");
    expect(baseTownOf("Rue d'Antibes, Cannes, France")).toBe("Cannes");
    expect(baseTownOf("Pl. du Casino, Monaco")).toBe("Monaco");
  });

  it("nothing in, nothing out", () => {
    expect(baseTownOf("   ")).toBe("");
    expect(baseTownOf(null)).toBe("");
  });
});

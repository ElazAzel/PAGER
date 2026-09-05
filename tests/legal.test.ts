import { describe, expect, it } from "vitest";
import { legalConfig, paymentTerms } from "../src/lib/legal";

describe("legal release contract", () => {
  it("rejects placeholders instead of presenting them as public contact details", () => {
    expect(legalConfig({ PAGER_OPERATOR_NAME: "", PAGER_SUPPORT_EMAIL: "support@example.invalid" })).toEqual({ configured: false, operatorName: null, supportEmail: null });
  });

  it("normalizes configured operator contact", () => {
    expect(legalConfig({ PAGER_OPERATOR_NAME: "  PAGER Labs  ", PAGER_SUPPORT_EMAIL: " HELP@PAGER.TEST " })).toEqual({ configured: true, operatorName: "PAGER Labs", supportEmail: "help@pager.test" });
  });

  it("describes the actual payment capability in both languages", () => {
    expect(paymentTerms("en", true)).toContain("Stripe Connect");
    expect(paymentTerms("ru", true)).toContain("Stripe Connect");
    expect(paymentTerms("en", false)).toContain("currently disabled");
    expect(paymentTerms("ru", false)).toContain("сейчас отключена");
  });
});

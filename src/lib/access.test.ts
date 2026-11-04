import { describe, expect, it } from "vitest";
import { canUse, DEFAULT_MODULES, firstAllowedPath } from "./access";
describe("permissões por função", () => {
  it("administrador tem acesso completo", () => {
    expect(canUse({ roles: ["admin"], modules: [], permissionsReady: false }, "relatorios")).toBe(true);
  });
  it("membro nunca acessa gestão mesmo com módulo adulterado", () => {
    const member = { roles: ["membro"], modules: [...DEFAULT_MODULES, "painel", "relatorios", "assistente"], permissionsReady: true };
    for (const module of ["painel", "simulacao", "relatorios", "assistente", "analytics", "configuracoes", "excluir"]) expect(canUse(member, module)).toBe(false);
    expect(firstAllowedPath(member)).toBe("/lancamentos");
    expect(canUse(member, "baixar")).toBe(true);
  });
  it("falha fechado sem migração, sem aprovação ou sem módulo", () => {
    expect(canUse({ roles: ["membro"], modules: DEFAULT_MODULES, permissionsReady: false }, "lancamentos")).toBe(false);
    expect(canUse({ roles: [], modules: DEFAULT_MODULES, permissionsReady: true }, "lancamentos")).toBe(false);
    expect(firstAllowedPath({ roles: ["membro"], modules: [], permissionsReady: true })).toBeNull();
  });
});

export const OPERATIONAL_MODULES = [
  { key: "lancamentos", label: "Lançar entradas e saídas" },
  { key: "contas", label: "Contas e vencimentos" },
  { key: "cartoes", label: "Recebíveis de cartões" },
  { key: "inadimplentes", label: "Inadimplentes" },
  { key: "baixar", label: "Dar e desfazer baixas" },
] as const;
export type OperationalModule = (typeof OPERATIONAL_MODULES)[number]["key"];
export const DEFAULT_MODULES: OperationalModule[] = OPERATIONAL_MODULES.map((m) => m.key);
export interface Access {
  roles: string[];
  modules: string[];
  permissionsReady: boolean;
}
export function canUse(access: Access | null | undefined, module: string) {
  if (!access) return false;
  if (access.roles.includes("admin")) return true;
  return (
    access.permissionsReady &&
    access.roles.includes("membro") &&
    OPERATIONAL_MODULES.some((m) => m.key === module) &&
    access.modules.includes(module)
  );
}
export function firstAllowedPath(access: Access | null | undefined) {
  if (canUse(access, "painel")) return "/painel" as const;
  if (canUse(access, "lancamentos")) return "/lancamentos" as const;
  if (canUse(access, "contas")) return "/contas" as const;
  if (canUse(access, "cartoes")) return "/cartoes" as const;
  if (canUse(access, "inadimplentes")) return "/inadimplentes" as const;
  return null;
}

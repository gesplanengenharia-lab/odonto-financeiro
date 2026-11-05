<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Finance rules (installments, card fees, default/inadimplência, margin) live as pure functions in `src/lib/finance.ts` with tests in `src/lib/finance.test.ts`; UI never re-implements them. Why: one tested source of truth for money math.
- Every launch is expanded into one `transactions` row per installment/recurrence (`group_id` links them); `competence_date` drives reports/margin, `due_date` drives cash flow and provisão. Why: reports and cash projections need different dates.
- Access is team-based: any row in `user_roles` = team member (RLS via `is_team_member`); the first signup becomes admin via the `handle_new_user` trigger, others wait for an admin to grant `membro`. Why: open signup must not expose clinic data.
- App pages live under `src/routes/_authenticated/` and read data with the browser client + React Query hooks in `src/lib/queries.ts` (RLS enforces access). Why: client-only gated routes, no server secrets needed.
- Patient receivables (`kind='entrada'`) auto-settle on `due_date` via `public.auto_settle_due_entries()` (daily pg_cron + called when the app opens); undoing a payment sets `auto_settle=false` so the row stays pending/inadimplente. Why: the clinic does not want to settle each installment by hand.

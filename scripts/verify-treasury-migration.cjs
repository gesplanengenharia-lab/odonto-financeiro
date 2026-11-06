/* Isolated PostgreSQL verification. Never connects to a clinic database.
 * Run with PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite node scripts/verify-treasury-migration.cjs
 * Verified with @electric-sql/pglite 0.5.15 (PostgreSQL 18.6).
 * The test dependency is intentionally outside the application and its lockfile. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
(async () => {
 const db = new PGlite();
 // Align CURRENT_DATE in synthetic fixtures with the production financial calendar.
 await db.exec(`SET TIME ZONE 'America/Sao_Paulo'`);
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 GRANT USAGE ON SCHEMA public, auth TO authenticated,anon,service_role;
 GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon,service_role;`);
 const root=path.join(__dirname,'../drizzle/migrations');
 for (const f of ['0000_financeiro_clinica.sql','0001_team_module_permissions.sql','0002_cheque_payment_method.sql','0003_auto_settle_entries.sql']) await db.exec(fs.readFileSync(path.join(root,f),'utf8'));
 const admin='10000000-0000-4000-8000-000000000001',member='10000000-0000-4000-8000-000000000002';
 await db.exec(`INSERT INTO auth.users(id,email) VALUES ('${admin}','admin@local.invalid'),('${member}','member@local.invalid'); INSERT INTO public.user_roles(user_id,role) VALUES ('${member}','membro');`);
 const legacy=(await db.query(`INSERT INTO public.transactions(kind,description,payment_method,status,competence_date,due_date,paid_date,gross_amount,net_amount,created_by) VALUES ('entrada','Preserved history','pix','pago',current_date-5,current_date-5,current_date-5,123,123,'${admin}') RETURNING to_jsonb(transactions) AS data`)).rows[0].data;
 const sql=fs.readFileSync(path.join(root,'0005_treasury_foundation.sql'),'utf8');
 let rolledBack=false;
 try { await db.exec(sql.replace('INSERT INTO public.financial_schema_versions(version) VALUES (1);', "RAISE EXCEPTION 'rollback smoke test';")); }
 catch (error) { rolledBack=error.message.includes('rollback smoke test'); }
 assert.ok(rolledBack,'Deliberate failure exercised the entire migration');
 assert.equal((await db.query("SELECT to_regclass('public.financial_accounts') IS NULL AS v")).rows[0].v,true,'Failed installation leaves no new tables');
 assert.equal((await db.query("SELECT count(*)::int AS v FROM information_schema.columns WHERE table_schema='public' AND table_name='transactions' AND column_name='financial_account_id'")).rows[0].v,0,'Failed installation leaves historical schema intact');
 await db.exec(sql);
 let checks=3;
 const check=(test,message)=>{assert.ok(test,message);checks++;};
 const scalar=async q=>(await db.query(q)).rows[0].v;
 const fail=async(sql,message)=>{let failed=false;try{await db.exec(sql);}catch{failed=true;}check(failed,message);};
 const role=async(name,id)=>{await db.exec('RESET ROLE');await db.query(`SELECT set_config('request.jwt.claim.sub',$1,false)`,[id||'']);await db.exec(`SET ROLE ${name}`);};
 const after=(await db.query(`SELECT to_jsonb(t)-'financial_account_id'-'reconciled_at'-'reconciled_by' AS data FROM public.transactions t WHERE id='${legacy.id}'`)).rows[0].data;
 check(JSON.stringify(after)===JSON.stringify(legacy),'Historical records unchanged');
 check(await scalar(`SELECT count(*)::int AS v FROM public.financial_accounts` )===0,'No fabricated bank account');
 await db.exec(sql);check(await scalar('SELECT count(*)::int AS v FROM public.financial_schema_versions')===1,'Safe reapplication');
 check(await scalar(`SELECT count(*)::int AS v FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('financial_accounts','treasury_movements','bank_reconciliations','financial_audit_log','financial_schema_versions') AND c.relrowsecurity` )===5,'RLS enabled on every new table');
 await role('authenticated',admin);
 const a=(await db.query(`INSERT INTO public.financial_accounts(name,kind,opening_date,opening_balance) VALUES ('Bank A','banco',current_date-30,1000) RETURNING id`)).rows[0].id;
 const b=(await db.query(`INSERT INTO public.financial_accounts(name,kind,opening_date,opening_balance) VALUES ('Cash','caixa',current_date-30,500) RETURNING id`)).rows[0].id;
 await db.exec(`UPDATE public.transactions SET financial_account_id='${a}' WHERE id='${legacy.id}'`);
 check(Number(await scalar(`SELECT public.financial_account_balance('${a}',current_date,false) AS v`))===1123,'Assigned paid receipts affect posted balance');
 check(Number(await scalar(`SELECT public.financial_account_balance('${a}',current_date,true) AS v`))===1000,'Unconfirmed receipt excluded from checked balance');
 await db.exec(`SELECT public.set_transaction_reconciliation('${legacy.id}','${a}',current_date-5,true)`);
 check(Number(await scalar(`SELECT public.financial_account_balance('${a}',current_date,true) AS v`))===1123,'Explicit confirmation affects checked balance');
 await db.exec(`UPDATE public.transactions SET gross_amount=124,net_amount=124 WHERE id='${legacy.id}'`);
 check(await scalar(`SELECT reconciled_at IS NULL AS v FROM public.transactions WHERE id='${legacy.id}'`),'Amount edit invalidates old reconciliation');
 await db.exec(`SELECT public.set_transaction_reconciliation('${legacy.id}','${a}',current_date-5,true)`);
 await role('authenticated',member);
 check(await scalar('SELECT count(*)::int AS v FROM public.financial_accounts')===0,'Member cannot read accounts');
 check(await scalar('SELECT count(*)::int AS v FROM public.financial_audit_log')===0,'Member cannot read audit history');
 await fail(`INSERT INTO public.financial_accounts(name,kind,opening_date) VALUES ('Forbidden','banco',current_date)`,'Member cannot create accounts');
 await fail(`SELECT public.financial_account_balance('${a}',current_date,false)`,'Member cannot call balance function');
 await fail(`SELECT public.set_transaction_reconciliation('${legacy.id}','${a}',current_date,true)`,'Member cannot confirm statement');
 await fail(`UPDATE public.transactions SET reconciled_at=now(),reconciled_by='${member}' WHERE id='${legacy.id}'`,'Member cannot forge direct reconciliation');
 await db.exec(`UPDATE public.transactions SET status='pendente' ,paid_date=NULL,auto_settle=false WHERE id='${legacy.id}'`);
 check(await scalar(`SELECT reconciled_at IS NULL AND reconciled_by IS NULL AS v FROM public.transactions WHERE id='${legacy.id}'`),'Undo payment clears reconciliation even for member');
 await db.exec('SELECT public.auto_settle_due_entries()');
 check(await scalar(`SELECT status='pendente' AS v FROM public.transactions WHERE id='${legacy.id}'`),'Manual default survives automatic settlement');
 await role('authenticated',admin);
 await db.exec(`SELECT public.set_transaction_reconciliation('${legacy.id}','${a}',current_date-5,true)`);
 await db.exec(`INSERT INTO public.treasury_movements(kind,account_id,movement_date,amount,description) VALUES ('aporte','${a}',current_date,200,'Capital contribution')`);
 const transfer=(await db.query(`INSERT INTO public.treasury_movements(kind,account_id,destination_account_id,movement_date,amount,description) VALUES ('transferencia','${a}','${b}',current_date,100,'Transfer') RETURNING id`)).rows[0].id;
 check(Number(await scalar(`SELECT public.financial_account_balance('${a}',current_date,false) AS v`))===1224,'Transfer debits source once');
 check(Number(await scalar(`SELECT public.financial_account_balance('${b}',current_date,false) AS v`))===600,'Transfer credits destination once');
 check(Number(await scalar(`SELECT sum(gross_amount) AS v FROM public.transactions WHERE kind='entrada'`))===124,'Contribution excluded from patient revenue');
 await fail(`UPDATE public.financial_accounts SET opening_balance=999 WHERE id='${a}'`,'Cannot rewrite opening balance after activity');
 await fail(`UPDATE public.treasury_movements SET amount=90 WHERE id='${transfer}'`,'Movement cannot be silently rewritten');
 await fail(`UPDATE public.treasury_movements SET voided_at=now(),voided_by='${admin}' WHERE id='${transfer}'`,'Cancellation needs reason');
 await db.exec(`UPDATE public.treasury_movements SET voided_at=now(),voided_by='${admin}',void_reason='Correction' WHERE id='${transfer}'`);
 check(Number(await scalar(`SELECT public.financial_account_balance('${a}',current_date,false) AS v`))===1324,'Cancellation reverses source effect');
 check(Number(await scalar(`SELECT public.financial_account_balance('${b}',current_date,false) AS v`))===500,'Cancellation reverses destination effect');
 const snapshot=(await db.query(`INSERT INTO public.bank_reconciliations(account_id,reconciliation_date,statement_balance,expected_balance) VALUES ('${a}',current_date,1300,-999) RETURNING expected_balance,difference`)).rows[0];
 check(Number(snapshot.expected_balance)===1324 && Number(snapshot.difference)===-24,'Statement snapshot computes expected balance on server');
 await fail(`DELETE FROM public.financial_audit_log`,'Audit log not deletable via application');
 await fail(`INSERT INTO public.financial_audit_log(table_name,record_id,operation,origin) VALUES ('fake','${legacy.id}','INSERT','usuario')`,'Audit log not forgeable via application');
 await fail(`UPDATE public.bank_reconciliations SET statement_balance=0`,'Statement snapshots immutable');
 check(await scalar(`SELECT count(*)::int AS v FROM public.financial_audit_log WHERE table_name='transactions' AND record_id='${legacy.id}'`)>=5,'Transaction changes audited');
 await role('anon','');await fail(`SELECT * FROM public.financial_accounts`,'Anonymous cannot read accounts');await fail(`SELECT * FROM public.financial_audit_log`,'Anonymous cannot read audit');
 await db.exec('RESET ROLE');await db.query(`SELECT set_config('request.jwt.claim.sub','',false)`);
 const pending=(await db.query(`INSERT INTO public.transactions(kind,description,payment_method,competence_date,due_date,gross_amount,net_amount) VALUES ('entrada','Automatic receipt','boleto',current_date-1,current_date-1,50,50) RETURNING id`)).rows[0].id;
 await db.exec('SELECT public.auto_settle_due_entries()');
 check(await scalar(`SELECT status='pago' AND reconciled_at IS NULL AS v FROM public.transactions WHERE id='${pending}'`),'Automatic receipt never becomes bank-confirmed');
 check(await scalar(`SELECT count(*)::int AS v FROM public.financial_audit_log WHERE record_id='${pending}' AND origin='sistema'`)===2,'System changes identified in audit');
 check(await scalar(`SELECT count(*)::int AS v FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='finance_private' AND has_function_privilege('authenticated',p.oid,'EXECUTE')`)===0,'Private trigger functions not exposed to authenticated users');
 await role('authenticated',admin);
 await db.exec('UPDATE public.card_settings SET debit_fee=debit_fee+0.1 WHERE id=1');
 check(await scalar("SELECT count(*)::int AS v FROM public.financial_audit_log WHERE table_name='card_settings' AND record_id='1'")===1,'Card-fee settings changes audited');
 await db.exec(`UPDATE public.user_roles SET allowed_modules=ARRAY['contas','baixar'] WHERE user_id='${member}'`);
 check(await scalar("SELECT count(*)::int AS v FROM public.financial_audit_log WHERE table_name='user_roles'")===1,'Permission changes audited');
 await role('anon','');
 await fail(`SELECT public.financial_account_balance('${a}',current_date,false)`,'Anonymous cannot call balance RPC');
 await db.exec('RESET ROLE');
 if (process.env.TREASURY_DELIVERY_FILE) {
   const results=await db.exec(fs.readFileSync(process.env.TREASURY_DELIVERY_FILE,'utf8'));
   const result=results.at(-1).rows[0];
   check(Number(result.versao_instalada)===1 && Number(result.tabelas_protegidas)===5 && Number(result.campos_novos)===3 && Number(result.gatilhos_auditoria)===7,'Delivered SQL and final verification query execute correctly');
 }
 const v2 = fs.readFileSync(path.join(root,'0006_treasury_atomic_balances.sql'),'utf8');
 const beforeV2 = await db.query('SELECT to_jsonb(t) AS data FROM public.transactions t ORDER BY id');
 await fail(v2.replace('INSERT INTO public.financial_schema_versions(version) VALUES (2);', "RAISE EXCEPTION 'rollback v2';"),'V2 installation rolls back atomically on failure');
 check(await scalar("SELECT to_regprocedure('public.treasury_balances_snapshot(date,uuid[])') IS NULL AS v"),'Failed v2 leaves no partial RPC');
 await db.exec(v2); await db.exec(v2);
 check(await scalar('SELECT count(*)::int AS v FROM public.financial_schema_versions WHERE version=2')===1,'V2 reapplication is idempotent');
 check(JSON.stringify((await db.query('SELECT to_jsonb(t) AS data FROM public.transactions t ORDER BY id')).rows)===JSON.stringify(beforeV2.rows),'V2 never rewrites financial records');
 await role('authenticated',admin);
 for (const patch of ["person='Synthetic patient'", "description='Changed synthetic reference'", 'due_date=current_date-4']) {
   await db.exec(`UPDATE public.transactions SET ${patch} WHERE id='${legacy.id}'`);
   check(await scalar(`SELECT reconciled_at IS NULL AND reconciled_by IS NULL AS v FROM public.transactions WHERE id='${legacy.id}'`),'Editing reconciled identity invalidates old statement confirmation');
   await db.exec(`SELECT public.set_transaction_reconciliation('${legacy.id}','${a}',current_date-5,true)`);
 }
 const balances = async (ids='NULL') => (await db.query(`SELECT public.treasury_balances_snapshot((now() AT TIME ZONE 'America/Sao_Paulo')::date,${ids}) AS data`)).rows[0].data;
 let combined = await balances();
 check(Number(combined.find(r=>r.id===a).posted)===1324 && Number(combined.find(r=>r.id===a).confirmed)===1324,'Snapshot contains both posted and confirmed views');
 check(Number(combined.find(r=>r.id===b).posted)===500,'Snapshot includes every selected account');
 await db.exec(`INSERT INTO public.treasury_movements(kind,account_id,destination_account_id,movement_date,amount,description) VALUES ('transferencia','${a}','${b}',current_date,25,'Atomic snapshot transfer')`);
 combined = await balances();
 check(Number(combined.find(r=>r.id===a).posted)===1299 && Number(combined.find(r=>r.id===b).posted)===525,'Both transfer legs appear in the same statement');
 check(combined.reduce((sum,r)=>sum+Number(r.posted),0)===1824,'Transfer preserves consolidated capital');
 check((await balances(`ARRAY['${a}'::uuid]`)).length===1,'Account subset is respected');
 const future=(await db.query("INSERT INTO public.financial_accounts(name,kind,opening_date,opening_balance) VALUES ('Future account','banco',current_date+1,99) RETURNING id")).rows[0].id;
 const notOpen=(await balances()).find(r=>r.id===future);
 check(notOpen.posted===null && notOpen.confirmed===null,'Account before opening has no invented zero');
 await fail('SELECT public.treasury_balances_snapshot(NULL)','Missing position date rejected');
 await fail('SELECT public.treasury_balances_snapshot(current_date+1)','Future cash position rejected');
 await role('authenticated',member);
 await fail('SELECT public.treasury_balances_snapshot(current_date)','Member cannot use snapshot RPC');
 await role('anon','');
 await fail('SELECT public.treasury_balances_snapshot(current_date)','Anonymous cannot use snapshot RPC');
 await db.exec('RESET ROLE');
 check(await scalar("SELECT NOT prosecdef AND provolatile='s' AS v FROM pg_proc WHERE oid='public.treasury_balances_snapshot(date,uuid[])'::regprocedure"),'Snapshot is stable and security invoker');
 console.log(JSON.stringify({checks,postgres:(await db.query('SELECT version() AS v')).rows[0].v,result:'passed',database:'isolated PGlite only; production untouched'}));
 await db.close();
})().catch(error=>{console.error(error);process.exit(1);});


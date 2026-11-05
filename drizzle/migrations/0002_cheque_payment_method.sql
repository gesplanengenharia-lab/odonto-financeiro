alter table public.transactions drop constraint transactions_payment_method_check;
alter table public.transactions add constraint transactions_payment_method_check check (payment_method in ('dinheiro','pix','debito','credito','boleto','transferencia','cheque'));

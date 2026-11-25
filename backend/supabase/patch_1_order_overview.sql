-- Patch 1: add payment_method to order_overview (the app shows it to the admin).
-- Run once in the Supabase SQL Editor AFTER the main migration.
drop view if exists public.order_overview;
create view public.order_overview with (security_invoker = true) as
select  o.order_id, o.customer_id, c.full_name as customer_name, c.email as customer_email,
        o.order_date, o.order_status, o.total_amount, o.paid_amount, o.remaining_amount,
        o.delivery_name, o.delivery_phone, o.delivery_address, o.delivery_pincode,
        o.gift_wrap, o.gift_message, o.tracking_number, o.carrier, o.stock_reserved,
        oi.product_id, p.product_name, oi.quantity, oi.agreed_unit_price, oi.color,
        coalesce(pay.payment_status, 'Payment Pending') as payment_status,
        pay.payment_id, pay.upi_transaction_reference, pay.amount as amount_paid,
        pay.proof_path, pay.rejection_reason, pay.payment_date, pay.verified_at,
        po.preorder_id, po.eligibility_status, po.allocation_status,
        po.expected_availability, po.queue_timestamp, po.ready_at,
        pay.payment_method
from public.orders o
join public.customer c on c.customer_id = o.customer_id
left join lateral (select * from public.order_item i where i.order_id = o.order_id
                   order by i.order_item_id limit 1) oi on true
left join public.product p on p.product_id = oi.product_id
left join lateral (select * from public.payment y where y.order_id = o.order_id
                   order by y.payment_id desc limit 1) pay on true
left join public.pre_order po on po.order_id = o.order_id;

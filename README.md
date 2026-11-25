# StitchStock (skeleton)
Run: `cd backend && npm install && npm start` → http://localhost:3000
Layers: routes → controllers (E4) → engines (E1 DSA, E2 OS, E3 audit) → db (E3).
Each owner replaces ONLY their stub; signatures are in backend/engines/CONTRACT.md.

Supabase setup: run `backend/supabase/schema.sql` and the applicable SQL patches in
`backend/supabase/` in the Supabase SQL Editor before starting the application.
Run `patch_3_return_requests.sql` to create or upgrade the PostgreSQL table used
for return and cancellation requests, and `patch_4_customer_messages.sql` to set
up PostgreSQL chat storage. Run `patch_5_customization_requests.sql` to set up
PostgreSQL customisation request storage and `patch_6_customization_request_reads.sql`
to track which requests the owner has viewed. To preserve existing local chat and
customisation history, run `node scripts/migrateCustomerMessages.js` and
`node scripts/migrateCustomRequests.js` from the `backend/` directory; both are
safe to rerun.

Login OTP email configuration: replace the sample SMTP values in `backend/.env`
with a real SMTP account to enable email OTP login. In local development, every
account uses the demo OTP `123456` without email delivery when `DEMO_LOGIN=true`;
this flag is ignored in production. Registration does not require OTP verification.
Password reset links are role-specific, expire after 15 minutes, and can only be
used once. Configure
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, and
`APP_BASE_URL` in `backend/.env` to send reset emails. Supabase-backed accounts
also require `SUPABASE_SERVICE_ROLE_KEY` on the backend so reset requests can
verify account roles securely; never expose that key to the frontend. The login
page links to the admin login at `login.html?role=owner`. New and reset passwords
must be 8-64 characters and include uppercase, lowercase, a number, and a
special character.

The storefront includes product discovery, gift suggestions, reviews, tracking,
care information, and customer help. Customisation request records and attachment
metadata are saved in PostgreSQL; uploaded customisation files remain under
`backend/data/custom-requests/`. Reviews (including their attachments) are saved
locally under `backend/data/` and are visible to the admin through the dashboard.
Product inventory syncs with Supabase when configured. Orders and pre-order
queues are saved under `backend/data/`; product inventory is saved locally when
Supabase is unavailable.

The customer navigation opens `frontend/customisation.html` for custom requests.
Customers can track request status, read admin replies and quotations, accept or
decline an offer, and pay a 50% advance using the existing demo UPI flow. The
customer's payment confirmation is not verified automatically. Admins can view
and reply to requests, set a quote and estimated completion, and update request
status from the Custom Requests section of the owner dashboard. Existing local
custom requests can be imported with the migration script above.

The owner dashboard uses separate routes for Overview, Customers, Customisation
Requests, Orders, Pre-orders, Products, Customer Messages, Reviews, Returns &
Cancellations, and Notifications. Return and cancellation requests are stored in
PostgreSQL; customer/admin conversations are also stored in PostgreSQL. Optional
return evidence is stored in the private Supabase Storage
bucket `return-evidence` (created automatically on first upload). Configure
`SUPABASE_SERVICE_ROLE_KEY` on the backend to enable evidence uploads. Admins
must provide a rejection reason, which is saved and shown in both dashboards.
Customers can submit up to 3 return requests per order.
Reviews, customisation requests, and observed customer profiles are saved under
`backend/data/`. The Customers page can
show demo accounts and customers
registered or observed through the app; it cannot enumerate Supabase accounts
that have never used the app without a Supabase service-role integration.

The customer storefront uses separate pages: `index.html` (Home), `shop.html`,
`product.html?id=...`, `customisation.html`, `wishlist.html`, `bag.html`,
`orders.html`, `messages.html`, and `about.html`. Product discovery, cart, and
wishlist state are shared across these pages in the browser.

The Keychains category includes the priced Damru and Blue Bird designs from the
provided images. Their initial stock is zero until restocked. For an existing
Supabase database, re-run `backend/supabase/schema.sql` to add these seed items.

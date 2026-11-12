# SchoolPulseOS

SchoolPulseOS is a multi-school operations platform for attendance, academics, finance, communication, and campus safety.

## Development

```bash
pnpm install
pnpm run dev
```

The application uses TanStack Start, React, Tailwind CSS, and Supabase. Provider credentials remain server-side and should be configured through the deployment environment.

Run the focused automated checks with `pnpm test`. Use the committed `pnpm-lock.yaml` as the dependency lockfile.

## School data assistant

The Operations Assistant uses built-in intent matching and read-only, school-scoped database
queries. It does not call an external AI service and does not require an AI API key. Conversation
context stays in the open browser session and is not saved by SchoolPulse. Attendance, fee,
academic, staff, and visitor queries are restricted by school role. The assistant cannot change
records. Its supported question patterns are deterministic and more limited than a generative
language model.

Apply the migrations in `supabase/migrations` in timestamp order before deploying. This includes
`20261104130000_secure_registration_codes_and_rate_limit.sql`, which makes registration codes
single-use and adds server-side throttling to registration verification.
The deployment proxy should overwrite `x-real-ip` or `x-forwarded-for` with the connecting
client's address for the additional per-IP registration limit to be effective.

## Parent payments

Apply the Supabase migrations before issuing invoices. The latest fee/payment migration backfills
existing positive student balances as invoices and adds invoice installments, webhook settlement,
and admin camera-view audit records.

Configure `PAYSTACK_SECRET_KEY` only in the server environment. In the Paystack dashboard, set the
webhook URL to `https://<your-deployed-host>/api/paystack-webhook` and subscribe to `charge.success`
and `charge.failed`. Settlement is performed only by the signed webhook; the browser return page
reads status but cannot mark a payment paid. Use the Paystack test key and test webhook first, then
replace it with the live secret key in the deployment environment for real charges. Never commit
either key or expose it to the browser.

Payment channels default to `card,bank_transfer,ussd`. Set the server-only
`PAYSTACK_ENABLED_CHANNELS` value to a comma-separated subset of `card,bank_transfer,ussd,mobile_money`
based on channels enabled for the Paystack account and merchant region. Mobile money is not shown
or accepted unless explicitly enabled.

Parents are sent to Paystack's hosted authorization URL, which can also be copied as a payment link.
Card, bank transfer, and USSD are available through the hosted checkout; mobile money is offered
only when Paystack enables it for the merchant/currency. For email confirmations, configure
`SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL`. WhatsApp delivery is not integrated.

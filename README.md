This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## KRX ETF TER sync

The KRX session currently redirects new browsers to sign-in. On the first run, open an
interactive browser and sign in when prompted:

```powershell
$env:KRX_INTERACTIVE="1"
npm run sync:krx-ter
Remove-Item Env:KRX_INTERACTIVE
```

The session is stored in the ignored `.krx-storage-state.json` file. Later monthly runs are
headless and only need:

```powershell
npm run sync:krx-ter
```

To automate it locally, register the Windows scheduled task once:

```powershell
npm run register:krx-ter-task
```

It runs at 09:00 on day 2 of every month and appends output to
`logs/krx-ter-sync.log`. The computer must be on and the Windows user must be signed in.

The script loads Supabase credentials from `.env.local` and writes with
`SUPABASE_SERVICE_ROLE_KEY`. Set `KRX_TRADE_DATE=YYYYMMDD` only when a specific trading date
is needed.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

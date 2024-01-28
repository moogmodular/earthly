# Create T3 App

This is a [T3 Stack](https://create.t3.gg/) project bootstrapped with `create-t3-app`.

## What's next? How do I make an app with this?

We try to keep this project as simple as possible, so you can start with just the scaffolding we set up for you, and add additional things later when they become necessary.

If you are not familiar with the different technologies used in this project, please refer to the respective docs. If you still are in the wind, please join our [Discord](https://t3.gg/discord) and ask for help.

- [Next.js](https://nextjs.org)
- [NextAuth.js](https://next-auth.js.org)
- [Prisma](https://prisma.io)
- [Tailwind CSS](https://tailwindcss.com)
- [tRPC](https://trpc.io)

## nostream db dev operations

`psql -U nostr_ts_relay -d nostr_ts_relay`

`DELETE FROM events;`

`HOST=192.168.0.XXX npm run dev`

pk_main: `637266428a21f96391963f25ac08a4fa97995766fb7c36114533f3021cfd8d2c` -> `fae0f0e6c4c1807575839a6560e69f297ae7bd88b44e880ed07ddf90d4cebaeb`
pk_second: `c9dd118c4e0e613c392ae84e4c1659d708c8a77989c47bf177026e0c9c4e61c8` -> `dcc05ae327acb50c573e677d9aa146f29f8a3cb3dc109275b4da944759d8a1aa`

## Learn More

To learn more about the [T3 Stack](https://create.t3.gg/), take a look at the following resources:

- [Documentation](https://create.t3.gg/)
- [Learn the T3 Stack](https://create.t3.gg/en/faq#what-learning-resources-are-currently-available) — Check out these awesome tutorials

You can check out the [create-t3-app GitHub repository](https://github.com/t3-oss/create-t3-app) — your feedback and contributions are welcome!

## How do I deploy this?

Follow our deployment guides for [Vercel](https://create.t3.gg/en/deployment/vercel), [Netlify](https://create.t3.gg/en/deployment/netlify) and [Docker](https://create.t3.gg/en/deployment/docker) for more information.

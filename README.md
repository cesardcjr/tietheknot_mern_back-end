# TieTheKnot Planner API

## Staging setup

Deploy the `staging` branch to a dedicated Render service. Configure its environment variables from `.env.example`, using:

- A new MongoDB database, such as `tietheknot_staging`; never use the production database.
- A unique staging `JWT_SECRET`.
- `TRUST_PROXY_HOPS=1` so Express rate limits use the client IP forwarded by Render.
- The exact staging Vercel frontend origins in `ALLOWED_ORIGINS`.

For dynamic Vercel preview domains, set `ALLOWED_ORIGIN_PATTERNS=https://tietheknot-mern-front-*.vercel.app` on the staging Render service. This is intentionally opt-in and should not be copied to production unless every matching preview deployment is trusted.

Run the service with `npm.cmd start`. The staging planner must use this service's `/api` URL through its `VITE_API_URL` setting.

## Release policy

Push normal updates to `staging`, test the complete flow there, then create a pull request from `staging` into `main`. Only merge that pull request when staging verification passes; `main` is the production release branch.

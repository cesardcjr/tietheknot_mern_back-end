# TieTheKnot Planner API

## Staging setup

Deploy the `staging` branch to a dedicated Render service. Configure its environment variables from `.env.example`, using:

- A new MongoDB database, such as `tietheknot_staging`; never use the production database.
- A unique staging `JWT_SECRET`.
- The exact staging Vercel frontend origins in `ALLOWED_ORIGINS`.

Run the service with `npm.cmd start`. The staging planner must use this service's `/api` URL through its `VITE_API_URL` setting.

## Release policy

Push normal updates to `staging`, test the complete flow there, then create a pull request from `staging` into `main`. Only merge that pull request when staging verification passes; `main` is the production release branch.

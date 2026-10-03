# WZPDCL Load Monitor – Backend

## Local
```bash
cp .env.example .env
# edit .env
npm install
npm run dev
```

## Vercel Environment Variables
| Name | Value |
|------|-------|
| MONGO_URI | your Atlas connection string |
| DB_NAME | wzpdcl-load-monitor |
| JWT_SECRET | long random string |
| CLIENT_ORIGIN | https://your-frontend.vercel.app |
| NODE_ENV | production |
| TZ | Asia/Dhaka |

## Seed production DB
```bash
# set MONGO_URI + DB_NAME in local .env to Atlas values
npm run seed
```

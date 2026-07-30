# ATAJ v3.0 Customer Onboarding Guide
Time to Value: < 1 Hour

## STEP 1: INSTALL - 2 MIN
docker pull ataj/ataj:3.0.0
curl -sSL https://ataj.dev/install.sh | bash

## STEP 2: WRITE YOUR APP - 10 MIN
cat > app.ataj
APP MyApp multi-cloud aws
HAVE User with id uuid
DO Buy and idempotent
^D

## STEP 3: DEPLOY - 5 MIN
atajc build
atajc deploy --prod

## STEP 4: VERIFY GUARANTEES - 3 MIN
ataj-admin status
ataj-admin cost
curl https://api.yours.com/health

## STEP 5: GO LIVE
You now have: RTO 15min, RPO 5min, CostCap \$1000, \$100k Warranty

Support: support@ataj.dev | Slack: #ataj-oncall

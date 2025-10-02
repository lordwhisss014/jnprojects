#!/bin/bash
set -e

NAMESPACE=$1

echo "Verifying YugabyteDB deployment in namespace: $NAMESPACE"

# Check if all pods are running
RUNNING_PODS=$(oc get pods -n $NAMESPACE -l app=yugabyte --no-headers | grep Running | wc -l)
if [ "$RUNNING_PODS" -ne 6 ]; then
  echo "Error: Not all pods are running. Expected 6, found $RUNNING_PODS"
  exit 1
fi

# Check master UI endpoint
MASTER_UI_ROUTE=$(oc get route yb-master-ui -n $NAMESPACE -o jsonpath='{.spec.host}')
if [ -z "$MASTER_UI_ROUTE" ]; then
  echo "Error: Master UI route not found"
  exit 1
fi

# Check YSQL endpoint
YSQL_ROUTE=$(oc get route yb-ysql -n $NAMESPACE -o jsonpath='{.spec.host}')
if [ -z "$YSQL_ROUTE" ]; then
  echo "Error: YSQL route not found"
  exit 1
fi

# Test YSQL connection (requires psql client)
if command -v psql &> /dev/null; then
  echo "Testing YSQL connection..."
  PGPASSWORD=yugabyte psql -h $YSQL_ROUTE -p 5433 -U yugabyte -c "SELECT version();" -d yugabyte
fi

echo "YugabyteDB verification completed successfully!"
echo "Master UI: https://$MASTER_UI_ROUTE"
echo "YSQL endpoint: $YSQL_ROUTE:5433"
echo "YCQL endpoint: $(oc get route yb-ycql -n $NAMESPACE -o jsonpath='{.spec.host}'):9042"
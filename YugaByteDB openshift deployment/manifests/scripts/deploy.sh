#!/bin/bash
set -e

NAMESPACE=$1

echo "Deploying YugabyteDB to namespace: $NAMESPACE"

# Create namespace if it doesn't exist
oc get namespace $NAMESPACE || oc create namespace $NAMESPACE

# Apply all manifests in order
for file in manifests/*.yaml; do
  echo "Applying $file..."
  oc apply -f $file -n $NAMESPACE
done
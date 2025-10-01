CI/CD Pipeline for YugabyteDB Deployment on OpenShift
Here's a complete CI/CD pipeline implementation using GitLab CI/CD to deploy a YugabyteDB cluster on OpenShift:

Prerequisites

GitLab repository
OpenShift cluster
Service account with appropriate permissions
OpenShift CLI (oc) installed on the CI/CD runner


Project Structure

.
├── .gitlab-ci.yml
├── manifests/
│   ├── 01-namespace.yaml
│   ├── 02-scc.yaml
│   ├── 03-service-account.yaml
│   ├── 04-master-service.yaml
│   ├── 05-master-statefulset.yaml
│   ├── 06-tserver-service.yaml
│   ├── 07-tserver-statefulset.yaml
│   ├── 08-external-services.yaml
│   └── 09-routes.yaml
└── scripts/
    ├── deploy.sh
    └── verify.sh
Insert at cursor


GitLab CI/CD Pipeline (.gitlab-ci.yml)

stages:
  - validate
  - deploy-dev
  - test-dev
  - deploy-staging
  - test-staging
  - deploy-prod
  - test-prod

variables:
  OPENSHIFT_SERVER: ${OPENSHIFT_SERVER}
  OPENSHIFT_TOKEN: ${OPENSHIFT_TOKEN}
  NAMESPACE_DEV: yugabyte-dev
  NAMESPACE_STAGING: yugabyte-staging
  NAMESPACE_PROD: yugabyte-prod

# Template for deployment jobs
.deploy_template: &deploy_definition
  image: registry.access.redhat.com/openshift4/ose-cli:latest
  before_script:
    - oc login --token=${OPENSHIFT_TOKEN} --server=${OPENSHIFT_SERVER} --insecure-skip-tls-verify
    - chmod +x ./scripts/deploy.sh
    - chmod +x ./scripts/verify.sh
    - sed -i "s/yugabyte/${NAMESPACE}/g" ./manifests/*.yaml

validate:
  stage: validate
  image: registry.access.redhat.com/openshift4/ose-cli:latest
  script:
    - for file in manifests/*.yaml; do oc apply --dry-run=client -f $file; done
  only:
    - merge_requests

deploy-dev:
  <<: *deploy_definition
  stage: deploy-dev
  variables:
    NAMESPACE: ${NAMESPACE_DEV}
  script:
    - ./scripts/deploy.sh ${NAMESPACE}
  environment:
    name: development
  only:
    - develop

test-dev:
  <<: *deploy_definition
  stage: test-dev
  variables:
    NAMESPACE: ${NAMESPACE_DEV}
  script:
    - ./scripts/verify.sh ${NAMESPACE}
  environment:
    name: development
  only:
    - develop

deploy-staging:
  <<: *deploy_definition
  stage: deploy-staging
  variables:
    NAMESPACE: ${NAMESPACE_STAGING}
  script:
    - ./scripts/deploy.sh ${NAMESPACE}
  environment:
    name: staging
  only:
    - main
  when: manual

test-staging:
  <<: *deploy_definition
  stage: test-staging
  variables:
    NAMESPACE: ${NAMESPACE_STAGING}
  script:
    - ./scripts/verify.sh ${NAMESPACE}
  environment:
    name: staging
  only:
    - main

deploy-prod:
  <<: *deploy_definition
  stage: deploy-prod
  variables:
    NAMESPACE: ${NAMESPACE_PROD}
  script:
    - ./scripts/deploy.sh ${NAMESPACE}
  environment:
    name: production
  only:
    - tags
  when: manual

test-prod:
  <<: *deploy_definition
  stage: test-prod
  variables:
    NAMESPACE: ${NAMESPACE_PROD}
  script:
    - ./scripts/verify.sh ${NAMESPACE}
  environment:
    name: production
  only:
    - tags
Insert at cursor


Deployment Script (scripts/deploy.sh)

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

# Wait for master pods to be ready
echo "Waiting for master pods to be ready..."
oc wait --for=condition=Ready pod/yb-master-0 pod/yb-master-1 pod/yb-master-2 -n $NAMESPACE --timeout=300s

# Wait for tserver pods to be ready
echo "Waiting for tserver pods to be ready..."
oc wait --for=condition=Ready pod/yb-tserver-0 pod/yb-tserver-1 pod/yb-tserver-2 -n $NAMESPACE --timeout=300s

echo "YugabyteDB deployment completed successfully!"
Insert at cursor


Verification Script (scripts/verify.sh)

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
Insert at cursor


Manifest Files

01-namespace.yaml

apiVersion: v1
kind: Namespace
metadata:
  name: yugabyte
Insert at cursor


02-scc.yaml

apiVersion: security.openshift.io/v1
kind: SecurityContextConstraints
metadata:
  name: yugabyte-scc
allowPrivilegedContainer: false
runAsUser:
  type: RunAsAny
seLinuxContext:
  type: MustRunAs
fsGroup:
  type: RunAsAny
supplementalGroups:
  type: RunAsAny
users:
- system:serviceaccount:yugabyte:yugabyte
Insert at cursor


03-service-account.yaml

apiVersion: v1
kind: ServiceAccount
metadata:
  name: yugabyte
  namespace: yugabyte
Insert at cursor


04-master-service.yaml

apiVersion: v1
kind: Service
metadata:
  name: yb-masters
  namespace: yugabyte
  labels:
    app: yugabyte
    component: yb-master
spec:
  clusterIP: None
  ports:
  - name: ui
    port: 7000
  - name: rpc-port
    port: 7100
  selector:
    app: yugabyte
    component: yb-master
Insert at cursor


05-master-statefulset.yaml

apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: yb-master
  namespace: yugabyte
spec:
  serviceName: yb-masters
  replicas: 3
  selector:
    matchLabels:
      app: yugabyte
      component: yb-master
  template:
    metadata:
      labels:
        app: yugabyte
        component: yb-master
    spec:
      serviceAccountName: yugabyte
      containers:
      - name: yb-master
        image: docker.io/yugabytedb/yugabyte:latest
        imagePullPolicy: IfNotPresent
        command:
        - "/home/yugabyte/bin/yb-master"
        - "--fs_data_dirs=/mnt/data0"
        - "--rpc_bind_addresses=0.0.0.0:7100"
        - "--webserver_interface=0.0.0.0"
        - "--master_addresses=yb-master-0.yb-masters.yugabyte.svc.cluster.local:7100,yb-master-1.yb-masters.yugabyte.svc.cluster.local:7100,yb-master-2.yb-masters.yugabyte.svc.cluster.local:7100"
        - "--replication_factor=3"
        ports:
        - containerPort: 7000
          name: ui
        - containerPort: 7100
          name: rpc-port
        volumeMounts:
        - name: datadir
          mountPath: /mnt/data0
        readinessProbe:
          tcpSocket:
            port: 7100
          initialDelaySeconds: 5
          periodSeconds: 10
        livenessProbe:
          tcpSocket:
            port: 7100
          initialDelaySeconds: 15
          periodSeconds: 10
        resources:
          requests:
            cpu: 500m
            memory: 1Gi
          limits:
            cpu: 1
            memory: 2Gi
  volumeClaimTemplates:
  - metadata:
      name: datadir
    spec:
      accessModes: [ "ReadWriteOnce" ]
      resources:
        requests:
          storage: 10Gi
Insert at cursor


06-tserver-service.yaml

apiVersion: v1
kind: Service
metadata:
  name: yb-tservers
  namespace: yugabyte
  labels:
    app: yugabyte
    component: yb-tserver
spec:
  clusterIP: None
  ports:
  - name: ui
    port: 9000
  - name: rpc-port
    port: 9100
  - name: cassandra
    port: 9042
  - name: redis
    port: 6379
  - name: postgres
    port: 5433
  selector:
    app: yugabyte
    component: yb-tserver
Insert at cursor


07-tserver-statefulset.yaml

apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: yb-tserver
  namespace: yugabyte
spec:
  serviceName: yb-tservers
  replicas: 3
  selector:
    matchLabels:
      app: yugabyte
      component: yb-tserver
  template:
    metadata:
      labels:
        app: yugabyte
        component: yb-tserver
    spec:
      serviceAccountName: yugabyte
      containers:
      - name: yb-tserver
        image: docker.io/yugabytedb/yugabyte:latest
        imagePullPolicy: IfNotPresent
        command:
        - "/home/yugabyte/bin/yb-tserver"
        - "--fs_data_dirs=/mnt/data0"
        - "--rpc_bind_addresses=0.0.0.0:9100"
        - "--webserver_interface=0.0.0.0"
        - "--tserver_master_addrs=yb-master-0.yb-masters.yugabyte.svc.cluster.local:7100,yb-master-1.yb-masters.yugabyte.svc.cluster.local:7100,yb-master-2.yb-masters.yugabyte.svc.cluster.local:7100"
        ports:
        - containerPort: 9000
          name: ui
        - containerPort: 9100
          name: rpc-port
        - containerPort: 9042
          name: cassandra
        - containerPort: 6379
          name: redis
        - containerPort: 5433
          name: postgres
        volumeMounts:
        - name: datadir
          mountPath: /mnt/data0
        readinessProbe:
          tcpSocket:
            port: 9100
          initialDelaySeconds: 5
          periodSeconds: 10
        livenessProbe:
          tcpSocket:
            port: 9100
          initialDelaySeconds: 15
          periodSeconds: 10
        resources:
          requests:
            cpu: 500m
            memory: 1Gi
          limits:
            cpu: 1
            memory: 2Gi
  volumeClaimTemplates:
  - metadata:
      name: datadir
    spec:
      accessModes: [ "ReadWriteOnce" ]
      resources:
        requests:
          storage: 10Gi
Insert at cursor


08-external-services.yaml
  `yaml
apiVersion: v1
kind: Service
metadata:
name: yb-master-ui
namespace: yugabyte
labels:
app: yugabyte
component: yb-master
spec:
ports:

name: ui
port: 7000
targetPort: 7000
selector:
app: yugabyte
component: yb-master
type: ClusterIP


apiVersion: v1
kind: Service
metadata:
name: yb-tserver-ui
namespace: yugabyte
labels:
app: yugabyte
component: yb-tserver
spec:
ports:

name: ui
port: 9000
targetPort: 9000
selector:
app: yugabyte
component: yb-tserver
type: ClusterIP
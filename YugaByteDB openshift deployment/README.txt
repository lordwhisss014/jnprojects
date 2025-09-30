Create a new project in OpenShift:

oc new-project yugabyte
Insert at cursor



Apply the SCC (if using) and bind it to the service account:

oc create -f yugabyte-scc.yaml
oc create -f yugabyte-serviceaccount.yaml
oc adm policy add-scc-to-user yugabyte-scc -z yugabyte-admin
Insert at cursor



Create the ConfigMap:

oc create -f yugabyte-configmap.yaml
Insert at cursor



Create the Persistent Volume Claims:

oc create -f yugabyte-pvcs.yaml
Insert at cursor



Create the Services:

oc create -f yb-master-service.yaml
oc create -f yb-tserver-service.yaml
Insert at cursor



Deploy the YugabyteDB Masters:

oc create -f yb-master-statefulset.yaml
Insert at cursor



Deploy the YugabyteDB TServers:

oc create -f yb-tserver-statefulset.yaml
Insert at cursor



Create the Routes for UI access:

oc create -f yugabyte-routes.yaml
Insert at cursor




3. Accessing YugabyteDB


Master UI: Access through the route created for the master UI

echo "https://$(oc get route yb-master-ui -o jsonpath='{.spec.host}')"
Insert at cursor



TServer UI: Access through the route created for the tserver UI

echo "https://$(oc get route yb-tserver-ui -o jsonpath='{.spec.host}')"
Insert at cursor



Connect using YSQL (PostgreSQL-compatible interface):

oc port-forward svc/yb-tserver-service 5433:5433
Insert at cursor

Then in another terminal:

psql -h localhost -p 5433 -U yugabyte -d yugabyte
Insert at cursor



Connect using YCQL (Cassandra-compatible interface):

oc port-forward svc/yb-tserver-service 9042:9042
Insert at cursor

Then in another terminal:

cqlsh localhost 9042
Insert at cursor




4. Additional Configuration Options


Resource Limits: Add resource limits to the containers for better resource management:

resources:
  limits:
    cpu: "2"
    memory: 4Gi
  requests:
    cpu: "1"
    memory: 2Gi
Insert at cursor



Node Affinity: To distribute YugabyteDB nodes across different physical nodes:

affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
    - weight: 100
      podAffinityTerm:
        labelSelector:
          matchExpressions:
          - key: app
            operator: In
            values:
            - yb-master
        topologyKey: kubernetes.io/hostname
version: '3.8'

services:
  oracle-db:
    image: container-registry.oracle.com/database/enterprise:12.2.0.1
    container_name: oracle-db
    ports:
      - "1521:1521"
      - "5500:5500"
    environment:
      ORACLE_PWD: "keycloak"
      ORACLE_SID: "ORCLCDB"
      ORACLE_PDB: "ORCLPDB1"
      ORACLE_CHARACTERSET: "AL32UTF8"
    volumes:
      - ./.docker/oracle-data:/opt/oracle/oradata
    healthcheck:
      test: ["CMD-SHELL", "echo 'SELECT 1 FROM dual;' | sqlplus -s sys/keycloak@//localhost:1521/ORCLPDB1 as sysdba"]
      interval: 30s
      timeout: 20s
      retries: 5
      start_period: 120s
    restart: unless-stopped
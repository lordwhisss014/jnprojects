<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Grumbling Dumpling - Project Documentation</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
            line-height: 1.6;
            color: #24292e;
            max-width: 900px;
            margin: 0 auto;
            padding: 40px 20px;
            background-color: #ffffff;
        }
        h1, h2, h3 {
            margin-top: 24px;
            margin-bottom: 16px;
            font-weight: 600;
            line-height: 1.25;
        }
        h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
        h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; margin-top: 40px;}
        h3 { font-size: 1.25em; }
        p { margin-top: 0; margin-bottom: 16px; }
        code {
            padding: 0.2em 0.4em;
            margin: 0;
            font-size: 85%;
            background-color: #f6f8fa;
            border-radius: 6px;
            font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
        }
        pre {
            padding: 16px;
            overflow: auto;
            font-size: 85%;
            line-height: 1.45;
            background-color: #f6f8fa;
            border-radius: 6px;
            margin-bottom: 16px;
        }
        pre code {
            background-color: transparent;
            padding: 0;
        }
        ul { padding-left: 2em; margin-bottom: 16px; }
        li { margin-bottom: 5px; }
        table {
            border-spacing: 0;
            border-collapse: collapse;
            margin-bottom: 16px;
            width: 100%;
        }
        table th, table td {
            padding: 6px 13px;
            border: 1px solid #dfe2e5;
        }
        table tr:nth-child(2n) { background-color: #f6f8fa; }
        .badges { margin-bottom: 20px; }
        .badges img { margin-right: 5px; }
        hr {
            height: 0.25em;
            padding: 0;
            margin: 24px 0;
            background-color: #e1e4e8;
            border: 0;
        }
        .architecture-img {
            max-width: 100%;
            height: auto;
            border: 1px solid #ddd;
            border-radius: 6px;
            padding: 10px;
            margin: 20px 0;
        }
    </style>
</head>
<body>

    <h1>🥟 Grumbling Dumpling: AI-Powered Full-Stack App on OpenShift</h1>

    <div class="badges">
        <img src="https://img.shields.io/badge/Status-Production%20Ready-success" alt="Status">
        <img src="https://img.shields.io/badge/Platform-OpenShift-red" alt="OpenShift">
        <img src="https://img.shields.io/badge/Backend-Node.js%2018-green" alt="Node.js">
        <img src="https://img.shields.io/badge/AI-Redis%20Vector%20Search-red" alt="Redis">
    </div>

    <p><strong>Grumbling Dumpling</strong> is a cloud-native e-commerce application deployed on <strong>Red Hat OpenShift</strong>. It features a modern microservices architecture, a secure Node.js backend, an Nginx frontend, and an integrated <strong>AI Chatbot</strong> powered by Vector Search.</p>

    <hr>

    <h2>🏗️ Architecture Overview</h2>
    <p>The application follows a <strong>Multi-Container Pod (Sidecar)</strong> pattern for the main application logic, connected to external stateful services.</p>

    <div class="architecture-img">
        

[Image of OpenShift architecture diagram]

    </div>

    <h3>1. The Application Pod (3 Containers)</h3>
    <ul>
        <li><strong>Frontend (Nginx):</strong> Serves the static HTML/CSS/JS and reverse-proxies API requests to the backend. It also exposes a <code>/status</code> page for monitoring.</li>
        <li><strong>Backend (Node.js):</strong> Handles API logic, connects to databases, and runs the local AI model (<code>Xenova/all-MiniLM-L6-v2</code>) for vector embeddings.</li>
        <li><strong>Metricbeat (Sidecar):</strong> A lightweight shipper that monitors the Nginx status and System (CPU/RAM) usage and pushes metrics to Elasticsearch.</li>
    </ul>

    <h3>2. Data Services</h3>
    <ul>
        <li><strong>PostgreSQL:</strong> Primary relational database for User Accounts and Order History.</li>
        <li><strong>Redis Stack:</strong> Vector Database used to store menu embeddings and perform Semantic Search for the chatbot.</li>
        <li><strong>Elasticsearch & Kibana (ELK):</strong> Centralized logging and analytics platform to visualize Sales Data and Server Health.</li>
    </ul>

    <hr>

    <h2>🚀 Features</h2>
    <ul>
        <li><strong>🛒 E-commerce:</strong> Browse menu, add to cart, and secure checkout.</li>
        <li><strong>🤖 AI Assistant:</strong> Ask questions like <em>"Do you have anything vegetarian?"</em> or <em>"I want something with shrimp"</em>. The bot understands context using <strong>Vector Search</strong> (Redis KNN).</li>
        <li><strong>🔐 Authentication:</strong> User registration and login with JWT and bcrypt hashing.</li>
        <li><strong>📊 Analytics:</strong> Real-time Kibana dashboards showing Top Customers, Total Revenue, and System Health.</li>
        <li><strong>🛡️ Security:</strong> Non-root container compliance for OpenShift (restricted-v2 SCC).</li>
    </ul>

    <hr>

    <h2>🛠️ Prerequisites</h2>
    <ul>
        <li><strong>OpenShift Cluster</strong> (4.x)</li>
        <li><strong>OC CLI</strong> installed and logged in.</li>
        <li><strong>GitLab Repository</strong> (hosting the source code).</li>
    </ul>

    <hr>

    <h2>📦 Deployment Guide</h2>

    <h3>1. Database & Redis Setup</h3>
    <p>Deploy the stateful services first using the provided YAML files.</p>
    <pre><code># Deploy Redis Stack (Vector Database) with GUI
oc apply -f redis-stack-gui.yaml

# Deploy ELK Stack (Elasticsearch + Kibana)
oc apply -f elk-stack.yaml

# Deploy PostgreSQL (Using ephemeral or persistent template)
oc new-app postgresql-persistent \
    -p POSTGRESQL_USER=dumplinguser \
    -p POSTGRESQL_PASSWORD=mysecurepassword \
    -p POSTGRESQL_DATABASE=dumplingdb</code></pre>

    <h3>2. Secret Management</h3>
    <p>Create the necessary secrets for Git pulling and Database connections.</p>
    <pre><code># Create Database Credentials Secret
oc create secret generic postgresql \
    --from-literal=database-user=dumplinguser \
    --from-literal=database-password=mysecurepassword \
    --from-literal=database-name=dumplingdb

# Link GitLab Secret for Builds
oc secrets link builder gitlab --for=pull
oc secrets link default gitlab --for=pull</code></pre>

    <h3>3. Application Build</h3>
    <p>Create the BuildConfigs to build the Frontend and Backend images from source.</p>
    <pre><code># Create ImageStreams and Build Configs
oc apply -f build.yaml

# Start the builds manually to populate images
oc start-build build-frontend
oc start-build build-backend</code></pre>

    <h3>4. Application Deployment</h3>
    <p>Deploy the main application pod.</p>
    <pre><code># Create ConfigMap for Metricbeat
oc apply -f metricbeat-config.yaml

# Deploy the Main Application
oc apply -f deployment.yaml</code></pre>

    <hr>

    <h2>⚙️ Configuration Details</h2>

    <h3>Backend (<code>server.js</code>)</h3>
    <ul>
        <li><strong>IPv4 Binding:</strong> Forced server to listen on <code>0.0.0.0</code> to ensure Nginx can reach it via <code>localhost</code>.</li>
        <li><strong>AI Model:</strong> Uses <code>@xenova/transformers</code>. Cache directory is forced to <code>/tmp</code> to avoid Read-Only file system errors in OpenShift.</li>
        <li><strong>Redis Indexing:</strong> Uses <strong>FLAT</strong> algorithm and <strong>HSET</strong> (Hashes) instead of JSON for reliable vector indexing on small datasets.</li>
    </ul>

    <h3>Frontend (<code>nginx.conf</code>)</h3>
    <ul>
        <li><strong>Reverse Proxy:</strong> Proxies <code>/api</code> traffic to <code>http://localhost:3000</code>.</li>
        <li><strong>Observability:</strong> Exposes <code>/status</code> endpoint (allow 127.0.0.1 only) for Metricbeat.</li>
    </ul>

    <h3>Observability (<code>metricbeat.yml</code>)</h3>
    <ul>
        <li><strong>Modules:</strong> Enabled <code>system</code> (CPU/Memory) and <code>nginx</code> (Active Connections).</li>
        <li><strong>Permissions:</strong> Run with <code>--strict.perms=false</code> to bypass OpenShift config ownership checks.</li>
    </ul>

    <hr>

    <h2>🔍 Troubleshooting & Lessons Learned</h2>
    <p>During the deployment, several critical OpenShift-specific challenges were solved:</p>

    <table>
        <thead>
            <tr>
                <th>Issue</th>
                <th>Cause</th>
                <th>Solution</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td><strong>"Connection Refused" (502)</strong></td>
                <td>Node.js defaulted to IPv6 (<code>::1</code>) while Nginx tried IPv4.</td>
                <td>Updated <code>server.js</code> to listen on <code>0.0.0.0</code> and Nginx to proxy to <code>localhost</code>.</td>
            </tr>
            <tr>
                <td><strong>"Permission Denied" (AI Model)</strong></td>
                <td>AI library tried writing to <code>node_modules</code> (Read-Only).</td>
                <td>Set <code>env.cacheDir = '/tmp/transformers_cache'</code> in code.</td>
            </tr>
            <tr>
                <td><strong>"0 Matches" in Vector Search</strong></td>
                <td>Redis JSON indexer rejected the JS Array format.</td>
                <td>Switched to <strong>Redis Hashes (<code>HSET</code>)</strong> and raw binary Buffers for vector storage.</td>
            </tr>
            <tr>
                <td><strong>"Invalid value: 0" (Metricbeat)</strong></td>
                <td>OpenShift blocks running containers as Root.</td>
                <td>Removed <code>runAsUser: 0</code> and relied on <code>--strict.perms=false</code> to run as random UID.</td>
            </tr>
            <tr>
                <td><strong>"Missing required parameter: body"</strong></td>
                <td>Elastic Client v7 vs v8 API mismatch.</td>
                <td>Updated backend code to use <code>body:</code> parameter instead of <code>document:</code>.</td>
            </tr>
        </tbody>
    </table>

    <hr>

    <h2>📈 Visualizing Data</h2>
    <ol>
        <li><strong>Access Kibana:</strong> Run <code>oc get route kibana</code> and open the URL.</li>
        <li><strong>Create Index Patterns:</strong>
            <ul>
                <li><strong>Sales Data:</strong> Create pattern <code>orders*</code> (Time field: <code>timestamp</code>).</li>
                <li><strong>System Metrics:</strong> Create pattern <code>metricbeat-*</code> (Time field: <code>@timestamp</code>).</li>
            </ul>
        </li>
        <li><strong>View Dashboard:</strong> Navigate to the "Dumpling Sales Dashboard" to see real-time revenue and system health.</li>
    </ol>

</body>
</html>

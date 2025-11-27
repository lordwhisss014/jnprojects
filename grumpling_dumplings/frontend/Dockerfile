# Use unprivileged Nginx for OpenShift security compliance
FROM nginxinc/nginx-unprivileged:alpine

# Copy config
COPY default.conf /etc/nginx/conf.d/default.conf

# Copy HTML and ALL IMAGES from the current directory to the container
COPY . /usr/share/nginx/html

# OpenShift standard port
EXPOSE 8080
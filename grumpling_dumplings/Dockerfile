FROM nginxinc/nginx-unprivileged:alpine

# Switch to root temporarily to copy files
USER root

# Copy website files
COPY --chown=nginx:nginx index.html /usr/share/nginx/html/dumpling/
COPY --chown=nginx:nginx src /usr/share/nginx/html/dumpling/src/

# Copy nginx configuration
COPY --chown=nginx:nginx default.conf /etc/nginx/conf.d/default.conf

# Switch back to nginx user
USER nginx

# Expose port 8080
EXPOSE 8080
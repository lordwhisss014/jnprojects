FROM node:18-alpine
WORKDIR /usr/src/app

# Copy package.json
COPY package*.json ./

# FIX: Use 'npm install' instead of 'npm ci'
# 'npm install' will generate the missing lock file automatically.
RUN npm install

# Copy the rest of the backend code
COPY . .

# Expose the port
EXPOSE 3000

# Start the server
CMD [ "npm", "start" ]
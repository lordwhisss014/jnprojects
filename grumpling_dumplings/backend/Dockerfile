# CHANGE: Use 'slim' instead of 'alpine' for AI compatibility (glibc)
FROM node:18-slim

WORKDIR /usr/src/app

# Copy package.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the backend code
COPY . .

# Expose the port
EXPOSE 3000

# Start the server
CMD [ "npm", "start" ]
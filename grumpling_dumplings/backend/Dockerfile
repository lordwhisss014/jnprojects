FROM node:18-alpine
WORKDIR /usr/src/app

# Copy dependencies and install
COPY package*.json ./
RUN npm ci --only=production

# Copy server code
COPY . .

# Node runs on 3000
EXPOSE 3000
CMD [ "npm", "start" ]
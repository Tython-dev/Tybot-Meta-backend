# Use official Node.js LTS image
FROM node:18

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

RUN touch .env 

# Install dependencies (omit dev dependencies for production)
RUN npm install --production

# Copy the rest of the app
COPY . .

# Expose the port used by Express (usually 3000 or similar)
EXPOSE 3009

# Start the app
CMD ["node", "server.js"]

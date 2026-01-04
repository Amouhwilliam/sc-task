# Use a lightweight Node.js image
FROM node:20-slim

# Create app directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose port (only needed for the Producer/API 1)
EXPOSE 3000

# Start the application
CMD [ "npm", "run", "dev"]
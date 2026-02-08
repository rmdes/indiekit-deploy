FROM node:22-alpine

RUN apk add --no-cache curl

WORKDIR /app

# Install only jsonwebtoken for JWT generation
RUN npm init -y && npm install jsonwebtoken

# Copy scripts and crontab
COPY docker/cron/crontab /etc/crontabs/root
COPY docker/cron/syndicate.sh /usr/local/bin/syndicate.sh
COPY docker/cron/webmention.sh /usr/local/bin/webmention.sh
COPY docker/cron/generate-token.js /app/generate-token.js

RUN chmod +x /usr/local/bin/syndicate.sh /usr/local/bin/webmention.sh

CMD ["crond", "-f", "-l", "2"]

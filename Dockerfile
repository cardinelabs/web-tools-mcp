FROM apify/actor-node:22
COPY --chown=myuser package*.json ./
RUN npm install --omit=dev --omit=optional && npm cache clean --force
COPY --chown=myuser . ./
CMD ["npx", "tsx", "src/index.ts"]

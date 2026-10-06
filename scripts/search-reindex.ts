// Rebuilds the Algolia product index from the database.
// Usage: npm run search:reindex
import { reindexAll } from "../lib/search/algolia";

reindexAll()
  .then(({ indexed }) => {
    console.log(`Indexed ${indexed} products into Algolia.`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

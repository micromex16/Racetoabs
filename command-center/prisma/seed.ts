import { seedIfEmpty } from "../src/lib/seed";
import { db } from "../src/lib/db";

seedIfEmpty()
  .then((did) => console.log(did ? "Seeded." : "Database already has data — seed skipped."))
  .finally(() => db.$disconnect());

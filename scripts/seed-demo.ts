/* Seeds (or re-seeds) the fictional demo dataset. Usage: npm run demo:seed */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

async function main() {
  const { seedDemo, DEMO_PASSWORD } = await import("@/lib/demo/seed");
  const summary = await seedDemo();
  console.log("Demo data seeded (all records are fictional and flagged is_demo):");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Demo staff password: ${DEMO_PASSWORD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


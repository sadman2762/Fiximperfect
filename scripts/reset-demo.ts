/* Deletes all demo data and re-seeds it. Usage: npm run demo:reset [-- --scenarios] */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

async function main() {
  const { seedDemo } = await import("@/lib/demo/seed");
  await seedDemo();
  console.log("Demo dataset reset.");
  if (process.argv.includes("--scenarios")) {
    const s = await import("@/lib/demo/scenarios");
    const one = await s.scenarioDuplicateDetection();
    console.log("Scenario 1 — duplicate detection:", JSON.stringify(one, null, 2));
    const two = await s.scenarioSafetyEscalation();
    console.log("Scenario 2 — safety escalation:", JSON.stringify(two, null, 2));
    const three = await s.scenarioResolutionVerification(one.ticketId);
    console.log("Scenario 3 — resolution verification:", JSON.stringify(three, null, 2));
    const four = await s.scenarioPredictiveMaintenance();
    console.log("Scenario 4 — predictive maintenance:", JSON.stringify(four, null, 2));
    const failed = [one, two, three, four].filter((x) => !x.passed);
    if (failed.length) {
      console.error(`${failed.length} scenario(s) did not meet expectations.`);
      process.exit(1);
    }
    console.log("All four scenarios passed.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


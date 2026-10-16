/**
 * One-off import: move the legacy `.data/availability.json` rows
 * (written while the `availability` table did not exist) into the
 * real database.
 *
 * Run AFTER supabase/schedule_management.sql in the SQL editor:
 *     node scripts/import_availability.mjs
 *
 * Safe to run twice — rows that already exist (same person, date and
 * time) are skipped instead of duplicated. Once it reports that every
 * record was skipped, the JSON file is fully retired and can be deleted.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envFile = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const env = {};
envFile.split("\n").forEach((line) => {
  const idx = line.indexOf("=");
  if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const FILE = path.join(__dirname, "..", ".data", "availability.json");

async function run() {
  if (!fs.existsSync(FILE)) {
    console.log("No .data/availability.json found — nothing to import.");
    return;
  }

  const records = JSON.parse(fs.readFileSync(FILE, "utf8"));
  if (!Array.isArray(records) || records.length === 0) {
    console.log("No records to import.");
    return;
  }

  let imported = 0;
  let skipped = 0;

  for (const record of records) {
    const { employee_id, date, start_time, end_time, notes } = record;

    const { data: existing } = await supabase
      .from("availability")
      .select("id")
      .eq("employee_id", employee_id)
      .eq("date", date)
      .eq("start_time", start_time)
      .eq("end_time", end_time)
      .limit(1);

    if (existing && existing.length > 0) {
      skipped++;
      continue;
    }

    const { error } = await supabase.from("availability").insert({
      employee_id,
      date,
      start_time,
      end_time,
      notes: notes ?? null,
      status: "available",
    });

    if (error) {
      // 23P01 = overlap constraint — the slot is taken in the database.
      console.log(`Skipped ${date} ${start_time}: ${error.message}`);
      skipped++;
      continue;
    }

    imported++;
  }

  console.log(`Done. Imported ${imported}, skipped ${skipped} (already present).`);
}

run();

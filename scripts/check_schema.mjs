import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envFile = fs.readFileSync(".env.local", "utf8");
const env = {};
envFile.split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) env[k.trim()] = v.join("=").trim();
});

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(url, key);

async function check() {
  const { data: schedData, error: schedError } = await supabase.from("schedules").select("*").limit(1);
  console.log("schedules table:", { error: schedError?.message, code: schedError?.code, data: schedData });

  const { data: availData, error: availError } = await supabase.from("availability").select("*").limit(1);
  console.log("availability table:", { error: availError?.message, code: availError?.code, data: availData });

  const { data: staffSchedData, error: staffSchedError } = await supabase.from("staff_schedules").select("*").limit(1);
  console.log("staff_schedules table:", { error: staffSchedError?.message, code: staffSchedError?.code, data: staffSchedData });
}

check();

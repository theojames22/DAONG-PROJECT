import fs from "fs";

const envFile = fs.readFileSync(".env.local", "utf8");
const env = {};
envFile.split("\n").forEach((line) => {
  const [k, ...v] = line.split("=");
  if (k && v.length) env[k.trim()] = v.join("=").trim();
});

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

async function checkTables() {
  const res = await fetch(`${url}/rest/v1/?apikey=${key}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const data = await res.json();
  console.log("Tables in database:", Object.keys(data.definitions || {}));
}

checkTables();

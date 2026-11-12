#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createClient } from "@supabase/supabase-js";

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readSecret(prompt) {
  if (!input.isTTY || !input.setRawMode) {
    return Promise.reject(new Error("Run this command in an interactive terminal."));
  }
  return new Promise((resolve, reject) => {
    let value = "";
    output.write(prompt);
    input.setRawMode(true);
    input.resume();
    const onData = (chunk) => {
      const text = String(chunk);
      if (text === "\u0003") {
        cleanup();
        reject(new Error("Cancelled."));
      } else if (text === "\r" || text === "\n") {
        cleanup();
        output.write("\n");
        resolve(value);
      } else if (text === "\u007f") {
        value = value.slice(0, -1);
      } else {
        value += text;
      }
    };
    function cleanup() {
      input.setRawMode(false);
      input.pause();
      input.off("data", onData);
    }
    input.on("data", onData);
  });
}

const email = (arg("email") ?? "").trim().toLowerCase();
const schoolId = (arg("school-id") ?? "").trim();
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!email || !email.includes("@") || !schoolId || !supabaseUrl || !serviceRoleKey) {
  console.error(
    "Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/bootstrap-admin.mjs --email admin@example.com --school-id SCHOOL_UUID",
  );
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const password = await readSecret("Temporary admin password (hidden): ");
const rl = createInterface({ input, output });
const confirmation = await rl.question("Type RESET to confirm replacing this admin password: ");
rl.close();

if (!password || confirmation !== "RESET") {
  console.error("Cancelled. No account changes were made.");
  process.exit(1);
}
if (password.length < 12) {
  console.error("Use a password with at least 12 characters.");
  process.exit(1);
}

const { data: school, error: schoolError } = await admin
  .from("schools")
  .select("id,name")
  .eq("id", schoolId)
  .maybeSingle();
if (schoolError || !school) {
  console.error(schoolError?.message ?? "School was not found.");
  process.exit(1);
}

const { data: users, error: usersError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (usersError) throw usersError;
const existing = users.users.find((user) => user.email?.toLowerCase() === email);
let userId = existing?.id;

if (existing) {
  const { error } = await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
  });
  if (error) throw error;
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("Supabase did not return the new user.");
  userId = data.user.id;
}

const { error: roleError } = await admin
  .from("user_roles")
  .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
if (roleError) throw roleError;

const { error: membershipError } = await admin
  .from("school_memberships")
  .upsert(
    { school_id: school.id, user_id: userId, role: "admin" },
    { onConflict: "school_id,user_id" },
  );
if (membershipError) throw membershipError;

console.log(`Admin account ready for ${email} at ${school.name}. The password was not printed.`);

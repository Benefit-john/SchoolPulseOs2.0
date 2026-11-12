import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequest } from "@tanstack/react-start/server";
import { isRegistrationCodeUsable } from "@/lib/registration-code";

const signInSchema = z.object({
  identifier: z.string().trim().min(1).max(255),
  password: z.string().min(1).max(256),
});

type LockoutProfile = {
  id: string;
  phone: string | null;
  sign_in_locked_until: string | null;
  failed_sign_in_attempts: number | null;
};

async function findLockoutProfile(identifier: string): Promise<LockoutProfile | null> {
  const { data, error } = await supabaseAdmin.rpc("lookup_signin_profile", {
    _identifier: identifier,
  });
  if (error || !data?.length) return null;
  return data[0] as LockoutProfile;
}

export const signInWithLockout = createServerFn({ method: "POST" })
  .validator(signInSchema)
  .handler(async ({ data }) => {
    const identifier = data.identifier.includes("@")
      ? data.identifier.toLowerCase()
      : data.identifier;
    const found = await findLockoutProfile(identifier);
    if (found?.sign_in_locked_until && new Date(found.sign_in_locked_until).getTime() > Date.now())
      return {
        ok: false as const,
        message: "Too many unsuccessful attempts. Try again later or contact the school office.",
      };
    let email = identifier;
    if (found) {
      const { data: authUser, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(
        found.id,
      );
      if (authUserError || !authUser.user?.email)
        return { ok: false as const, message: "The sign-in details are not correct." };
      email = authUser.user.email;
    }
    const { data: result, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password: data.password,
    });
    if (error || !result.session) {
      if (found) {
        const attempts = (found.failed_sign_in_attempts ?? 0) + 1;
        await supabaseAdmin
          .from("profiles")
          .update({
            failed_sign_in_attempts: attempts,
            sign_in_locked_until:
              attempts >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null,
          })
          .eq("id", found.id);
      }
      return { ok: false as const, message: "The sign-in details are not correct." };
    }
    if (found)
      await supabaseAdmin
        .from("profiles")
        .update({ failed_sign_in_attempts: 0, sign_in_locked_until: null })
        .eq("id", found.id);
    return {
      ok: true as const,
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
    };
  });

const studentCheck = z.object({
  role: z.enum(["parent", "student"]),
  studentCode: z.string().trim().min(3).max(40),
  dateOfBirth: z.string().max(10).optional(),
  registrationCode: z.string().trim().max(40).optional(),
});
export const validateRegistration = createServerFn({ method: "POST" })
  .validator(studentCheck)
  .handler(async ({ data }) => {
    const request = getRequest();
    const forwardedFor = request?.headers.get("x-forwarded-for");
    const sourceIp =
      request?.headers.get("x-real-ip")?.trim() || forwardedFor?.split(",")[0]?.trim() || null;
    const { data: allowed, error: rateLimitError } = await supabaseAdmin.rpc(
      "allow_registration_validation",
      {
        _student_code: data.studentCode,
        _source_ip: sourceIp,
      },
    );
    if (rateLimitError) {
      console.error("Registration validation rate limit failed", rateLimitError.message);
      throw new Error("Registration could not be verified right now. Please try again shortly.");
    }
    if (!allowed) {
      return {
        ok: false as const,
        message: "Too many verification attempts. Please wait a few minutes and try again.",
      };
    }

    const client = supabaseAdmin;
    const query = client
      .from("students")
      .select(
        "id,date_of_birth,registration_code,registration_code_expires_at,registration_code_used_at",
      )
      .eq("student_code", data.studentCode)
      .maybeSingle();
    const { data: student, error } = await query;
    if (error || !student)
      return {
        ok: false as const,
        message: "We could not find that student record. Check the ID with your school office.",
      };
    const dobMatches = !!data.dateOfBirth && student.date_of_birth === data.dateOfBirth;
    const codeMatches = isRegistrationCodeUsable(student, data.registrationCode);
    if (!dobMatches && !codeMatches)
      return {
        ok: false as const,
        message:
          "The date of birth or registration code does not match the verified school record.",
      };
    return { ok: true as const };
  });

export const adminExists = createServerFn({ method: "GET" }).handler(async () => {
  const { count } = await supabaseAdmin
    .from("user_roles")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "admin");
  return { exists: (count ?? 0) > 0 };
});

export const completeRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles, error } = await context.supabase.rpc("complete_registration");
    if (error)
      return {
        roles: [],
        error: "Your account could not be linked. Contact your school administrator.",
      };
    return { roles: roles ?? [], error: null };
  });

const inviteSchema = z.object({
  fullName: z.string().trim().min(2),
  email: z.string().trim().email(),
  role: z.enum([
    "principal",
    "teacher",
    "bursar",
    "security",
    "librarian",
    "nurse",
    "driver",
    "staff",
  ]),
  origin: z.string().url(),
});
export const inviteStaffMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inviteSchema)
  .handler(async ({ data, context }) => {
    const { data: memberships, error: membershipError } = await supabaseAdmin
      .from("school_memberships")
      .select("school_id")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .limit(2);
    const membership = memberships?.length === 1 ? memberships[0] : null;
    if (membershipError || !membership)
      return {
        ok: false as const,
        message: "You need exactly one admin school workspace to send an invitation.",
      };
    const schoolId = membership.school_id;

    const request = getRequest();
    if (!request) return { ok: false as const, message: "Invitation could not be sent." };
    const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { full_name: data.fullName, intended_role: data.role },
      redirectTo: `${data.origin}/welcome`,
    });
    if (error || !invited.user)
      return { ok: false as const, message: error?.message ?? "Invitation could not be sent." };
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: invited.user.id, role: data.role });
    if (roleError) {
      await supabaseAdmin.auth.admin.deleteUser(invited.user.id);
      return {
        ok: false as const,
        message: "The invitation could not be assigned to this school.",
      };
    }
    const { error: membershipAssignmentError } = await supabaseAdmin
      .from("school_memberships")
      .insert({ user_id: invited.user.id, school_id: schoolId, role: data.role });
    if (membershipAssignmentError) {
      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", invited.user.id)
        .eq("role", data.role);
      await supabaseAdmin.auth.admin.deleteUser(invited.user.id);
      return {
        ok: false as const,
        message: "The invitation could not be assigned to this school.",
      };
    }
    return { ok: true as const, message: `Invitation sent to ${data.email}.` };
  });

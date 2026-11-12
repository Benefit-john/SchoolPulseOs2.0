export type RegistrationCodeRecord = {
  registration_code: string | null;
  registration_code_expires_at: string | null;
  registration_code_used_at: string | null;
};

export function isRegistrationCodeUsable(
  record: RegistrationCodeRecord,
  submittedCode: string | undefined,
  now = Date.now(),
): boolean {
  if (!submittedCode || record.registration_code !== submittedCode) return false;
  if (record.registration_code_used_at) return false;
  if (!record.registration_code_expires_at) return true;
  return new Date(record.registration_code_expires_at).getTime() > now;
}

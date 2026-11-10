import "server-only";

/** Registráciu možno vypnúť premennou REGISTRATION_OPEN=false (napr. po naplnení kapacity). */
export function isRegistrationOpen(): boolean {
  return process.env.REGISTRATION_OPEN !== "false";
}

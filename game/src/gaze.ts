/** Bounded gaze; colocated targets have no stable bearing and return to neutral. */
export function gazeYaw(dx: number, dz: number, forward: number): number {
  if (![dx, dz, forward].every(Number.isFinite) || Math.hypot(dx, dz) < .45) return 0;
  const angle = Math.atan2(dx, dz) - forward;
  return Math.max(-.65, Math.min(.65, Math.atan2(Math.sin(angle), Math.cos(angle))));
}

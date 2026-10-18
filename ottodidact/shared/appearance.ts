import type { Session } from './milestone';

export function appearance(state:Session) {
  const active=!!state.presented;
  return {
    glow:state.effectsSuspended?'off':active?'bright':state.glowMode==='always'?'faint':'off',
    dim:!state.snapshotStale && !state.effectsSuspended && active && !!state.capture && (state.phase==='question'||state.phase==='loading'||(state.phase==='explained'&&state.annotations.length>0)),
    processing:!state.snapshotStale && !state.effectsSuspended && active && !!state.pending && !!state.capture,
  } as const;
}

// Milestone sessions live only in the main process; no screenshots are written to browser storage.
export function clearSession(): void { localStorage.removeItem('ottodidact.session'); }

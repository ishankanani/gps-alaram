import { File, Paths } from 'expo-file-system';

// Small things the map and trip screens remember on the phone: how many times the app was opened
// (the long-press hint shows in the first 3), dismissed map banners (by id) and when Arrived last
// suggested Pro.

type Memory = { sessions: number; dismissed: string[]; upsellShownAt: number | null };

const EMPTY: Memory = { sessions: 0, dismissed: [], upsellShownAt: null };

function file() {
  return new File(Paths.document, 'stopwake-map-ui.json');
}

function read(): Memory {
  try {
    const f = file();
    if (!f.exists) return EMPTY;
    const parsed = JSON.parse(f.textSync()) as Partial<Memory>;
    return {
      sessions: typeof parsed.sessions === 'number' ? parsed.sessions : 0,
      dismissed: Array.isArray(parsed.dismissed) ? parsed.dismissed.filter((d) => typeof d === 'string').slice(-50) : [],
      upsellShownAt: typeof parsed.upsellShownAt === 'number' ? parsed.upsellShownAt : null,
    };
  } catch {
    return EMPTY;
  }
}

let memory: Memory | null = null;
let counted = false;

function current(): Memory {
  memory ??= read();
  return memory;
}

function write(next: Memory) {
  memory = next;
  try {
    const f = file();
    if (!f.exists) f.create();
    f.write(JSON.stringify(next));
  } catch {
    // Forgetting a hint is harmless.
  }
}

/** Counts this app run (once) and returns how many runs there have been, this one included. */
export function countSession(): number {
  if (!counted) {
    counted = true;
    write({ ...current(), sessions: current().sessions + 1 });
  }
  return current().sessions;
}

export function isDismissed(id: string): boolean {
  return current().dismissed.includes(id);
}

export function dismiss(id: string) {
  if (!isDismissed(id)) write({ ...current(), dismissed: [...current().dismissed, id] });
}

export function upsellShownAt(): number | null {
  return current().upsellShownAt;
}

export function markUpsellShown(at: number) {
  write({ ...current(), upsellShownAt: at });
}

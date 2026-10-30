type Listener<P> = (payload: P) => void;

/** What features depend on: a bus that knows (at least) their own events. */
export interface Bus<M extends object> {
  on<K extends keyof M>(type: K, fn: Listener<M[K]>): () => void;
  once<K extends keyof M>(type: K, fn: Listener<M[K]>): () => void;
  emit<K extends keyof M>(type: K, payload: M[K]): void;
}

/** Small typed pub/sub. A failing listener is logged and never breaks the others. */
export class EventBus<M extends object> implements Bus<M> {
  private listeners = new Map<keyof M, Set<Listener<never>>>();

  on<K extends keyof M>(type: K, fn: Listener<M[K]>): () => void {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(fn as Listener<never>);
    return () => this.off(type, fn);
  }

  once<K extends keyof M>(type: K, fn: Listener<M[K]>): () => void {
    const off = this.on(type, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  off<K extends keyof M>(type: K, fn: Listener<M[K]>): void {
    this.listeners.get(type)?.delete(fn as Listener<never>);
  }

  emit<K extends keyof M>(type: K, payload: M[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        (fn as Listener<M[K]>)(payload);
      } catch (err) {
        console.error(`[events] listener for "${String(type)}" failed`, err);
      }
    }
  }
}

import { AsyncLocalStorage } from "node:async_hooks";
import type { ServerEventBus } from "@modelcontextprotocol/server";
import { z } from "zod";
import { canAccess } from "../domain/types";
import { log } from "../log";
import type { Store } from "../store/store";

const listenRequest = z
  .object({
    method: z.literal("subscriptions/listen"),
    params: z
      .object({
        notifications: z
          .object({ resourceSubscriptions: z.array(z.string()).optional() })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

/** SDK subscriptions bypass resource reads; enforce the same Room gate here. */
export function roomSubscriptions(store: Store, source: ServerEventBus) {
  const identity = new AsyncLocalStorage<string>();
  async function accessible(uri: string, member: string) {
    const match = /^quorus:\/\/room\/(r_[a-f0-9]{16})$/.exec(uri);
    if (!match?.[1]) return false;
    const room = await store.getRoom(match[1]);
    return !!room && canAccess(room, member);
  }
  const bus: ServerEventBus = {
    publish: (event) => source.publish(event),
    subscribe(listener) {
      // Capture the subscriber, never the publisher's async request identity.
      const member = identity.getStore();
      if (!member) throw new Error("subscription has no Member identity");
      let active = true;
      let pending = Promise.resolve();
      const unsubscribe = source.subscribe((event) => {
        pending = pending
          .then(async () => {
            if (!active) return;
            if (event.kind === "resource_updated" && !(await accessible(event.uri, member))) return;
            if (active) listener(event);
          })
          .catch(() => log.error("mcp.subscription", { error: "delivery authorization failed" }));
      });
      return () => {
        active = false;
        unsubscribe();
      };
    },
  };
  return {
    bus,
    run: <T>(member: string, fn: () => T): T => identity.run(member, fn),
    async filter(body: unknown, member: string): Promise<unknown> {
      const parsed = listenRequest.safeParse(body);
      // Invalid requests remain untouched for the SDK's protocol validation.
      if (!parsed.success) return body;
      const request = parsed.data;
      const requested = request.params.notifications.resourceSubscriptions;
      if (requested) {
        const allowed = await Promise.all(requested.map((uri) => accessible(uri, member)));
        request.params.notifications.resourceSubscriptions = requested.filter((_, i) => allowed[i]);
      }
      return request;
    },
  };
}

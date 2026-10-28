import { EventKey } from "../Event/EventDispatcher";
import { RedDotChange } from "./RedDotStore";

export const redDotEvent = {
    changed: new EventKey<RedDotChange>('reddot.changed'),
};
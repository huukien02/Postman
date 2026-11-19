import { nanoid } from "nanoid";
import type { KeyValue } from "./types";

export const newId = () => nanoid(10);

export const kv = (key = "", value = "", enabled = true): KeyValue => ({
  id: newId(),
  key,
  value,
  enabled,
});

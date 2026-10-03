import { json, legeCookie } from "../../src/lib.js";
export const onRequestPost = () => json({ ok: true }, 200, { "set-cookie": legeCookie });

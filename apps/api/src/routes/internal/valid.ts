// The private routers' zod checks at the HTTP boundary, each refusal a 400 with the first issue's message.
import type { Context } from "hono";
import { validator } from "hono/validator";
import type { z } from "zod";

export const bad = (c: Context, error: z.ZodError) => c.json({ error: error.issues[0]?.message ?? "invalid request" }, 400);

/** The JSON body `schema` accepts, read with `c.req.valid("json")`. A body that is not JSON reads as {}; malformed JSON is the validator's own 400. */
export const jsonBody = <S extends z.ZodType>(schema: S) =>
  validator("json", (value, c) => {
    const body = schema.safeParse(value);
    return body.success ? (body.data as z.output<S>) : bad(c, body.error);
  });

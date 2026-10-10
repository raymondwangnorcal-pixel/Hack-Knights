import { errorResponse } from "./backend";

// The backend adapter (backend.ts) fails loudly. On the public screens a backend hiccup should
// not blank the page mid-demo, so these routes log the error exactly as errorResponse does
// (visible in Vercel's logs) and then serve the sample data, marked with an X-Mozzy-Fallback header.
export async function realOrSample<T>(real: () => Promise<T>, sample: () => T | null): Promise<Response> {
  try {
    return Response.json(await real());
  } catch (err) {
    const failed = errorResponse(err); // logs "[backend] …"
    const data = sample();
    if (data === null) return failed;
    return Response.json(data, { headers: { "X-Mozzy-Fallback": `backend ${failed.status}` } });
  }
}

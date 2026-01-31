export default {
  async fetch(request: Request) {
    return new Response("Hello from jarvis-worker", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  },
};

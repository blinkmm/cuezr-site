export default async (req) => {
  const { payload } = await req.json();

  if (!payload?.data?.email || payload.data.consent !== "true") {
    return new Response("Skipped — no email or no consent", { status: 200 });
  }

  const apiKey = process.env.BUTTONDOWN_API_KEY;
  if (!apiKey) {
    console.error("BUTTONDOWN_API_KEY not set");
    return new Response("Missing API key", { status: 500 });
  }

  const res = await fetch("https://api.buttondown.com/v1/subscribers", {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email_address: payload.data.email,
      type: "regular",
    }),
  });

  if (res.ok || res.status === 409) {
    return new Response("Subscriber added", { status: 200 });
  }

  const err = await res.text();
  console.error(`Buttondown error ${res.status}: ${err}`);
  return new Response("Buttondown error", { status: 500 });
};

export const config = { path: "/.netlify/functions/submission-created" };

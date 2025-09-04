const endpoint = "http://localhost:3000/api/chat";

async function main() {
  const message = process.argv[2] ?? "What is the refund policy?";

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    console.log("Status:", res.status);
    console.log("Response:", JSON.stringify(json, null, 2));
  } catch (err: any) {
    console.error("Request failed:", err?.message || err);
    process.exit(1);
  }
}

main();

import { redirect } from "next/navigation";

export default function Home() {
  // Always send users to the demo experience as the app’s landing page
  redirect("/demo");
}

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function TextbooksPage() {
  redirect("/study?tab=materials");
}

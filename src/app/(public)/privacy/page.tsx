import { LegalDocument } from "@/features/support/LegalDocument";

export const metadata = { title: "隱私權政策" };
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return <LegalDocument slug="privacy" />;
}

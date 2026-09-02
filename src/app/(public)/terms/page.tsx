import { LegalDocument } from "@/features/support/LegalDocument";

export const metadata = { title: "使用條款" };
export const dynamic = "force-dynamic";

export default function TermsPage() {
  return <LegalDocument slug="terms" />;
}

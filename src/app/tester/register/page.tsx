import { redirect } from "next/navigation";

export default function TesterRegisterPage() {
  redirect("/register?tester=1");
}

import { Metadata } from "next";
import { AuthForm } from "./form";

export const metadata: Metadata = { title: "Log in · PayCall" };

export default function Login() {
  return <AuthForm />;
}

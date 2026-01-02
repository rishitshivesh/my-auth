import Image, { type ImageProps } from "next/image";
import { Alert, AlertDescription, AlertTitle, Button } from "@repo/ui";
import styles from "./page.module.css";
import { LoginForm } from "../components/login/page";

export default function Home() {
  return <LoginForm />;
}

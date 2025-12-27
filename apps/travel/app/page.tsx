import Image, { type ImageProps } from "next/image";
import { Alert, AlertDescription, AlertTitle, Button } from "@repo/ui";
import styles from "./page.module.css";

type Props = Omit<ImageProps, "src"> & {
  srcLight: string;
  srcDark: string;
};

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <Image
          className={styles.logo}
          src={"/logo.svg"}
          alt={"Scrolloop"}
          width={180}
          height={38}
          priority
        />

        <ol>
          <li>Welcome to Scrolloop!</li>
          <li>We're brewing something for you. Stay Tuned!.</li>
        </ol>
        <Button size={"lg"} variant={"default"} className={"bg-primary"}>
          Open alert
        </Button>
        <Alert>
          <AlertTitle>Hi</AlertTitle>
          <AlertDescription>Theme</AlertDescription>
        </Alert>
      </main>
    </div>
  );
}

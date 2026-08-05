import type { Metadata } from "next";
import { PongGame } from "@/components/PongGame";
import { EmbeddedImpossiblePong } from "@/components/EmbeddedImpossiblePong";
import { TestNav } from "../test/TestNav";
import styles from "../test/test.module.css";

export const metadata: Metadata = {
  title: "Play — Dev Sanghavi",
  description: "Play Dev Sanghavi's mini arcade.",
};

export default function PlayPage() {
  return (
    <main className={styles.page}>
      <TestNav active="play" />
      <div className={`${styles.frame} ${styles.playFrame}`}>
        <section className={styles.playPortal}>
          <EmbeddedImpossiblePong />
        </section>
      </div>
      <PongGame />
    </main>
  );
}

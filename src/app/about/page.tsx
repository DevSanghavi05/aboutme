import type { Metadata } from "next";
import { TestNav } from "../test/TestNav";
import { AboutContent } from "../test/about/AboutContent";
import { PongGame } from "@/components/PongGame";
import styles from "../test/test.module.css";

export const metadata: Metadata = {
  title: "About Dev Sanghavi",
  description: "Learn more about Dev Sanghavi, founder of Learnr.",
};

export default function AboutPage() {
  return (
    <main className={`${styles.page} ${styles.aboutPage}`}>
      <TestNav active="about" />

      <div className={`${styles.frame} ${styles.aboutFrame}`}>
        <section className={styles.aboutSection} aria-labelledby="about-heading">
          <AboutContent />
        </section>
      </div>
      <PongGame />
    </main>
  );
}

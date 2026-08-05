import type { Metadata } from "next";
import { TestNav } from "../TestNav";
import { AboutContent } from "./AboutContent";
import styles from "../test.module.css";

export const metadata: Metadata = {
  title: "About Dev Sanghavi",
  description: "Learn more about Dev Sanghavi, founder of Learnr.",
};

export default function AboutPage() {
  return (
    <main className={styles.page}>
      <TestNav active="about" />

      <div className={styles.frame}>
        <section className={styles.aboutSection} aria-labelledby="about-heading">
          <AboutContent />
        </section>
      </div>
    </main>
  );
}

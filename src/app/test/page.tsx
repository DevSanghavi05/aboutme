import type { Metadata } from "next";
import Image from "next/image";
import { Github, Mail, Phone } from "lucide-react";
import { TestNav } from "./TestNav";
import styles from "./test.module.css";

export const metadata: Metadata = {
  title: "Dev Sanghavi — Founder of Learnr",
  description: "Meet Dev Sanghavi, founder of Learnr.",
};

export default function TestPage() {
  return (
    <main className={styles.page}>
      <TestNav active="home" />

      <div className={styles.frame}>
        <section className={styles.hero} aria-labelledby="test-introduction">
          <div className={styles.intro}>
            <Image
              className={styles.portrait}
              src="/icon.png"
              alt="Dev Sanghavi"
              width={160}
              height={160}
              priority
            />

            <h1 id="test-introduction" className={styles.copy}>
              <span>
                I&apos;m <em className={styles.blue}>Dev Sanghavi</em>,
              </span>
              <span>
                the <em>founder</em> of{" "}
                <a
                  className={styles.learnrLink}
                  href="https://getlearnr.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <em className={styles.blue}>Learnr</em>
                </a>
                .
              </span>
            </h1>

            <ul className={styles.contacts} aria-label="Contact links">
              <li>
                <details className={styles.contactItem}>
                  <summary className={styles.contactTrigger} aria-label="Show phone number">
                    <Phone aria-hidden="true" />
                  </summary>
                  <a className={styles.contactValue} href="tel:+17133633348">713-363-3348</a>
                </details>
              </li>
              <li>
                <details className={styles.contactItem}>
                  <summary className={styles.contactTrigger} aria-label="Show email">
                    <Mail aria-hidden="true" />
                  </summary>
                  <a className={styles.contactValue} href="mailto:devrsanghavi05@gmail.com">devrsanghavi05@gmail.com</a>
                </details>
              </li>
              <li>
                <details className={styles.contactItem}>
                  <summary className={styles.contactTrigger} aria-label="Show GitHub profile">
                    <Github aria-hidden="true" />
                  </summary>
                  <a className={styles.contactValue} href="https://github.com/DevSanghavi05" target="_blank" rel="noopener noreferrer">
                    github.com/DevSanghavi05
                  </a>
                </details>
              </li>
              <li>
                <details className={styles.contactItem}>
                  <summary className={styles.contactTrigger} aria-label="Show X profile">
                    <span className={styles.xIcon} aria-hidden="true">𝕏</span>
                  </summary>
                  <a className={styles.contactValue} href="https://x.com/DevSanghav15604" target="_blank" rel="noopener noreferrer">
                    x.com/DevSanghav15604
                  </a>
                </details>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}

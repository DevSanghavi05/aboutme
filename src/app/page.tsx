import type { Metadata } from "next";
import Image from "next/image";
import { PongGame } from "@/components/PongGame";
import { HomeContactArea } from "@/components/GithubActivityModal";
import { getGithubActivity } from "@/lib/githubActivity";
import { TestNav } from "./test/TestNav";
import styles from "./test/test.module.css";

export const metadata: Metadata = {
  title: "Dev Sanghavi - Founder of Learnr",
  description: "Dev Sanghavi is a 12-year-old developer and creator from Houston, TX, and the founder of Learnr. See what he's building.",
};

export default async function HomePage() {
  const githubActivity = await getGithubActivity();

  return (
    <main className={styles.page}>
      <TestNav active="home" />

      <div className={`${styles.frame} ${styles.homeFrame}`}>
        <section className={`${styles.hero} ${styles.homeHero}`} aria-labelledby="home-introduction">
          <div className={styles.intro}>
            <Image
              className={`${styles.portrait} ${styles.homePortrait}`}
              src="/icon.png"
              alt="Dev Sanghavi"
              width={210}
              height={210}
              priority
            />

            <h1 id="home-introduction" className={`${styles.copy} ${styles.homeCopy}`}>
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

            <HomeContactArea activity={githubActivity} />
          </div>
        </section>

      </div>
      <PongGame />
    </main>
  );
}

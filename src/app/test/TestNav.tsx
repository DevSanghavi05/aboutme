import Image from "next/image";
import Link from "next/link";
import { MenuVertical } from "@/components/ui/menu-vertical";
import styles from "./test.module.css";

type TestNavProps = {
  active: "home" | "about" | "play";
};

export function TestNav({ active }: TestNavProps) {
  return (
    <header className={styles.topBar}>
      <Link className={styles.navBrand} href="/" aria-label="Dev Sanghavi home">
        <Image src="/icon.png" alt="" width={34} height={34} aria-hidden="true" />
        <span>Dev Sanghavi</span>
      </Link>

      <nav
        className={styles.menuShell}
        aria-label="Primary navigation"
        data-active={active}
      >
        <MenuVertical
          activeHref={active === "home" ? "/" : active === "about" ? "/about" : "/play"}
          color="#2864f0"
          skew={-3}
          menuItems={[
            { label: "Home", href: "/" },
            { label: "About", href: "/about" },
            { label: "Play", href: "/play" },
          ]}
        />
      </nav>
    </header>
  );
}
